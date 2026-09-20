# Decisions and risk register

Standing technical decisions, and an honest reading of what is most likely to
break. Written at M0 per SPEC §15; updated whenever a decision changes or a
risk resolves.

---

## Part 1 — Risk register

Ordered by how much of the product dies if the assumption is wrong.

### R1 — Web Speech API voices on cheap Indonesian Android devices

**Status (v1.10.0): a second platform, and it corrected the code again.** A
macOS/Chromium row — explicitly *not* a phone and *not* the empty "Chrome,
desktop" row — found that the report named the wrong operating system on every
device that is not Android, and that the boot probe never answers at all while
the page is hidden. Details in Part 3. The four rows that would actually test
this risk are still empty, and this one cannot stand in for any of them.

**Status (v1.5.1): the first real row exists, and it corrected the code.**
Chrome 151 on Android, 2026-08-13: working on-device voices in **both**
languages, completing at 932 ms and 999 ms — over the 500 ms deadline, so the
app had been withholding L4 and the mora-timing drills from a phone that could
deliver both. `TTS_ONEND_DEADLINE_MS` is now 2,000 ms (D29, amended). This is
the failure mode D29 named when it said the matrix would have to decide the
number, and it took one row to find.

R1's specific prediction — that `ja-JP` would be the first voice missing on a
cheap Android — did **not** hold on this device. One row is not a trend, and it
is the first evidence in either direction.

Four rows are still empty, and the most valuable is the second: a device with no
TTS engine installed, which is the only configuration that can confirm or refute
M4's ~15 s first-call stall. This row cannot, because the phone had an engine.

The clip set is still empty and still for the same reason: the pipeline and its
CI gate exist (`npm run ingest:audio`, `npm run check:audio`), and **no voice
model has had its licence read and dated**, so invariant 5 refuses every clip.

**Earlier status:** M4 hardened the probe into a once-per-start liveness check with a
hard 500 ms `onend` deadline (D29), shipped the fallback chain the risk always
needed, and **found a new failure mode in the API itself** (below). **The matrix
in Part 3 is still empty**, and until rows land there the one thing we have not
done is watch this run on a real phone.

The original reading of this risk, from M0, follows the M4 findings.

**What changed in M4.** The probe now runs once on boot, waits for `onend` and
nothing else, and its verdict governs the whole session. L4 dictation is
unblocked but gated per item: audio comes from a pre-cached clip first and
synthesis second, and an item with neither is held at L3 rather than shown as a
text card pretending to be a listening test (SPEC §2.6). The consequence is that
the app is now *fully functional with the speech engine dead* — 94 of 116
contrastive drills are text, every ladder rung below L4 is text, and the only
thing a silent device loses is the listening material, which it says out loud on
the home screen.

**What M4 measured, and it changes the shape of this risk.** Building the boot
probe surfaced something the risk register had not anticipated: **the first touch
of `speechSynthesis` in an environment with no speech service behind it blocks
the main thread for ~15 seconds.** Not the probe's own timeouts — those are
async and bounded — the API call itself. It was found by the cold-start test,
which went from 1.2s to 14.9s the moment the probe was added to boot, and
returned to 1.2s when it was moved.

That is five times SPEC §5.4's entire icon-tap-to-first-question budget, with the
app frozen throughout, and it lands on exactly the device this risk is about: the
cheap Android with no TTS engine installed. `requestIdleCallback` is not
sufficient protection, because the idle moments during an async boot are the gaps
where the app is waiting on IO and is about to want the main thread back. So the
probe now fires only when a screen is *painted* — `onFirstQuestion` from the
session screen, `onReady` from home — and until it answers, `isTtsLive()` is
false and audio is withheld.

**Consequence for the device matrix:** the rows below should record not just
whether a voice exists, but how long the first `speechSynthesis` call takes. If
this stall reproduces on real hardware, the probe may need to move behind an
explicit "test audio" affordance rather than running automatically at all.

**What is still missing, and it is not code.** The pre-cached clip set is empty.
Tatoeba audio is a licence *candidate*, not a cleared dataset — per-clip terms
chosen by the contributor, some with no licence at all — so nothing can enter
`assets/` under it (SPEC §5.2). Today the fallback chain therefore terminates in
"no clip", and on a device whose engine is dead, L4 is withheld from every item.
The mechanism is built and tested; it has nothing to serve yet.

---

**The original M0 reading, for context.**

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

**Mitigation (shipped, M2; hardened M4):** `src/platform/speech.ts` waits for
`voiceschanged`, enumerates voices per target language, prefers
`localService`, and speaks a zero-volume utterance that must **complete** inside
500 ms before declaring success — which catches the engine that lists a voice and
then never speaks. The verdict is surfaced honestly in the UI, and
`ladderCeiling` is the gate that withholds L4 rather than degrading it to text
(SPEC §2.6).

**Insurance:** a pre-cached, CC-licensed clip set for the highest-frequency
items. See R4 — this is what actually spends the 8 MB budget.

**Needs from you:** the manual device matrix in SPEC §13 cannot be run in CI.
It needs real phones (a cheap Android, an iPhone, Firefox Android). Findings
get recorded in Part 3 of this file.

### R2 — Indonesian-translated corpus is a hard ceiling, and it binds Japanese

**Status:** **resolved** (M6). Measured, not guessed — and the prediction was
pessimistic in size but right in shape.

| | |
|---|---|
| Japanese sentences on Tatoeba | 248,849 |
| with a **direct** Indonesian pair | 5,919 |
| reachable **through English** | 12,395 |
| union, after dedup and tokenization | **15,324** |

Direct pairs alone would have cleared M1's 5,000-sentence bar, but only just, and
with no room to select for difficulty. Triangulating JA→EN→ID roughly triples the
corpus to 15,324 — option (a) from the M0 list, chosen because the measurement
showed the other two were not needed.

**The cost, recorded rather than waved away:** a triangulated sentence has been
through two translators, and drift is real. So every sentence carries `via:
'direct' | 'en'` and triangulated ones carry the English `bridge` id. That makes
the route auditable per sentence, lets the reviewer spot-check the two-hop ones,
and leaves the door open for the UI to weight them differently. A direct pair
always wins where one exists; triangulation never overwrites.

**No machine translation was needed, and none was used.** See D40.

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

