# Implementation report — Cashu payment path in the ServicesPage pay step

Scope: `src/pages/ServicesPage.vue` pay step + `src/js/cvmPayment.ts` (new) +
`src/stores/wallet.ts` (`mintPaymentToken`). Worktree
`/home/c03rad0r/repos/cashu-me/.worktrees/t_55415198`. Not committed.

## 1. The mint/token step, exactly

This is the part that was missing. `sms.send` requires a **`cashu_token`** param
carrying a `cashuA…`/`cashuB…` bearer string; there was no code in the repo that
produced one.

### Where the pieces already were

| Need                                                                                  | Existing code                                                                               |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Split a spendable amount out of the wallet's proofs, swapping with the mint if needed | `wallet.send(proofs, wallet, amount, invalidate, includeFees)` — `src/stores/wallet.ts:708` |
| Serialise proofs to the bearer string                                                 | `proofs.serializeProofs(sendProofs)` — `src/stores/proofs.ts:159`                           |
| Sum for the honest `sats` figure                                                      | `proofs.sumProofs(...)` — `src/stores/proofs.ts:79`                                         |
| Active mint wallet handle                                                             | `wallet.activeWallet(true)` — `src/stores/wallet.ts`                                        |

### What was added — `wallet.mintPaymentToken(amount)`

`src/stores/wallet.ts`, inserted directly above `redeem`:

```ts
mintPaymentToken: async function (amount, mutexPriority = "normal") {
  const proofsStore = useProofsStore();
  const proofs = await proofsStore.getProofs();
  const wallet = await this.activeWallet(true);
  const { sendProofs } = await this.send(
    proofs,
    wallet,
    amount,
    true,  // invalidate — the token is leaving the wallet
    true,  // includeFees — the receiver deducts the mint's input fee
    mutexPriority
  );
  if (!sendProofs.length) throw new Error("could not split proofs.");
  const token = proofsStore.serializeProofs(sendProofs);
  return { token, sats: proofsStore.sumProofs(sendProofs) };
}
```

Three deliberate choices:

1. **`includeFees = true`.** The receiving CVM counts _spendable value_ after the
   mint's input fee. A token summing to exactly 2900 sats would arrive worth
   2900 − fee and be refused. `send(..., includeFees=true)` mints a swap whose
   encoded proofs cover the price **plus** the input fee, so the token the
   service receives is worth ≥ 2900.
2. **`invalidate = true`.** The proofs are removed from the store the instant the
   token is encoded. A `cashuA…` string in flight is bearer money: leaving the
   source proofs spendable would double-count them. Recovery from a failed remote
   send is the service's separate `refund_token`, not a local re-spend.
3. **Throws on an empty split** so the caller maps it to an honest failure
   instead of sending an empty token.

`send()` (`wallet.ts:708`) itself does the heavy lifting: offline exact-match
first, otherwise a mint swap via `wallet.ops.send(...)`, then reserves the sent
proofs (or removes them when `invalidate`), under the UI mutex.

## 2. The payment orchestration — `src/js/cvmPayment.ts` (new)

`src/js/cvm.ts` is the transport (gift-wrapped MCP JSON-RPC). The new module is
the _payment_ half, kept out of the Quasar-heavy component so it can be tested
directly (the page mounts empty in this repo's harness).

`payForSms(input)` runs the steps in this exact order, **money-moving step last**:

1. `pickPaymentSource` — no seed → `noWallet`; no mint → `noMint`. Nothing is
   minted.
2. `client.call("sms.pricing", { to })` — the **live** price, read from the rail.
   A thrown call means no reply arrived → `unreachable` (silence is never
   success). Only an unreachable rail falls back to the documented 2900, and the
   result is flagged `priceSats`.
3. `hasAddressableMint` — the user's mints must include the escrow mint
   (`SERVICE_MINT_URL`). A token from any other mint is refused
   `token_wrong_mint`, so this is checked **before** minting: no money moves for
   a token that would be handed back.
4. `mintToken({ sats })` — the injected `wallet.mintPaymentToken` above. A throw
   here (balance too low) → `insufficientFunds`.
5. `client.call("sms.send", buildSmsSendArgs(to, body, token))` — the paid call
   with the token in the contract's `cashu_token` field (`body`, **not**
   `message`). The reply is parsed with the shared `parseToolPayload` and mapped
   by `readCvmResult`.

### Honesty rules (this is the point of the task)

The rail reports `best_effort: true`, `delivery_receipts: false`.

- `readCvmResult` **computes** `deliveryConfirmed: false` — it never reads
  `delivery_confirmed` from the payload. A reply that asserts `true` is
  downgraded. There is a test named exactly for that
  (`never claims delivery even if a reply tries to assert it`).
- `accepted` (the rail took the message) is kept distinct from delivery. Success
  copy says "Accepted by the rail … not confirmed delivered."
- The no-receipts caveat is **unconditional** HTML (`data-testid="no-receipts"`
  with no `v-if`), so it cannot be hidden by a state bug.
- A refusal keeps its machine `reason` (`payment_required`,
  `token_wrong_mint`, …) and renders it (`data-testid="pay-error-reason"`)
  alongside the i18n sentence — the refusal is data, not something to swallow.
- `mapCvmError` has **no** reason→success mapping: an unknown reason becomes
  `generic`, never a pass.

## 3. The page wiring — `src/pages/ServicesPage.vue`

Kept the Options API, `mixins: [windowMixin]`, `data-testid` names, and the
`src/` alias convention.

- `data-testid="confirm-pay-btn"` now calls `payNow` instead of the old
  `step = 'sent'` placeholder.
