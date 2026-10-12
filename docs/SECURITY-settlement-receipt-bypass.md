# SECURITY FINDING — nosms CVM: `settlement_receipt` is never validated (payment bypass)

**Found:** 2026-10-12, while reading the live server for the PWA payment integration.
**Severity:** High — free SMS for anyone who can reach the CVM, on the operator's
personal JMP line, at the operator's expense.
**Exploited?** No. Found by code reading. I did NOT probe it live, because a
successful probe would send a real SMS to a real handset.

## Evidence (live server, the copy actually running)
`/home/c03rad0r/repos/nosms/app/cvm_tools.py` — the running process's cwd is
`/home/c03rad0r/repos/nosms` (pid 2156635), so this is the authoritative code.

`sms_send()` line 303-345:

```python
if not owner:
    if cashu_token:
        held = self._pay_with_token(cashu_token, price, caller)   # line 337 — REAL: swaps at mint
    elif not settlement_receipt:                                   # line 338 — only checks TRUTHINESS
        raise ToolError(
            "payment_required", ...)                               # line 340
```

The `cashu_token` branch genuinely captures value: `_pay_with_token` (line 224)
decodes the token, enforces `token_wrong_mint` against the configured mint,
checks proof states via the mint, and NUT-03 swaps it. That path is sound.

The `settlement_receipt` branch is **not**. There is no validation anywhere:

```
grep -rn settlement_receipt app/ server.py   →
  cvm_tools.py:305   parameter declaration
  cvm_tools.py:308   docstring
  cvm_tools.py:338   truthiness check only
  cvm_tools.py:477   JSON schema (type: string)
  cvm_tools.py:518   JSON schema
  cvm_tools.py:579   same truthiness pattern in jmp.credentials
  cvm_tools.py:603   passed through unchanged from args
```

No signature check, no settlement store lookup, no preimage/hash verification,
no nonce, no server-side record of a settlement ever having occurred. A caller
can pass ANY non-empty string (or the JSON boolean `true`, which is also
non-falsy) as `settlement_receipt` and skip payment entirely.

The same hole exists on the `jmp.credentials` path (line 579), though that one
is gated by the operator allow-list *before* payment (line 573), so it is only
reachable by allow-listed callers — lower impact.

## Impact
- Anyone who knows the server npub can send SMS free of charge.
- Bounded by the pacer to `daily_cap = 20`/UTC-day with a 60-300 s jittered gap
  (`app/transports/pacing.py:83-85`) — so up to 20 messages/day.
- All 20 ride the operator's personal JMP line. The rail is a personal line sold
  as a risk-priced service; abuse is exactly the ToS collision recorded in
  ADR-0003, and the operator already accepted a ban risk there. Free volume
  raises that risk materially.
- Costs the operator the rail fee and the ban risk, and gives an abuser
  untraceable SMS.

## Options for a fix (no code written yet — needs the operator's call)
1. **Validation (correct, more work):** define what a CEP-8 settlement receipt
   actually is (a signed attestation? a preimage against a known payment hash?),
   store settlements server-side, and verify on receipt. Reject anything that
   does not verify, with a distinct reason token.
2. **Remove the branch (small, safe, honest):** drop `settlement_receipt` from
   `sms.send` and `jmp.credentials`, and state in the contract that the only
   accepted PMI is a Cashu token. The lightning path then goes through the token
   path — which is what actually works today anyway.
3. **Fail closed (interim):** keep the parameter but reject any `settlement_receipt`
   until there is a verifier, so the hole cannot be used while the real design lands.

Option 2 is the honest one for now: the token path is the PMI that is implemented
and validated. Claiming a second rail that is not verified is the same class of
overclaim as the Services-tab "done" that turned out not to be done.

## Recommendation
- Fix the SERVER (option 2 or 3 now, option 1 when CEP-8 settlements are real).
- The PWA must use the **`cashu_token`** path — the one that genuinely holds value.
- Do not ship a UI that offers "pay a lightning invoice" until `settlement_receipt`
  verifies, or the UI would be lying about what it collects.

## Also found (blocks the end-to-end test)
`NOSMS_MINT_URL=https://testnut.cashu.space` on the live unit
(`~/.config/systemd/user/nosms-cvm-server.service:18`) — a TEST mint. A token
from a real wallet (e.g. minibits) is refused with `token_wrong_mint`
(cvm_tools.py:235-239). So a genuine end-to-end paid send needs the service
repointed at a real mint, and a funded token for that mint.


## RESOLVED 2026-10-12 (commit 169a935, deployed)

Fixed properly per operator decision (option 2): service-issued settlement
receipts with a real verifier.

- `app/settlements.py` — SQLite SettlementStore: single-use redemption (one
  conditional UPDATE; 8-thread race test: exactly one winner), caller-bound,
  amount-checked, 15-min TTL, 256-bit unguessable, fails closed on dead handle.
- `cvm_tools.sms_send` — receipt path redeems through the store; fabricated /
  wrong-caller / too-small / expired / reused receipts get a visible
  `bad_settlement` refusal. No store wired = refuse (fail closed).
- Live proof (over the wire, 2026-10-12): fabricated `"rcpt-1"` →
  `{"reason":"bad_settlement"}` — the exact string the old code honoured.
- Full suite 812 passed. The two legacy tests asserting the old behaviour
  were replaced with bypass-refused tests.
