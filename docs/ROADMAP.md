# ROADMAP — v1.2.0 through v1.5.0

> **Executed 2026-08-12 — see `CHANGELOG.md` v1.5.0 and the M8–M11 entry in
> `docs/PROGRESS.md` for what actually landed.** This file is kept as written
> so the plan can be read against the outcome. Three things went differently:
> the gloss go/no-go **failed at 40.3%** and glosses shipped as reference rather
> than as an answer key (D59); Simple English Wikipedia turned out to band 96%
> of its prose at level 6, so passages serve the intermediate learner rather
> than the beginner (D61); and the FSRS optimizer was measured and **not**
> shipped (D62). Two planned items — **chunks** and **topic clusters** — are not
> built, because both need authored content and a reviewer rather than code.
> And the **BYOK AI layer this file scoped for v1.5.0 was declined**: it was
> implemented, reviewed and deleted, and §14 question 5 now reads *declined*
> rather than *deferred* (D63). Everything below it in the v1.5.0 section that
> describes an AI feature describes something that does not exist.

Planning document, written 2026-08-12 against v1.1.0. `SPEC.md` is still the
contract and this file does not amend it; anything here that changes a standing
decision becomes a `D` entry in `docs/DECISIONS.md` when it is actually taken.
Numbers quoted from v1.1.0 are measured, numbers quoted for future releases are
targets and are marked as such.

Milestone names continue the §12 sequence: **M8–M11 map onto v1.2.0–v1.5.0.**
All four are minor releases — additive schema, no break in the local data
contract. `v2.0.0` is reserved for something that breaks an export.

---

## Where v1.1.0 actually leaves us

Every §2 requirement has an implementation, and that is exactly why the
remaining work is legible: what is left is not features beside the spec, it is
**four places where the app is honest about not knowing something**, and each of
them has a name in the risk register.

| The gap | What it costs today | Named in |
|---|---|---|
| No verified device audio, no pre-cached clips | L4 withheld on silent devices, 22 EN + 3 JA drills withheld, phonology categories permanently *"belum cukup data"*, listening axis of the radar `null`, `listening` ability absent from placement | R1, D25, D29, D30 |
| No Indonesian glosses | L2 is a supported cloze rather than meaning recall, reader's word panel has no dictionary, placement cannot test recall | R3, D21, M7 deviations |
| No passage corpus | The reader is a feed, not a text; §2.4's coverage band is unreachable on single sentences; reading axis of the radar `null` | D28, D45, D47 |
| No per-user memory parameters | §2.1 buys the review log to optimize FSRS per learner; what ships is a bounded nudge | D39 |

