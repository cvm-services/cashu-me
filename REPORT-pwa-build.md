# REPORT — cashu.me CVM services PWA build verification

**Date:** 2026-10-12
**Worktree:** `/home/c03rad0r/repos/cashu-me/.worktrees/t_55415198`
**Branch:** `wt/cashu-services-ui` @ `faaa015` — *feat: add CVM services catalogue and facilitator console*
**Machine:** node v22.22.1 / npm 9.2.0; load avg 15–31 on 4 cores during run.

---

## 1. Baseline

`git status --short` → **empty** (working tree clean, up to date with `origin/wt/cashu-services-ui`).

`git log --oneline -3`:
```
faaa015 feat: add CVM services catalogue and facilitator console
e21f5fa Merge pull request #592 from a1denvalu3/feat/onchain-deposit-limits
bec6ac5 feat(onchain): render BIP321 QR for deposit addresses with an amount
```

`git show --stat faaa015` — files touched by HEAD:
```
 PROGRESS.md                       |   6 ++
 REPORT.md                         |  19 ++++++
 public/catalog.json               |  28 +++++++++
 src/components/MainHeader.vue     |   1 +
 src/i18n/en-US/index.ts           |  41 +++++++++++++
 src/pages/ServicesConsolePage.vue |  18 ++++++
 src/pages/ServicesPage.vue        | 124 ++++++++++++++++++++++++++
 src/router/routes.js              |   9 +++
 8 files changed, 246 insertions(+)
```

### ⚠️ PHASE-DOC LEAK CONFIRMED (report-only, history NOT rewritten)
`PROGRESS.md` and `REPORT.md` **are committed inside faaa015** (they are tracked; `git ls-files` lists both). They are worker phase notes, not product code, and should not be in a feature commit. **No history was rewritten.**

`REPORT.md` also contains a self-contradicting verification claim (lines 16–17):
> `npm run lint`: blocked because the workspace lacks the executable local ESLint dependency; npm install was attempted but failed with a network socket timeout.
> Build and e2e could not be run because dependencies were not installable in this environment.

That claim is **false in this environment** — lint, tests and the PWA build all ran green (below). `REPORT.md` line 19 also says *"The changes are intentionally uncommitted"* while the same commit committed them.

## 2. Disk free space

| stage | `df -h /` avail |
|---|---|
| before (baseline) | **4.3 G** (99% used) |
| after install/build | **2.6 G** (99% used) |

Never dropped below the 1.5 G stop threshold. (Note: the task brief said ~4.9 G free; measured value is 4.3 G.)

## 3. Dependency install

`node_modules` already contained **958 packages / 952 M** and, contrary to the brief, the previously-"missing" packages are present:

```
PRESENT quasar   PRESENT vitest   PRESENT @typescript-eslint/parser
PRESENT vue      PRESENT @quasar/app-vite
```

`npm ls --depth=0` resolves **all 52 declared top-level dependencies with no missing/invalid/extraneous entries**. No `npm install` was therefore required, and **none was run** (avoiding a further ~1 GB disk cost). Not leaving `/` at 99%.

## 4. lint / test / build — REAL results

| command | exit | result | duration |
|---|---|---|---|
| `npm run lint` | **0** | eslint clean, zero findings | ~66 s |
| `npm run test:ci` | 0 | **Test Files 29 passed (29) · Tests 274 passed (274)** | 111.8 s |
| `npm run build:pwa` | **0** | **Build succeeded** | 01:49:04 → 02:05:16 (~16 min) |

Build output folder (verbatim): `/home/c03rad0r/repos/cashu-me/.worktrees/t_55415198/dist/pwa`
`du -sh dist/pwa` → **11M**

## 5. PWA installability evidence

Confirmed present in `dist/pwa/`:

| artifact | status | detail |
|---|---|---|
| `index.html` | ✅ 3130 B | `<link rel="manifest" href="/manifest.json">`, `<meta name="theme-color" content="#000000">` |
| `manifest.json` | ✅ 1390 B | full Web App Manifest (name/short_name/start_url/icons/screenshots) |
| `manifest.webmanifest` | ✅ 970 B | Quasar icon-gen manifest |
| `sw.js` | ✅ 16646 B | real Workbox: `precacheAndRoute([...])` with revisioned asset URLs, `setCacheNameDetails({prefix:"cashu"})`, `skipWaiting`, `clientsClaim` |
| `workbox-c1cfc6fb.js` | ✅ 15206 B | Workbox runtime |
| icons | ✅ | `icons/` has icon-128/192/256/384/512 PNGs + apple-touch + favicon set |
| `catalog.json` | ✅ 774 B | copied to dist root (served at `/catalog.json`) |

