# PROGRESS.md

## M2 — The loop · complete (2026-08-10)

**Acceptance:** a 4-minute session runs end to end offline; kill-and-resume
loses nothing; §2.1 and §2.8 tests pass; icon-tap to first question ≤ 3s. All
four met, each as an executable test rather than a claim.

| | required | actual |
|---|---|---|
| icon tap → first answerable question | ≤ 3s | **1.2s** |
| §2.8 interleaving over 1,000 generated sessions | no violations | **0 violations, 0 relaxations** |
| session offline, network cut | works | e2e passes |
| kill mid-session → review logs kept | all | e2e asserts the count |
| initial JS (gzipped) | ≤ 200 KB | 105.4 KB |
| first-load precache | ≤ 8 MB | ~0.58 MB gzipped |

```
✓ typecheck · lint · 198 unit tests · licence gate · build · bundle budget
✓ 9 e2e tests: offline session, lossless resume, cold start, installability
```

### The R5 decision, made

You delegated it, so: **one active FSRS card per item**, with the ladder level
selecting the task and FSRS state carrying across promotion (D18). A card per
rung would multiply review load by up to 7× and cap a 4-minute-a-day learner at
a vocabulary in the low hundreds. `ReviewLog.ladderLevel` records the rung every
answer was given at, so promotion uses the last three answers *at the current
level* and the call stays reversible on real evidence rather than on argument.

### What shipped

Six new `src/core` modules, all pure and unit-tested: `scheduler` (the ts-fsrs
wrapper), `ladder` (promotion, demotion, leeches, mastery), `grader`,
`sessionComposer`, `cloze`, `rng`. Plus `src/platform/speech.ts` (the R1 probe),
the content loader, the review and session repositories, and the session UI —
L0 exposure, L1 recognition, L2/L3 cloze, feedback, and an end screen that
reports what got stronger rather than points.

`recordReview` is the single writer of FSRS state: it cannot be called without a
rating and it writes the card and appends the log in one transaction. That is
§2.2 made structural. A card is not created until the learner first answers it.

### Four things measurement changed

**Importing the corpus into IndexedDB took 43 seconds.** Bands 1–3 are 27,650
sentence rows, and the budget for icon-tap-to-first-question is 3 seconds.
Fetching and parsing the same content as JSON takes ~5 ms. So lexemes (queried,
thousands) live in IndexedDB and sentences (read by id, tens of thousands) stay
as JSON in memory, with the pipeline emitting `anchors.b*.json` — just the
sentences a band's vocabulary is taught through. 43s → **1.2s** (D19).

**Runtime caching could not deliver the offline promise.** §5.4 says the app
works offline after first load; runtime caching only achieves that if the
learner happened to be online for a whole session first. The starter bands are
now precached — 0.58 MB gzipped against an 8 MB budget (D20).

**Naive greedy interleaving fails §2.8.** Always taking the highest-priority
legal card defers same-type cards until only same-type cards remain, then has no
legal move — 2 violations in 1,000 sessions. Ordering by how many of a category
are still waiting, with risk breaking ties, gives zero violations.

**Plain Levenshtein calls a transposition a different word.** `becuase` scores
distance 2 from `because`, past the tolerance for a 7-letter word — so a learner
who knew the answer would be told they were wrong. Damerau-Levenshtein charges 1
for the commonest typing slip there is.

### Deviations

| Deviation | Why |
|---|---|
| L2 is a cloze *with* the Indonesian translation, not "target → meaning typed" | Grading typed meaning needs a gloss (blocked, R3). Grading against the single shipped translation would mark good paraphrases wrong — the unfairness §2.7 exists to prevent. Contextual production splits by support instead: L2 shows the translation, L3 does not (D21). Reverts when glosses land. |
| No answer ever produces an FSRS rating of Easy | §2.12 forbids deriving it from the confidence tap, and deriving it from latency would be invented. Correct → Good, near-miss → Hard, wrong → Again (D22). |
| Lighthouse PWA gate replaced with direct installability assertions | Lighthouse **removed the PWA category in v12** (Chrome 126) when Chrome revised its installability criteria. The e2e suite asserts what the score measured — manifest validity, icon resolution, maskable icon, SW control, offline start_url — with no new dependency (D23). |
| `ReviewLog.ladderLevel` and `Item.anchorSentenceIds` added to the §6 shape | Both follow from D18: promotion needs the last three answers at the current rung, and which example a learner meets first is a pipeline decision, not a query. |
| Session budget spends the reserved input/contrastive 20% on reviews | Those pools have no content until M3 and M4. The share is reserved in the constants, so the numbers are already right when they arrive. |
| The §2.1 "±3 points of target retention" test is not the one the spec describes | Simulating a learner who forgets on FSRS's own curve tests FSRS against itself. What ships is a regression test that our parameters and timestamp handling reach the scheduler intact — see R6, which called this at M0. |