Plus three things typed and empty: `ItemKind = 'chunk'` is never produced
(§2.5 asks for collocations as first-class items), `clusterId` is a constant
because no content carries a topic (§2.8's second interleaving rule is inert,
and §2.10's "modulated by learner-selected topic goals" has nothing to modulate),
and §10's on-screen kana keyboard does not exist — `src/core/kana.ts` converts
for the *grader* and for the reader, and a Japanese learner at L5 is typing
into a plain text field.

**The shape of the roadmap follows from that.** Each release closes one register
entry and turns one `null` on the progress screen into a measurement. No release
adds a mechanic that does not trace to §2, and none of them relaxes invariant 4.

---

## At a glance

| | Release | Theme | Closes | Turns into a measurement |
|---|---|---|---|---|
| M8 | **v1.2.0** | Audio, and the device we have never seen | R1 | listening |
| M9 | **v1.3.0** | Meaning | R3 (glosses) | vocabulary recall, not recognition |
| M10 | **v1.4.0** | Reading | D45's "only the source changes" | reading |
| M11 | **v1.5.0** | The learner's own parameters | D39's nudge, D4's deferral | scheduler fit, free production |

Budget discipline across all four: **every addition is lazy**. Audio, glosses,
passages, the FSRS optimizer and the optional AI module must each stay out of
the entry chunk, and `scripts/check-bundle.mjs` is what proves it. Target at
v1.5.0: **initial JS ≤ 160 KB gzipped** (128.3 today, 200 is the invariant), so
the budget still has room after the roadmap ends.

---

## v1.2.0 — M8 · Audio, and the device we have never seen

**Why first.** It is the only item on the list that blocks *five* other things,
and it is the last technical unknown in the product. It is also the only release
here whose critical path runs through hardware and a licence rather than code.

### Scope

**1. A diagnostics screen that fills the matrix (`src/features/settings/DiagnosticsScreen.tsx`).**
Part 3 of `docs/DECISIONS.md` has been empty since M4 because filling it needs
phones we do not have. So stop treating it as something only the owner can do:
a screen with an explicit **"Uji audio"** button that runs the probes on demand
and emits a copy-pasteable report — voices enumerated per language,
`localService`, **first-call latency**, `onend` latency, `SpeechRecognition`
presence, `TimestampTrigger` support, storage durability, user agent. Anyone
with a phone can then send a row.

This is also the escape hatch D29 already anticipated: if the ~15 s first-call
stall reproduces on real hardware, the probe moves behind this button and stops
running by itself. Building the button first means that change is a config flip,
not a redesign.

**2. Pre-cached audio, generated at build time (`npm run ingest:audio`).**
Piper, run offline, ONNX voices, output committed as Opus. Deterministic per
invariant 10 — same text and same voice in, byte-identical clip out, or the
manifest hash churns and every learner re-downloads for nothing.

Shape, following R4's measurement (text is 2.6% of the budget; audio is the
budget): the initial precache stays **text-only**, and a band's clips are
fetched and cached when the band is. Coverage order is band 1 headwords, then
band 1 anchor sentences ≤ 10 tokens (the L4 material, per D30), then band 2.
Both languages.

**Gate before a single clip enters `assets/`:** the specific voice model's
licence read, dated and entered in `data/licenses.json`, with a matching
`NOTICE.md` section (invariant 5). Piper's own code licence is not the question;
the voice model is, and each one carries the terms of the corpus it was trained
on. A voice whose terms cannot be established is not used — the same rule that
kept Tatoeba audio out.

**Japanese is the weaker case and should be measured before it is promised.**
Piper's Japanese voice inventory is thinner than its English one, and JA audio is
what the mora-timing drills depend on entirely. If no JA voice clears both the
licence gate and an intelligibility check by a native ear, ship EN clips, say so,
and leave JA on synthesis-or-nothing. Half a fallback chain that works is worth
more than a whole one that is claimed.

**3. `listening` stops being `null` — from live evidence, not from placement.**
D25 left the row absent because audio was unverified. With clips shipped it can
be estimated, but *not* by adding items to placement: §4.2 has 90 seconds and 25
items and the vocabulary loop already spends them. §4.2 also says *"re-estimate
continuously"*, so the listening ability is updated from what the learner
actually does — L4 dictation outcomes and minimal-pair drill outcomes — and stays
absent until it has real evidence behind it, on the same "not measured" rule as
everything else (invariant 18).

**4. Housekeeping that should not survive into v1.3.**

- **D53's open half.** The app teaches one language at a time while `targets` is
  an array and first run offers a multi-select. Recommendation: keep one active
  language and fix the *copy* — first run picks the language to start with and
  says it is switchable — rather than building parallel teaching. Cheapest
  honest fix; the array stays because the other language keeps its own cards.
- **The sync Worker: deploy once or delete it.** It is written, documented and
  unproven. One deployment tests D51's arithmetic; deleting `workers/` costs
  nothing because nothing imports it. Leaving it undeployed and undeleted is the
  only option with no upside.
- **The Indonesian native pass on shipped copy**, now including the habit and
  recap strings. This is a gate on the release, not a nice-to-have: it is the
  language the product is in.

### Acceptance

- ≥ 3 rows in `docs/DECISIONS.md` Part 3, from observation, including
  first-call latency. **Manual — this is the release's critical path.**
- On a device with the speech engine dead, L4 is offered for every item whose
  anchor has a clip, and the log records L4. E2E, with synthesis stubbed dead.
- Audio for bands 1–2, both languages, ≤ 8 MB total; initial precache unchanged
  at ~1.31 MB. New CI gate `npm run check:audio`.
