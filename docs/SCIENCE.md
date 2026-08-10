# SCIENCE.md — from finding to code

Every learner-facing mechanic in LinguaKu traces to a requirement in SPEC §2.
This file is the map: mechanism → where it lives → how we know it works.

`Status` is one of **shipped**, **planned (Mn)**, or **at risk** (see
`docs/DECISIONS.md`). Code that implements a row carries a
`// SCIENCE: <mechanism> — see SPEC §2.x` comment.

---

## §2.1 Spaced retrieval with a modern memory model

**Mechanism:** spacing effect; retrieval scheduled against a predicted
forgetting curve rather than a fixed ladder of intervals.

**Implementation:** `ts-fsrs` behind `src/core/scheduler.ts` — a thin wrapper
exposing preview (all four rating outcomes), apply, retrievability query, and a
per-user parameter slot. Defaults: `request_retention` 0.90, `enable_fuzz`
true, short-term steps enabled. State is serialized by
`src/data/fsrsState.ts`; every answer appends a `ReviewLog` row, and the log is
append-only at the storage layer.

**Acceptance:** scheduling deterministic given (state, rating, timestamp);
review log round-trips; a simulated 90-day history measures retention within
±3 points of target. See R6 in `docs/DECISIONS.md` for what that last test can
and cannot honestly claim.

**Status:** **shipped** (M2). `src/core/scheduler.ts` is the only writer of FSRS
state; determinism is pinned by tests that replay a history and compare, fuzz
included, and by one that round-trips the state through JSON mid-history.

## §2.2 Retrieval practice, not review

**Mechanism:** the testing effect — producing an answer strengthens memory far
more than re-reading it.

**Implementation:** no code path advances FSRS state without a recorded
learner response. The glossary is browsable but creates and advances nothing.
Enforced structurally: `scheduler.apply()` takes a `ReviewLog` as input, not a
rating alone.

**Acceptance:** a test asserts no exported function mutates `Card.fsrs` without
a corresponding log row.

**Status:** **shipped** (M2). `recordReview` is the single writer, it cannot be
called without a rating, and it writes the card and appends the log inside one
transaction — so state cannot move without its log, and the log cannot be
dropped to make a card look better. A card is not even created until the
learner first answers.

## §2.3 Desirable difficulty via a card-type ladder

**Mechanism:** desirable difficulties — retrieval that is effortful but
successful produces more durable learning than easy retrieval.

**Implementation:** L0 errorless exposure → L1 recognition MCQ → L2 recall →
L3 cloze → L4 audio-only → L5 production → L6 free production. Promotion when
stability passes threshold *and* last-3 accuracy ≥ 2/3; demotion on lapse.
Distractors drawn from the same POS and frequency band, or from a §3
confusable.

**Resolved (D18):** one active FSRS card per item; the ladder level selects the
task and the state carries across promotion. A card per rung would multiply
review load by up to 7× and cap a 4-minute learner at a vocabulary in the low
hundreds. `ReviewLog.ladderLevel` records the rung each answer was given at, so
promotion can use the last three answers *at the current level* and the ladder's
effect on accuracy stays measurable.

**Acceptance:** an item that has only ever been answered at L1 cannot display
as mastered.

**Status:** **shipped for L0–L3** (M2); L4 waits on audio (R1), L5–L6 on
production input (M7). R5 resolved as one card per item (D18). L2 ships as a
supported cloze rather than typed meaning (D21) — a documented deviation forced
by the missing gloss source.

## §2.4 Comprehensible input at i+1, quantified

**Mechanism:** the ~95–98% known-token coverage threshold for unassisted
comprehension.

**Implementation:** `src/core/coverage.ts` computes the known-set (FSRS
retrievability > 0.6 counts as known) and scores candidate texts. The selector
targets coverage ∈ [0.92, 0.98] and hard-refuses < 0.85. Japanese coverage uses
build-time morphological tokens (`Sentence.tokens`), never character splitting.

**Acceptance:** against synthetic learner profiles, ≥90% of returned items fall
in band and none fall below 0.85.

**Status:** the tokenizer (`src/core/tokenize.ts`) is **shipped** (M1) and is the
same one the build-time pipeline uses, so runtime and build-time coverage
cannot disagree. The selector itself is **planned (M3)**.

## §2.5 Everything lives in a sentence

**Mechanism:** contextual encoding — a word learned in a sentence carries
usage, collocation and register that a word pair does not.

**Implementation:** the ingestion pipeline rejects any lexeme with zero linked
example sentences. Collocations and formulaic chunks are first-class `Item`s
(`kind: 'chunk'`), not derived from single words.

**Acceptance:** pipeline test — a lexeme with no linked sentence fails
ingestion rather than shipping bare.

**Status:** **shipped for English** (M1). The pipeline rejected 2,185 otherwise
qualifying lexemes for having no example sentence, and a CI test asserts that
every shipped lexeme resolves to at least one sentence that actually ships.
Still **at risk for Japanese** (R2).

## §2.6 Dual coding and audio-first

**Mechanism:** dual coding — phonological and orthographic traces reinforce
each other; listening is a distinct skill that reading practice does not build.

**Implementation:** `src/platform/` capability probe for `speechSynthesis`
(waits for `voiceschanged`, prefers `localService`, speaks a timed test
utterance). Pre-cached CC-licensed clips as fallback.

**Acceptance:** an item with no working audio is **excluded from L4
scheduling**, never silently degraded to a text card.

**Status:** probe **shipped** (M2) — including the case that makes voice
enumeration insufficient on its own: an engine that lists a voice and then never
speaks. L4 itself waits until the device matrix has been run. Still **at risk**
(R1).

## §2.7 Generation and output

