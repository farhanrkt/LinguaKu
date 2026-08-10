# Decisions and risk register

Standing technical decisions, and an honest reading of what is most likely to
break. Written at M0 per SPEC §15; updated whenever a decision changes or a
risk resolves.

---

## Part 1 — Risk register

Ordered by how much of the product dies if the assumption is wrong.

### R1 — Web Speech API voices on cheap Indonesian Android devices

**Status:** the probe shipped in M2; the device matrix is still unrun, and this
remains the single most fragile assumption in the app.

SPEC §2.6 makes audio mandatory (every item ships with pronounceable audio, and
audio-only L4 cards are a required rung of the ladder). SPEC §5.1 says that
audio comes free from `speechSynthesis`. Those two together are load-bearing
for the entire listening half of the product, and the second one is an
assumption we have not tested on a single real device.

What makes it fragile, specifically:

- On Android, `speechSynthesis` delegates to whatever TTS engine is installed.
  Coverage of `ja-JP` — and the presence of an *offline* voice rather than one
  that silently requires network — varies by OEM ROM and by whether the user
  ever downloaded the voice data. A device that speaks English fine may have no
  Japanese voice at all.
- `getVoices()` populates asynchronously; a naive probe on first paint returns
  an empty list and looks identical to "no voices installed".
- `voice.localService` is the only signal distinguishing on-device synthesis
  from a network round trip, and an app that claims to work offline cannot
  rely on the network one.
- Firefox and iOS Safari each have their own gaps and gesture requirements.

**Mitigation (shipped, M2):** `src/platform/speech.ts` waits for
`voiceschanged`, enumerates voices per target language, prefers
`localService`, and speaks a timed silent utterance before declaring success —
which catches the engine that lists a voice and then never speaks. The verdict
is surfaced honestly in the UI, and `canScheduleAudioOnly` is the gate that
withholds L4 rather than degrading it to text (SPEC §2.6).

**Insurance:** a pre-cached, CC-licensed clip set for the highest-frequency
items. See R4 — this is what actually spends the 8 MB budget.

**Needs from you:** the manual device matrix in SPEC §13 cannot be run in CI.
It needs real phones (a cheap Android, an iPhone, Firefox Android). Findings
get recorded in Part 3 of this file.

### R2 — Indonesian-translated corpus is a hard ceiling, and it binds Japanese

**Status:** measured for English (comfortable). Still decisive for M6.

SPEC §2.5 requires every lexical item to be anchored to an example sentence
**with an Indonesian translation**. Measured at tatoeba.org/en/stats on
2026-08-10: English 2,041,935 sentences, Japanese 249,125, **Indonesian
28,198**. Indonesian ranks 42nd.

- **M1 (English):** fine, as predicted. 25,635 of the 28,189 Indonesian
  sentences (91%) are linked to an English one; after deduplication that is
  **23,497 usable pairs**, nearly 5× the milestone bar.
- **M6 (Japanese):** likely not fine. Direct JA↔ID pairs are a subset of a
  subset and could be in the hundreds. Japanese content that meets §2.5 as
  written may simply not exist for free.

**Options for M6, to decide before that milestone:** (a) pivot through English
(ja→en→id chains) and accept translation drift; (b) keep sentence-level
translations in English while glossing at the lexeme level in Indonesian —
weaker but honest; (c) author/verify a small ID-translated core by hand. All
three change what §2.5 means for Japanese, so this is your call, not mine.

### R3 — Dataset licensing

**Status:** the English frequency blocker is **resolved** (D13, by removing the
dependency rather than clearing it); the Indonesian gloss blocker remains, but
no longer blocks M1.

Verified 2026-08-10 by reading the licence text (see `NOTICE.md`,
`data/licenses.json`):

- **Tatoeba** sentence text: CC BY 2.0 FR, attribution required; a subset also
  CC0. **Audio is not covered** — the licence is chosen per clip by its
  contributor, and clips with an empty licence field may not be reused outside
  Tatoeba at all. The pipeline must resolve audio licences per file.