- Re-running `ingest:audio` on unchanged input produces byte-identical clips.
- Every voice model in `data/licenses.json → datasets`, rendered on the
  attribution screen, asserted by `attribution.spec.ts` in both directions.
- Listening ability appears only after real listening evidence; the radar shows
  a hollow marker until then.

### Risks this adds

- **R7 — voice-model licensing.** Same class of risk as R3, and it has already
  cost us Tatoeba audio once.
- **R8 — build-time audio makes the repo heavy.** Committed binaries in git
  (invariant 10 wants committed, deterministic outputs). Measure before
  committing; if it is unmanageable, the decision to record is where the clips
  live instead, and it must not become a recurring cost.

### Not in this release

No pronunciation *scoring*. Shadowing stays record-and-compare (M7's deviation
stands): a recognizer tells a learner whether a machine understood them, which is
not the same claim, and inventing a score is what §2.15 bans.

---

## v1.3.0 — M9 · Meaning

**Why now.** R3's remaining half. D21 says in as many words that L2 "reverts to
the spec's shape when glosses land", the reader's missing dictionary is the same
blocker, and so is recall-based placement. One dataset unblocks three things the
spec asked for.

### Scope

**1. Indonesian glosses, parsed from Wikimedia dumps directly.**
Not Kaikki — its extraction states no licence of its own (R3). The underlying
content is CC BY-SA 4.0, so parse the dumps: `en.wiktionary` translation
sections give EN→ID, `id.wiktionary` gives Indonesian definitions. Offline,
committed, deterministic, in `scripts/ingest/build-glosses.ts`.

**Spike first, and make it a go/no-go with a number.** Measure gloss coverage
over bands 1–3 before building anything on top. **If coverage is below 70%, L2
stays as it is and the release says why** — a meaning-recall rung that works for
two words in three is worse than a cloze that works for all of them.

**Licence consequence, handled by construction:** glosses ship in their **own
shard** under CC BY-SA 4.0. English sentence shards stay CC BY 2.0 FR. D9's
per-file provenance already supports this; mixing the two into one file would
silently upgrade the whole English corpus to share-alike.

**2. What glosses unlock, in the order the spec asks for them.**

- **L2 becomes §2.3's rung**: target → meaning, typed or spoken, graded against
  the gloss *set* with §2.7's tolerant matching. D21 is retired, and the reason
  it existed — good paraphrases marked wrong — is exactly what a set of glosses
  fixes.
- **The reader's word panel** gets the dictionary M7 had to ship without.
- **L1 distractors** come from same-band glosses rather than from translations
  of other sentences (§2.3 asks for plausible distractors; this is what makes
  them plausible).
- **Placement gains a recall item type**, noted as blocked in M3's deviations.
  Kept optional and short: §4.2's 90 seconds are not negotiable.

**3. Chunks become first-class items.** §2.5 names them explicitly — *"take a
shower"*, 「お世話になります」 — and `ItemKind = 'chunk'` has been typed and
unproduced since M0. Extract collocations statistically from the corpus we
already ship (PMI over adjacent n-grams, band-restricted), review by hand, and
give them their own card type so §2.8 keeps them apart from lexemes.

**4. The kana keyboard (§10).** *"Japanese input without an IME headache:
on-screen kana keyboard + romaji input with live conversion."* Today a Japanese
learner at L5 types into a plain field, which is the friction §10 exists to
remove. `src/core/kana.ts` already has the conversion; this is a UI component
plus live preview, and it belongs with the release that touches typed answers.

### Acceptance

- Gloss coverage over bands 1–3 reported as a measured number, per language,
  with the go/no-go decision recorded either way.
- L2 grades typed meaning against a gloss set; `grader.test.ts` covers
  paraphrase acceptance, and the near-miss path (§2.7) still reports near-misses
  as near-misses.
- Reader word panel shows a gloss with its source, or says there is none.
- ≥ 200 EN and ≥ 100 JA chunks shipped, each anchored to a sentence (§2.5's
  ingestion rule applies to them unchanged).