### Known content-quality limitation

Frequency is type-level with no POS tagging, so the exposure card for the
article `a` can pick *"She got an A."* — where the "A" is a grade, not the
article. Real, visible, and not worth a tagger yet; noting it rather than
hiding it.

### Next decision I need from you

Only one, and it is not blocking: **the manual speech device matrix** (R1).
The probe is built and tested against engines that lie, but it has still never
run on a real phone. That needs a cheap Android, an iPhone, and Firefox Android
— things I cannot reach. Until then L4 stays withheld rather than guessed at.

---

## M1 — Content pipeline, English · complete (2026-08-10)

**Acceptance:** ≥5,000 banded EN sentences with ID translations; licence check
passes; beginner shard ≤ 8 MB. All three met, with a lot of room.

| | required | actual |
|---|---|---|
| banded EN sentences with ID translations | ≥ 5,000 | **23,497** |
| beginner first download (band 1, gzipped) | ≤ 8 MB | **0.21 MB** |
| whole corpus, all six bands (gzipped) | — | 1.05 MB |
| lexemes ranked, banded and anchored | — | 5,245 |
| licence gate | passes | 4 datasets declared, 12 asset files traced |

```
✓ typecheck · lint · 61 unit tests · licence gate · build · bundle budget
✓ 3 e2e tests including offline reload
```

### The two blockers, resolved

**English frequency list — removed rather than cleared.** Frequency ranks are
computed from Tatoeba's own 2.03M-sentence English corpus (decision D13). This
adds no licence surface, is register-matched to the sentences we actually teach
from, and makes §2.4 coverage self-consistent: a rank predicts coverage of *our*
corpus, which is the thing coverage is computed over. `wordfreq` was verified as
a viable fallback (Apache-2.0 code, CC BY-SA 4.0 data) but is sunset and frozen
at ~2021 usage.

**Indonesian glosses — sidestepped, not solved.** M1 anchors meaning in
translated sentences rather than dictionary definitions, which is what §2.5
asks for anyway. Kaikki's terms remain unstated and the blocker is still live
for the short glosses that L1/L2 cards will eventually want.

### What shipped

**`scripts/ingest/`** — `fetch.ts` pulls the Tatoeba exports into a gitignored
`.cache/`; `build-en.ts` runs the §5.3 chain (normalize → dedupe → rank →
score → band → shard → hash) in about six seconds. Both are TypeScript executed
directly by Node, so they share `src/core` with the app instead of duplicating
the tokenizer and the difficulty scorer (D17).

**Four new `src/core` modules**, pure and unit-tested: `tokenize.ts` (the same
tokenizer at build time and runtime, so coverage cannot drift), `frequency.ts`
(§2.10 bands, deterministic ranking), `difficulty.ts` (§7.6), `properNoun.ts`.

**`assets/content/en/`** — 11 shards plus a manifest carrying a SHA-256 per
shard for cache-busting. Output is deterministic: no timestamps, ties broken
explicitly, so an unchanged corpus produces byte-identical files and nobody
re-downloads anything.

**Content-integrity tests in CI** — the M1 acceptance numbers, hash and byte
matching per shard, every anchor resolving to a sentence that actually ships,
every lexeme banded consistently with its rank, and no placeholder name taught
as vocabulary.

### Two judgement calls worth reviewing

