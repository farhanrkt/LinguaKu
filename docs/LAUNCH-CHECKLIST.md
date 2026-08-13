# Production build verification — v1.0.0

> **Numbers below are v1.0.0's and have not been re-measured for v1.5.0.** The
> current figures are in `CHANGELOG.md`: 724 unit tests, 45 e2e, 136.2 KB
> initial JS, 9 cleared datasets. The *procedure* is unchanged and still the
> one to follow. Two items moved: 5.3's device matrix is now collectable from
> inside the app (Settings → "Uji suara di HP ini"), and the pre-cached audio
> blocker is now risk **R7** — a voice model's licence, not a code path.

Run top to bottom. Each item says **how to check** and **what passing looks
like**, with the numbers this build actually produced on 2026-08-11 so a
regression is visible rather than merely absent.

Anything marked **BLOCKER** must be resolved before a public URL exists.
Anything marked **manual** cannot be done in CI and needs a human with a phone.

---

## 0. Pre-flight — repository state

| | Check | Expected |
|---|---|---|
| 0.1 ✅ | `package.json` version | **`1.0.0`**. Resolved 2026-08-11. |
| 0.2 ✅ | Code licence | **MIT**, `LICENSE` committed. D12 settled 2026-08-11. `LICENSE`, `NOTICE.md` and `README.md` all state that MIT covers the code only and that the Japanese content shards remain CC BY-SA 4.0 with share-alike. |
| 0.3 ✅ | `README.md` status section | Rewritten for v1.0.0 (M0–M7), linking `CHANGELOG.md` and this checklist. Resolved 2026-08-11. |
| 0.4 | Working tree clean | `git status --short` is empty. |
| 0.5 | On `main`, up to date | `git log --oneline -1` matches the remote. |
| 0.6 | No unresolved markers | `grep -rn "TODO\|FIXME\|XXX\|HACK" src/ scripts/ workers/` returns nothing. (`UNVALIDATED` in `scripts/ingest/build-ja.ts` is intentional and documented — D41.) |
| 0.7 | Release notes present | `CHANGELOG.md` v1.0.0 entry matches the numbers this run produces. |

```bash
git status --short && node -p "require('./package.json').version"
```

---

## 1. The gate

One command chains typecheck → lint → unit → licences → build → bundle budget.
This is what CI runs; if it is red, nothing else on this page matters.

```bash
npm ci && npm run verify
```

| | Check | Expected on this build |
|---|---|---|
| 1.1 | Typecheck | Clean. Strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. |
| 1.2 | Lint | Clean. `no-explicit-any` is an error, not a warning. |
| 1.3 | Unit tests | **596 passed, 39 files**, ~15 s. Zero skipped. |
| 1.4 | Licence gate | **7 datasets declared and attributed; 38 asset files traced.** |
| 1.5 | Build | Succeeds; `dist/` written. |
| 1.6 | Initial JS | **125.5 KB / 200 KB gzipped (63%)** — invariant 6. |
| 1.7 | Initial CSS | **6.5 KB / 40 KB gzipped (16%)**. |

A jump in 1.6 with no new feature usually means a lazy chunk became a static
import. `scripts/check-bundle.mjs` walks the real build manifest and counts the
entry chunk plus its transitive static imports, so content shards cannot hide.

---

## 2. End-to-end, against a real production build

```bash
npm run test:e2e
```