- **JMdict / JMnedict / KANJIDIC2** (EDRDG): CC BY-SA 4.0, attribution
  required, **share-alike**. Two consequences: any shard derived from EDRDG
  data must ship under CC BY-SA 4.0 or compatible, and EDRDG asks for
  acknowledgement on each screen displaying dictionary content (or a dedicated
  About screen for apps) — so the attribution screen is a licence condition,
  not a courtesy.

Resolved since:

- **English frequency list** — no longer needed. Ranks are computed from
  Tatoeba's own English corpus, which is already cleared (decision D13). The
  fallback, if those ranks ever prove inadequate, is `wordfreq`: verified
  2026-08-10 as Apache-2.0 code with **CC BY-SA 4.0 data**, so it is usable —
  but it is sunset, frozen at roughly 2021 usage, and ships as Python packages.

Still open, though no longer blocking:

- **Indonesian glosses.** Kaikki's raw-data page states no licence for the
  extraction itself. The underlying Wiktionary content is CC BY-SA 4.0, so the
  safer path may be to parse Wikimedia dumps directly rather than depend on
  unstated third-party terms. M1 sidesteps this by anchoring meaning in
  translated sentences rather than dictionary definitions, which §2.5 arguably
  prefers anyway — but L1/L2 cards will want a short gloss eventually.

Everything unresolved sits under `candidates` in `data/licenses.json`, and the
licence gate refuses anything in `assets/` that references a candidate key.

### R4 — The 8 MB beginner shard is an audio budget, not a text budget

**Status:** **confirmed by measurement** (M1).

Predicted at M0, measured at M1: the entire English corpus — 23,497 sentence
pairs and 5,245 lexemes across all six bands — is **1.05 MB gzipped**, and a
beginner's band-1 download is **0.21 MB**. That is 2.6% of the 8 MB budget.
Text is effectively free.

Audio is not. At ~8 KB per short Opus clip, 1,000 clips ≈ 8 MB — the entire
budget, for one band. So the real question the 8 MB number is asking is *how
much pre-recorded audio do we ship as insurance against R1*.

**Settled:** the initial shard is text-only; audio is fetched and cached per
band on demand. With text costing so little, essentially the whole 8 MB is
available as R1 insurance — roughly 800–1,000 pre-cached clips — which makes
the audio question a content-sourcing problem, not a budget one.

### R5 — FSRS was not designed for a 7-rung ladder (my nomination)

**Status:** **decided** in M2 — one active card per item (see below). Delegated
to me rather than answered, so it stays here as a reversible call: the schema
supports either reading, and `ReviewLog.ladderLevel` keeps the evidence needed
to revisit it.

SPEC §2.1 buys a validated memory model. SPEC §2.3 then turns one lexeme into
up to seven cards. These interact in a way the spec does not resolve:

- If each ladder level is its own FSRS card with its own state, a vocabulary of
  N words generates up to 7N cards. With §7.2 reserving ~60% of a 4-minute
  session for reviews (call it 12–15 items), steady-state review capacity is
  roughly 100 cards; that is ~15 words. The learner would stall at a vocabulary
  in the low hundreds.
- FSRS's stability parameter models one memory trace. Changing the task under
  the same item (recognition → recall → production) changes the retrieval
  difficulty, so a stability learned at L1 does not transfer cleanly to L5.

**Recommendation:** one *active* card per item. The ladder level is a property
of that card — it selects which task to present — and FSRS state carries across
promotion, with a difficulty bump on promotion and a demotion on lapse. Each
`ReviewLog` row records the ladder level it was answered at, so the ladder's
effect on accuracy stays measurable. This keeps review load linear in
vocabulary and keeps FSRS closest to its validated shape. The §2.3 acceptance
test still holds: an item that never left L1 has never been promoted, so it
cannot show as mastered.

**Implemented as recommended** (`src/core/ladder.ts`): one card per item, the
ladder level selects the task, FSRS state carries across promotion, demotion on
lapse, and every `ReviewLog` row records the rung it was answered at — so
promotion can look at the last three answers *at the current level*, and the
ladder's effect on accuracy stays measurable despite the shared state.