**Status (v1.3.0/v1.4.0): the gloss blocker is resolved, and so is the passage
one.** Both by the route this entry recommended — parsing the Wikimedia dumps
directly rather than depending on a third party's extraction. `wiktionary-id`
and `wikipedia-simple-en` are cleared datasets as of 2026-08-12, verified two
ways each (dumps.wikimedia.org/legal.html and the wiki's own `rightsinfo` API),
both CC BY-SA 4.0 with share-alike, both shipping in their own shards so that no
Tatoeba-derived file inherits those terms (D60).

What the glosses do *not* do is grade an answer: coverage is 30% of English
lexemes and 4% of Japanese, measured before anything was built on top, so they
are reference material and L2 is unchanged (D59).

**Earlier status:** the English frequency blocker is **resolved** (D13, by removing the
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

### R7 — The voice model is the last licence question, and it blocks the last feature

**Status:** open and **owned by the project owner**, who is generating the clips
locally. Three findings from 2026-08-13 that shape what is actually possible:

**English has a candidate.** `en_US-libritts-high` exists in the official Piper
index; its model card gives the training corpus as LibriTTS under **CC BY 4.0**,
which is compatible. It carries **904 speakers**, so a speaker must be pinned —
`--speaker` is now a required part of the clip hash, because an unpinned
multi-speaker run does not reproduce and invariant 10 depends on it.

**Japanese has one voice now, and it is the wrong licence.** *(re-measured
2026-08-19.)* The official index has moved to **174 voices / 55 language codes**,
and Japanese has appeared — filed under the non-standard code **`ja_JA`**, which
is why a search for `ja_JP` still finds nothing. It is
`ja_JA-hi_fi_captain-medium` (NICT Hi-Fi-Captain, 2 speakers, finetuned from
LibriTTS-R), and its model card gives the dataset licence as **CC BY-NC-SA 4.0**.
The **NC** disqualifies it against the criterion this register already set: a
non-commercial restriction is incompatible with an MIT app whose assets are
meant to be redistributable. It is not a close call and it does not need a
second opinion — but it does need re-checking whenever the index moves, because
the index moved once already.

**The three other paths, read at source 2026-08-19.** None is promoted; R7 is
still owned by the project owner, and *reading and dating* is the step this
register reserves for a person.

| Candidate | Licence, as written | Verdict |
|---|---|---|
| **Hi-Fi-Captain** (official Piper set) | CC BY-**NC**-SA 4.0 | Fails on NC. |
| **JSUT**-derived | Audio: academic / non-commercial / personal only, and *"Re-distribution is not permitted"*. Text is separately CC BY-SA. | Fails harder than NC — the audio terms forbid the redistribution this project's assets are built on. |
| **つくよみちゃんコーパス** (Tsukuyomi-chan, CV. 夢前黎), via the `piper-plus` fork | Commercial use permitted, personal or corporate. Publishing TTS software using the voice is **explicitly permitted** with a mandatory verbatim credit line. But redistributing the corpus is prohibited in principle, *"licensing to others as reusable material"* is prohibited, and a **separate character licence** applies on top. | **The only candidate that clears NC** — and it is a conditional permission grant rather than an open licence. Two consequences worth weighing before anyone reads it properly: the "reusable material" prohibition sits awkwardly beside D9's per-file provenance, which exists precisely so a reuser *can* reuse; and the voice is a **character**, so the app would be adopting someone's mascot as its Japanese voice. |
| **Mozilla Common Voice** ja | **CC0** | The cleanest licence available, and the only one with no conditions at all. There is no ready-made Piper voice: it is crowd-sourced ASR data, so it would mean selecting a single clean speaker with enough material and training a voice. Real work, and the only path that ends with an asset as free as the rest of `assets/`. |

**A toolchain consequence, if Tsukuyomi-chan is the one chosen.** It is served
through `piper-plus`, a fork that uses **its own G2P and phoneme system** and
whose models are *not* compatible with upstream `rhasspy/piper-voices`. So
choosing it is also choosing a different binary for `scripts/ingest/build-audio.ts`
than the English side uses — two generators, not one.

**Japanese had no voice at all.** Measured against
`rhasspy/piper-voices/voices.json`: 173 voices, 54 language codes, and **`ja_JP`
is not one of them**. There is no `ja_JP-jsut-*` model to download from the
official set. A community model is possible but needs its own licence read, and
a JSUT-derived one needs the corpus terms checked specifically — a
non-commercial restriction would be incompatible with an MIT-licensed app whose
assets are meant to be redistributable. Until one clears, Japanese stays on
synthesis-or-nothing and the mora-timing drills stay withheld on silent devices.

**The output format changed to AAC.** The pipeline emitted Opus, which is the
better codec and the wrong default: Safari only gained Ogg Opus playback in
17.5, and iOS is precisely the platform where the boot probe reports a dead
engine (D29). An insurance clip the most common silent device cannot play is not
insurance. `--format` accepts `m4a` (default), `opus` and `mp3`; the budget gate
measures real bytes rather than the estimate.

**Clips go in `assets/content/<lang>/<voiceKey>/`, not `assets/content/audio/`.**
The licence gate refuses any binary under `assets/` whose path names no dataset
key, because a binary cannot carry provenance inline the way a shard can (D9).

**The voice may only be promoted in the same commit as the clips.** The gate now
fails on the mirror case too — a dataset declared but referenced by nothing —
because the attribution screen renders `datasets` directly. Found by writing
that check: **`jmnedict` had been in `datasets` since M6** for a proper-name
feature that was never built, so the app had been naming a source it did not
use. Demoted to `candidates`; its EDRDG terms are unchanged and it can return
the moment something uses it.

The whole procedure is `docs/AUDIO-RUNBOOK.md`.

Everything downstream of a pre-cached clip is built: the plan is deterministic
and unit-tested, the generator is written, the budget and provenance gate runs
in CI, and `src/platform/audio.ts` has been serving an empty index since M4. The
missing piece is a decision only a human can make — **which Piper voice, under
which licence, read on which date**. A voice model carries the terms of the
corpus it was trained on and those vary per voice; invariant 5 refuses a clip
whose dataset is not declared, and that refusal is the point.

Japanese is the weaker case and should be measured rather than assumed: Piper's
Japanese inventory is thinner than its English one, and §3.2's mora-timing
drills are exactly what depends on it. Shipping English clips and saying so
beats claiming a fallback chain that is only half real.

### R8 — Committed audio would make the repository heavy

**Status:** open, and it becomes real the moment R7 is answered.

Invariant 10 wants deterministic, committed outputs, which for audio means
binaries in git — roughly 800–1,000 Opus clips at ~8 KB each. That is fine once
and awkward forever after: every regeneration rewrites history-sized blobs. The
generator already skips any clip that exists, so a rerun adds rather than
rewrites, but if the total becomes unmanageable the decision to record is where
clips live instead — and whatever the answer is, it may not introduce a
recurring cost (invariant 4).

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
| D12 | **Code licence is MIT** (settled at v1.0.0, 2026-08-11) | EDRDG share-alike binds the *data*, not the code, so this was a free choice and it has been made. `LICENSE` covers `src/`, `scripts/`, `workers/` and the authored contrastive content in `data/contrastive/`. It does **not** reach `assets/content/`: English shards stay CC BY 2.0 FR, Japanese shards stay CC BY-SA 4.0, and redistributing the latter carries share-alike. `LICENSE` and `NOTICE.md` both say so, because an MIT badge on a repository whose content is share-alike is the kind of thing a reuser only discovers after they have shipped. |
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
| D24 | **The Yes/No vocabulary check and the adaptive item loop are the same sequence** | SPEC §4.2 asks for both inside 90 seconds. Every real word the learner judges *is* a 1PL response — "I know this" is the answer, its frequency rank is its difficulty — and pseudowords interleave at one in four to measure over-claiming. One tap per item, both measurements. |
| D25 | **Only the `vocab` dimension is estimated; listening and grammar are absent, not guessed** | §4.2 says the three must not be collapsed into one number. Listening needs audio verified on a real device (R1) and grammar has no items until M4. A missing row reads as "not measured"; a fabricated one reads as a measurement, which §2.15 bans. |
| D26 | **The corrected estimate can never be less certain than the prior** | Over-claiming widens the uncertainty band, but uncapped it produced placements reading "somewhere between band 1 and band 6" — true, and useless. Evidence can fail to narrow what we knew; it cannot un-know it. Where the band is still three tiers wide, the result screen says so in words instead of printing the range. |
| D27 | **New items come from the learner's frontier band, nearest the frontier first** | §4.3 level-gating. `bandForAbility` returns the frontier itself rather than one below, because a new item enters at L0 — errorless exposure — where difficulty costs the learner nothing; §2.3's desirable difficulty comes from the ladder and from the coverage selector's choice of teaching sentence. |
| D28 | **The i+1 band is a running-text criterion, with a sentence-level fallback** | Coverage on an n-token text is quantized to 1/n, so [0.92, 0.98] is unreachable below ~17 tokens — on a 10-token sentence the reachable values are 1.00, 0.90, 0.80 and the band is empty. Applying it literally to sentences would reject nearly all of them, so short items fall back to i+1's literal form: exactly one new word. |
| D29 | **The TTS probe runs once per app start *per language*, waits for `onend`, gives up at 2,000 ms — and fires only after a screen is painted** | Four calls, plus one correction. *Per language* was added at v1.0.1: the verdict was originally one value for the whole app, so on a device with an en-US voice and no ja-JP one — the exact configuration R1 warns is most likely — the English probe vouched for Japanese, and the app would report audio ready, schedule L4 dictation and mora minimal-pair drills, then have nothing to speak them with. Keyed by language it is still one settled verdict per language per start, so the rung cannot flicker under the learner. *Once per app start*, because a verdict that can flip mid-session would flicker the L4 rung in and out under the learner, and re-probing per card costs a settle delay on every audio item. *`onend`, not `onstart`*, because the Android failure mode is an engine that announces itself and then goes silent — a start-based check passes it. *2,000 ms* — **amended 2026-08-13 by the first real device row**, which is what this decision said the matrix was for. The original number was 500 ms on the reasoning that "an engine that cannot finish a zero-volume full stop in half a second will not deliver a dictation card either", and measurement refuted it: a Chrome 151 Android phone with genuine on-device voices in *both* languages completed at 932 ms and 999 ms, and was therefore being told it had no audio — L4 and the mora drills withheld from a device that could do both. Nearly all of that second is engine start-up, paid once per utterance rather than per syllable. Loosening it cannot admit a liar, because an engine that fires `onend` has finished speaking by definition; it can only stop excluding an honest engine that is slow. 2,000 ms also matches `VOICES_TIMEOUT_MS`, so both halves of the probe give up on one schedule rather than two guesses, and the extra 1.5 s is never in front of a learner: the probe runs after first paint and audio is withheld until it answers. *After a paint*, because measurement forced it: the first `speechSynthesis` call on a device with no speech service blocks the main thread for ~15s (see R1), so "on boot" in the literal sense would freeze the app for five times its entire cold-start budget. **Two costs, stated plainly:** iOS Safari needs a user gesture before it will speak, so this will mark iOS dead where audio might have worked from inside a tap; and there is a window early in the first screen where `isTtsLive()` is false because the answer has not arrived. Both fail safe — audio withheld, never faked. |
| D30 | **L4 is dictation of a short sentence, and the audio gate is per item, not per app** | SPEC §2.3 offers "audio-only cloze / dictation of the sentence"; dictation is the unambiguous one — the answer is fully determined by what was heard, with no visible frame to guess from. Capped at 10 tokens, past which it measures working memory instead of phonological form. The gate is per item because audio availability genuinely is: a pre-cached clip exists for one sentence and not another. An item with no audible anchor is held at L3 by the same ceiling that a dead engine imposes (`ladderCeiling`), and a card already at L4 when audio vanishes is **demoted visibly** rather than quietly presented as text — the log records the rung actually answered, or every later measurement of the ladder reads a fiction. |
| D31 | **The contrastive YAML is compiled at build time; `yaml` is a devDependency** | SPEC §3 requires authored YAML, versioned. A YAML parser has no business in a 200 KB bundle (invariant 6), and the validation the compiler runs — every MCQ answer present among its options, every category carrying all three parts of its note, every minimal pair marked audio-dependent — is worth failing the *build* over rather than discovering as an unanswerable question on a learner's phone. `yaml` is MIT and build-time only, so §0 rule 1 is untouched. |
| D32 | **Drill answers are `DrillAttempt` rows, not `ReviewLog` rows** | A drill has no FSRS card: no stability, no due date, nothing scheduled. Filing drill answers among the review logs would put unscheduled items into the retention rate §9 promises to report honestly, and would make `ReviewLog.cardId` a lie. Separate table, separate writer (`recordDrillAnswer`), same one-transaction discipline as `recordReview` so a rating can never move without the answer that moved it being on record. |
| D33 | **No category is called a weakness under five attempts** | §2.15 bans fake precision, and an Elo rating after two answers is noise wearing a number. Below the threshold the heatmap says "belum cukup data" and how many answers are still needed — visible rather than hidden, because hiding it would let the screen read as complete when it is not. The composer still *drills* unmeasured categories (that is how they become measured); it just never *reports* them. |
| D34 | **The interference detector stays silent when context cannot disambiguate** | `book`/`books` and `go`/`goes` are the same string alternation, and M1's frequency-only pipeline produces no part-of-speech tag. The word before the blank settles most cases; where it does not, no tag is emitted at all. A wrong tag is worse than no tag — it shows the learner an explanation of a mistake they did not make and moves the wrong Elo rating on the way. |
| D35 | **The vocabulary interval is asymmetric: a counted floor, an extrapolated middle, and unsampled bands added whole** | A symmetric ± would be dishonest here. Exposure is frontier-first (D27), so within a band the learner has met the commoner words and not the rarer ones, and a band never shown tells us nothing. The floor is a count (no inference), the middle extrapolates only sampled bands via a Wilson interval (the normal approximation returns bounds above 1 at ten-out-of-ten, which this app produces constantly), and the ceiling adds unsampled bands in full because that is exactly how wide our ignorance is. A beginner gets a very wide band; that is the right answer, and §2.15 bans the tight one. |
| D36 | **The capability percentage is over LinguaKu's own corpus, and the copy says so** | §9's example says "everyday conversation". We can measure coverage of the corpus we teach from *exactly* — the ranks were derived from it (D13) — and we cannot measure conversational English at all. So the pipeline emits per-word corpus share, the figure is computed rather than modelled, and the sentence names the corpus. It also carries the ceiling: everything we ship is 87.3% of tokens, because proper nouns are filtered (D14) and band 6 is not shipped. Stating a percentage without saying what it is a percentage of would overstate it. |
| D37 | **Import merges the append-only log by id; everything else is overwritten** | SPEC §6's own sentence, read literally: *"last-write-wins per card with the log as tiebreaker."* `ReviewLog` and `DrillAttempt` are UUID-keyed and append-only, so a restore adds what it lacks and touches nothing else — re-importing is a no-op, two devices' histories union, and a restore can never destroy review history. Cards, abilities and scores are current state, so the bundle wins; interleaving two schedules for one card after the fact is not something we can do correctly. Discovered the hard way: the first implementation deleted logs to replace them, and the Dexie hook refused. |
| D38 | **No charting library; five figures of inline SVG** | The smallest credible charting library is a meaningful slice of a 200 KB budget (invariant 6) for bars, a polygon and a marker. `charts.tsx` is under 200 lines. Every component takes `number \| null` and draws an explicit gap for null, so "not measured" cannot render as a bar of zero — the easiest way to break §2.15 by accident. |
| D39 | **A retention verdict comes from the confidence interval, never the point estimate — and retuning is a nudge, not a fit** | 51 of 60 is 85% and is not evidence the scheduler is mistuned. Only an interval that excludes the target justifies saying so, and only then does §9's "offer to retune" appear. The retune moves `request_retention` one bounded step (±0.03, clamped to 0.80–0.95) in the direction the evidence points, and is labelled a nudge everywhere: a real per-user parameter fit needs the FSRS optimizer and far more history than a learner has when they first notice the number. |
| D40 | **Japanese translations come from triangulation only; no machine translation** | Two reasons, in order. First, it is not needed: JA→EN→ID yields 15,324 sentences against a 5,000 bar, and the gap it would fill is the rare tail rather than the N5–N4 core. Second, there is no free path to it — §0 rule 1 bans a paid API and D4 defers the AI layer to post-M7, so a translation step would mean either a recurring bill or a large local model in the build. And a generated Indonesian sentence shipped as ground truth is a different kind of content from a human translation with a Tatoeba id behind it, however it is flagged. If the tail ever needs filling, hand-authoring a small core (M0's option c) keeps the provenance honest. |
| D41 | **Kanji ship both KRADFILE's radicals and a derived one-level grouping** | SPEC §2.11 wants the learner to see 校 as 木 + 交. KRADFILE gives the *radicals* — 父 + 木 + 亠 — which is correct, licensed, and not what the spec asks for, because 交 is itself 亠 + 父. The pipeline therefore also computes a grouping: where another kanji's radical set is a proper subset of this one's, the shared radicals collapse into it. That recovers 校 = 木 + 交, 語 = 言 + 吾, 時 = 日 + 寺 from licensed data instead of hand-authoring 1,748 breakdowns. Marked `UNVALIDATED` in the source: the subset rule is a heuristic, deliberately conservative (one level, largest match, kanji only), and the raw radical list ships alongside so nothing is lost when a grouping is wrong. It fires on 1,149 of 1,748. |
| D42 | **Furigana fades per token, not per character** | A per-character split of a reading is not generally possible, and forcing one produces wrong furigana rather than finer furigana: okurigana spans kanji and kana (行く = いく), rendaku voices a reading by position (手紙 = てがみ), and jukujikun has no split at all (今日 = きょう, where neither character contributes a syllable). A ruby span therefore covers a token — which is also how furigana is set in real Japanese text — and the reading drops when *every* kanji in it is stable. 学校 keeps its reading until both 学 and 校 are known. |
| D43 | **Mnemonics are last-write-wins by timestamp; every other table takes the bundle** | D37's rule is right for cards, abilities and scores, and wrong for the one table where the learner's own authorship is the value. SPEC §2.11's finding is that self-generated mnemonics beat given ones, so restoring last month's backup must not silently undo the version rewritten yesterday. Found by writing the round-trip test §2.11 implies, not by inspection. |
| D44 | **Kanji are items, and are exempt from §2.5's anchor rule** | §2.5 requires every *lexeme* to be met in a sentence. A kanji is taught by its components and readings — that is what §2.11 specifies — so demanding an example sentence for 校 would apply the wrong rule and reject the whole inventory. Kanji still get cards, schedules and a place in the session, because §2.11 teaches them rather than displaying them, and they count as their own card type for §2.8 so four characters cannot land in a row. |
| D45 | **The reader is a graded *feed* of sentences, not a passage** | SPEC §8 asks for a graded reader; Tatoeba is a corpus of independent sentence pairs, not documents, so there is no continuous text to grade. Stringing unrelated sentences together and calling it a passage would look like a reader and read like nonsense — worse than a feed, because extensive reading depends on the text meaning something. A real passage corpus needs Simple English Wikipedia, still an uncleared candidate (R3); the selector is written so that only the source changes when it clears. |
| D46 | **Mining records an intention; it does not create a card** | SPEC §8 calls it "one-tap card creation", and doing that literally would break invariant 0: a card is the product of an *answer*, `recordReview` cannot be called without a rating, and minting one from a tap would put an item into the schedule with a due date and a history nobody earned. So a tap writes to `minedItems`, the composer introduces mined words ahead of the frontier queue — and past the frontier gate, because level gating exists to stop us marching a learner through words they did not choose, not to overrule a choice they made — and the card appears when it is answered. The learner sees "one tap and it's in my deck"; the deck stays honest. |
| D47 | **The reader has three floors, because one is not enough** | At most two unknown words (i+1's literal form); at least 60% of the sentence known at any length; and the §2.4 running-text floor of 0.85 only above fourteen tokens, where coverage is no longer quantized enough to be meaningless (the D28 problem again). The middle floor exists because the count rule alone passes "the quokka devours pastry" — two unknown of four — on a technicality. A four-token minimum drops the fragments Tatoeba is full of; "Hi." is not reading whatever its coverage says. |
| D48 | **A silent device skips L4; it does not cap the ladder at L3** | Modelling audio as a *ceiling* (D30) was right when L4 was the top rung and wrong the moment production landed: it would lock a learner with no speech engine out of L5 and L6 — losing them the whole top half of the ladder because of a missing *listening* rung. So `audioAvailable` gates one rung rather than the maximum, and promotion runs 3 → 5 without it. SPEC §2.6 is satisfied exactly as written — the item is excluded from L4 scheduling, and nothing else about its progress changes. |
| D49 | **L6 grades on whether the word was used, and says so** | Free production has no right answer to match, and there is no grammar model here — D4 keeps the LLM layer out until after M7. The one thing checkable is whether the learner used the target word in their own sentence, which is exactly the generation effect the rung exists for. So that is what is checked, the card tells the learner that is what is checked, and the sentence is kept verbatim in `answerRaw`. Inventing a quality score would add nothing except a number nobody could defend. |
| D50 | **Speech input is detected, never probed** | `speech.ts` probes synthesis because a voice that lists and never speaks is a real Android configuration and the cost of finding out is a silent utterance. Recognition is different: starting a recognizer prompts for the microphone, so probing would mean asking a learner for permission in order to decide whether to draw a button. Feature detection decides visibility; a refused permission or a hung engine resolves to "not heard" and the text field is right there. §5.1's "never block progression on it", read literally. |
| D51 | **A sync delta is one D1 row per session, not one per review** | SPEC §5.1 says to batch "one write per finished session, not per card", which fixes the *request* count — and the binding constraint is elsewhere. Verified 2026-08-11: D1's free tier allows 100,000 row writes a day, and a 4-minute session produces ~30 review logs, so a row per review caps the free tier at ~3,300 sessions/day, an order of magnitude under the 100,000 request cap. Storing the session as one opaque payload moves both caps to 100,000 sessions/day. The server never reads inside a delta and cannot: the local store is the source of truth, merge logic is pure and on the client, and the Worker only routes — which is also what keeps it inside the 10 ms CPU budget. |
| D52 | **Sync is opt-in with no default endpoint, and its token lives outside Dexie** | Two separate points. *Opt-in*: sync means a learner's review history leaves their phone, nothing in the core product needs that, and there is no LinguaKu server to default to — they point it at infrastructure they run. *Outside Dexie*: everything in the database is exportable by design (§9 — the learner owns their data and may hand the file to anyone), so a bearer token stored there would be a quiet way to leak access to a whole history. `localStorage` keeps it out of the export by construction rather than by remembering to filter it. |
| D53 | **`targets[0]` is the active language, and everything derived from it is recomputed when it changes** | Reported against the live v1.0.0 build: choosing the other language resumed the *old* language's session and hid the skill check. The cause was one idea held in five places. `targets[0]` is what the content loader, item queue, drill picker, ability estimate and speech probe all read, but the home control *appended* to the array, so tapping "Bahasa Jepang" changed a label and taught English. It is now a switch that promotes the chosen language to the head, and the state hanging off it — resumable session, placement offer, contrastive pack, bands, script mode — is recomputed on the switch rather than left from boot. `Session.lang` makes the first of those structural: a queue built from one language's items can no longer be resumed under another, so the wrong-content failure cannot recur by omission. The other language keeps its cards, its ability and its own unfinished session. **Still open:** the app teaches one language at a time while `targets` is an array and first-run offers a multi-select — see the note under Part 3. |
| D54 | **A reminder is local or it is honest about not being one** | §2.13 asks for a notification at the habit cue. Web Push needs a server holding VAPID keys and a subscription per device — a recurring cost, so invariant 4 rules it out and there is no LinguaKu server to hold them. That leaves Notification Triggers (`TimestampTrigger`), which fires with the app closed and is Chromium-only, and otherwise an in-app cue shown on the next open after the time has passed. The screen names which of the two this device gets, in those words. The rejected option is the easy one: take the permission, store a time, and never fire — §2.6 already settled that a capability which does not exist is withheld and named, never faked. `scheduleReminder` returns whether anything was really scheduled, so a browser that advertises the API and then throws reports false rather than leaving the learner believing they will be reminded. |
| D55 | **A skip records a request, never a rating** | §2.14 guarantees the learner can decline any item. Invariant 0 makes `recordReview` the only writer of scheduling state and it cannot be called without a rating, so a skip cannot go through it — and filing one as a lapse would be worse than offering no skip at all: it would let a learner exercising autonomy damage their own schedule, and it would put an item nobody answered into the §9 retention rate. So `deferredItems` holds the request and the composer honours it for new items and for cards already due; a deferred card stays due with its FSRS state untouched, and only what is *shown* changes. The window escalates 3 → 7 → 21 → 60 days and caps: §2.14 is autonomy, not deletion, and an item that vanished permanently could never be reconsidered. Expired rows are kept, because `times` is the record of how often this learner has declined — deleting it would read the fifth refusal as the first. |
| D56 | **The weekly recap reports capability and offers no verdict** | §9's last line. Every honest summary of a week is one sentence away from a scoreboard, so the recap has no total, no score and no target — a quiet week is a fact rather than a shortfall, and there is no "you missed three days" because that sentence has no use except to make someone feel behind (§2.14, docs/ETHICS.md). Two consequences that took deciding: "first met" is read from the learner's whole history rather than the window, or a word met months ago would be relabelled new every week; and the comparison with the previous week is withheld until the profile is two weeks old, because comparing a first week against a range that did not exist manufactures a decline out of the fact that somebody is new. |
| D57 | **The device matrix is collected by the app, and a probe fired from a tap may raise the verdict** | Part 3 sat empty from M4 to v1.2.0 not because the data was hard to get but because the person holding the phone is not the person holding the debugger. `DiagnosticsScreen` runs every probe on demand and emits the row as markdown. It also pays back a cost D29 recorded: iOS Safari will not speak outside a user gesture, so the boot probe marks a working engine dead there — a probe fired from inside a tap is the only honest measurement that platform allows, and `adoptVerdict` lets it count. Two rules keep that safe: it can only *raise* capability (a later failure never retracts an engine already heard to complete an utterance, which would be the mid-session flicker D29 exists to prevent), and it is held to the same 500 ms deadline as everything else, so a slower engine is reported as the number it is and still withheld from L4. |
| D58 | **Listening is estimated from L4 answers, not from placement, and not from minimal-pair drills** | §4.2 requires three abilities estimated separately and gives placement 90 seconds and 25 items, which the vocabulary loop already spends (D24). §4.2's own answer is in the same paragraph: *"re-estimate continuously."* So listening comes from dictation answers through the 1PL model placement already uses, with the item's frequency rank as the item difficulty — the same scale, so the two numbers mean comparable things. Minimal-pair drills are listening and are deliberately excluded: a drill has no difficulty on any measured scale, and assigning one would make the estimate a fabrication rather than a measurement. They still move the phonology categories in the heatmap, which is where their evidence belongs, and they count in the radar's raw accuracy. Under five answers there is no estimate and no row (D33's floor, same reasoning). |
| D59 | **Glosses are reference, never an answer key — and that is what let them ship at 30% coverage** | The v1.3.0 go/no-go was 70% and the measurement came back 40.3% over bands 1–3 for English and 9.2% for Japanese, worst on the commonest words. Grading a typed meaning against a gloss needs it to be right for *every* item, and marking a good answer wrong is the unfairness §2.7 exists to prevent — so L2 stays D21's supported cloze. Displaying a gloss needs it to be right only where it is shown, and a word without one keeps the honest empty state the reader already had. en.wiktionary's translation tables were measured too (+16 points on band 1) and rejected: they return `know → tahu, setubuh`, which is a per-sense review problem rather than a coverage one. |
| D60 | **Glosses and passages ship in their own share-alike shards** | Both are CC BY-SA 4.0 and the Tatoeba-derived English shards are CC BY 2.0 FR. Folding either into an existing shard would upgrade the whole English corpus to share-alike by accident — a thing a reuser only discovers after shipping. D9's per-file provenance already supported this; the licence gate and the content tests now assert it in both directions. Both datasets were cleared by reading the terms at source rather than through a third party (dumps.wikimedia.org/legal.html plus each wiki's own `rightsinfo` API, both read 2026-08-12), which is exactly the route R3 recommended over depending on an extraction with unstated terms. |
| D61 | **Passages come from Simple English Wikipedia; Japanese keeps the feed, and the screen says so** | D45 wrote the reader as a feed because Tatoeba has no documents, and wrote the selector so that only the source would change when a passage corpus cleared. This is that source — and the histogram is the finding: 96% of Simple English Wikipedia's prose bands at 6, and only 5 paragraphs in all of it band at 1. "Simple" is not "beginner" on our scale. That is not a reason to loosen the banding; it is a reason to be clear who the reader serves — the default learner is intermediate English (D3), which is band 3 and up, where the material actually is. There is no free, licence-cleared corpus of graded Japanese prose, so Japanese keeps the sentence feed and the screen names the difference rather than letting a learner infer parity. |
| D62 | **The FSRS optimizer is measured and not shipped; the nudge stays** | §2.1 buys the review log for per-user parameter optimization and D39 ships a bounded nudge in the meantime, saying plainly that a real fit needs the optimizer. Measured 2026-08-12: `fsrs-browser@6.6.0` is BSD-3-Clause (free, so invariant 4 is untouched) and 332 KB of WASM plus 36 KB of glue, which is fine as a lazy chunk since invariant 6 counts the entry chunk and its static imports. What is *not* established is whether it trains usefully single-threaded on the reference device — its parallelism goes through `wasm-bindgen-rayon`, which needs cross-origin isolation, and enabling that site-wide is a deployment change this project cannot verify without hardware. A parameter fit that silently degrades a learner's schedule is worse than a nudge that moves one bounded step, so the nudge stays and the numbers are recorded rather than the question being re-opened from zero next time. |
| D63 | **There is no AI layer. §14 question 5 is answered: declined** | §14 question 5 was left "deferred to post-M7" and D4 kept the seam out until then. The answer is now *no*, and the reason is stronger than the feature: the product's claim is that a learner's history never leaves their phone unless they run the infrastructure themselves (D52), and **a bring-your-own-key layer makes that claim conditional on a guard rather than on the code's shape**. Invariant 8 is explicit — prefer deleting code over guarding it — and a dormant module with a key field is exactly the scaffolding it bans, because the next person to read it sees a feature that is nearly on. It was implemented during v1.5.0 (off by default, consented per call, zero-egress e2e) and **deleted** on review. What that implementation would have bought was rubric feedback at L6, where D49 admits the app can only check that the word was used; that limitation stands and is stated to the learner, which is the honest version. If this is ever revisited, it starts from this row, not from the deleted code. |
| D64 | **Chunks are authored, then validated against the corpus — not mined** | SPEC §2.5 makes collocations first-class items and names "take a shower", and `ItemKind = 'chunk'` had been typed and unproduced since M0. The obvious route is statistical (PMI over n-grams) and it was rejected on quality: Tatoeba is saturated with `tom said`, PMI cannot separate a collocation from a frequent accident, and there are no part-of-speech tags to filter with (D34) — the output would be teaching material nobody had read. So `data/chunks/*.yaml` is hand-written and the corpus *validates* rather than generates: every chunk must occur in a sentence the app actually ships, with an Indonesian translation, or the build fails. That is §2.5's own ingestion rule, the one that rejected 2,185 lexemes at M1. Two matcher findings came out of it, both of which had been silently rejecting real phrases: the corpus contains *"took a shower"* rather than the base form, so the leading verb is inflected before matching (closed list, because with no POS tags inflecting an arbitrary first word turns "on foot" into "ons foot"); and separable phrasal verbs appear as *"drop me off"*, so a two-word verb is matched around an object pronoun. 73 English and 23 Japanese chunks ship, each with an authored Indonesian meaning — the parts do not compose, which is the whole reason the item exists — and a chunk counts as its own card type for §2.8. |
| D65 | **Topics are authored, partial, and modulate rather than filter** | Three requirements land on one file. §2.10 orders new items by frequency *"modulated by learner-selected topic goals"*; §2.14 says the learner *"picks topic clusters"*; and §2.8 forbids more than three items from one cluster in a row — a rule that had been running against `clusterId = "b3"`, the frequency band, since M2, which made it a near-duplicate of the band gate rather than an interleaving constraint. Automatic clustering needs embeddings (a model in the build) or a lexical database (a licence, and WordNet's domains are not this), and a wrong topic is worse than none because topics steer what a learner is taught next. So the map is hand-written, and **partial on purpose**: 6.9% of the English inventory and 2.0% of the Japanese, published in the shard rather than implied. A word in no topic loses nothing — it keeps its band as its cluster and its place in the frequency queue. Choosing a topic **reorders** new items and never restricts them, because a learner who picks "food" still needs the function words that hold a sentence together. The compiler fails on a word that is not in the shipped inventory, which is what stops the file rotting as the corpus changes — it caught three on the first run, including a Cyrillic word that had slipped into the Japanese list. |
| D66 | **The home screen holds practice; everything else is one tap deeper** | It had grown to seven links — reader, progress, habit, sync, diagnostics, attribution, plus the language and minutes controls — each of which pushed *Latihan 4 menit* further from the thumb (SPEC §10 puts the primary action in the thumb zone). The rule now: home holds practice and the two things a learner opens *between* sessions (the reader and progress); the rest lives behind one settings screen, which is also where the topic picker belongs. The e2e suite goes through the same door a learner does rather than reaching past the UI. |
| D67 | **The glossary is a read, and that is the condition §2.2 attaches to it** | §2.2 bans "browse the list" as a study activity and permits this in the same sentence: *"a passive glossary is fine, but it does not create or advance cards."* So `buildGlossary` opens no transaction, calls no writer, and cannot reach `recordReview` — the only function allowed to move FSRS state (invariant 0) — and a test asserts a card is byte-identical after the glossary has been built against a timestamp thirty days later. It lists only items with a card, because a card is the product of an answer: this is what the learner has *met*, not what the app ships. Ordered strongest first, which is a §2.14 choice rather than a technical one — opening it should show what someone has secured, not what they are currently failing. It exists because the progress screen could say "kamu mengenali sekitar 1.200 kata" and never show one of them, and capability you cannot look at is a claim rather than evidence. |
| D68 | **Accessibility is gated, not asserted — and the keyboard is checked by using it** | §10 promises WCAG AA contrast, `motion-safe:` on every transition, 56px tap targets and *"full keyboard operation on desktop"*, and §13 gated none of it: all four were claims maintained by care since M0. `e2e/a11y.spec.ts` runs axe (`@axe-core/playwright`, MPL-2.0, devDependency only, nothing in the bundle) over every screen a learner reaches, plus a session mid-answer. It found one real defect on the first run — the JSON restore input is visually hidden behind a button, so a screen reader met an **unlabelled file field**, critical severity, on the one screen where a learner hands over their whole history. The keyboard is checked separately and behaviourally, by driving the app with nothing but Tab and Enter from the home screen into a session and answering a card, because "full keyboard operation" is a behaviour that no static rule observes. Reduced motion is checked by asking the browser for the preference and asserting that nothing declares a transition. **axe is a floor, not a verdict**: it cannot tell whether a screen makes sense, and passing it says only that the mechanical failures are absent. |
| D69 | **The offline promise is gated against the built service worker, not the config** | §5.4 promises the app is *"fully functional offline after first load, including audio for cached bands"*, and two things erode that as content grows without anything noticing. The runtime content cache is capped by `maxEntries`, and workbox evicts least-recently-used entries past it — the cap was **64** from M2, and glosses, chunks, topics and passages took the shard count to **65**, so a learner who touched both languages was one fetch from losing content they had already downloaded, with a failure that only appears on a plane. And every runtime rule matched `.json`, so **the first audio clip would have matched none of them** — re-fetched on every play, unavailable offline, which is the exact situation the clips exist to survive. `scripts/check-offline.mjs` asserts both against `dist/sw.js` rather than against `vite.config.ts`, because the built worker is what ships; it reads the cap *per cache name*, since taking the largest number in the file would let the content cache shrink below the shard count while the deliberately-large audio cache hid it. Audio also gets `rangeRequests`: an `<audio>` element issues Range requests, Safari always does, and a cached clip answering a range request with a 200 will not play. |
| D70 | **Running text is one tab stop, and the arrows move inside it** | §10 promises *"full keyboard operation on desktop"*, and the reader kept that promise in the most expensive way available: every word in a passage and every token in the feed was its own `<button>`. Two passages and twenty sentences put **~320 tab stops** between a learner and the back button. Nothing failed — axe is content with a focusable button, and the keyboard test walked into a session without touching the reader — which is why this needed a number rather than care. The words are now a composite widget (the WAI-ARIA roving tabindex pattern) in `src/ui/TappableText.tsx`: the block is one stop in the page's tab order, Left/Right and Home/End move between words inside it, and a click makes that word the block's entry point so Tab returns where the learner was. Arrows **clamp rather than wrap**, because prose is a line and not a ring, and arriving back at the first word reads as a bug to someone who cannot see the whole block. The gate is in `e2e/a11y.spec.ts` and asserts both halves — under 40 tab stops, *and* more than 100 words still individually reachable — because withdrawing the stops without keeping the words operable would have taken tap-to-gloss away from the keyboard entirely, which is a worse failure than the one being fixed. |
| D71 | **Dark mode is scanned, because half of §10's contrast promise was never measured** | §10 asks for *"dark mode, WCAG AA contrast"* in one clause and every axe scan ran in light mode, so the dark half had been a claim for eleven milestones. Adding the scan found `dark:text-slate-400`'s predecessor at **4.23:1** on the page background against a 4.5 floor — used **54 times across 15 files**, on every screen with secondary text. The same run found `text-stone-500` at **4.38:1** inside the reader's tinted panel: that shade clears AA on the page background at 4.60:1 and fails on `bg-stone-100`, so it was correct where it was written and wrong where it was reused. The cost is real and stated: raising the tertiary shade collapses it into the secondary one, so dark mode has one fewer step of hierarchy than light. AA is the promise; the third grey was not. The scan also covers the reader **with content in it** — the existing sweep reached the reader before any vocabulary existed, so axe had only ever seen its empty state, never a passage, never the feed, never the word panel. |
| D72 | **One click is one answer, latched twice** | Every write in the session was an `async` handler with no guard, and there are two different ways to click twice. **Racing:** eight taps on "Oke, paham" before the first `await` returned produced **eight** `ReviewLog` rows and eight FSRS advances for one item — measured, not theorised. **Sequential:** the feedback renders in the footer while the card stays on screen above it, so every control that produced the answer is still live once the verdict appears, and clicking it again seconds later wrote another row. Neither is cosmetic, because `recordReview` is the only writer of FSRS state (invariant 0) and `ReviewLog` is **append-only at the Dexie hook** (invariant 1) — updates, overwrites and deletes all throw, so a duplicate row cannot be cleaned up afterwards. It stays in the substrate §9 computes the honest retention rate from, permanently. The race is held by a **ref** rather than state, because `setState` is asynchronous and two clicks in one tick would both read the stale value; the sequential case is held by refusing to answer while a verdict is showing, and both are mirrored into `disabled` so the UI says what it is doing. Both have e2e gates, and both gates were checked by reverting the fix and watching them fail (8 rows, then 5-instead-of-3). |
| D73 | **The word's meaning is shown on every rung, and its absence is stated** | `glossFor` was called only on the `exposure` branch, so L1–L6 carried no gloss at all — including **L5, whose entire job §2.3 defines as "ID → target, produced"**. L5's prompt was the *sentence* translation while the graded answer was a single headword, so a learner shown *"Dia mendapat nilai A."* and asked "what's the English?" had to produce **"a"** with nothing indicating which word was wanted or that one word was wanted at all. The gloss is now resolved once per task for every kind (`glossFor` caches per band, so this is one shard read per band, not per card), and used in three places: L0 as before, **L5 as the prompt** with the sentence demoted to labelled context and an explicit "one word only", and the **feedback panel on every card** — which is safe everywhere, because a gloss cannot give away an answer that has already been given. Coverage is 30% of English and 4% of Japanese (D59), so *absent* is the ordinary case and it is said out loud rather than rendered as blank space — the reader has done this since v1.7.0 and the session was the surface that stayed silent. A gloss remains reference and never an answer key (invariant 29). |
| D74 | **L0 advances on one tap and claims nothing** | Exposure is errorless by §2.3 — the learner is not being tested — but it submitted `task.headword` as its own answer, which graded "correct", printed **"Benar!"** over a card that had asked nothing, and waited for a second tap to dismiss the compliment. Two taps and a congratulation nobody earned, on the rung a beginner sees most. Confirming still records the review (invariant 0: the confirmation *is* the response) and then advances directly; any promotion it caused is already reported in the session summary, which is where §2.14 wants capability reported anyway. |
| D75 | **An answered card retires: it stays readable, it stops being answerable** | The verdict used to render in the footer while the live card stayed mounted above it, which is what made D72's sequential double-answer reachable at all — every control that produced the answer was still there. The card is now replaced by a static *"Soal tadi"* panel showing the sentence **with the answer filled into the blank**, its translation, and the learner's own answer where it differed. Keeping the content is the point: "the answer was X" means very little without the sentence X belongs in, and a cloze's answer means nothing without the gap. **It is deliberately not dimmed** — the obvious way to say "finished" is opacity, and opacity on text is exactly what D71's contrast gate exists to catch, since a shade clearing AA at full strength does not at 60%. It retires by losing its controls and saying so, at full contrast. The layout changed with it: the feedback used to sit inside a `max-h-[60vh]` scroller nested in a scrolling page, with `flex-1` on the main column pushing it down and leaving a dead band between a card and its own verdict. Now the whole answered state reads as one column and the footer carries only *"Lanjut"*, which is what §10 wants in the thumb zone anyway. `handleAnswer` keeps its guard as a backstop: nothing on screen can reach it, but it is the only writer of permanently uncorrectable state (invariants 0 and 1), and one comparison is cheaper than a layout that must never change back. |
| D76 | **A daily introduction cap, beside the debt throttle rather than instead of it** | §7.2 calls review debt *"the #1 cause of abandonment in SRS apps"*, and `newItemAllowance` has implemented the brake since M5 — but a brake and a speed limit are different things. The throttle is computed **per session** from a 7-day forecast, and a forecast only moves once cards exist and their due dates have spread, which is days after the evening that caused the problem. Nothing stopped a learner running five sessions in one evening and passing it five times. Measured on a fresh profile: a 4-minute learner's **first session queued 30 new words** against a review capacity of 20 a day — a backlog bought on day one and paid for on day four. `dailyNewWords` caps introductions per local day, counted from `ReviewLog.introduction`, which `recordReview` sets for free because it has already queried the card's history to compute promotion. The default is `dailyCapacityFor(minutes) / 4` rather than a second magic number, so the two halves of §7.2 cannot drift apart: **5 / 10 / 19** for the three session lengths. **The cost is stated rather than hidden:** early sessions are now short, because a learner with no cards has nothing to review and their queue is exactly one day's allowance. That is the correct behaviour and the home screen says so before they start. Zero is a legitimate setting (§2.14), and it is how anyone digs out of a backlog. |
| D77 | **The card can be pushed away with a thumb, and every swipe is also a button** | §10 puts primary actions in the thumb zone; `src/ui/SwipeCard.tsx` takes that one step further on the one screen a learner touches daily. Three rules keep it from becoming a second code path. **It is additive** — every action reachable by swipe is a real button underneath, it is `aria-hidden` to assistive technology, and the keyboard route is untouched, so §10's "full keyboard operation" is unaffected. **It only goes on cards whose primary action is already a tap** — the exposure rung and the retired card — because on a cloze or production rung the learner is selecting text in an input and a horizontal drag would fight them for the gesture. **It commits through the same latch as a tap** (invariant 37), so one swipe is one `ReviewLog` row, gated by an e2e test. The drag decides its axis after 10px and then holds it, or the page could not be scrolled from anywhere on a card; it resists a pull towards a side with no action on it; and it respects `prefers-reduced-motion` by not transforming at all while still committing. `Screen` gained `overflow-x-clip` because a card travelling off the edge widened the document to 464px in a 375px viewport — `clip` and not `hidden`, since `hidden` creates a scroll container and would silently break the sticky footer above it. |
| D78 | **The home screen states today's load before the learner commits to it** | The one thing an SRS home screen owes its user, and the one thing this one never said: how much is waiting. `todaySnapshot` reads the due count and the remaining introductions and the screen prints them as a sentence — *"0 ulangan · 5 kata baru"* — in tabular numerals. Counts, never targets (§2.15) and never praise (§2.14): a finished day is reported in the same flat voice as a busy one, and there is nothing here that can be fallen behind on. Null while it loads rather than zero, because invariant 18 forbids drawing an unmeasured figure as a 0. It counts **profile-wide**, deliberately matching `dueCandidates` rather than scoping to the active language, so the number on the home screen cannot disagree with what the session it launches actually contains; that scoping is a known wrinkle in the composer and the two move together when it is fixed. A learner who has switched new words off is told *that*, not that new words resume tomorrow — the two states are different sentences because they are different facts. |
| D79 | **A review queue holds one language, and the filter runs inside the query** | `Session.lang` has recorded which language a queue was composed for since v1.0.1, added because resuming a session under a different target handed the learner the other language's content. The queue itself was never actually built that way: `newCandidates` scoped by the `[lang+kind]` index and `drillCandidates` scoped throughout, but `dueCandidates` pulled due cards for the **whole profile** — so a learner who had studied both could meet Japanese kanji inside an English session while the UI claimed otherwise. A card carries no language of its own (it is keyed `profileId::itemId`), so `langOfItemId` reads it off the id namespace every item already carries — `en:lex:word`, `ja:kanji:水` — which is the inverse of `lexemeIdFor` and avoids a second round trip per card. **The filter runs before the limit, and that ordering is the fix rather than a detail:** `dueCards` pages at 200 rows, so filtering an already-capped page would let a Japanese backlog fill every row and leave a learner's English session looking empty. `todaySnapshot` counts through the same predicate, so the home screen cannot promise reviews the session will not contain. |
| D80 | **The learner is told what a tap costs before it spends their data** | §5.4 names the reference device as *"Indonesian mid-range Android on mobile data"*, and the architecture has respected that since M2: the first download is budgeted at 8 MB (§5.3) and everything else is deferred (D20). The half that was missing is that **nothing told the learner when a tap was about to spend their quota, and nothing let them decline**. Opening the reader fetches its band's sentence and passage shards — measured from the manifest, **415 KB gzipped** for an English learner at band 2 and **479 KB** for a Japanese one — unannounced, on a prepaid plan. The figure shown is the manifest's own `gzipBytes`, which the pipeline has emitted since M1, because quoting raw bytes would overstate the cost roughly fourfold. Three behaviours make it honest rather than merely cautious. **`unknown` does not hold back:** two of the three target browsers have no Network Information API, so treating silence as "probably metered" would withhold the reader from most desktop learners and every iPhone on Wi-Fi, on no evidence — withholding what someone expected, on a guess, is the worse failure. **A shard already in the cache is never charged for:** the gate checks `caches.match` first, because warning about a cost that no longer exists is a false alarm, not care. **Practice is never gated** — only the reader is, because the session's content is precached and a learner who declines a download must still be able to study. `src/data` does not import `src/platform`, so `downloadCost` reads the manifest and the feature layer asks the cache. |
| D23 | **Lighthouse PWA gate replaced with direct installability assertions** | §13 asks for "Lighthouse PWA score ≥ 90", but Lighthouse removed the PWA category in v12 (Chrome 126) when Chrome revised its installability criteria. `e2e/coldstart.spec.ts` asserts what the score measured — manifest validity, icon resolution, maskable icon, service-worker control, offline start_url — with no new dependency. |

---

## Part 3 — Manual test matrix (SPEC §13)

Speech APIs cannot be tested in CI. Results go here as they are gathered;
empty rows are honest, invented ones are not.

> **First row landed 2026-08-13, and it changed the code.** The app collects
> these itself now: Settings → *"Uji suara di HP ini"* → *"Uji audio sekarang"*
> emits a row to paste in. Empty cells below are honest; invented ones would
> defeat the only purpose the table has.

| Device | `speechSynthesis` en-US | `speechSynthesis` ja-JP | Offline voice (`localService`) | First-call latency | `SpeechRecognition` |
|---|---|---|---|---|---|
| Chrome 151, Android (model not reported — UA frozen to `Android 10; K`) | **ready, 932 ms** — "English United States" | **ready, 999 ms** — "Japanese Japan" | en: yes, ja: yes | 0 ms | present |
| Chrome, Android (low-end, no TTS engine installed) | | | | | |
| Firefox, Android | | | | | |
| Safari, iOS | | | | | |
| Chrome, desktop | | | | | |
| **Chromium 148 / Electron host, macOS 26.5.0, 8 GB, 8 cores — *not a phone*** | **ready, 855 ms** — Samantha | **ready, 114 ms** — Eddy (Japanese (Japan)) | en: yes, ja: yes | 3 ms | present |

**What the second row settled, and what it is not.** *(added 2026-08-19)*

It is **not** the "Chrome, desktop" row, and that row is still empty. The
browser is Chromium 148 inside an Electron host on a developer's Mac — the
speech engine underneath is macOS's, which is what desktop Chrome on this
machine would also use, but the host's autoplay and idle policies are its own.
Filed as its own row, named for what it is, because the alternative was to write
"Chrome, desktop" and quietly mean something else.

Its value is not the timings. **It found two defects by being a second
platform**, which is the entire argument for the table:

*The row named the wrong operating system.* `formatDeviceReport` printed
`Android/OS <version>` unconditionally — the matrix is about cheap Android
phones, so the label had been written as a constant. This machine reported
*"Android/OS 26.5.0"*, and an iPhone would have reported Android. The empty
cells in this table are the honest ones; a row naming the wrong OS is worth less
than no row at all. The platform is a low-entropy client hint that Chromium has
always offered for free, and nothing had asked for it.

*The boot probe never answered while the page was hidden.* `requestIdleCallback`
does not run for a hidden page, and its `timeout` option only counts down while
the page is visible — so a tab that boots in the background sits on *"Mengecek
suara di HP ini…"* indefinitely. Measured at 25 s and still pending; it resolved
correctly the moment the page was looked at. Deferring until the page is visible
is deliberate and stays (the first `speechSynthesis` call on a device with no
speech service blocks the main thread for ~15 s), but the code claimed its
timeout was *"a ceiling, not a target"*, and for a hidden page it was neither.
It has a real ceiling now.

*What this row cannot tell us.* Nothing about a cheap Android, which is the
claim under test. Both voices here are macOS system voices on an 8 GB machine.
The four rows that matter are still empty.

**What the first row settled.**

*The 500 ms deadline was wrong, and it was costing a working device the whole
listening half of the product.* Both engines completed — real, on-device,
`localService: true` voices in both languages — at 932 ms and 999 ms. Under the
old deadline this phone was told it had no usable audio: L4 dictation withheld,
the mora-timing drills withheld, the listening axis of the radar left unmeasured,
all while owning offline voices for English *and* Japanese. `TTS_ONEND_DEADLINE_MS`
is now **2,000 ms**; the reasoning is in `src/platform/speech.ts` and the short
version is that nearly all of that second is engine start-up, paid once, and a
longer wait cannot admit a liar — an engine that fires `onend` has finished
speaking by definition.

*R1's pessimism about `ja-JP` does not hold on this device.* The register
predicted Japanese voices would be the first thing missing on a cheap Android.
Here it is present, local, and only 67 ms slower than English. One device is not
a trend, and it is the first evidence in either direction.

*The ~15 s first-call stall did not reproduce — and this row cannot refute it.*
`getVoices()` returned in 0 ms, but M4's stall was measured specifically where
**no speech service is installed**, and this phone has one. The row that would
settle it is the second one in the table, still empty.

*The report could not name the device, and now can.* Chrome has frozen the UA
model to "K" since v110, so the row above identifies a browser and not a phone.
The diagnostics screen now also collects client hints — model, platform version,
RAM, cores, screen — because "works on a cheap Android" is the claim under test
and 2 GB of RAM is what makes a phone cheap. Re-running on the same device will
produce a row that says which phone it was.

*Two things worth doing on the next run.* The report says `display: browser tab`
and `storage: best-effort`; installing it to the home screen first will usually
flip persistence to `persisted`, and that is the configuration a real learner is
in. And `permission: default` means notifications were never requested, so the
`in-app-only` verdict there reflects the API, not a refusal.