Manifest (`dist/pwa/manifest.json`, verbatim):
```json
{"id":"cashu","name":"Cashu.me","short_name":"Cashu.me","description":"A Cashu Ecash wallet for the web.","display":"standalone","start_url":"/","orientation":"portrait","background_color":"#000000","theme_color":"#000000","protocol_handlers":[{"protocol":"web+cashu","url":"/?token=%s"},{"protocol":"web+lightning","url":"/?lightning=%s"}],"icons":[{"src":"icons/icon-128x128.png","sizes":"128x128","type":"image/png","purpose":"maskable"},{"src":"icons/icon-192x192.png","sizes":"192x192","type":"image/png","purpose":"maskable"},{"src":"icons/icon-256x256.png","sizes":"256x256","type":"image/png","purpose":"maskable"},{"src":"icons/icon-384x384.png","sizes":"384x384","type":"image/png","purpose":"maskable"},{"src":"icons/icon-512x512.png","sizes":"512x512","type":"image/png","purpose":"maskable"},{"src":"icons/icon-512x512.png","sizes":"512x512","type":"image/png","purpose":"any"}],"screenshots":[{"src":"/screenshots/narrow-1.png","form_factor":"narrow","sizes":"542x942","type":"image/png","label":"fullscreen view"},{"src":"/screenshots/narrow-2.png","form_factor":"narrow","sizes":"542x942","type":"image/png","label":"fullscreen view"},{"src":"/screenshots/wide-1.png","form_factor":"wide","sizes":"1910x932","type":"image/png","label":"fullscreen view"},{"src":"/screenshots/wide-2.png","form_factor":"wide","sizes":"1910x932","type":"image/png","label":"fullscreen view"}]}
```

`dist/pwa/manifest.webmanifest` icons use `../icons/icon-NN.webp` sources (Quasar icon-gen output), also genuine.

**Verdict: the build output is a genuine installable PWA** (manifest wired into index.html with name + start_url + maskable icons, plus a real Workbox service worker precaching 142 built assets).

## 6. Services page — SMS vs WhatsApp exposure

`src/pages/ServicesPage.vue` (the only new customer page; route `/services` added in `src/router/routes.js`; header link added in `src/components/MainHeader.vue`). It is a **pure static-catalogue renderer** — its only import is `defineComponent`; the single data source is `fetch("/catalog.json")`.

### ❌ SMS entry point: ABSENT
`grep -rniE '\bsms\b' src public scripts test *.md` → **zero matches anywhere in the repository.** There is no SMS service entry, no SMS string, no SMS branch. **No SMS ContextVM entry point is exposed.**

### ❌ WhatsApp entry point: present only as a permanently-disabled card, NO Pay action
The exact deciding line (`src/pages/ServicesPage.vue:113`) — the `available` flag is hard-forced false for WhatsApp:
```js
available: entry.available !== false && entry.transport !== "whatsapp", npub: entry.npub,
```
So `transport === "whatsapp"` ⇒ `available === false`, regardless of the catalogue's `available` field.

The Pay action is rendered **only** when `available` is true (`src/pages/ServicesPage.vue:34`):
```html
<q-btn v-if="service.available" color="primary" unelevated :label="$t('services.pay')" @click="selected = service" />
```
And the card is additionally badged Unavailable (`:26`) with a dimmed class (`:19`, `.service-unavailable`).

Compiled proof (`dist/pwa/assets/ServicesPage.acffcb1d.js`):
- forced flag: `available:o.available!==!1&&o.transport!=="whatsapp"`
- Pay button ternary: `a.available?(n(),m(d,{key:0,color:"primary",unelevated:"",label:e.$t("services.pay"),...})):q("")` → renders **nothing** when unavailable.

Catalogue fixture `public/catalog.json` (copied verbatim into `dist/pwa/catalog.json`) also ships WhatsApp as:
```json
{
  "id": "whatsapp-cvm",
  "name": "WhatsApp CVM",
  "announcement": "Unavailable until the WhatsApp rail reports available=true.",
  "price_sats": 250,
  "transport": "whatsapp",
  "available": false
}
```
The only other entry is `example-cvm`, a generic 100-sat fixture — **not** an SMS service.

### Verdict
The earlier review finding **still holds, unchanged.** The Services page exposes:
- **SMS:** not exposed at all (0 references repo-wide).
- **WhatsApp:** rendered as a card that is **forced unavailable with no Pay action**, decided at `src/pages/ServicesPage.vue:113` (the `&& entry.transport !== "whatsapp"` clause) plus the `v-if="service.available"` guard at line 34. Forcing is hardcoded; it is not data-driven, even though the fixture's `announcement` claims it would activate "until the WhatsApp rail reports available=true" — no code path reads such a signal.

Additionally, the generic Pay flow is a stub: the confirm dialog's Pay button only sets `paymentNotice = true` (`:64`) and shows the `services.notWired` copy — i.e. **even the one nominally-available fixture has no wired payment**, which the UI honestly discloses ("Payment is not wired end-to-end in this release.").

## 7. Hard-rule compliance
No merge, no push, no force-push, no history rewrite. `npm run dev` was never started (one-shot commands only). Worktree reused as given; no `/tmp` worktree created.