- Kana keyboard operable one-handed, 56 px targets, full keyboard fallback on
  desktop.
- English sentence shards still declare CC BY 2.0 FR. Asserted, not assumed.

---

## v1.4.0 — M10 · Reading

**Why now.** D45 recorded that the reader is a feed because Tatoeba has no
documents, and that *"the selector is written so that only the source changes
when it clears"*. This is the release that changes the source.

### Scope

**1. Simple English Wikipedia, cleared and ingested.** CC BY-SA 4.0, listed in
§5.2, still a `candidate` in `data/licenses.json`. Read the terms, date them,
clear it, then build `scripts/ingest/build-passages.ts`: dump → wikitext
stripped → paragraph-level segmentation → the existing difficulty and banding
chain (§5.3) → passage shards, lazy per band, never precached.

**2. The i+1 selector operates on running text at last.** D28's arithmetic —
coverage on an n-token text is quantized to 1/n, so [0.92, 0.98] is empty below
~17 tokens — stops binding on a paragraph. §2.4's acceptance test moves onto real
passages and the sentence-level fallback stays for the feed.

**3. The reading axis stops being `null`.** Measured from cloze over a passage
the learner has actually read, not from invented comprehension questions. It is
the same retrieval mechanic §2.2 already requires, over text rather than a
sentence, so it needs no new grading story.

