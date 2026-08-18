# Production build verification — v1.9.0

Run top to bottom. Each item says **how to check** and **what passing looks
like**, with the numbers this build actually produced on **2026-08-18**, so a
regression is visible rather than merely absent.

Anything marked **BLOCKER** must be resolved before a public URL exists.
Anything marked **manual** cannot be done in CI and needs a human with a phone.

> Re-measured for v1.9.0. The previous edition quoted v1.0.0's numbers — 596
> tests, 125.5 KB, 29 e2e — and had carried a warning saying so since v1.5.0.
> Every figure below was produced by the run that wrote this file.

---

## 0. Pre-flight — repository state

| | Check | Expected |
|---|---|---|
| 0.1 | `package.json` version | **`1.9.0`** |
| 0.2 ✅ | Code licence | **MIT**, `LICENSE` committed (D12). Covers `src/`, `scripts/`, `workers/` and the authored content in `data/`. It does **not** reach `assets/content/`. |
| 0.3 | `README.md` status section | Current for this version. |
| 0.4 | Working tree clean | `git status --short` is empty. |
| 0.5 | Branch up to date | `git log --oneline -1` matches the remote. |
| 0.6 | No unresolved markers | `grep -rn "TODO\|FIXME\|XXX\|HACK" src/ scripts/ workers/` returns nothing. (`UNVALIDATED` in `scripts/ingest/build-ja.ts` is intentional — D41.) |
| 0.7 | Release notes present | The `CHANGELOG.md` entry matches the numbers this run produces. |

```bash
git status --short && node -p "require('./package.json').version"
```

---

## 1. The gate

One command chains typecheck → lint → unit → licences → audio → build → bundle
→ offline. This is what CI runs; if it is red, nothing else on this page matters.

```bash
npm ci && npm run verify
```

| | Check | Expected on this build |
|---|---|---|
| 1.1 | Typecheck | Clean. Strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. |
| 1.2 | Lint | Clean. `no-explicit-any` is an error, not a warning. |
| 1.3 | Unit tests | **752 passed, 60 files**, ~7 s. Zero skipped. |
| 1.4 | Licence gate | **8 datasets declared and attributed; 65 asset files traced.** Fails in *both* directions — an undeclared dataset, and a declared one nothing references. |
| 1.5 | Audio gate | *"no pre-cached audio yet"* until R7 is answered. Once clips ship: budget and index checked in both directions. |
| 1.6 | Build | Succeeds; `dist/` written. |
| 1.7 | Initial JS | **136.7 KB / 200 KB gzipped (68%)** — invariant 6. |
| 1.8 | Initial CSS | **6.9 KB / 40 KB gzipped (17%)**. |
| 1.9 | Offline gate | **65 shards under a 192-entry cache, audio rule present.** See §5.4 below for why this exists. |

A jump in 1.7 with no new feature usually means a lazy chunk became a static
import. `scripts/check-bundle.mjs` walks the real build manifest and counts the
entry chunk plus its transitive static imports, so content shards cannot hide.

---

## 2. End-to-end, against a real production build

```bash
npm run test:e2e
```

| | Check | Expected |
|---|---|---|
| 2.1 | Full suite | **49 passed**, emulated Pixel 5 / android-chrome, ~80 s. |
| 2.2 | Cold start | `coldstart.spec.ts` — icon tap → first answerable question **under 3 s** on a warm cache. This run: **103 ms**. Invariant 12. |
| 2.3 | Installability | Manifest validity, icon resolution, maskable icon, service-worker control, offline `start_url` (D23). |
| 2.4 | Offline session | `session.spec.ts` runs a session with the network cut. |
| 2.5 | Lossless resume | Killing the app mid-session resumes at the exact next item. |
| 2.6 | Zero egress | `sync.spec.ts` drives a full session and the progress screen asserting **no request leaves the origin**. Invariant 21. |
| 2.7 | Placement is optional | `placement.spec.ts` — skipping costs nothing. Invariant 13. |
| 2.8 | Attribution both ways | `attribution.spec.ts` — every shipped dataset appears, no uncleared candidate does, and no dataset the build does not use. |
| 2.9 | Honest empty states | `progress.spec.ts` — every §9 section says it has nothing yet; the radar never shows 0% for an unmeasured axis. |
| 2.10 | Export round-trip | JSON export restores into a fresh install with no account. |
| 2.11 | **WCAG 2.1 AA** | `a11y.spec.ts` — axe over eight screens plus a session mid-answer: **0 violations**. |
| 2.12 | **Keyboard only** | Tab and Enter from home into a session and through an answer, no clicks (§10). |
| 2.13 | **Reduced motion** | Nothing declares a transition under `prefers-reduced-motion` (§10). |
| 2.14 | Topics are optional | Choosing none costs nothing; choosing one survives a cold start (§2.14). |
| 2.15 | The glossary answers nothing | Browsing creates and advances no cards (§2.2, D67). |

---

## 3. Content and licence integrity