### R6 — The retention acceptance test can be made to pass meaninglessly

**Status:** noted, affects how M2's tests are written.

SPEC §2.1 asks that a simulated 90-day learner history produce measured
retention within ±3 points of the 0.90 target. If the simulated learner forgets
according to FSRS's own curve, the test is circular — it will pass whatever we
build, because it is testing FSRS against itself. If the simulated learner
forgets according to some other curve, failure tells us about the simulation,
not about our code.

**What the test should actually assert:** that *our pipeline* (state
round-tripping, timestamp handling, the composer's ordering, the fuzz setting)
introduces no systematic bias — i.e. that intervals we schedule match the
intervals `ts-fsrs` prescribes for the same inputs, and that measured retention
under an FSRS-consistent learner lands on target. That is a real regression
test. It will be labelled as such rather than dressed up as validation of the
memory model.

---

## Part 2 — Standing decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **One installable app**, EN and JA as lazily-loaded language packs | Single install, single service worker, one profile with `targets[]` as §6 assumes. Content never enters the JS bundle, so the 200 KB budget is unaffected by adding a language. |
| D2 | **Cloudflare Pages**, new repo | Phase-2 sync (§5.1) is Workers + D1 — same account, no migration later. Edge presence near the reference user. Static build, no secrets. |
| D3 | **Default learner: intermediate English + beginner Japanese** | The most common Indonesian profile. EN cold-starts mid-frequency with heavy §3.1 contrastive weighting; JA cold-starts at kana. Makes the contrastive engine load-bearing from day one. |
| D4 | **No AI layer until post-M7** | §1: LLM features are optional garnish. A feature flag with no implementation is dead scaffolding (§0 rule 5) and an invitation to lean on it. The extension point is `src/platform/` when it comes. |
| D5 | Timestamps are **epoch milliseconds**, not `Date` | IndexedDB indexes numbers directly and they survive export/import losslessly. Conversion to `Date` happens only at the `ts-fsrs` boundary, in `src/data/fsrsState.ts`. |
| D6 | Indexed booleans are **`Flag` (`0 \| 1`)** | IndexedDB cannot index booleans, and the composer's hot path needs `[profileId+suspended+dueAt]`. |
| D7 | `profileId` added to `Card`, `ReviewLog`, `Mnemonic` | Deviation from §6, needed for scoped export (§9) and per-profile delta sync (§5.1). |
| D8 | `Card.dueAt` is a **derived mirror**, maintained by a Dexie hook | IndexedDB cannot index a nested path inside a compound key. Deriving it in the hook rather than at call sites means it cannot drift, whatever writes the card. |
| D9 | Provenance is **per file**, via a `sources: string[]` key in each generated shard | A shard legitimately mixes Tatoeba sentences with Wiktionary glosses, so a per-directory convention would lie. Binary assets, which cannot carry metadata, live under a directory named for their dataset. |
| D10 | Japanese tokenization happens **at build time only** | A bundled morphological dictionary is an order of magnitude over the whole content budget. `Sentence.tokens` is precomputed. Consequence: the M7 reader's "paste your own text" path needs a lighter heuristic or does without. |
| D11 | Icons are generated by a **~150-line rasterizer**, outputs committed | An image toolchain that exists to draw one speech bubble does not earn its place (§0 rule 1). `npm run icons` runs on redesign, never in CI. |
| D12 | Code licence **not yet chosen** (`UNLICENSED` for now) | EDRDG share-alike binds the *data*, not the code, so this is a free choice — but it is yours. Worth settling before the repo goes public. |
| D13 | **English frequency is derived from Tatoeba's own corpus**, not an external word list | Removes a licence dependency instead of clearing one; register-matched to the sentences we actually teach from; and makes §2.4 coverage self-consistent, since a rank predicts coverage of *our* corpus. Cost: Tatoeba skews toward short translated declaratives and is saturated with the names Tom and Mary — handled by D14. |
| D14 | **Proper nouns are filtered from the lexeme inventory but not from the ranks** | `tom` is the 3rd most frequent token in Tatoeba. The ranks stay honest, because coverage genuinely has to account for meeting "Tom" in a sentence; the vocabulary list drops names. Detection uses lower-case share among *mid-sentence* occurrences only — sentence-initial capitalisation makes `where's` look exactly like `boston`. Known gap: demonyms (`french`, `german`) are filtered too. |
| D15 | **Sentence banding is by 90th-percentile token rank**, not by the composite difficulty score | "The harder words here live in band N" is a defensible claim; "this sentence is B1" is not (§2.15). The composite score only orders sentences within a band. p90 rather than max, so one rare proper noun cannot make an otherwise simple sentence look advanced. |
| D16 | **`Item.levelTag` is optional and unset for everything M1 ships** | No licence-cleared CEFR-aligned wordlist exists yet, and deriving a CEFR label from corpus frequency is exactly the fake precision §2.15 bans. `band` is the honest signal until a real alignment lands. |
| D17 | **Every relative import carries its file extension** | Lets Node run `scripts/ingest/*.ts` directly against `src/core`, so the pipeline shares the app's tokenizer and scorer with no transpiler dependency and no duplicated logic. Vite and Vitest both accept explicit extensions. |
| D18 | **One active FSRS card per item; the ladder level selects the task** | The R5 decision, implemented. Keeps review load linear in vocabulary instead of multiplying it by up to 7×, and keeps FSRS closest to the shape it was validated in. `ReviewLog.ladderLevel` preserves the evidence to reverse this. |
| D19 | **Lexemes live in IndexedDB; sentences stay as JSON in memory** | Measured, not assumed: importing the 27,650 sentence rows of bands 1–3 took **43 s** on an emulated mid-range phone against a 3 s budget, while fetching and parsing a band's anchor shard takes ~5 ms. Lexemes are queried (by band, rank, kind) and number in the thousands; sentences are read by id and number in the tens of thousands. The pipeline emits `anchors.b*.json` — just the sentences a band's vocabulary is taught through — for the session path. |
| D20 | **Starter bands are precached, not runtime-cached** | SPEC §5.4 promises the app is fully functional offline *after first load*. Runtime caching only delivers that if the learner happened to be online for a whole session first. Bands 1–3 lexemes + anchors cost ~0.58 MB gzipped against an 8 MB budget. |
| D21 | **L2 is a supported cloze, not "target → meaning typed"** | A deviation from §2.3, forced by R3: grading a typed meaning needs a gloss to compare against, and grading against the single shipped Indonesian sentence would mark good paraphrases wrong — the exact unfairness §2.7 exists to prevent. So contextual production splits by *support*: L2 shows the Indonesian translation, L3 does not. Reverts to the spec's shape when glosses land. |
| D22 | **No answer ever produces an FSRS rating of Easy** | Easy is a claim about how effortless retrieval felt. §2.12 forbids deriving it from the confidence tap, and deriving it from response latency would be an invented mechanic. Correct → Good, near-miss → Hard, wrong → Again, until there is a real signal. |
| D23 | **Lighthouse PWA gate replaced with direct installability assertions** | §13 asks for "Lighthouse PWA score ≥ 90", but Lighthouse removed the PWA category in v12 (Chrome 126) when Chrome revised its installability criteria. `e2e/coldstart.spec.ts` asserts what the score measured — manifest validity, icon resolution, maskable icon, service-worker control, offline start_url — with no new dependency. |

---

## Part 3 — Manual test matrix (SPEC §13)

Speech APIs cannot be tested in CI. Results go here as they are gathered;
empty rows are honest, invented ones are not.

| Browser / device | `speechSynthesis` en-US | `speechSynthesis` ja-JP | Offline voice (`localService`) | `SpeechRecognition` |
|---|---|---|---|---|
| Chrome, Android (mid-range) | — | — | — | — |
| Chrome, Android (low-end) | — | — | — | — |
| Firefox, Android | — | — | — | — |
| Safari, iOS | — | — | — | — |
| Chrome, desktop | — | — | — | — |