**4. Topic clusters (§2.10, §2.14, and §2.8's inert second rule).** Passages
carry real categories, which is the cheapest honest source of topic labels. For
the lexeme inventory and for Japanese, where there is no equivalent corpus,
author a small map — `data/topics/{en,ja}.yaml`, ~20 clusters over the first
2,000 words, compiled at build time with the same failing-compiler discipline as
the contrastive YAML (D31). This switches on both the §2.8 spacing rule and
§2.14's *"learner picks topic clusters"*, which is autonomy the app currently
promises in the spec and not in the UI.

**5. Japanese reading is the honest asymmetry of this release.** There is no
graded Japanese passage corpus that is free and cleared. Japanese keeps the
feed, and the screen says which of the two it is showing rather than letting the
learner infer parity.

### Acceptance

- §2.4's coverage-band test passes on passages: ≥ 90% in band, never below 0.85.
- Passage shards lazy; initial precache unchanged; invariant 6 unmoved.
- Reading ability appears only after passage evidence exists.
- Topic selection changes which new items are introduced, and 1,000 generated
  sessions show no violation of §2.8's ≤ 3 per cluster rule — a rule that has
  never actually been exercised, because until now every item had the same
  cluster.
- SEW attribution and share-alike rendered on the attribution screen; passage
  shards declare CC BY-SA 4.0.

---

## v1.5.0 — M11 · The learner's own parameters

**Why last.** It needs history that only real use produces, and it is the one
release that touches the optional AI layer D4 deferred to post-M7 — which is now.

### Scope

**1. Real FSRS optimization (§2.1's stated reason for keeping the log).**
D39 ships a bounded nudge to `request_retention` and says plainly that a real
per-user fit needs the optimizer. This release attempts it.

**Verify the package before promising the feature.** SPEC §2.1 names
`@open-spaced-repetition/binding`; confirm what actually runs in a browser —
a native Node binding does not, and the WASM sibling is the candidate. The
constraints are hard: **lazily loaded, never in the entry chunk, run in a Worker
so it cannot block the main thread** (R1 taught us what a blocked main thread
costs on the reference device), triggered on demand behind *"optimalkan
jadwalmu"*, never automatically. **If nothing fits the budget, the nudge stays
and the release says so** — that is a perfectly good outcome and it is the one
D39 already anticipated.

Whatever ships must be reversible to defaults in one tap, and the parameters go
in the export (§9 — the learner owns their data).

**2. The error-correction drill (§8, *"perbaiki kalimat ini"*).** The last
unbuilt item in the exercise catalog, and it needs no AI: the contrastive YAML
already holds authored wrong sentences per category, with explanations. Adding a
drill type over content that exists is the cheapest §8 item left.

**3. The optional AI layer — bring-your-own-key, off, and structurally inert.**
§5.1 and §14 question 5, answered "deferred to post-M7". Uses, in the order they
are worth doing: **free-production feedback at L6** (D49 checks only that the
word was used, and says so — a rubric response is the obvious upgrade), then
**example-sentence generation**, and nothing in the core loop, ever.

The design constraint is the one invariant 21 already proved works for sync:
**nothing in `src/features/session` or `src/data` imports the AI module**, the
settings screen is the only place a key is entered, each call is consented to at
the point of use because it sends the learner's own sentence to a third party,
and `sync.spec.ts`'s zero-egress assertion is extended to cover it. The key
lives in `localStorage`, not Dexie, for D52's reason exactly.

If it cannot be built without the core loop depending on it, it does not ship.
§1 is not ambiguous: LLM features are garnish.

### Acceptance

- Optimization either produces per-user parameters from ≥ N real reviews, with
  a measured before/after on the retention audit, **or** is reported as not
  viable with the numbers that ruled it out.
- Initial JS still ≤ 200 KB, target ≤ 160 KB, with the optimizer and AI modules
  present but lazy — proven by `check-bundle.mjs` against the real manifest.
- A full session with AI configured but not invoked produces **zero external
  requests**. Same e2e discipline as sync.
- Error-correction drills for ≥ 10 EN and ≥ 5 JA categories, all from authored
  content, compiler-validated.
- Every AI-touched surface degrades to the current behaviour with no key set,
  offline, or on a refused call.

---

## Cross-cutting, all four releases

**Budgets are checked, not assumed.** `npm run verify` stays the gate. New gates
this roadmap adds: `check:audio` (v1.2), gloss-coverage reporting (v1.3),
passage banding integrity (v1.4).

**Schema.** v5 today. Expect v6 (audio refs, listening ability rows), v7
(glosses, chunks, topic selections), v8 (passages, reading ability), v9 (per-user
FSRS parameters). Every one additive, every one with a round-trip test, per §6.

**Proposed invariants**, to be added to `CLAUDE.md` as each lands:

27. No audio clip enters `assets/` without its **voice model** cleared in
    `data/licenses.json` — invariant 5, applied to a generator rather than a
    corpus.
28. Glosses and passages ship in their own share-alike shards; a shard's licence
    is never widened by mixing sources into it.
29. The AI module is imported by exactly one screen, and a session with a key
    configured makes no request the learner did not ask for.
30. Per-user FSRS parameters are derived only from the review log, are reversible
    to defaults in one tap, and never enter the initial bundle.

**Proposed decisions** to record when taken: D57 voice model and audio
provenance · D58 listening estimated from live evidence, not placement · D59
gloss shard separation · D60 topic clusters authored where no corpus supplies
them · D61 passages from Simple English Wikipedia, Japanese stays a feed · D62
optimizer ships or the nudge stays, on measurement · D63 AI is opt-in per call,
not per key.

**What we still refuse to ship by v1.5.0**, unchanged: a CEFR or JLPT label
without a licence-cleared alignment (invariant 9); any streak, life, gem or
leaderboard (invariant 7); a push server (invariant 24); machine-translated
content presented as ground truth (D40); a chatbot in the core loop (§1); and any
dependency that is not free at the tier we use (invariant 4).

---

## Decisions needed before v1.2.0 starts

1. **The voice model.** Which Piper voice for English, which for Japanese, and
   confirmation that its licence has been read and dated. Nothing about the audio
   pipeline can be committed before this, and it is the one blocker code cannot
   route around.
2. **The sync Worker: deploy or delete.** Both are fine; the current state is
   the only one that is not.
3. **Who runs the device matrix.** The diagnostics screen makes it possible for
   anyone with a phone. If that is you and two friends, v1.2.0 ships on schedule;
   if there is no one, R1 stays open and this roadmap's first release is a
   licence-and-pipeline release only.
4. **Is the BYOK AI layer wanted at all?** §14 question 5 deferred it rather than
   declining it. It is the only item in these four releases that adds a way for a
   learner's data to leave their phone, and the roadmap works without it — v1.5.0
   would be the optimizer and the error-correction drill, and that is a coherent
   release.
