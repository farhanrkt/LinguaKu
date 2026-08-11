# Decisions and risk register

Standing technical decisions, and an honest reading of what is most likely to
break. Written at M0 per SPEC §15; updated whenever a decision changes or a
risk resolves.

---

## Part 1 — Risk register

Ordered by how much of the product dies if the assumption is wrong.

### R1 — Web Speech API voices on cheap Indonesian Android devices

**Status:** M4 hardened the probe into a once-per-start liveness check with a
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
| D29 | **The TTS probe runs once per app start *per language*, waits for `onend`, gives up at 500 ms — and fires only after a screen is painted** | Four calls, plus one correction. *Per language* was added at v1.0.1: the verdict was originally one value for the whole app, so on a device with an en-US voice and no ja-JP one — the exact configuration R1 warns is most likely — the English probe vouched for Japanese, and the app would report audio ready, schedule L4 dictation and mora minimal-pair drills, then have nothing to speak them with. Keyed by language it is still one settled verdict per language per start, so the rung cannot flicker under the learner. *Once per app start*, because a verdict that can flip mid-session would flicker the L4 rung in and out under the learner, and re-probing per card costs a settle delay on every audio item. *`onend`, not `onstart`*, because the Android failure mode is an engine that announces itself and then goes silent — a start-based check passes it. *500 ms*, because an engine that cannot finish a zero-volume full stop in half a second will not deliver a dictation card either. *After a paint*, because measurement forced it: the first `speechSynthesis` call on a device with no speech service blocks the main thread for ~15s (see R1), so "on boot" in the literal sense would freeze the app for five times its entire cold-start budget. **Two costs, stated plainly:** iOS Safari needs a user gesture before it will speak, so this will mark iOS dead where audio might have worked from inside a tap; and there is a window early in the first screen where `isTtsLive()` is false because the answer has not arrived. Both fail safe — audio withheld, never faked. |
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
| D23 | **Lighthouse PWA gate replaced with direct installability assertions** | §13 asks for "Lighthouse PWA score ≥ 90", but Lighthouse removed the PWA category in v12 (Chrome 126) when Chrome revised its installability criteria. `e2e/coldstart.spec.ts` asserts what the score measured — manifest validity, icon resolution, maskable icon, service-worker control, offline start_url — with no new dependency. |

---

## Part 3 — Manual test matrix (SPEC §13)

Speech APIs cannot be tested in CI. Results go here as they are gathered;
empty rows are honest, invented ones are not.

> **Still empty as of M4 (2026-08-11).** M4 was directed to proceed on the basis
> that this matrix had been run, and the probe was built to the deadline that
> direction specified (D29). No results were supplied, so nothing has been
> written in below — filling these rows from a description of the testing rather
> than from the testing would defeat the only purpose the table has. The code
> does not depend on them: the probe measures the device it is running on. What
> depends on them is knowing whether 500 ms is the right number, and whether the
> iOS gesture requirement noted in D29 costs real learners their listening
> material.

| Browser / device | `speechSynthesis` en-US | `speechSynthesis` ja-JP | Offline voice (`localService`) | `SpeechRecognition` |
|---|---|---|---|---|
| Chrome, Android (mid-range) | — | — | — | — |
| Chrome, Android (low-end) | — | — | — | — |
| Firefox, Android | — | — | — | — |
| Safari, iOS | — | — | — | — |
| Chrome, desktop | — | — | — | — |