| | Check | Expected |
|---|---|---|
| 3.1 | Pipeline determinism | Re-running an ingest script against unchanged input produces **byte-identical** shards. Invariant 10. |
| 3.2 | Manifest hashes | `assets/content/*/manifest.json` SHA-256 per shard matches the shard on disk. |
| 3.3 | EN corpus | 23,497 pairs · 5,245 lexemes · band 1 = 481 words = 70.28% of tokens · teachable ceiling 87.33%. |
| 3.4 | JA corpus | 15,324 pairs (5,919 direct + 9,405 triangulated) · 6,904 lexemes · **1,748 / 1,748 kanji** with components. |
| 3.5 | Glosses | EN **1,581 (30.1%)**, JA **274 (4.0%)** — partial by measurement, reference only, never an answer key (D59). |
| 3.6 | Passages | **1,680** from Simple English Wikipedia, banded; English only (D61). |
| 3.7 | Chunks | EN **73**, JA **23**, every one anchored to a real sentence or the build fails (D64). |
| 3.8 | Topics | EN 12 clusters / 366 items (6.9%), JA 7 / 137 (2.0%). Coverage published in the shard (D65). |
| 3.9 | Contrastive packs | EN 21 categories / 126 drills / 75 false friends; JA 14 / 37 / **6 positive-transfer notes**. Drill types: mcq, cloze, minimal-pair, correction. |
| 3.10 | No YAML in the bundle | `data/**/*.yaml` is compiled at build time; `yaml` is a devDependency only. |
| 3.11 | `NOTICE.md` current | Every `datasets` entry has a matching section; no `candidates` key is referenced from `assets/`. Invariant 5. |
| 3.12 | Share-alike honoured | Japanese shards **CC BY-SA 4.0**; English sentences **CC BY 2.0 FR**; glosses and passages **CC BY-SA 4.0 in their own shards**, so share-alike does not travel (D60). |

---

## 4. The build artifact

```bash
npm run build && npm run preview
```

| | Check | Expected |
|---|---|---|
| 4.1 | `dist/` contents | `index.html`, `manifest.webmanifest`, `sw.js`, `workbox-*.js`, `assets/`, `content/`, `icons/`. |
| 4.2 | Precache size | **44 entries · 5.62 MB raw · 1.32 MB gzipped** — both languages, bands 1–3 lexemes, anchors, glosses and chunks, both contrastive packs, both topic maps. Budget is 8 MB for a beginner's first download (§5.3). |
| 4.3 | What is *not* precached | Passages, band 4+ shards and audio are fetched on demand and cached at runtime — a beginner should not pay for them on first load. |
| 4.4 | No source maps served | Decide explicitly: the build emits `.map` files. Ship them or strip them, but on purpose. |
| 4.5 | No secrets | `grep -rn "token\|secret\|api[_-]key" dist/assets/*.js` finds nothing that is a value. There is no server and no build-time secret by design. |
| 4.6 | Update strategy | `registerType: 'autoUpdate'` — a new deploy takes effect on next load without a prompt. |
| 4.7 | Icons | 192, 512, maskable 512, apple-touch, favicon.svg present and referenced by the manifest. |

---

## 5. Manual device verification

**Everything in this section is manual.** Real hardware, not an emulator.

### 5.1 The offline promise

1. Load the deployed URL on a phone, complete first run (two taps).
2. Answer at least one question so a card exists.
3. Open the reader so a passage is fetched, and the glossary so it is populated.
4. Enable airplane mode, kill the app entirely, relaunch from the home icon.

Passing: the app loads, a session starts, questions are answerable, the reader
still has its passage, progress persists. Nothing anywhere says "you are
offline" as an error.

Step 3 is new and it is the point: **content fetched at runtime is the half of
the offline promise a precache cannot keep**, and the cap that governs it was
one shard away from evicting content when this was written. See §5.4.

### 5.2 Install

Passing: the install prompt appears in Chrome Android; the installed app opens
standalone, portrait, correct icon and splash. The **"Latihan 4 menit"**
launcher shortcut opens straight into a session.

### 5.3 **BLOCKER (manual)** — the speech device matrix

`docs/DECISIONS.md` Part 3. **One row of five is filled**, and it already
corrected the code: a Chrome 151 Android phone with working on-device voices in
both languages completed at 932 ms and 999 ms, over the old 500 ms deadline, so
the app had been withholding L4 and the mora drills from a device that could do
both. The deadline is now 2,000 ms.

Collect the remaining rows from the app: **Pengaturan → "Uji suara di HP ini" →
"Uji audio sekarang"**, then paste the markdown it produces.

The most valuable row left is **a device with no TTS engine installed**. It is
the only configuration that can confirm or refute M4's ~15 s first-call stall,
and the one filled row cannot, because that phone had an engine.

### 5.4 Degradation, deliberately provoked