**Mechanism:** the generation effect — self-produced answers are retained
better than recognized ones.

**Implementation:** ≥1 production task per session. `src/core/grader.ts` does
tolerant matching: normalization, romaji↔kana equivalence, Levenshtein
tolerance scaled to item length, English contractions. Near-misses are shown
*as near-misses*, not marked wrong.

**Acceptance:** grader unit tests cover romaji↔kana, typos within tolerance,
and contractions.

**Status:** grader **shipped** (M2); speech input is M7. Distance is
Damerau-Levenshtein, not plain Levenshtein: an adjacent transposition is the
commonest typing slip, and charging 2 for it would tell a learner who knew the
answer that they were wrong. Romaji↔kana is M6.

## §2.8 Interleaving and mixed practice

**Mechanism:** interleaving beats blocking for discrimination and transfer,
despite feeling worse during practice.

**Implementation:** `src/core/sessionComposer.ts` enforces ≤2 consecutive
items of the same card type and ≤3 from the same topic cluster. Deterministic
under a seeded RNG.

**Acceptance:** a property test over 1,000 generated sessions finds no
violation.

**Status:** **shipped** (M2), and the property test passes with zero
violations and zero relaxations. Ordering is not naive greedy — always taking
the highest-priority legal card defers same-type cards until only same-type
cards remain, and then has no legal move. The primary key is how many of a
category are still waiting; risk breaks ties. Where a pool makes §2.8
impossible, the session says so rather than silently blocking.

## §2.9 Elaborative, contrastive feedback

**Mechanism:** elaborative interrogation — explaining *why* an answer is wrong
builds a rule, not a corrected instance.

**Implementation:** authored `data/contrastive/{en,ja}.yaml`. A wrong answer
matching a known Indonesian-L1 interference pattern shows, in Indonesian, the
L1 pattern, why the target differs, and one minimal pair.

**Acceptance:** ≥80% of grammar items and 100% of interference-tagged items
have an authored contrastive note.

**Status:** planned (M4 for English, M6 for Japanese).

## §2.10 Frequency-ordered curriculum

**Mechanism:** the top ~2,000 word families cover most everyday text, so early
effort should buy maximal coverage.

**Implementation:** six frequency bands (`FREQUENCY_BANDS` in
`src/core/frequency.ts`), modulated by learner-selected topic goals. Ranks come
from Tatoeba's own English corpus (D13); proper nouns are filtered from the
vocabulary list but not from the ranks (D14).

**Acceptance:** the known-words dashboard renders a coverage-vs-band curve from
real learner state.

**Status:** **shipped for English** (M1) — 5,245 lexemes ranked and banded from
a 2.03M-sentence corpus. R3 resolved by deriving frequency from Tatoeba itself
(D13) rather than clearing an external list. The dashboard curve is M5.

## §2.11 Mnemonics and decomposition for kanji

**Mechanism:** elaborative encoding through imagery; self-generated mnemonics
outperform given ones.

**Implementation:** radical decomposition (`Item.componentsOf`) plus a
component graph, with an Indonesian-language mnemonic the learner can edit.
`Mnemonic.authoredByUser` marks learner edits, which win on sync.

**Acceptance:** every kanji item renders its component breakdown; user-authored
mnemonics persist and survive sync.

**Status:** planned (M6); decomposition source not yet licence-cleared (R3).

## §2.12 Metacognitive calibration

**Mechanism:** judgment-of-learning accuracy is trainable, and miscalibration
predicts wasted study time.

**Implementation:** a one-tap Yakin/Ragu signal before the reveal on recall
cards, stored on `ReviewLog.confidence`. Charted as confidence vs. actual
accuracy. Also a second signal for leech detection.

**Acceptance:** the calibration chart renders from real logs; confidence never
overrides the FSRS rating.

**Status:** **shipped** (M2) — and the confidence signal *is* the submit
button (Yakin / Ragu), so asking for it costs the learner no extra tap. A test
pins that two identical answers with opposite confidence produce identical FSRS
state. Chart is M5.

## §2.13 Microlearning and habit architecture

**Mechanism:** implementation intentions ("after X, I will do Y at Z")
substantially raise follow-through versus goal intentions.

**Implementation:** default 4-minute session, 8 and 15 available. Onboarding
captures a cue and place (`Habit`) and schedules a local notification.
Session state persists after **every single answer** (`Session.resumeCursor`).

**Acceptance:** killing the app mid-session and reopening resumes at the exact
next item, losing no review logs.

**Status:** resume **shipped** (M2): the cursor is persisted and *awaited*
before the next item renders, and an e2e test kills the page mid-session and
asserts both the position and the review-log count survive. Habit capture and
notifications are still to come.

## §2.14 Motivation via competence, not coercion

**Mechanism:** self-determination theory — autonomy, competence and relatedness
sustain motivation; external contingencies erode it.

**Implementation:** learner picks topics and daily load and can always skip an
item; progress is phrased as capability ("kamu sekarang paham ~86% kata di
percakapan sehari-hari"); a rolling 7-day consistency band that heals itself
replaces the streak.

**Acceptance:** `docs/ETHICS.md` lists the banned mechanics and the PR
checklist references it.

**Status:** ethics doc and copy rules **shipped** (M0); progress framing
**planned (M5)**.

## §2.15 Explicitly banned mechanics

Recognition-only progression; translation-only cards with no context; timed
pressure by default; XP divorced from measured ability; auto-advancing lessons
that ignore memory state; fake-precision level claims without an uncertainty
band.

**Status:** enumerated in `docs/ETHICS.md` (**shipped**, M0) and enforced by
review, not by tests. Level estimates carry a standard error in the schema
(`Ability.standardError`) so the uncertainty band is available by construction.