- `payNow()`:
  - **no seed / no seed signer** — the CVM gift wrap is signed by the
    wallet-seed keypair, which lives on the **nostr** store
    (`nostrStore.seedSignerPrivateKey`, derived at boot by
    `nostr.initWalletSeedPrivateKeySigner()`). A missing signer refuses locally:
    nothing is minted, nothing is sent.
  - **no mint / wrong mint / insufficient balance / `payment_required` /
    unreachable** — each maps to its own i18n key via `payForSms`, shown in
    `data-testid="pay-error"` with the machine reason.
  - **success** — `data-testid="send-result"` states _Accepted by the rail_, the
    send id and rail status are shown, and the no-receipts caveat is always
    present.
  - The button is `:disabled="paying"` so a double-tap cannot mint twice.
  - The transport is a real `new CvmClient({ relays: SERVICE_RELAYS,
serverPubkey: npubToHex(...), secretKey })`, closed in `finally`.
- An accepted send is recorded in wallet history through
  `wallet.addPaymentHistory(...)` (not a raw array push), inside a try/catch: a
  history write must never turn a real send into a visible failure.

Supporting edits:

- `src/css/services.scss` — result/refusal surfaces, `svc-cta:disabled`.
- `src/i18n/en-US/index.ts` — the new `services.*` keys and the `payErrors`
  group.

## 4. Tests

`test/vitest/__tests__/cvmPayment.test.ts` (36) — npub→hex, relays, arg builder
(`body` present, `message` absent), live-price resolution incl. the CEP-8 cap and
the fallback, wallet/mint gating, the reason→key map, honest-result mapping
(refused / refunded / unreachable / forced-false delivery), and `payForSms`
orchestration with injected client + mint (happy path, no-seed, wrong-mint, CVM
unreachable, insufficient balance) — asserting the mint is simply **not called**
on every refusal.

`test/vitest/__tests__/servicesPay.test.ts` (11) — source contracts for the page
(the pay button no longer fakes `sent`, honest result fields present, the caveat
is unconditional, the refusal reason is surfaced, the seed signer comes from the
nostr store, history goes via `addPaymentHistory`) and for `mintPaymentToken`
(serialises proofs, `includeFees`, and `send(..., true, true, ...)` i.e.
invalidate).

TDD: `cvmPayment.test.ts` was written and run first, failing on
`Failed to resolve import "src/js/cvmPayment"`, before the module existed.

## 5. Commands and real output

```
$ npx vitest run test/vitest/__tests__/cvmPayment.test.ts   # before impl
Error: Failed to resolve import "src/js/cvmPayment" ... Does the file exist?
Test Files  1 failed (1)   Tests  no tests

$ npx vitest run test/vitest/__tests__/cvmPayment.test.ts test/vitest/__tests__/servicesPay.test.ts
✓ test/vitest/__tests__/cvmPayment.test.ts (36 tests) 129ms
✓ test/vitest/__tests__/servicesPay.test.ts  (11 tests)
Test Files  2 passed (2)   Tests  47 passed (47)

$ npx vitest run test/vitest/__tests__/servicesPay.test.ts \
    test/vitest/__tests__/cvmPayment.test.ts \
    test/vitest/__tests__/cvmClient.test.ts
Test Files  3 passed (3)   Tests  50 passed (50)   # incl. the pre-existing 5 CVM tests

$ npm run lint
> cashu@0.0.1 lint
> eslint --ext .js,.vue,.ts ./
LINT_EXIT=0            # no output → clean

$ npx vitest run        # full suite
Test Files  1 failed | 33 passed (34)
Tests       309 passed | 26 skipped (335)
  FAIL src/components/__tests__/CreateInvoiceDialog.test.ts
  Error: Hook timed out in 10000ms (beforeAll)

$ npx vitest run src/components/__tests__/CreateInvoiceDialog.test.ts   # isolation
✓ src/components/__tests__/CreateInvoiceDialog.test.ts (26 tests) 9406ms
```

The single full-suite failure is **pre-existing and unrelated**: that
`beforeAll` takes ~9.4s and exceeds vitest's 10s default `hookTimeout` under the
full-suite load of this 34-file suite; it passes 26/26 when run on its own. None
of the touched files are involved.

SFC validity was checked directly (the harness cannot mount this page):

```
$ node -e "…parse+compileTemplate+compileScript on ServicesPage.vue…"
SFC OK: template compiled, script lang=ts
```

## 6. Files changed

- `src/js/cvmPayment.ts` — **new**: npub→hex, relays, arg builder, live price,
  mint gate, reason→key map, honest `readCvmResult`, `payForSms`.
- `src/pages/ServicesPage.vue` — pay step wired to the CVM.
- `src/stores/wallet.ts` — `mintPaymentToken` (the mint/token step).
- `src/css/services.scss` — result/refusal surfaces.
- `src/i18n/en-US/index.ts` — `services.payErrors.*` + result keys.
- `test/vitest/__tests__/cvmPayment.test.ts` — **new**, 36 tests.
- `test/vitest/__tests__/servicesPay.test.ts` — **new**, 11 tests.

## 7. Not verified / limits

- No live end-to-end payment was executed (no funded wallet + real relay round
  trip from here). The transport is the already-green `CvmClient`; the money step
  is exercised against an injected mint, not a real mint.
- `SERVICE_MINT_URL` is the nosms default (`https://testnut.cashu.space`). If a
  deployment runs `NOSMS_MINT_URL` elsewhere, that constant must match, or the
  escrow-mint gate will correctly refuse.
- The page template is verified by compilation + source contract, not by mounting
  (Quasar components render empty in this repo's harness).
