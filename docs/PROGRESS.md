# PROGRESS.md

## v1.7.0 — the glossary (2026-08-13)

Named at v1.6.0 as the obvious next thing and left rather than rushed; built
now. SPEC §2.2 permits exactly one kind of browsing — *"a passive glossary is
fine, but it does not create or advance cards"* — and the app had the ban
without the permission.

**Why it is worth a release.** The progress screen has been able to *count* a
learner's vocabulary since M5 and never able to *show* it. §2.14 asks progress
to be expressed as capability; a number is a claim about capability, a list you
can scroll through is the thing itself.

**The second half of §2.2's sentence is the design** (D67). `buildGlossary`
opens no transaction, calls no writer, and has no path to `recordReview` — the
only function permitted to move FSRS state (invariant 0). The test that matters
builds the glossary against a timestamp thirty days later and asserts the card
is byte-identical afterwards: looking at your own vocabulary must not schedule
it.

Ordered strongest first, which is a §2.14 decision rather than a technical one.
Opening it shows what a learner has secured, not what they are currently
failing.

### The plan from here

| | | |
|---|---|---|
| **v1.8.0** | Reachable | §10 promises WCAG AA, reduced motion and *"full keyboard operation on desktop"*; §13 gates none of it. An axe-core run and a keyboard-traversal test in CI, plus whatever they find. |
| **v1.9.0** | The honest close | Whatever the device matrix reports, the native copy pass integrated, the launch checklist re-measured against real numbers. The last v1. |
| **v2.0.0** | — | Gated on decisions rather than code: audio shipped, the matrix filled, the Indonesian reviewed by a native speaker, sync deployed or deleted. The first release whose every claim has been checked by a person on real hardware. |

---

## v1.6.0 — learning material, and the screen that had run out of room (2026-08-13)

Two §2 requirements had been typed and empty since M0. Both now have content
behind them, and both were built the same way: authored by a person, then held
to the corpus by a compiler that fails the build.

### §2.5 — chunks

73 English and 23 Japanese collocations and formulas. The design question was
authored versus mined, and mining lost on quality: Tatoeba is saturated with
`tom said`, PMI cannot tell a collocation from a frequent accident, and D34
already records that this pipeline has no part-of-speech tags to filter with.
The output would have been teaching material nobody had read.

So the corpus **validates** instead of generating (D64): every chunk must occur
in a sentence the app actually ships, or the build fails — §2.5's own ingestion
rule, the one that rejected 2,185 lexemes at M1.

**The gate immediately found two bugs in itself, which is the useful part.**
Seventeen chunks failed on the first run, and the cause was the matcher rather
than the corpus: English inflects, so the corpus holds *"took a shower"* and not
the base form; and separable phrasal verbs appear as *"drop me off"*. Fixing
both recovered a third of the list. What stayed rejected — *get dressed*, *take
it easy*, 「ただいま」 — genuinely is not in a 23,497-pair corpus, and was deleted
rather than shipped without an example.

A chunk carries its own Indonesian meaning, because its parts do not compose,
and counts as its own card type so two cannot land back to back (§2.8).

### §2.10 and §2.14 — topics

Twelve English topics, seven Japanese, picked in settings. This closes the last
promise §2.14 was making without a control: *"the learner picks topic clusters"*.

**It reorders, never restricts** (D65) — a learner who picks "food" still needs
the function words that make a sentence, and filtering to a topic would starve
them of exactly those. The map is partial (6.9% of the English inventory, 2.0%
of the Japanese) and says so in the shard, because a wrong topic is worse than
no topic when topics steer what gets taught next.

It also makes §2.8's second rule real for the first time. *"Never more than 3
from the same topic cluster"* has been running against the frequency band since
M2, which made it a restatement of the band gate; three food words in a row is
now something the composer can actually see.

The compiler caught three authoring errors on the first run, including a
Cyrillic word that had slipped into the Japanese list — which is the argument
for having it.

### The home screen

Seven links had accumulated between the learner and the practise button, each
one shipped for a good reason (D66). Habit, sync, diagnostics and attribution
are now behind one settings screen, which is where the topic picker lives too.
The e2e suite goes through the same door a learner does rather than reaching
past the UI, which is why four specs changed.

### Not built, and worth naming