| | Check | Expected |
|---|---|---|
| 2.1 | Full suite | **29 passed**, emulated Pixel 5 / android-chrome, ~40 s. |
| 2.2 | Cold start | `coldstart.spec.ts` — icon tap → first answerable question **under 3 s** on a warm cache. This run: **1.4 s**. Invariant 12. |
| 2.3 | Installability | Manifest validity, icon resolution, maskable icon, service-worker control, offline `start_url`. These replace the removed Lighthouse PWA category (D23). |
| 2.4 | Offline session | `session.spec.ts` runs a session with the network cut. |
| 2.5 | Lossless resume | Killing the app mid-session resumes at the exact next item. |
| 2.6 | Zero egress | `sync.spec.ts` drives a full session and the progress screen asserting **no request leaves the origin**. Invariant 21. |
| 2.7 | Placement is optional | `placement.spec.ts` — skipping costs nothing. Invariant 13. |
| 2.8 | Attribution both ways | `attribution.spec.ts` — every shipped dataset appears, no uncleared candidate does. This is an EDRDG licence condition, not a courtesy. |
| 2.9 | Honest empty states | `progress.spec.ts` — every §9 section says it has nothing yet; the radar never shows 0% for an unmeasured axis. |
| 2.10 | Export round-trip | JSON export restores into a fresh install with no account. |

---

## 3. Content and licence integrity

| | Check | Expected |
|---|---|---|
| 3.1 | Pipeline determinism | Re-running an ingest script against an unchanged corpus produces **byte-identical** shards. Invariant 10 — churn here means every learner re-downloads for nothing. |
| 3.2 | Manifest hashes | `assets/content/*/manifest.json` SHA-256 per shard matches the shard on disk. Covered by the content-integrity unit tests. |
| 3.3 | EN corpus | 23,497 pairs · 5,245 lexemes · band 1 = 481 words = 70.28% of tokens · teachable ceiling 87.33%. |
| 3.4 | JA corpus | 15,324 pairs (5,919 direct + 9,405 triangulated) · 6,904 lexemes · **1,748 / 1,748 kanji with components**. |
| 3.5 | Contrastive packs | EN 21 categories / 116 drills / 75 false friends; JA 14 categories / 32 drills / **6 positive-transfer notes**. The compiler fails the build on an MCQ whose answer is missing from its options, a category with no minimal pair, or a drill with no explanation. |
| 3.6 | No YAML in the bundle | `data/contrastive/*.yaml` is compiled at build time; `yaml` is a devDependency only. |
| 3.7 | `NOTICE.md` current | Every entry in `data/licenses.json → datasets` has a matching section. No `candidates` key is referenced from `assets/`. Invariant 5. |
| 3.8 | Share-alike honoured | Japanese shards declare **CC BY-SA 4.0** (EDRDG mixed with Tatoeba takes the stricter term); English shards declare CC BY 2.0 FR. |

```bash
node -e "const m=require('./assets/content/ja/manifest.json');console.log(m.license,m.sources.join(', '))"
```

---

## 4. The build artifact

```bash
npm run build && npm run preview
```

| | Check | Expected |
|---|---|---|
| 4.1 | `dist/` contents | `index.html`, `manifest.webmanifest`, `sw.js`, `workbox-*.js`, `assets/`, `content/`, `icons/`. |
| 4.2 | Precache size | **30 entries · 5.38 MB raw · 1.31 MB gzipped** — both languages, bands 1–3 lexemes and anchors, plus both contrastive packs. Budget is 8 MB for a beginner's first download. |
| 4.3 | Precache contents | Starter bands are **precached, not runtime-cached** (D20) — runtime caching only delivers offline if the learner happened to be online for a whole session first. |
| 4.4 | No source maps served | Decide explicitly: the build currently emits `.map` files (`index-*.js.map` is 1.6 MB). Ship them or strip them, but do it on purpose. |
| 4.5 | No secrets | `grep -rn "token\|secret\|api[_-]key" dist/assets/*.js` finds nothing that is a value. There is no server and no build-time secret by design. |
| 4.6 | Update strategy | `registerType: 'autoUpdate'` — a new deploy takes effect on next load without a prompt. |
| 4.7 | Icons | 192, 512, maskable 512, apple-touch, favicon.svg all present and referenced by the manifest. |

---

## 5. Manual device verification

**Everything in this section is manual.** Do it on real hardware, not an
emulator, and record what you see.

### 5.1 The offline promise