| | Check | Expected |
|---|---|---|
| 5.4.1 | Device with no TTS engine | L4 withheld; promotion still runs **3 → 5**; L5 and L6 reachable (D48). |
| 5.4.2 | Home screen on a silent device | Says in Indonesian that listening practice is hidden, and why. |
| 5.4.3 | A card sitting at L4 when audio dies | Demoted **visibly**; the log records the rung actually answered. |
| 5.4.4 | No `SpeechRecognition` | Shadowing falls back to record-and-compare; the text field is present; progression is never blocked. |
| 5.4.5 | Storage pressure / denied persistence | The status panel reports durability honestly. Content caches carry `purgeOnQuotaError`, so a full device drops re-fetchable content rather than failing — review history is never what gets evicted. |

---

## 6. Deploy — Cloudflare Workers Static Assets

| | Check | Expected |
|---|---|---|
| 6.1 | Workers Builds settings | Build `npm run build` · deploy `npx wrangler deploy` · path empty · `NODE_VERSION` = `22`. |
| 6.2 | Only one variable | `NODE_VERSION`. There are no secrets and no server. |
| 6.3 | Routing | Single page, query-param driven (`/?latihan=4`) — `not_found_handling` is `"none"`, **not** `"single-page-application"`. An SPA fallback would answer a missing content shard with `index.html` and a 200, turning a clean 404 into a JSON parse error further down. |
| 6.3b | `wrangler.jsonc` | At the repo root, assets-only, pointing at `./dist`. Validate with `npx wrangler deploy --dry-run`. |
| 6.4 | HTTPS + HSTS | Service workers require a secure context. |
| 6.5 | `sw.js` not long-cached | Must be revalidated or a stale worker pins learners to an old build. Hash-named assets may be cached hard. |
| 6.6 | Custom domain | DNS resolves, certificate valid, `start_url` (`/`) and `scope` (`/`) match the deployed origin. |

### 6.7 Post-deploy smoke, on the live URL

1. First run → one language and minutes → local profile, no signup.
2. Placement offered → **skip it** → home still offers it.
3. Session → answer to the end screen → it reports what got stronger, **not points**.
4. Progress → every section shows a real number or says it has nothing yet. **No level label anywhere.**
5. Glossary → shows what was answered; opening an entry answers nothing.
6. Reader → a passage renders with its source article named; tap a word → gloss or an honest "no dictionary" → mine a word → it appears next session, and no card was created by the tap.
7. Settings → topics offered; choosing none is fine and says so.
8. Attribution → Tatoeba, EDRDG, Wiktionary and Simple English Wikipedia listed; nothing listed that is not shipped.
9. Sync is **off**, with copy saying the app does not need it.
10. DevTools → Network, with sync off: **no request leaves the origin** during a full session.

---

## 7. Sync — only if you are deploying the Worker

If you are not, the check is that it stays off: items 2.6 and 6.7.10 are the
whole verification, and `workers/` can be deleted without touching the app.

| | Check | Expected |
|---|---|---|
| 7.1 | Limits re-verified | Read 2026-08-11: 100k Workers requests/day, 10 ms CPU/request, 100k D1 row writes/day, 5M row reads/day. **Confirm current before relying on them.** |
| 7.2 | Delta shape | One D1 row **per session**, not per review (D51). |
| 7.3 | Worker only routes | It never reads inside a delta; merge logic is pure and on the client. |
| 7.4 | Token handling | Bearer token in `localStorage`, never Dexie, so it cannot land in an export (D52). |
| 7.5 | Failure is inert | A failed sync leaves local data untouched. |
| 7.6 | Still opt-in | No default endpoint. |

---

## 8. Ship

| | Step |
|---|---|
| 8.1 | Version, `CHANGELOG.md` entry and `README.md` status current. |
| 8.2 | `git tag -a v1.9.0 -m "LinguaKu v1.9.0"` and push the tag. |
| 8.3 | Confirm the deployed commit hash equals the tagged commit. |
| 8.4 | Re-run 6.7 against the production URL after the tag deploy. |

**Rollback:** Cloudflare keeps prior deployments — roll back in the dashboard.
`autoUpdate` means clients pick it up on next load; a client mid-session
finishes on the build it started with. No data migration is involved: all
learner data is local, and the Dexie schema is unchanged by a rollback within
v1.x.

---

## Open items carried into launch

Known and accepted, not oversights. They belong in the release notes and in any
support channel that exists on day one.

1. **R7 — the voice model.** The audio pipeline, its CI gate and the runtime
   fallback all exist and have nothing to serve. Blocked on reading and dating a
   voice model's licence. `docs/AUDIO-RUNBOOK.md` is the whole procedure.
   **There is no Japanese Piper voice at all** — 173 voices, 54 language codes,
   no `ja_JP` — so Japanese stays synthesis-or-nothing.
2. **The device matrix: four rows of five.** The first one already changed the
   code; the app collects the rest in five taps.
3. **The Indonesian copy wants a native pass** — now including the diagnostics
   screen, the passage reader, the kana keyboard, the glossary, 96 chunk glosses
   and 19 topic labels.
4. **The sync Worker is undeployed and unproven.** Deploy it once, or delete it.
5. **Chunks and topics are partial by design**, and both say so: 73 + 23 phrases,
   6.9% + 2.0% topic coverage. Growing them is content work, not code.
