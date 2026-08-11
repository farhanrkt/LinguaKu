# PROGRESS.md

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