1. Load the deployed URL on a phone, complete first-run (two taps).
2. Answer at least one question so a card exists.
3. Enable airplane mode.
4. Kill the app entirely and relaunch from the home-screen icon.

Passing: the app loads, a session starts, questions are answerable, progress
persists. Nothing anywhere says "you are offline" as an error.

### 5.2 Install

Passing: the install prompt appears in Chrome Android; the installed app opens
standalone (no browser chrome), portrait, with the correct icon and splash.
The **"Latihan 4 menit"** launcher shortcut opens straight into a session.

### 5.3 **BLOCKER (manual)** — the speech device matrix

`docs/DECISIONS.md` Part 3 is **still empty**, and has been since M4. It is the
last technical unknown in the product. Fill these rows from observation; an
invented row is worse than an empty one.

| Browser / device | `speechSynthesis` en-US | `speechSynthesis` ja-JP | Offline voice (`localService`) | **First-call latency** | `SpeechRecognition` |
|---|---|---|---|---|---|
| Chrome, Android (mid-range) | | | | | |
| Chrome, Android (low-end, no TTS engine installed) | | | | | |
| Firefox, Android | | | | | |
| Safari, iOS | | | | | |
| Chrome, desktop | | | | | |

Three specific questions the matrix has to answer:

- **Is 500 ms the right `onend` deadline** on a cheap Android? Too tight
  withholds L4 from devices that would have worked; too loose passes an engine
  that announces itself and goes silent.
- **Does the ~15 s first-call stall reproduce?** M4 measured
  `speechSynthesis`'s first call blocking the main thread for ~15 s where no
  speech service is installed — five times the entire cold-start budget. The
  probe is deferred until after first paint because of it. If it reproduces on
  real hardware, the probe may belong behind an explicit "test audio" button.
- **Does iOS Safari's gesture requirement cost real learners their listening
  material?** The probe will mark iOS dead where audio might have worked from
  inside a tap. Reversible, and the matrix should decide it.

### 5.4 Degradation, deliberately provoked

| | Check | Expected |
|---|---|---|
| 5.4.1 | Device with no TTS engine | L4 withheld; promotion still runs **3 → 5**; L5 and L6 reachable. A missing listening rung must not cost production (D48). |
| 5.4.2 | Home screen on a silent device | Says in Indonesian that listening practice is hidden, and why. |
| 5.4.3 | A card sitting at L4 when audio dies | Demoted **visibly**; the review log records the rung actually answered. Never presented as text while the log claims L4. |
| 5.4.4 | No `SpeechRecognition` | Shadowing falls back to record-and-compare; the text field is present; progression is never blocked. |
| 5.4.5 | Storage pressure / denied persistence | The status panel reports durability honestly rather than silently. |

---

## 6. Deploy — Cloudflare Workers Static Assets

D2 said "Cloudflare Pages"; Cloudflare now routes Git-connected static sites
through **Workers Builds**. Same account, same free tier, and an assets-only
Worker (no `main`) is never billed as an invocation — invariant 4 is unaffected.

| | Check | Expected |
|---|---|---|
| 6.1 | Workers Builds settings | Build `npm run build` · deploy `npx wrangler deploy` · path empty · `NODE_VERSION` = `22`. |
| 6.2 | Only one variable | `NODE_VERSION`. There are no secrets and no server; anything else in that panel is wrong. |
| 6.3 | Routing | Single page, query-param driven (`/?latihan=4`) — no path routing, so `not_found_handling` is `"none"`, **not** `"single-page-application"`. An SPA fallback would answer a missing content shard with `index.html` and a 200, turning a clean 404 into a JSON parse error further down. |
| 6.3b | `wrangler.jsonc` | At the repo root, assets-only, pointing at `./dist`. Distinct from `workers/sync/wrangler.toml`, which is the optional sync Worker and is deployed separately. Validate with `npx wrangler deploy --dry-run`. |
| 6.4 | HTTPS + HSTS | Service workers require a secure context. |
| 6.5 | `sw.js` not long-cached | The service worker must be revalidated or a stale one pins learners to an old build. Content shards are hash-named and may be cached hard. |
| 6.6 | Custom domain | DNS resolves, certificate valid, `start_url` (`/`) and `scope` (`/`) match the deployed origin. |