**Tatoeba made `tom` the third most frequent English token**, ahead of `a` —
the corpus is saturated with Tom and Mary as placeholder names. Ranks are left
untouched, because coverage genuinely has to account for a learner meeting
"Tom" in a sentence, but proper nouns are filtered out of the *vocabulary list*
(D14). Detection uses lower-case share among mid-sentence occurrences only; the
naive version, which looks at all occurrences, also deleted `i'm`, `i've` and
`where's`, since those are capitalized only because they open sentences. 493
tokens filtered. **Known gap:** demonyms go too — `french` and `german` are not
currently teachable words.

**Sentences are banded by 90th-percentile token rank, not by the composite
difficulty score** (D15). "The harder words in this sentence live in band N" is
defensible; "this sentence is B1" is not. Relatedly, `Item.levelTag` is now
optional and unset for everything M1 ships (D16) — inventing CEFR labels from
frequency would be exactly the fake precision §2.15 bans.

### Deviations

| Deviation | Why |
|---|---|
| No Indonesian glosses in the lexeme inventory | Blocked on licence (above). Meaning is carried by anchor sentences, which §2.5 prefers. |
| Lexeme inventory stops at rank 8,000 (bands 1–5) | Band 6 is the open-ended tail; shipping it means hundreds of thousands of entries for no M1 benefit. |
| `Item.levelTag` made optional | See D16 — no cleared CEFR alignment exists. |
| Shards not yet copied into `dist/` | The runtime loader is M2. Copying 4.5 MB into the build with nothing reading it would be dead weight. |
| Every relative import now carries a file extension | See D17 — lets Node run the pipeline against `src/core` with no transpiler. |
| Syntactic depth approximated by clause markers | Shipping a parser to score 25k sentences is not free; the proxy is labelled as a proxy everywhere it surfaces. |

### Next decision I need from you

Nothing blocks M2 except **the ladder-versus-FSRS question**, still open from
M0 and repeated below. Everything else in M1 was mine to decide and is
documented in `docs/DECISIONS.md` (D13–D17).

---

## M0 — Foundations · complete (2026-08-10)

**Acceptance:** `npm run verify` green; app installs as a PWA and loads offline.
Both met, and the offline half is proven by an automated test rather than a
claim — Playwright cuts the network and reloads.

```
✓ typecheck (tsc --noEmit, strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes)
✓ lint (eslint, type-checked rules, no-explicit-any as an error)
✓ 18 unit tests
✓ licence gate: 4 datasets declared and attributed
✓ build
✓ initial JS 91.8 KB / 200 KB (46%) · initial CSS 3.9 KB / 40 KB (10%)
✓ 3 e2e tests on an emulated Pixel 5, including offline reload
```

### What shipped

