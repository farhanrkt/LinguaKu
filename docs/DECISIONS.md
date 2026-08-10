# Decisions and risk register

Standing technical decisions, and an honest reading of what is most likely to
break. Written at M0 per SPEC §15; updated whenever a decision changes or a
risk resolves.

---

## Part 1 — Risk register

Ordered by how much of the product dies if the assumption is wrong.

### R1 — Web Speech API voices on cheap Indonesian Android devices

**Status:** unresolved, and the single most fragile assumption in the app.

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

**Mitigation (M2):** `src/platform/` gets a capability probe that waits for
`voiceschanged`, enumerates voices per target language, prefers
`localService`, and actually speaks a timed test utterance before declaring
success. The result is cached and surfaced honestly in the UI. Per SPEC §2.6,
an item with no working audio is **excluded from L4 scheduling**, never
degraded silently to text.

**Insurance:** a pre-cached, CC-licensed clip set for the highest-frequency
items. See R4 — this is what actually spends the 8 MB budget.

**Needs from you:** the manual device matrix in SPEC §13 cannot be run in CI.
It needs real phones (a cheap Android, an iPhone, Firefox Android). Findings
get recorded in Part 3 of this file.

### R2 — Indonesian-translated corpus is a hard ceiling, and it binds Japanese

**Status:** partially measured. Decisive for M6, comfortable for M1.

SPEC §2.5 requires every lexical item to be anchored to an example sentence
**with an Indonesian translation**. Measured at tatoeba.org/en/stats on
2026-08-10: English 2,041,935 sentences, Japanese 249,125, **Indonesian
28,198**. Indonesian ranks 42nd.

- **M1 (English):** fine. English is Tatoeba's hub language, so most of those
  28k Indonesian sentences are linked to an English one. The ≥5,000 bar has
  headroom. The exact EN↔ID pair count gets measured from `links.csv` in M1.
- **M6 (Japanese):** likely not fine. Direct JA↔ID pairs are a subset of a
  subset and could be in the hundreds. Japanese content that meets §2.5 as
  written may simply not exist for free.

**Options for M6, to decide before that milestone:** (a) pivot through English
(ja→en→id chains) and accept translation drift; (b) keep sentence-level
translations in English while glossing at the lexeme level in Indonesian —
weaker but honest; (c) author/verify a small ID-translated core by hand. All
three change what §2.5 means for Japanese, so this is your call, not mine.

### R3 — Dataset licensing

**Status:** four sources cleared, the two M1 needs are **not**.

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

Not cleared, and both block M1:

- **Indonesian glosses.** Kaikki's raw-data page states no licence for the
  extraction itself. The underlying Wiktionary content is CC BY-SA 4.0, so the
  safer path may be to parse Wikimedia dumps directly rather than depend on
  unstated third-party terms.
- **English frequency list.** No source chosen. Candidates differ sharply:
  some are permissive, some are non-commercial, some state nothing. Frequency
  banding (§2.10) is the backbone of the curriculum, so this cannot be
  hand-waved.

Everything unresolved sits under `candidates` in `data/licenses.json`, and the
licence gate refuses anything in `assets/` that references a candidate key.

### R4 — The 8 MB beginner shard is an audio budget, not a text budget

**Status:** analysed, not yet measured against real data.

Back-of-envelope for M1-shaped content: 5,000 sentence pairs at roughly 250
bytes of JSON each ≈ 1.25 MB raw, well under 500 KB gzipped; 2,000 lexeme
entries add a few hundred KB. Text is nearly free.

Audio is not. At ~8 KB per short Opus clip, 1,000 clips ≈ 8 MB — the entire
budget, for one band. So the real question the 8 MB number is asking is *how
much pre-recorded audio do we ship as insurance against R1*.

**Proposed:** the initial shard is text-only (~1–2 MB, so first launch on
mobile data stays cheap); audio is fetched and cached per band on demand, and
the pre-cached insurance set is capped at a few hundred of the highest-value
clips. Confirm in M1 once real sizes are known.

### R5 — FSRS was not designed for a 7-rung ladder (my nomination)

**Status:** open architectural decision, blocks M2.

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

The current schema supports either reading (`Card` carries both `itemId` and
`ladderLevel`), so nothing is foreclosed — but M2 has to pick one.

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