### 6.7 Post-deploy smoke, on the live URL

1. First run → language and minutes → local profile created, no signup.
2. Placement offered → **skip it** → home screen still offers it.
3. Start a session → answer through to the end screen → it reports what got
   stronger, **not points**.
4. Progress screen → every section either shows a real number or says it has
   nothing yet. **No level label anywhere.** No bar of zero on an unmeasured
   axis.
5. Reader → tap a word → gloss panel opens → mine a word → confirm it appears
   in the next session and that no card was created by the tap alone.
6. Attribution screen → Tatoeba and all EDRDG datasets listed; nothing listed
   that is not shipped.
7. Settings → sync is **off**, with copy saying the app does not need it.
8. DevTools → Network, with sync off: **no request leaves the origin** during a
   full session.

---

## 7. Sync — only if you are deploying the Worker

If you are not, the check is simply that it stays off: item 2.6 and 6.7.8 are
the whole verification, and `workers/` can be deleted without touching the app.

| | Check | Expected |
|---|---|---|
| 7.1 | Limits re-verified | Read 2026-08-11: 100k Workers requests/day, 10 ms CPU/request, 100k D1 row writes/day, 5M row reads/day. **Confirm current before relying on them.** |
| 7.2 | Delta shape | One D1 row **per session**, not per review (D51). A row per review caps the free tier at ~3,300 sessions/day. |
| 7.3 | Worker only routes | It never reads inside a delta; merge logic is pure and on the client in `src/core/delta.ts`. This is what keeps it inside 10 ms. |
| 7.4 | Token handling | Bearer token lives in `localStorage`, never Dexie, so it cannot end up inside an export bundle the learner might share (D52). |
| 7.5 | Failure is inert | A failed sync leaves local data untouched — asserted by `sync.spec.ts`. |
| 7.6 | Still opt-in | No default endpoint. The learner points it at infrastructure they run. |

---

## 8. Ship

| | Step |
|---|---|
| 8.1 | `package.json` at `1.0.0`, `CHANGELOG.md` entry final, `README.md` status current. |
| 8.2 | Code licence decided and a `LICENSE` file committed (0.2). |
| 8.3 | `git tag -a v1.0.0 -m "LinguaKu v1.0.0"` and push the tag. |
| 8.4 | Confirm the deployed commit hash equals the tagged commit. |
| 8.5 | Re-run 6.7 against the production URL after the tag deploy. |

**Rollback:** Cloudflare Pages keeps prior deployments — roll back in the
dashboard. Note that `autoUpdate` means clients pick up the rollback on next
load; a client mid-session finishes on the build it started with. No data
migration is involved, because all learner data is local and the Dexie schema is
unchanged by a rollback within v1.x.

---

## Open items carried into launch

These are known and accepted, not oversights. They belong in the release notes
and in any support channel that exists on day one.

1. **R1 — the device matrix (5.3).** The last technical unknown. It gates L4,
   three Japanese drills, the listening axis of the radar, and shadowing.
2. **Pre-cached audio.** Design approved, not started, and blocked on choosing
   and dating a voice-model licence before a clip enters `assets/`. Until then
   the fallback chain's first step has nothing to serve.
3. **The sync Worker is undeployed and unproven.** Deploy it once to test the
   arithmetic, or delete `workers/` — the app has never depended on it.
4. **The Indonesian copy wants a native pass**, particularly the Japanese
   drills, the phonology tips, and the reader's word panel.
5. **The weekly recap** (§9's last line) is computed but unbuilt, pending a
   product call on whether it is a screen, a home-screen card, or the body of
   the habit notification.