**Toolchain.** Vite 8 + React 19 + TypeScript 6 (strict, plus
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`), Tailwind 4,
`vite-plugin-pwa`, Vitest, Playwright, ESLint with type-checked rules.

**Data layer (SPEC §6).** All ten entities typed, and the Dexie schema at
version 1 with indexes chosen for the queries the composer will actually run
(`[profileId+suspended+dueAt]` for due cards, `[profileId+reviewedAt]` for
analytics, a multi-entry index on `interferenceTags` for the contrastive
engine). Two invariants are enforced by the store rather than by convention:

- `ReviewLog` is append-only — update, `put()` over an existing row, delete and
  `clear()` all throw. A reset drops the database instead.
- `Card.dueAt` is derived from `Card.fsrs.dueAt` by a Dexie hook, so it cannot
  drift no matter what writes the card.

`src/data/fsrsState.ts` is the serialization boundary to `ts-fsrs`, round-trip
tested across five review generations.

**App.** First-run screen (pick languages, pick daily minutes) creating an
anonymous local profile — no signup, no wall, two taps. Home screen with those
settings editable and an honest status panel (offline readiness, storage
durability). Indonesian-first copy, all of it in `src/i18n/id.ts`; dark mode;
WCAG AA contrast; `motion-safe:` transitions; 56px+ tap targets with primary
actions in the thumb zone.

**CI gates.** `npm run verify` chains typecheck → lint → unit → licence →
build → bundle budget. `scripts/check-bundle.mjs` walks the real build manifest
and counts only the entry chunk plus its transitive static imports, so lazy
content shards will not be able to hide inside the budget.
`scripts/check-licenses.mjs` enforces the §5.2 hard rule.

**Docs.** `CLAUDE.md`, `docs/SCIENCE.md` (all fifteen §2 requirements mapped to
implementation and acceptance test), `docs/DECISIONS.md` (risk register plus
twelve standing decisions), `docs/ETHICS.md`, `NOTICE.md`, `SPEC.md`.

**Licence research (SPEC §15).** Four datasets verified by reading the licence
text: Tatoeba (CC BY 2.0 FR; audio is *not* covered — per-contributor, and
unlicensed clips are unusable) and JMdict / JMnedict / KANJIDIC2 (CC BY-SA 4.0,
share-alike, with EDRDG requiring visible acknowledgement). Everything else is
in a `candidates` list with its specific blocker; the gate refuses candidates.

### Deviations from the spec, and why

| Deviation | Why |
|---|---|
| `profileId` added to `Card`, `ReviewLog`, `Mnemonic` | §6 omits it, but scoped export (§9) and per-profile delta sync (§5.1) both need it. |
| Indexed booleans stored as `0 \| 1` | IndexedDB cannot index booleans, and the composer's hot path is a compound index containing `suspended`. |
| Timestamps stored as epoch ms, not `Date` | Indexable, and lossless through export/import. `Date` exists only at the `ts-fsrs` boundary. |
| `Card.dueAt` added as a derived mirror | IndexedDB cannot index a nested path inside a compound key. |
| `Habit` and `Mnemonic` given explicit keys | §6 gives neither a primary key. |
| Licence gate written in M0, not M1 | §12 lists a licence check among M0's CI gates; writing it now also gave the licence research somewhere to land. |
| Lighthouse PWA gate not yet in CI | §13 lists it, but it pairs naturally with the cold-start timing test, which is M2's acceptance criterion. Both land together in M2. |
| Code licence left `UNLICENSED` | Not mine to pick — see the decision needed below. |

### Not built, deliberately

No `src/core/` modules, no scheduler, no session UI, no AI seam. Per §0 rule 5
these would be scaffolding for milestones that have not started. `ts-fsrs` is a
dependency today only because the schema's serialization contract is defined
against its types and tested against its real scheduler.

---

## Decisions I need from you

**1. The ladder-versus-FSRS question — this one blocks M2.**
§2.3 turns one lexeme into up to seven cards; §2.1 buys a memory model built
for one card per memory. If every rung carries its own FSRS state, a 4-minute
session's review capacity caps the learner at a vocabulary in the low hundreds.
My recommendation is **one active card per item**, where the ladder level
selects the task and FSRS state carries across promotion (difficulty bump up,
demotion on lapse), with each `ReviewLog` recording the level it was answered
at. The schema supports either reading today. Full argument: R5 in
`docs/DECISIONS.md`.

**2. §14 question 3, still open: how much content do you author yourself?**
This shapes M4 and M6 more than any technical choice. Roughly: (a) you author
the ~100 contrastive notes and I generate drills from them, (b) I draft
everything from corpora and you review, or (c) split — you write the
explanations that need a native ear, I generate the mechanical items. My
recommendation is (c): the contrastive explanations in §3.1 are the product's
differentiator and read wrong when they are not written by someone who has made
the mistake.

**3. ~~Two licence blockers that stop M1 from shipping.~~ Resolved in M1** —
frequency by removing the dependency (D13), glosses by deferring them (§2.5
anchors meaning in sentences anyway). The gloss question returns when L1/L2
cards want a short definition.

**4. Code licence.** Currently `UNLICENSED`. EDRDG's share-alike binds the data,
not the code, so this is a free choice — worth settling before the repo is
public.

**5. Japanese sentence data will not meet §2.5 as written.** Tatoeba has 28,198
Indonesian sentences against 2.0M English; direct JA↔ID pairs will be a small
fraction of that. Not urgent until M6, but the options (pivot through English,
gloss in Indonesian at lexeme level only, or hand-author a core) each change
what the app promises. R2 in `docs/DECISIONS.md`.

---

## Next milestone

**M3 — Level awareness.** Adaptive placement (≤90s, ≤25 items), three separate
ability estimates, the i+1 content selector, and a new-item throttle driven by
forecast review debt. Nothing blocks it: the tokenizer and banding it needs are
already shipped, and `sentences.b*.json` is waiting for the selector that
finally has a use for the whole corpus.
