# Services CVM payment integration — plan

## Goal

Make the SMS service actually work end to end in the PWA: user pays, an SMS is
sent, the operator can test it manually on their phone.

Today the pay step is a placeholder (`confirm-pay-btn` flips `step = "sent"`),
which is why paying produced a mock invoice and no SMS. Nothing else in the app
can pay the CVM.

## Protocol (from /home/c03rad0r/repos/nosms/docs/cvm/llms.txt + reference client)

- Transport: MCP JSON-RPC over Nostr. Build a **kind 25910 rumor**, JSON-RPC body,
  tag `["p", <server pubkey>]`, then **gift-wrap (NIP-59)** to the server pubkey.
- Correlation: poll received gift-wraps for a reply whose JSON-RPC `id` matches.
- Tools: `sms.pricing`, `sms.capabilities` (free), `sms.send` (PAID), `sms.status`.
- Discovery: CEP-6 announcements, kinds 11316-11320.
- Server npub: npub1yfd2zvsq3lmz7n6ckjt77rm0a56s3d49n2xvpc0ct2tzx24c4wuqn4h6hf
- Relays: relay.contextvm.org, relay2.contextvm.org, relay.primal.net
- Payment (CEP-8, explicit gating): unpaid `sms.send` answers `payment_required`.
  Paid call carries `cashu_token` OR `settlement_receipt`. 2900 sats flat.
- A passed token is swapped at the mint on receipt; hard rail failures auto-refund,
  a best_effort miss is not (no delivery receipts on this rail).

## Phases

0. Probe — confirm the live CVM's real unpaid response, token field name, and the
   lightning/settlement_receipt shape. Evidence, not docs.
1. Transport — `src/js/cvm.ts`: gift-wrapped kind-25910 request/response over the
   contextvm relays, using the wallet's existing NIP-44/NDK plumbing.
2. Payment — token path first (spend from the Cashu wallet), LN path second.
3. UI — replace the placeholder pay step with a real invoice surface: amount,
   accept token or pay bolt11, pending state, honest best_effort caveat, refund note.
4. E2E — pay a real 2900-sat send to a real number; confirm via `sms.status`.
5. Tests + deploy to the orangesync subdomain; gateway restart; surface for manual test.

## Constraints

- Honest UI: no delivery guarantee on this rail; no delivery receipts.
- The rail's `cap:tool:sms.send:2900:sats` is authoritative, not the catalog copy.
- Never fake a success. An unpushed, unverified claim is not a result.