A **browsable glossary** — §2.2 explicitly permits one ("a passive glossary is
fine, but it does not create or advance cards") and there is still no screen
where a learner can look at what they know. The progress screen counts it; it
cannot show it. That is the obvious next thing here and it was left rather than
rushed alongside two content pipelines.

---

## M8–M11 — the v1.2.0–v1.5.0 roadmap, executed in one pass (2026-08-12)

`docs/ROADMAP.md` planned four releases. This entry records what actually
landed, what the measurements changed, and the two items that are **not built**
— named here rather than left to be discovered.

| | planned | actual |
|---|---|---|
| unit tests | — | **724** (from 653) |
| e2e tests | — | **45** (from 41) |
| initial JS, gzipped | ≤ 200 KB | **136.2 KB** (68%) |
| datasets cleared | — | **9** (from 7) |
| §8 exercise catalog | all | complete — the error-correction drill was the last one |
| radar axes measured | 5 | **4 of 5**; listening and reading stopped being `null` |

### M8 · Audio, and the device we have never seen

**The device matrix is now something anyone with a phone can fill.** It has been
empty since M4 for a mundane reason — the person with the hardware is not the
person with the debugger — so the probes moved into the app:
`src/features/settings/DiagnosticsScreen.tsx` runs them on demand and emits
markdown that pastes straight into Part 3 of `docs/DECISIONS.md`.

Two things make it more than a convenience:

**It probes from inside a tap, and a good answer counts** (D57). D29 recorded
that the boot probe marks iOS Safari dead where audio would have worked, because
iOS wants a user gesture and neither boot nor first paint is one. A button *is*
one. `adoptVerdict` takes up that answer for the session — but only upward
(a later failure never retracts an engine already heard to speak) and only
inside the app's own 500 ms deadline, so a slow engine is reported honestly and
still withheld from L4.

**It measures rather than judges.** The diagnostic probe runs to a 5-second
deadline and reports the elapsed time, because the open question is whether
500 ms is right on a cheap Android — and at a 500 ms deadline, "finished in
780 ms" and "never finished" look identical.

**Listening stopped being `null`** (D58). §4.2 wants three abilities estimated
separately; `vocab` has been real since M3 and `listening` is now estimated from
L4 dictation answers through the same 1PL model placement uses, with the item's
frequency rank as its difficulty. Not from placement — §4.2's 90 seconds are
already spent (D24) — and not from minimal-pair drills either, because a drill
has no difficulty on any measured scale and inventing one would be exactly the
fabrication D25 refuses. Below five answers there is no estimate and no row.

Two bugs fell out of writing it: the radar's listening axis counted every rung
**≥ 4**, so L5 and L6 production answers were being reported as listening; and
`production` had been hard-coded to `null` with the basis "(M7)" since M5, four
milestones after production shipped. Both now read the rung from the log.

**The audio pipeline exists and has never been run.** `scripts/ingest/build-audio.ts`
plans, names and indexes clips deterministically, `npm run check:audio` is a new
CI gate over the budget and the index, and the pure half is unit-tested. What is
missing is not code: **no voice model has been licence-checked**, so nothing may
enter `assets/` (invariant 5), and Piper is not installed here. This is stated
the way `workers/sync` states the same thing rather than left to look finished.

**D53's open half is closed.** First run offered a multi-select while the app
teaches one language at a time; it now asks which language to *start* with and
says switching is free and loses nothing.

### M9 · Meaning — and the measurement that changed the plan

The roadmap set a **70% go/no-go** on gloss coverage before building anything on
top. Measured over the shipped lexeme inventory on 2026-08-12:

| | bands 1–3 |
|---|---|
| English, id.wiktionary | **40.3%** (740 / 1,834) |
| English, adding en.wiktionary translation tables | 56.5% on band 1 |
| Japanese | **9.2%** (184 / 2,000) |

**So L2 does not become meaning recall, and D21 stands.** Two things made that
clear-cut rather than marginal. The misses are the *commonest* words — of band
1's first sixty by rank, the ones with no gloss are *to, was, do, be, his, are,
not, her, at, think, as, can, from, go, by* — function words, where a dictionary
gloss is least useful anyway. And en.wiktionary's translation tables give
`know → tahu, setubuh`: not wrong, and not something to show a learner meeting
the word for the first time. That is a per-sense review problem, not a coverage
problem, so those tables are not used at all.

**What shipped instead is the distinction that makes glosses useful anyway**
(D59): *grading* against a gloss demands it be right for every item, and an
unfair "wrong" is what §2.7 exists to prevent; *displaying* one demands only
that it be right where it is shown. So 1,581 English and 274 Japanese glosses
ship as **reference** — the reader's word panel finally has the dictionary M7
had to go without, and L0 finally has the gloss §2.3 always asked for — and a
word without one says so.

**The licence was cleared at source, which is what R3 suggested.** The old
blocker was Kaikki's extraction stating no terms of its own; parsing the
Wikimedia dump directly removes the intermediary. Confirmed two ways on
2026-08-12: `dumps.wikimedia.org/legal.html`, and each wiki's own `rightsinfo`
API. Glosses ship in **their own shards** under CC BY-SA 4.0 so the
Tatoeba-derived English sentence shards stay CC BY 2.0 FR — mixing them into one
file would have quietly upgraded the whole English corpus to share-alike.

**The kana keyboard** (§10) is built, and with it `romajiToKana` — an IME-style
live converter the repo never had. It holds a trailing `n` while typing (or
`nani` would lose its first keystroke to ん) and commits it on submit, and it
makes っ from doubled consonants, because きって is not きて and §3.2 says mora
length is where Indonesian gives no intuition at all.

### M10 · Reading

**Simple English Wikipedia is cleared and ingested**: 389,501 articles →
paragraphs → banded by 90th-percentile token rank, exactly as sentences are
(D15). And the histogram is the finding:

| band | paragraphs found | shipped |
|---|---|---|
| 1 | 5 | 5 |
| 2 | 75 | 75 |
| 3 | 712 | 400 |
| 4 | 3,843 | 400 |
| 5 | 4,558 | 400 |
| 6 | 241,652 | 400 |

**"Simple" English is not beginner English by our banding** — 96% of its prose
sits in band 6. That is not a reason to relax the measure; it is a reason to say
who the reader is for. The default learner is *intermediate English* (D3), which
is band 3 and up, and that is where the material is. A band-1 learner keeps the
sentence feed, and the screen does not pretend otherwise (D61).

**§2.4's coverage band is finally operative.** D28 recorded that [0.92, 0.98] is
literally unreachable on a ten-token sentence — the reachable values are 1.00,
0.90, 0.80. On a forty-token paragraph there are forty values inside it, so
`selectPassages` applies the spec's own threshold as written, and drops anything
under 0.85 outright rather than approximating.

**Reading stopped being `null`.** The check is a cloze over a word in the text
just read — the same retrieval §2.2 already requires, over running text — and it
is deliberately not a comprehension quiz: 1,680 passages cannot carry authored
questions, and generated ones would be answerable by string-matching. Attempts
go to their own append-only table (`ReadingAttempt`, schema v6) for D32's reason
exactly: a passage has no card, so these could never be review logs.

### M11 · The learner's own parameters

**The error-correction drill** — §8's last unbuilt catalog item — ships as a
drill *type* rather than an MCQ dressed as one: the prompt is a sentence with a
mistake, the answer is the whole sentence back. 10 English and 5 Japanese,
authored, one per morphosyntax category. The compiler refuses a correction whose
answer equals its prompt, and caught the first Japanese one for ending in 。
rather than a full stop, which is the gate doing its job.

**The optional AI layer was built and then deleted** (D63). It went in under
this pass's blanket instruction — bring-your-own-key, off by default, called
only from a tap, with a zero-egress e2e test driving a session with a key
configured. On review it was **declined outright**: the product's claim is that
a learner's data never leaves the phone unless they run the infrastructure
themselves, and a guarded module makes that claim conditional on the guard
rather than on the shape of the code. Invariant 8 says prefer deleting code over
guarding it, so `src/platform/ai.ts`, its screen, its feedback panel, its tests
and its copy are gone rather than flagged off. §14 question 5 is now answered
*declined* rather than *deferred*, and D63 records the reasoning so the next
session starts from the decision instead of the code.

The consequence is worth stating plainly: L6 still grades on whether the target
word was used and says so (D49). That was the one thing the layer would have
improved, and the honest version of that limitation is the one that ships.

**The FSRS optimizer was evaluated and not shipped** (D62). `fsrs-browser@6.6.0`
is BSD-3-Clause and 332 KB of WASM plus 36 KB of glue: fine as a lazy chunk,
since invariant 6 counts the entry chunk. What is not established is whether it
runs usefully single-threaded on the reference device — its threading goes
through `wasm-bindgen-rayon`, which needs cross-origin isolation — and a
parameter fit that silently degrades a learner's schedule is worse than the
bounded nudge D39 already ships. The nudge stays; the numbers are recorded so
the next session starts from them rather than from scratch.

### Not built

| | Why |
|---|---|
| **Chunks as first-class items** (§2.5, `ItemKind = 'chunk'`) | Extraction is mechanical (PMI over the shipped corpus) but the output needs a human pass before it becomes teaching material, and shipping unreviewed collocations as items would put content nobody read in front of learners. Typed and still unproduced. |
| **Topic clusters** (§2.10, §2.14, §2.8's second rule) | The mechanism is small; the content is not. It needs ~20 authored clusters over the first 2,000 words in two languages, and a bad topic map is worse than none — it would gate new-item selection on a taxonomy nobody trusts. `clusterId` is still a constant, so §2.8's per-cluster rule remains inert. |

Both were planned for v1.3.0 and v1.4.0 respectively. Neither is blocked by
anything technical; both are blocked on authored content and a reviewer.

### One defect found on the way out

Writing the declared-but-unreferenced check for the audio sequencing turned up a
live one: **`jmnedict` has been listed as a shipped dataset since M6** — and
therefore named on the in-app attribution screen — for a proper-name
disambiguation feature that was never built. Nothing fetches it, nothing parses
it, no shard declares it. The screen was claiming a provenance the app does not
have, which is the mirror of the failure M6 wrote that screen to avoid, and the
e2e test only checked the other direction.

It is now a candidate, `NOTICE.md` no longer attributes it, the e2e test asserts
it is absent, and `check-licenses.mjs` fails the build on any dataset that
nothing references. The same check is what will stop a voice model from being
promoted before its clips exist.

### Decisions I need from you

**1. The voice model — you have taken this, and three things changed under it.**
`en_US-libritts-high` exists and its corpus is CC BY 4.0, but it has 904
speakers, so `--speaker` is now part of the clip hash. **There is no Japanese
Piper voice in the official catalogue** — 173 voices, 54 language codes, no
`ja_JP` — so `ja_JP-jsut-multi_di-medium` cannot be pulled from it, and a
community model needs its own licence read (JSUT's terms especially). And the
default output is now **AAC/m4a**, not Opus: Safari only plays Ogg Opus from
17.5, and iOS is the device the clips exist to rescue. Output path is
`assets/content/<lang>/<voiceKey>/` — `assets/content/audio/` fails the licence
gate, by design.

**2. Two datasets were cleared without you.** `wiktionary-id` and
`wikipedia-simple-en` were promoted from candidates to datasets by reading the
terms at source and dating them (2026-08-12). The reasoning is in
`data/licenses.json` and `NOTICE.md`. If you would rather clear licences
yourself, say so and they come back out.

**3. The Indonesian copy grew again** — the diagnostics screen, the AI screen,
the passage reader, the kana keyboard, and 15 new drill explanations. All of it
still wants a native pass.

**4. The sync Worker is still undeployed.** Written, documented, unproven, and
now the only remaining path by which a learner's data could leave the phone —
deploy it once to test D51's arithmetic, or delete `workers/`.

---

## M7 — Production, reader, optional sync · complete (2026-08-11)

**Acceptance:** the app remains fully functional with sync disabled **and** with
speech APIs unavailable. Both met, and both as executable tests rather than
claims.

| | required | actual |
|---|---|---|
| ladder rungs reachable | L0–L6 | **all seven** |
| works with speech APIs absent | yes | ladder skips L4, drills withheld, typing unaffected |
| works with sync disabled | yes | **zero external requests**, asserted in the browser |
| unit tests | — | 596 |
| e2e tests | — | 29 |
| initial JS (gzipped) | ≤ 200 KB | 125.5 KB |

```
✓ typecheck · lint · 596 unit tests · licence gate · build · bundle budget
✓ 29 e2e: offline session, resume, cold start, installability, placement,
  drills, heatmap, §9 progress, export/restore, attribution, reader, sync
```

### The reader (§8)

Tap-to-gloss and one-tap mining, both entirely local — an e2e test cuts the
network before tapping to prove it. Three things the spec's words could not
survive contact with the corpus, all recorded as decisions:

**A feed, not a passage** (D45). Tatoeba is independent sentence pairs, not
documents. Stringing unrelated sentences together and calling it a passage would
*look* like a reader and *read* like nonsense, which is worse than a feed —
extensive reading depends on the text meaning something.

**Mining records an intention, not a card** (D46). "One-tap card creation" done
literally breaks invariant 0: a card is the product of an answer, and minting one
from a tap puts an item in the schedule with a due date nobody earned. The tap
writes to `minedItems`; the composer introduces the word next session, ahead of
the frontier queue and *past* the frontier gate — level gating exists to stop us
marching a learner through words they did not choose, not to overrule a choice
they made.

**Three floors, because one is not enough** (D47). The count rule alone passes
*"the quokka devours pastry"* — two unknown of four — on a technicality.

### Production, and the silent device

The ladder reaches L6. L5 is production from the Indonesian alone; L6 is a
sentence about the learner's own life.

**Audio was modelled as a ceiling, and that became wrong the moment production
landed** (D48). A learner with no speech engine would have been capped at L3 —
locked out of the top half of the ladder by a missing *listening* rung. So
`audioAvailable` now gates one rung rather than the maximum, and promotion runs
3 → 5 without it. §2.6 is satisfied exactly as written: the item is excluded from
L4 scheduling and nothing else changes. The old test asserted the lock-out; it
now asserts the escape.

**L6 grades on whether the word was used, and says so** (D49). No right answer
exists to match and there is no grammar model — D4 keeps the LLM layer out until
after M7 — so the honest check is the only checkable thing, which is also exactly
the generation effect the rung exists for.

**Speech input is detected, never probed** (D50). Synthesis earns a live probe
because an engine that lists a voice and never speaks is real and a silent
utterance is cheap. Recognition would cost a microphone permission prompt merely
to decide whether to draw a button. Every failure path — absent, refused, silent,
hanging, throwing — resolves to "not heard", with the text field right there.

### Sync, and the arithmetic that changed its design

§5.1 asked for the free-tier limits to be verified at build time. Read
2026-08-11 at developers.cloudflare.com:

| | |
|---|---|
| Workers requests | 100,000 / day |
| Workers CPU | 10 ms / request |
| D1 rows written | 100,000 / day |
| D1 rows read | 5,000,000 / day |

§5.1 says to batch "one write per finished session, not per card", which fixes
the *request* count. **The binding constraint turns out to be somewhere else.** A
4-minute session produces around thirty review logs; at one D1 row each that is
100,000 ÷ 30 ≈ **3,300 sessions a day** — an order of magnitude below the request
cap. So a delta is one *row*: the whole session as an opaque payload, which moves
both caps to 100,000 sessions a day (D51).

The server can afford that because it never reads inside a delta. It cannot: the
local store is the source of truth, merge logic is pure and lives on the client
in `src/core/delta.ts`, and the Worker only routes — which is also what keeps it
inside the 10 ms CPU budget.

**Disabled is structural, not careful.** Nothing in `src/features` or `src/data`
imports the sync module; the settings screen is the only caller. No boot
registration, no timer, no listener. An e2e test drives a whole session and the
progress screen while asserting **zero requests leave the origin**.

It is also opt-in with no default endpoint, which is a privacy decision: sync
means a learner's history leaves their phone, and nothing about the core product
needs that. The token lives in `localStorage` rather than Dexie so it cannot end
up inside an export bundle the learner might share (D52).

### Deviations

| Deviation | Why |
|---|---|
| The Worker has never been deployed or run | It needs a Cloudflare account the build environment does not have. The client, delta format and merge rules are unit-tested in CI; the limits above were read from documentation, not measured against a live account. `workers/sync/README.md` says so under "What is untested". |
| Shadowing is record-and-compare, with no score | §5.1 asks for exactly this where recognition is unavailable. For pronunciation it is arguably the better tool anyway: a recognizer tells you whether a machine understood you, your own ear tells you how far you are from the model. |
| No per-word dictionary in the reader | R3 again — no gloss source is licence-cleared. The panel shows what the app knows and says plainly that there is no dictionary, rather than leaving a thin gloss unexplained. |
| L6 does not assess sentence quality | See D49. Inventing a score would add a number nobody could defend. |

### Next decision I need from you

**1. R1 — the device matrix, still empty and now the last technical unknown.**
Every speech path degrades gracefully and is tested against stubs; none has run
on a real phone. It gates L4, three Japanese drills, the listening axis of the
radar, and now shadowing.

**2. Piper audio.** Design approved and unblocked; not started. It needs the
voice-model licence chosen and dated before a clip enters `assets/`.

**3. Deploy the Worker, or drop it.** It is written and documented but unproven.
If sync matters, one deployment would tell us whether the arithmetic holds. If it
does not, deleting `workers/` costs nothing — the app has never depended on it.

**4. The Indonesian copy across M6 and M7 wants a native pass**, particularly the
Japanese drills and the reader's word panel.

---

## M6 — Japanese · complete (2026-08-11)

**Acceptance:** a Japanese absolute-beginner path from kana to first 100 kanji
works offline; JA-specific tests pass. Both met.

| | required | actual |
|---|---|---|
| JA sentences with an Indonesian translation | §2.5 | **15,324** (5,919 direct + 9,405 via English) |
| kanji shipped, with component breakdown | §2.11: every one | **1,748 / 1,748** |
| JA contrastive categories | §3.2 | 14, of which **6 are positive transfer** |
| positive-transfer topics §3.2 names | all | 6 of 6 |
| beginner first download | ≤ 8 MB | **0.49 MB** |
| unit tests | — | 532 |
| e2e tests | — | 23 |
| initial JS (gzipped) | ≤ 200 KB | 120.8 KB |

```
✓ typecheck · lint · 532 unit tests · licence gate (7 datasets) · build · bundle
✓ 23 e2e, including the attribution screen the EDRDG licence requires
```

### R2 is resolved, by measurement

The risk register said Japanese might not satisfy §2.5 at all — "possibly in the
hundreds" of JA↔ID pairs. Measured: 5,919 direct, 12,395 reachable through
English, **15,324** after union and dedup. Pessimistic in size, right in shape.

Every sentence records `via: 'direct' | 'en'`, and triangulated ones carry the
English `bridge` id. A two-hop translation can drift in ways a direct pair
cannot, so the route is auditable per sentence rather than invisible, and a
direct pair always wins where one exists. No machine translation was used or
needed (D40).

### The attribution screen is a licence condition, so it went first

EDRDG requires an application using JMdict, KANJIDIC2 or KRADFILE to acknowledge
the usage and source in its UI. We now ship all three, so the screen had to exist
before a single Japanese card could. It renders from `data/licenses.json` — the
same file the CI gate reads — so a dataset cannot enter the build without
appearing here, and the legal list cannot drift from the actual one.

It shows `datasets` only, never `candidates`: listing a source we do not ship
would claim a provenance the app does not have, which is the mirror of omitting
one we do. An e2e test asserts both directions.

**KRADFILE cleared** by reading both EDRDG pages: covered by the EDRDG licence,
CC BY-SA 4.0. KRADFILE2/RADKFILE2 are a different copyright and are not used.
Japanese shards ship CC BY-SA 4.0 — mixing Tatoeba with EDRDG takes the stricter
term, not the more convenient one.

### Three things the data decided rather than the plan

**KRADFILE does not decompose 校 the way §2.11 says.** It gives the *radicals* —
父 + 木 + 亠 — which is correct and is not what the spec asks the learner to see,
because 交 is itself 亠 + 父. A conservative containment rule recovers the level
the spec wants: where another kanji's radical set is a proper subset of this
one's, the shared radicals collapse into it. That yields **校 = 木 + 交, 語 = 言 +
吾, 時 = 日 + 寺** from licensed data rather than 1,748 hand-authored breakdowns.
Marked `UNVALIDATED`, raw radicals ship alongside, fires on 1,149 of 1,748 (D41).

**Furigana cannot fade per character, and pretending otherwise produces wrong
furigana rather than finer furigana** (D42). Okurigana spans kanji and kana
(行く = いく), rendaku voices a reading by position (手紙 = てがみ), and jukujikun
has no split at all (今日 = きょう, where neither character contributes a
syllable). So a ruby span covers a token — which is how furigana is set in real
Japanese text — and the reading drops when *every* kanji in it is stable. 学校
loses its furigana once both 学 and 校 are known, not half of it when one is.

**A stale backup was silently undoing a newer mnemonic.** The M5 import rule
(bundle wins for current state) is right for cards and scores and wrong for the
one table where the learner's own authorship *is* the value. §2.11's finding is
that self-generated mnemonics beat given ones, so mnemonics are now last-write-
wins **by timestamp**: restoring last month's file cannot undo the version
rewritten yesterday. Found by writing the round-trip test the invariant demands,
not by inspection (D43).

### Positive transfer is the part of §3.2 that makes it unusual

Every language course lists what is hard. §3.2 asks for the opposite as well:
*"naming the parallel is elaborative encoding, and it is a real morale advantage
this audience is never told about."* So `ja.yaml` has two kinds of entry, and the
build **fails** if the positive half is missing.

Six advantages are named explicitly: the shared five-vowel system, open CV
syllables, familiar numeral classifiers (ekor/buah/orang/batang → 匹/個/人/本),
no plural marking or articles or gender, topic fronting as a bridge into は, and
politeness registers that a ngoko/krama speaker already has the instinct for.
They carry a note and no drills, because there is nothing to remediate — and the
compiler special-cases exactly that rather than demanding drills for them.

The eight difficulties are drilled: は/が, に/で, SOV and modifier-before-noun,
mora timing with the spec's own minimal pairs (おばさん/おばあさん, きて/きって),
verb and adjective conjugation, kana script, and あげる/くれる/もらう.

### Deviations

| Deviation | Why |
|---|---|
| Furigana fades per token, not per character | A per-character split of a reading is not generally possible — okurigana, rendaku, jukujikun. Stated in the module header and pinned by a test rather than left as a surprise (D42). |
| Japanese has 32 drills against English's 116 | §12's ≥100 bar is M4's, for English. §3.2's requirement is coverage of the named categories plus the positive-transfer notes, and both are complete. The drill count should grow with use, not be padded to hit a number set for a different milestone. |
| No false-friend list for Japanese | §3.1 asks for one for English. §3.2 does not, and Indonesian–Japanese false friends are a much thinner phenomenon. |
| Kanji are exempt from §2.5's anchor rule | §2.5 is about lexemes — a word must be met in a sentence. A kanji is taught by its components and readings, which is what §2.11 specifies, so requiring an example sentence for 校 would be applying the wrong rule. |
| Old JLPT levels ship, current N1–N5 do not | KANJIDIC2 carries the pre-2010 four-level scale. Mapping it onto N1–N5 would be inventing an alignment, which is what D16 refused to do for CEFR. `jlpt-wordlists` is still an uncleared candidate. |

### Next decision I need from you

**1. R1 — the device matrix, now blocking more than before.** Japanese needs
`ja-JP` voices, which §3.2's mora-timing drills depend on entirely, and R1 notes
those are the *most* likely to be missing on a cheap Android. Three of the
Japanese drills are withheld without audio today.

**2. Piper audio.** Your lazy-band design is approved and unblocks the payload
question. Piper is not installed here, and the voice-model licence still needs
choosing and dating before a clip enters `assets/` — for Japanese as well as
English now.

**3. The Japanese drills want a native reviewer more than the English ones did.**
I am more confident about the Indonesian in the positive-transfer notes than
about the Japanese example sentences in the drills. Worth a pass before anyone
learns from them.

---

## M5 — Progress and analytics · complete (2026-08-11)

**Acceptance:** every §9 item renders from real local data; export round-trips
into a fresh install. Both met.

| | required | actual |
|---|---|---|
| §9 items rendering from local data | all | 10 of 10 |
| export → fresh install → identical state | round-trips | asserted through a JSON string |
| unit tests | — | 468 |
| e2e tests | — | 21 |
| initial JS (gzipped) | ≤ 200 KB | 119.2 KB |
| charting dependencies added | — | none |

```
✓ typecheck · lint · 468 unit tests · licence gate · build · bundle budget
✓ 21 e2e: offline session, resume, cold start, installability, placement,
  contrastive drills, heatmap, every §9 section, JSON export and restore
```

### The number this milestone is really about

**Band 1 is 481 words and 70.3% of every token in the corpus.** The pipeline now
emits per-word corpus share, so §9's capability sentence — *"kamu mengenali
sekitar N kata… kira-kira X% dari kata yang muncul di kalimat yang kami
ajarkan"* — is **measured, not modelled**. No Zipf approximation, no borrowed
frequency list: the ranks came from the corpus we teach from (D13), so the
percentage is exact over that corpus and the copy says exactly which corpus.

It also produces an honest ceiling. Master every word we ship and you reach
**87.3%**, not 100% — proper nouns are filtered out of the inventory (D14) and
band 6 is not shipped, and both still turn up in real sentences. The screen says
so rather than letting the learner infer that the last 13% is their fault.

Regenerating the shards was also an unplanned check of invariant 10: rerunning
the unchanged pipeline first produced byte-identical output, which is the
property the whole cache-busting story rests on.

### The vocabulary interval is asymmetric, on purpose

SPEC §9 wants a vocabulary-size estimate *with a confidence interval*. The
tempting version is a symmetric ± around an extrapolation, and it would be
dishonest here: new items come from the learner's frontier band, nearest the
frontier first (D27), so within a band they have met the commoner words and not
the rarer ones, and a band they have never been shown tells us nothing at all.

So the interval is built out of what each piece of evidence actually supports
(D35):

- the **floor** is the count of words demonstrably retained — no inference;
- the **middle** extrapolates only bands with a real sample, using a Wilson
  score interval, which unlike the normal approximation does not produce bounds
  above 1 when a learner gets ten out of ten;
- the **ceiling** adds every unsampled band *whole*, because "we have not tested
  you on 3,400 words" is exactly that wide.

A learner three sessions in gets a very wide band. That is the correct answer.

### Retention audits the scheduler, and the audit can act

`measureRetention` counts **only cards that were genuinely due after an
interval** — a card still in learning has not been left alone, so answering it
says nothing about whether the interval was right, and counting those would push
the number towards 100% and make a mistuned scheduler look perfect.

The verdict comes from the confidence interval, not the point estimate (D39): 51
of 60 is 85% on its face and nowhere near enough evidence to accuse the
scheduler of anything, and there is a test that says so.

§9 asks the app to *"say so and offer to retune"*, so it does — the offer appears
only when the evidence rules the target out, and it moves
`request_retention` one bounded step in the direction the evidence points. It is
a **nudge, not an optimization**, and the code says so: a real per-user parameter
fit is what §2.1 buys the review log for, and it needs the FSRS optimizer and far
more history. Retuning upward shortens intervals for someone who keeps
forgetting; retuning downward hands time back to someone who barely does.

### Four more things worth flagging

**The append-only hook caught the import path, and it was right.** Restore
originally deleted the profile's review logs and laid the bundle down whole;
the Dexie hook rejected it. The fix is better than the original: `ReviewLog` and
`DrillAttempt` are keyed by UUID, so an import **merges** — it adds the rows it
does not have and touches nothing else — while cards, abilities and scores are
current state and get overwritten (D37). That is SPEC §6's own sentence read
literally, it makes re-importing a no-op, it unions two devices' histories, and
it means a restore can never destroy review history.

**No charting library.** Five small figures — bars, a polygon, a marker — against
a 200 KB budget. `charts.tsx` is under 200 lines of inline SVG, and every
component takes `number | null` so that "not measured" cannot accidentally render
as a bar of zero (D38). The bundle went 113.7 → 119.2 KB for the whole milestone.

**The radar has five axes and three of them are honest gaps.** Reading and free
production have no items until M7, so they are drawn as hollow markers on empty
spokes rather than points at the origin — a polygon pulled to zero reads as "you
scored nothing at reading" when the truth is that reading has never been tested.
An e2e test asserts the screen never shows 0% for them.

**The empty state is most of the work.** The first thing every §9 section needed
was a truthful way to say it has nothing yet, and the first e2e test asserts
exactly that — before any answer, vocabulary, retention and calibration all say
so in Indonesian, and no level label appears anywhere.

### Deviations

| Deviation | Why |
|---|---|
| Retuning is a bounded nudge to `request_retention`, not a parameter fit | §2.1's real optimizer needs `@open-spaced-repetition/binding` and a long history. One honest step per look at the evidence is what the data supports now; the log keeps accumulating for the real thing. |
| The capability percentage is over *our* corpus, not "everyday conversation" | We can measure the first exactly and cannot measure the second at all. The copy names the corpus rather than making a claim about the language (D36). |
| `mastered` and `placedAtRank` are computed but not yet shown | Both are in `ProgressReport` for the weekly recap; the recap is the one §9 line that reads better with a week of data behind it than with an empty state. Flagged rather than half-built. |
| Reading and production score `null` forever until M7 | D25's rule, applied to the radar: a missing measurement reads as "not measured", a fabricated one reads as a measurement. |
| Lexeme shards changed hash to carry `share` | A real content change, so the re-download is earned rather than churn. Pre-release, so nobody pays for it twice. |

### Next decision I need from you

**1. R1, unchanged and now the longest-standing open item.** The device matrix in
`docs/DECISIONS.md` Part 3 is still empty. M5 added nothing to this except one
more consumer: the listening axis of the radar stays `null` on any device where
the probe says the engine is dead.

**2. Pre-cached audio — still a licence question, not a code one.** Unchanged
from M4, and it now gates two visible things rather than one.

**3. The weekly recap (§9's last line) is deliberately unbuilt.** Everything it
would summarise is computed; what I do not know is whether you want it as a
screen, a card on the home screen, or the body of the local notification the
habit cue (§2.13) already schedules. That is a product call.

---

## M4 — The contrastive engine · complete (2026-08-11)

**Acceptance:** ≥100 authored contrastive items; wrong answers on tagged items
produce an Indonesian explanation; the heatmap renders from real logs. All three
met. L4 dictation is unblocked alongside, behind the hardened TTS probe.

| | required | actual |
|---|---|---|
| authored contrastive items | ≥ 100 | **116** across 21 categories |
| §3.1 morphosyntax categories covered | all 10 | 10 |
| §3.1 phonology categories covered | all | 10 |
| curated false friends | ≥ 60 | **75** |
| items tagged with a category carrying a note | 100% | 100%, gated in the build |
| §2.8 interleaving, 1,000 sessions **with drills mixed in** | no violations | 0 violations, 0 relaxations |
| unit tests | — | 414 |
| e2e tests | — | 17 |
| icon tap → first answerable question | ≤ 3s | 53 ms (gate still green) |
| initial JS (gzipped) | ≤ 200 KB | 113.7 KB |
| contrastive pack | — | 15.3 KB gzipped, precached |

```
✓ typecheck · lint · 414 unit tests · licence gate · build · bundle budget
✓ 17 e2e tests: offline session, lossless resume, cold start, installability,
  placement, contrastive drills and the heatmap
```

### Task 1 — L4 unblocked, and what the probe now actually asserts

The probe fires once per app start, speaks a zero-volume utterance, and waits for
**`onend` and only `onend`** for **500 ms**. Anything else — a voice that never
finishes, an engine that fires `onstart` and goes quiet, an error, silence — is
`dead` for the rest of the session (D29). It runs as soon as a screen is painted
rather than during boot itself, for a reason that turned out to be the most
important thing this milestone learned; see below.

Waiting on `onend` rather than `onstart` is the whole point of the change. The
Android failure mode is an engine that announces itself and produces nothing, and
a start-based check passes it; there is now a test that stubs exactly that engine
and asserts the verdict is `dead`.

The fallback chain below it is per item, not per app:

1. a pre-cached clip for that sentence, if one exists;
2. otherwise synthesis, if the probe said the engine is live;
3. otherwise the item is not L4-eligible and is held at L3.

That third branch is `ladderCeiling(hasAudio)`, and it is a ceiling rather than a
filter for a reason. An item that cannot be heard is never *promoted* into L4, and
a card already sitting at L4 when the engine dies is **demoted visibly** — the
review log records the rung the learner was actually shown. The alternative,
presenting a dictation card as a text card, is exactly the silent degradation
§2.6 forbids, and it would poison every later measurement of the ladder.

L4 itself is dictation of a short sentence (≤10 tokens), chosen over the
audio-cloze reading of §2.3 because the answer is fully determined by what was
heard, with no visible frame to guess from. An item whose anchors are all too
long has no L4 material and is held at L3 by the same mechanism (D30).

**The honest gap:** the pre-cached clip set is empty. Tatoeba audio is a licence
*candidate*, not a cleared dataset — terms are per contributor and some clips
carry none — so nothing may enter `assets/` under it. Step 1 of that chain is
built, tested, and has nothing to serve. On a device whose engine is dead, L4 is
therefore withheld from every item today. The app stays fully usable: 94 of the
116 drills are text, every rung below L4 is text, and the home screen says in
Indonesian that listening practice is hidden and why.

### Task 2 — the contrastive engine

**`data/contrastive/en.yaml`** — 21 categories: all ten §3.1 morphosyntax
categories, ten phonology categories (the missing phonemes split by contrast,
the three vowel pairs, final devoicing, cluster reduction, word stress), and
false friends. Each carries a three-part Indonesian note in a fixed order —
*what Indonesian does*, *what English does instead*, *one minimal pair* — plus
116 drills and a curated list of 75 false friends.

The order of the note is a decision, not a layout. Naming the L1 pattern first
tells the learner the mistake is systematic rather than careless, which is the
entire claim §2.9 is making. All example sentences are authored here rather than
lifted from the corpus, so the content carries no third-party licence
(`linguaku-authored`, declared and attributed).

`npm run ingest:contrastive` compiles the YAML to a 15 KB shard and **fails the
build** on an MCQ whose answer is not among its options, a category with no
minimal pair, a drill with no explanation, or a minimal pair not marked as
needing audio (D31). A YAML parser has no business in the bundle, and an
unanswerable question should never reach a phone.

**`src/core/elo.ts`** — one rating per category, updated in place after every
answer, with K decaying as evidence accumulates. Elo rather than the 1PL grid
`placement.ts` uses because this question never stops being asked, over twenty
categories at once, and has to stay incremental.

**`src/core/interference.ts`** — the piece that makes the engine work on ordinary
reviews rather than only on drills. It turns a wrong cloze answer into category
tags: `he` for `she`, `walk` for `walked`, `is` for `are`, `a` for `the`. Those
tags are written to `ReviewLog.interferenceHit`, move the same Elo ratings the
drills do, and pull up the authored note as feedback. The heatmap is therefore
built from what the learner does when they are *not* being tested on it, which is
the thing a quiz cannot tell you.

**The composer** now spends §7.2's last 5% on drills from the weakest category
(nearest the learner's rating within it), with drills counting as their own card
type so §2.8 keeps two of them apart. Drills deliberately do not receive the
spare budget when reviews run dry: §7.2 asks for one contrastive drill, not for a
session to become remediation.

**The heatmap** ranks measured categories weakest-first and says *"belum cukup
data"* — with the number of answers still needed — for everything else.
`heatmap.test.ts` walks the whole join: a normal cloze answered wrongly, through
the detector, into the review log and the category rating, out as a ranked
standing — with no drill involved anywhere.

### The R1 finding that cost the most to learn

**The first `speechSynthesis` call blocks the main thread for ~15 seconds when
there is no speech service behind it.** Not the probe's timeouts — those are
async and bounded — the API call itself.

It showed up as the cold-start acceptance test going from 1.2s to 14.9s the
moment the probe was wired into boot, and returning to 1.2s when it was moved.
Instrumenting the boot path showed a 14.9-second gap with no network activity and
no JavaScript progress, sitting between the content manifest arriving and the
anchor shards being requested — the main thread, gone.

That is five times SPEC §5.4's entire icon-tap-to-first-question budget, with the
app frozen for all of it, and it lands on exactly the device R1 is about: the
cheap Android with no TTS engine installed.

`requestIdleCallback` was not enough — the idle moments during an async boot are
precisely the gaps where the app is waiting on IO and is about to want the main
thread back. So the probe now fires only once a screen is **painted**:
`onFirstQuestion` from the session screen, `onReady` from home. Until it answers,
`isTtsLive()` is false and audio is withheld, which is the same safe default the
rest of §2.6 runs on. A unit test stubs the API and asserts the probe has not
touched it before the deferral elapses.

This is worth a row of its own in the device matrix: not just *is there a voice*
but *how long does the first call take*. If it reproduces on real hardware, the
probe may belong behind an explicit "test audio" button rather than running by
itself at all.

### Four things worth flagging

**A wrong tag is worse than no tag.** `book`/`books` and `go`/`goes` are the same
string alternation, and M1's frequency-only pipeline produces no part-of-speech
tag. The word before the blank settles most cases; where it does not, the
detector emits nothing at all (D34). Roughly half of `interference.test.ts` is
about the detector staying quiet.

**Eight correct answers in a row is not yet "you've got this".** The weakness
threshold is expected accuracy below 0.75 on a median drill, and the damped K
means clearing it takes about a dozen. A test that asserted otherwise was
rewritten rather than the threshold lowered: the cost of the strict version is a
few extra drills in a category the learner is fine at, which is much cheaper than
declaring a weakness resolved on thin evidence.

**Drills are not review logs** (D32). A drill has no FSRS card — nothing
scheduled, no stability — so filing drill answers among the review logs would put
unscheduled items into the retention rate §9 promises to report honestly. They
get their own table and their own single writer, with the same one-transaction
discipline `recordReview` has.

**Session planning must not touch the network.** `planSession` runs inside the
≤3s budget, so the contrastive pack is read from memory if it is there and simply
skipped if it is not — a first-ever session that starts before the pack lands
gets no drill, and the next one does. Content that has not arrived is not
scheduled, the same rule bands already follow.

**The e2e suite found a real bug, not a flake.** Advancing to the next card left
the *previous* card on screen and answerable for as long as the next one took to
build — so a learner could answer a card that had already been graded, and a
second `recordReview` would land on it. Fixed by clearing the card with the
feedback; the test helper now also waits for the counter to move rather than
racing the app.

### Deviations

| Deviation | Why |
|---|---|
| The probe fires after the first screen paints, not literally at boot | Forced by measurement, not preference: a literal boot probe freezes the app for ~15s on a device with no speech service (above). It is still once per app start with one verdict for the session, which is what the directive was buying. |
| The probe will mark iOS Safari dead where audio might have worked | iOS requires a user gesture before it will speak, and neither boot nor first paint is one. This is the cost of a stable session-wide verdict (D29), and it fails safe — L4 withheld, never faked. The M2 behaviour (probe inside the practise tap) traded the stable verdict for iOS coverage. Reversible; the matrix should decide it. |
| L4 is dictation only, not the audio-cloze alternative §2.3 also allows | Dictation's answer is determined entirely by the audio. An audio-cloze needs the sentence frame on screen, which makes it partly a reading task — a weaker measurement of phonological form (D30). |
| `CategoryScore` gains a `correct` tally, beyond the §6 shape | The heatmap reports accuracy, and the Elo rating is damped and difficulty-weighted, so it does not carry a raw hit count. Existing rows are backfilled with 0 rather than a number reconstructed from the rating. |
| The 22 minimal-pair listening drills are withheld without audio | Same rule as L4 (§2.6). Shown as a reading exercise they would silently convert a listening measurement into a spelling one. |
| `yaml` added as a devDependency | MIT, build-time only, never in the bundle. §0 rule 1 is about recurring cost, and there is none. |
| Phonology categories will stay unmeasured on a silent device | Honest consequence of the above: the heatmap will show them as "belum cukup data" indefinitely rather than scoring them from text proxies. |

### Next decision I need from you

**1. R1, still — and now it is the only thing standing between the engine and
its listening half.** Part 3 of `docs/DECISIONS.md` is still empty. M4 proceeded
on the basis that the matrix had been run, and the probe was built to the 500 ms
`onend` deadline that direction specified; no results came with it, so I have not
written rows I did not observe. Two things need real phones: whether 500 ms is
the right number on a cheap Android, and whether the iOS gesture consequence
above costs real learners their listening material.

**2. Pre-cached audio is now the binding constraint, and it is a licence
question, not a code one.** The fallback exists and has nothing to serve.
Options, all of which are yours: clear Tatoeba audio per clip (the export carries
a licence field; the ones with an empty field are unusable), source a
CC-licensed clip set, or accept synthesis-only and let dead-engine devices go
without L4 permanently. R4 measured the room: essentially the whole 8 MB budget
is free for roughly 800–1,000 clips.

**3. The Indonesian copy is a draft and reads like one in places.** You said you
would edit it. The places I would look first: the phonology tips, which are the
hardest to write without sounding like a textbook, and `PASSIVE_OVERUSE`, where
the explanation is about register and my ear for Indonesian register is the
weakest part of this file.

---

## M3 — Level awareness · complete (2026-08-10)

**Acceptance:** §2.4 and §4.2 acceptance tests pass; simulated learners of three
different levels receive appropriately different content. Both met.

| | required | actual |
|---|---|---|
| i+1 selection in band, passage-length text | ≥ 90% | **100%**, 0 below the floor |
| placement length | ≤ 25 items, ≤ 90s | capped and asserted end to end |
| three simulated learners get different bands | yes | strictly increasing band means |
| unit tests | — | 306 |
| e2e tests | — | 14 |

### What shipped

Four new `src/core` modules: `coverage` (known-set and i+1 selection),
`forecast` (14-day load projection and the new-item throttle), `placement`
(1PL estimation, max-information selection, stopping rule, false-alarm
correction) and `pseudoword` (build-time non-word generation).

The placement screen itself is one interaction: a word, and two buttons. SPEC
§4.2 asks for both an adaptive 1PL loop and a Yes/No pseudoword check inside 90
seconds, so they are the **same sequence** (D24) — every real word judged is a
1PL response, and pseudowords interleave at one in four to catch over-claiming.
It is offered right after the language choice and can always be declined; an
e2e test asserts that declining costs nothing, because a placement that has
quietly become mandatory is an onboarding wall.

Sessions are now level-gated: new items come from the learner's frontier band,
nearest the frontier first (D27), and the new-item allowance is throttled
automatically by projected review debt. Which anchor sentence teaches a word is
now an i+1 decision rather than always the globally easiest one.

### Three things measurement or the spec's own numbers forced

**The i+1 coverage band is unreachable on sentences.** Coverage on an n-token
text is quantized to 1/n, and the band is 0.06 wide — so below ~17 tokens it can
contain no achievable value at all. On a 10-token sentence the reachable
coverages are 1.00, 0.90, 0.80: the band is empty. §2.4's threshold is a
*running-text* finding. Applied literally to single sentences it would reject
nearly all of them, so short items fall back to i+1's literal form — exactly one
new word — and the §2.4 acceptance test runs on passage-length text where the
band is the operative criterion (D28).

**Uncapped over-claim correction produced a useless placement.** A learner who
answered erratically and claimed pseudowords got "somewhere between band 1 and
band 6" — honest, and worthless. Evidence can fail to narrow what we knew; it
cannot make us less certain than the prior, so the corrected standard error is
now capped there. Where the band is still three tiers wide, the result screen
says so in words rather than printing the range (D26).

**A trigram model makes obvious fakes.** The first pseudoword pass emitted
`admaninja` and `awflualte` — a learner spots those on sight, and a Yes/No check
whose fakes are visible measures nothing. An order-3 character model follows
English orthotactics closely enough to produce word-shaped output (`anago`,
`badests`, `assicks`) while carrying far too little context to reconstruct real
words. Candidates within one edit of a real word are rejected too: showing
`becuase` tests whether a learner spots a typo, not whether they know the word.

### Deviations

| Deviation | Why |
|---|---|
| Only `vocab` is estimated; listening and grammar rows are absent | §4.2 forbids collapsing the three. Listening needs audio verified on a real device (R1); grammar has no items until M4. A missing row reads as "not measured"; a fabricated one would read as a measurement (D25). |
| Vocabulary ability is a corrected self-report, not a test of recall | It is what §4.2's Yes/No check is, and it buys 25 items in 90 seconds. The false-alarm correction is what keeps it from measuring confidence. Recall-based placement items would need glosses (R3). |
| The mapping from false-alarm correction onto (θ, SE) is a calibration choice | The mechanism is the spec's; the shrink-toward-prior mapping is an implementation detail, labelled as such in the code rather than presented as a finding. |
| §7.2's "forecast load > 1.5× daily budget" read as *mean daily* load | Read as a weekly total against a daily budget it would throttle almost every learner — any learner with more than ~60 cards due in a week. Mean daily load against daily capacity is the reading that does what the rule is for. |

### Next decision I need from you

Still only R1: **the speech device matrix**. Unchanged from M2 — the probe is
built and tested against engines that lie, but has never run on a real phone,
and until it has, L4 stays withheld and the `listening` ability stays unmeasured.

---

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

**M4 — Contrastive engine (English).** The differentiator: authored
`data/contrastive/en.yaml` covering every §3.1 category, interference tagging on
items and wrong answers, targeted drills, minimal-pair listening, and the
heatmap. This is the milestone where §14 question 3 — how much of the
contrastive content you write yourself — stops being hypothetical.
