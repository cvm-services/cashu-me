# cashu.sms — services design system

Two shipped designs, one toggle. The theme module (`src/js/theme.ts`) sets
`app-theme-dark` / `app-theme-light` on `<html>`; `src/css/services.scss` holds
both token sets. Persisted in `localStorage["theme"]`; falls back to the OS
`prefers-color-scheme` on first visit.

| | Light — "Calm storefront" | Dark — "Terminal" |
|---|---|---|
| ground | `#faf9f7` warm off-white | `#0d0f12` near-black |
| text | `#22272b` | `#e8e6e1` (warm, not pure white) |
| accent | `#0f6a5b` teal | `#f7931a` sats-orange |
| voice | editorial, friendly | terse, price-forward |

## Principles
- **sats first, fiat second.** Price reads `2,900` with the secondary `≈ €0.86` smaller beside it.
- **The row is the tap target.** No nested button to mis-tap; unavailable rows are inert (`tabindex=-1`, `aria-disabled`).
- **Honest by default.** An unavailable service is greyed with the reason inline and no payment path. Escrow behaviour and the missing delivery receipts are stated before money moves.
- **One primary action per step.** compose -> pay -> sent.

## Verification
- Design tokens confirmed present in the built bundle (`assets/index.*.css`).
- Light theme rendered in a headless browser against the real `dist/pwa`: Services page with both cards, sats-first pricing, WhatsApp greyed with its reason.
- `npm run lint` clean; `npm run build:pwa` exit 0.
