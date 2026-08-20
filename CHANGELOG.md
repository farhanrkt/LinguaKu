# Changelog

All notable changes to LinguaKu. Dates are ISO. This file is the release
record; `docs/PROGRESS.md` is the per-milestone engineering log behind it.

---

## v1.11.0 — 2026-08-19

Two problems reported from actually using the app. Both turned out to be worse
than they looked from the outside, and one of them was corrupting data.

### Fixed — one click was writing one review *per click*

Every write in the session was an `async` handler with no guard, and there are
two ways to click twice.

**Racing.** Eight taps on "Oke, paham" before the first `await` returned wrote
**eight** `ReviewLog` rows and advanced FSRS eight times, for one item. That is
measured, not estimated — it is what the new gate reports when the fix is
reverted.

**Sequentially.** The feedback renders in the footer while the card stays on
screen above it, so every control that produced the answer is still live once
the verdict appears. Clicking it again seconds later wrote another row.

Neither is cosmetic. `recordReview` is the only writer of FSRS state and
`ReviewLog` is **append-only at the Dexie hook** — updates, overwrites and
deletes all throw — so a duplicate row **cannot be removed afterwards**. It sits
permanently in the log §9 computes the honest retention rate from.

The race is latched with a **ref**, because `setState` is asynchronous and two
clicks in one tick would both read the stale value. The sequential case is
latched by refusing to answer a card whose verdict is showing. Both are mirrored
into `disabled` so the controls say what they are doing, and both have e2e gates
that were checked by reverting the fix and watching them fail.

### Fixed — the word's meaning was missing on five rungs out of seven

`glossFor` was only called on the L0 branch, so **L1–L6 carried no gloss at
all**. The worst case was L5, which §2.3 defines as *"ID → target, produced"*:
its prompt was the whole *sentence* translation while the graded answer was a
single headword. A learner was shown

> Dia mendapat nilai A.

and asked "what's the English?" — with the expected answer being **"a"**.
Nothing said which word was wanted, or that one word was wanted.

Now the gloss is resolved once for every task and used in three places: L0 as
before; **L5 as the prompt**, with the sentence demoted to labelled context and
an explicit *"satu kata saja"*; and the **feedback panel on every card**, which
is safe everywhere because a gloss cannot give away an answer already given.

### Fixed — the absent case rendered as blank space

Gloss coverage is 30% of English words and 4% of Japanese (measured, D59), so
"no entry" is the **ordinary** case, not an edge one. The session rendered
nothing at all for it, which is indistinguishable from a bug — and it is what
"the translation sometimes doesn't show" actually was. It now says so, in the
same words the reader has used since v1.7.0.

### Changed — an exposure card is one tap, and claims nothing

L0 is errorless by §2.3, but it submitted the headword as its own answer, graded
it "correct", printed **"Benar!"** over a card that asked nothing, and waited for
a second tap. Confirming still records the review — the confirmation *is* the
response — and now advances directly. Promotions are reported in the summary,
where §2.14 wants capability reported anyway.

### Measured on this build

| | |
|---|---|
| unit tests | **766**, 57 files |
| e2e | **56** (4 new) |
| initial JS / CSS gzipped | **137.8 KB** / **6.7 KB** |
| WCAG 2.1 AA violations | **0**, light and dark |

---

## v1.10.1 — 2026-08-19

Two of v2.0.0's four gates worked, as far as they can be worked without the
owner's hardware. One of them closed.

### Sync is deployed — the gate that said "deployed or deleted"

`workers/sync/` had never been run. Its own README said so: *"The Worker itself
has never been deployed or run."* It has now.

| | |
|---|---|
| Worker | `linguaku-sync` |
| D1 | `linguaku`, region APAC, served from Singapore |

**It is live and it grants nothing.** `SYNC_TOKEN` is deliberately unset, so
every `POST /sync` answers 401 — verified over 14 consecutive requests — and
everything else answers 404. The endpoint exists; its owner sets the secret.

Two steps in the README were wrong and are corrected: `d1 execute` needs
`--config` from outside that directory, and `d1 create` suggests a binding name
that does **not** match the `DB` binding `index.ts` reads.

**Invariant 21 was re-checked, not assumed.** The e2e test that drives a full
session asserting zero requests leave the origin still passes. A deployed
endpoint changes nothing about an app that does not import the client.

**Still untested:** the authenticated round trip, which needs the token.

### R7 — the Japanese voice, read at source

The register recorded on 2026-08-13 that `ja_JP` was absent from the official
Piper set. **The index has moved**: 174 voices, 55 language codes, and Japanese
now exists — under the non-standard code **`ja_JA`**, which is why searching for
`ja_JP` still finds nothing.

It does not help. `ja_JA-hi_fi_captain-medium` is **CC BY-NC-SA 4.0**, and the
NC fails the criterion R7 already set.

Three other paths were read at source and none is promoted — reading and dating
is the owner's step:

- **JSUT** — audio is academic/non-commercial/personal, and *"Re-distribution is
  not permitted"*. Worse than NC.
- **つくよみちゃんコーパス** via the `piper-plus` fork — the only candidate that
  clears NC. Commercial use permitted and TTS publication explicitly allowed
  with a verbatim credit, but redistribution of the corpus is prohibited,
  *"licensing to others as reusable material"* is prohibited, a **separate
  character licence** applies, and the fork's incompatible G2P means a second
  generator beside the English one.
- **Mozilla Common Voice ja** — **CC0**, the only path with no conditions at
  all, and the only one with no ready-made voice: it would mean training one.

### The copy packet

All **349** learner-facing strings, grouped by screen, published as a review
document for the native-speaker pass — the third gate, and the only one that
needed no hardware and no licence.

### Still gated on a person

Three of four: the voice model's licence (R7, now with the options laid out),
the four empty device-matrix rows, and the native-speaker copy pass.

---

## v1.10.0 — 2026-08-19

The one thing v1.9.1 named and left open, and the three defects that turned up
behind it. All three were found by writing a gate or by running the app on a
second platform — none by reading the code, which is the same finding this
branch keeps making.

### The reader cost ~320 tab stops, and now costs one per block

Named in v1.9.1 as *"a design decision rather than a patch"* and left. Every
word in a passage and every token in the feed was its own `<button>`, so a
learner on a keyboard or a switch device paid a stop for every word they were
not interested in before reaching anything else on the screen. Nothing was
failing: axe is content with a focusable button, and the §10 keyboard test
walked from home into a session without ever touching the reader.

The words are now a roving-tabindex composite (`src/ui/TappableText.tsx`, D70).
Tab enters and leaves a block; Left/Right and Home/End move between words inside
it; a click makes that word the block's entry point. Arrows clamp rather than
wrap, because prose is a line and not a ring.

**The gate asserts both halves** — under 40 tab stops *and* 100+ words still
individually reachable — because withdrawing the stops without keeping the words
operable would have taken tap-to-gloss away from the keyboard entirely, which is
a worse §10 failure than the one being fixed.

### Fixed — dark mode had never been scanned, and 54 usages failed AA

§10 promises *"dark mode, WCAG AA contrast"* in one clause, and every axe scan
since v1.8.0 ran in light mode. Adding the dark scan found the tertiary text
shade at **4.23:1** on the page background against a 4.5 floor — used **54
times across 15 files**, on every screen with secondary text. Raised to the
shade above it, which clears 7.66:1.

**The cost, stated plainly:** dark mode now has one fewer step of type hierarchy
than light, because the third grey was not AA and AA is the promise.

The same run found `text-stone-500` at **4.38:1** inside the reader's tinted
word panel. That shade clears AA on the page background at 4.60:1 — it was
correct where it was written and wrong where it was reused, which is the class
of defect only a scan finds.

### Fixed — the device report named the wrong operating system

`formatDeviceReport` printed `Android/OS <version>` unconditionally, because the
matrix R1 keeps is about cheap Android phones and the label had been written as
a constant. Running it on a Mac produced *"Android/OS 26.5.0"*; an iPhone would
have produced a row claiming Android. The empty cells in that table are the
honest ones, and a row naming the wrong OS is worth less than no row at all. The
platform is a low-entropy client hint Chromium has always offered for free.

### Fixed — the boot probe never answered while the page was hidden

`requestIdleCallback` does not run for a hidden page, and its `timeout` only
counts down while the page is visible. A tab that booted in the background sat
on *"Mengecek suara di HP ini…"* for **25 s and counting**, and resolved
correctly the moment it was looked at. Deferring until the page is visible stays
— the first `speechSynthesis` call on a device with no speech service blocks the
main thread for ~15 s (R1) — but the code claimed its timeout was *"a ceiling,
not a target"*, and for a hidden page it was neither. It has a real one now.

### Added — a second row in the device matrix, named for what it is

macOS 26.5.0 / Chromium 148, en **ready at 855 ms** (Samantha), ja **ready at
114 ms** (Eddy). It is filed as its own row and **not** as the empty "Chrome,
desktop" one, because the host is Electron rather than stock Chrome. It says
nothing about a cheap Android, which is the claim R1 is actually about — its
whole value was being a second platform, and it found the two defects above.

### Measured on this build

| | |
|---|---|
| unit tests | **766**, 57 files |
| e2e | **52** |
| icon tap → first answerable question | **108 ms** (budget 3 s) |
| initial JS / CSS gzipped | **137.4 KB** / **6.7 KB** (budgets 200 / 40) |
| WCAG 2.1 AA violations | **0**, light **and** dark |
| reader tab stops | **< 40**, from ~320 |

### Still gated on a person, not on code

Unchanged from v1.9.0, and this release moves none of it: the voice model's
licence (R7), four empty rows in the device matrix, a native-speaker pass over
the Indonesian, and sync deployed or deleted.

---

## v1.9.1 — 2026-08-18

A review pass over the nine releases this branch added in one sitting, and the
four defects it found. Three of them were invisible: the app did not crash, no
test failed, and a learner would simply have got less than the release notes
promised.

### Fixed — a fifth of the chunks were never shown

A chunk's anchors are chosen from the whole corpus; `buildTask` resolved them
against `anchors.b<band>.json`, which is the curated subset a band's
*vocabulary* is taught through (D19). Where a chunk's anchor was not in that
subset the task came back null and the session skipped the item silently.
**15 of 70 English chunks and 5 of 17 Japanese** were unreachable — *by the
way*, *right now*, *make sure*, *be good at*, 「ありがとうございます」,
「わかりました」. Chunk shards now carry their example sentences inline, so the
lookup that failed no longer exists.

### Fixed — Japanese production answers ending in ん were marked wrong

`romajiToKana` holds a trailing `n` while typing, so `nani` does not turn into
ん on the first keystroke, and resolves it on commit. `KanaInput` called
`onChange(committed)` and then a zero-argument `onSubmit()` in the same tick, so
the caller submitted its **pre-conversion state**: `nihon` + Enter went in as
`にほn`, which the grader scores *wrong* — not even a near miss. A learner who
typed the right answer was told they were wrong and the card took an Again.
`onSubmit` now receives the committed value.

### Fixed — the pipeline never pruned bands it stopped writing

The first chunk run banded every Japanese formula at 6; the banding was
corrected and `chunks.b6.json` stayed on disk, in the manifest, in `dist/` and
in the offline cache budget — 23 duplicate chunks at a band the pipeline no
longer assigns. It also made the output depend on what happened to be there
before, which is invariant 10 in spirit. The build now prunes and says so.

### Fixed — mining was missing from passages

`§8` calls one-tap mining the retention engine, and passages are the first thing
the reader shows. Tapping a word there produced a panel with no "add to my
practice" button and no explanation. The guard was defensive about
`MinedItem.fromSentenceId` — a field nothing in `src/` reads. The passage id is
its provenance now.

### Noted, not fixed

Every word in the reader is its own focusable button, so two passages add ~160
tab stops before the sentence feed. The pattern predates this branch; passages
make it materially worse. §10's "full keyboard operation" is satisfied and
practically unusable on that screen.

### Measured

| | v1.9.0 | v1.9.1 |
|---|---|---|
| unit tests | 752 | **755** |
| content shards | 65 | **64** (one was stale) |
| chunks reachable in a session | 76 of 96 | **96 of 96** |

---

## v1.9.0 — 2026-08-18

The deploy audit, and it found two ways the offline promise was already broken.

### Fixed — the runtime cache was one shard from evicting content

The content cache has been capped at **64 entries** since M2, when the app
shipped 47 files. Glosses, chunks, topics and passages took the count to **65**.
Workbox evicts least-recently-used entries past the cap, so a learner who
touched both languages was one fetch away from losing content they had already
downloaded — and the failure only shows up on a plane. Raised to 192, with
`purgeOnQuotaError` so a full device drops re-fetchable content rather than
failing.

### Fixed — audio would not have been cached at all

Every runtime caching rule matched `.json`. The first pre-cached clip would have
matched none of them: re-fetched on every play, unavailable offline, which is
precisely the situation the clips exist to survive (§5.4 promises offline audio
for cached bands). Clips now have their own cache, and `rangeRequests` with it —
an `<audio>` element issues Range requests, Safari always does, and a cached
clip answering one with a 200 will not play.

Both were found by writing the gate rather than by reading the code.

### `npm run check:offline`

A new gate in `verify`, asserting against **`dist/sw.js`** — the worker that
actually ships — rather than the config that generated it (D69). It reads the
cap per cache name, because taking the largest number in the file would let the
content cache shrink below the shard count while the deliberately-large audio
cache hid it.

### The launch checklist is re-measured

It had carried v1.0.0's numbers since March, with a warning saying so. Every
figure in `docs/LAUNCH-CHECKLIST.md` now comes from the run that wrote it: 752
unit tests, 49 e2e, 136.7 KB initial JS, **103 ms** icon-tap-to-first-question
against a 3 s budget, 44 precache entries at 1.32 MB gzipped against 8 MB, 8
datasets, 65 asset files. The manual section gained the step that matters for
what was just fixed — open the reader *before* going offline, because content
fetched at runtime is the half of the promise a precache cannot keep.

### Measured

| | v1.8.0 | v1.9.0 |
|---|---|---|
| unit tests | 752 | 752 |
| e2e tests | 49 | 49 |
| CI gates | 7 | **8** |
| runtime cache headroom | **1 shard** | 127 shards |

---

## v1.8.0 — 2026-08-13

**The accessibility promises now have a gate.** §10 has asked for WCAG AA
contrast, reduced-motion support, 56px targets and *"full keyboard operation on
desktop"* since M0, and §13 listed a gate for none of them — so all four were
claims held up by care.

### Found on the first run

**A screen reader met an unlabelled file field on the restore control**
(critical). The JSON import input is visually hidden behind a styled button, so
sighted learners see the button and everyone else met an anonymous file input —
on the one screen where a learner hands over their entire history. It has a name
now.

### The gate

- **axe** over every screen a learner reaches — first run, home, reader,
  progress, glossary, settings, attribution — and over a session, mid-answer.
  `@axe-core/playwright`, MPL-2.0, devDependency only: nothing enters the bundle.
- **The keyboard, by using it.** Tab and Enter from the home screen into a
  session and through an answer, with no clicks and nothing reached past the UI.
  "Full keyboard operation" is a behaviour; no static rule observes it.
- **Reduced motion**, by asking the browser for the preference and asserting
  that nothing on screen declares a transition.

axe is a floor rather than a verdict (D68): it catches contrast, names, roles
and labels, and it cannot tell whether a screen makes sense.

### Measured

| | v1.7.0 | v1.8.0 |
|---|---|---|
| e2e tests | 45 | **49** |
| unit tests | 752 | 752 |
| initial JS, gzipped | 136.7 KB | **136.7 KB** |
| WCAG 2.1 AA violations | unmeasured | **0** |

---

## v1.7.0 — 2026-08-13

**The glossary** — the one kind of browsing SPEC §2.2 allows, and the last
learner-facing surface the app was missing.

The progress screen could say *"kamu mengenali sekitar 1.200 kata"* and never
show a single one of them. A number is a claim; a list you can scroll is
evidence, and evidence is what §2.14 asks progress to be made of.

Everything answered, strongest first — *sudah nempel*, *kamu kenal*, *mulai
pudar*, *diajarkan ulang* — with its meaning where one exists, its example
sentence on tap, and a search box. Only items with a card appear, because a card
is the product of an answer: this is what a learner has met, not what the app
ships.

**And it advances nothing** (D67). That is the condition §2.2 attaches, so it is
enforced structurally rather than by care: the query opens no transaction, calls
no writer, and cannot reach `recordReview`. A test builds the glossary against a
timestamp thirty days in the future and asserts the card is byte-identical
afterwards.

### Measured

| | v1.6.0 | v1.7.0 |
|---|---|---|
| unit tests | 745 | **752** |
| e2e tests | 44 | **45** |
| initial JS, gzipped | 135.4 KB | **136.7 KB** (68%) |

---

## v1.6.0 — 2026-08-13

Learning material and the screens around it. Two spec requirements that had been
typed and empty since M0 now have content behind them, and the home screen gave
back the space they needed.

### §2.5 — collocations are items now

`ItemKind = 'chunk'` has existed, unproduced, since the schema was written.
**73 English and 23 Japanese chunks** ship: *take a shower*, *make a mistake*,
*pay attention*, 「よろしくお願いします」, 「お世話になります」 — the phrase §2.5 names
as its own example.

They are **authored, then validated against the corpus** (D64). Mining them
statistically was tried and rejected: Tatoeba is saturated with `tom said`, PMI
cannot separate a collocation from a frequent accident, and there are no
part-of-speech tags to filter with. So a human wrote the list and the corpus
holds it to §2.5's own ingestion rule — a chunk with no real example sentence
fails the build.

Writing that gate surfaced two matcher bugs that had been quietly rejecting real
phrases. The corpus contains *"took a shower"*, not the base form, so the
leading verb is inflected before matching. And separable phrasal verbs appear as
*"drop me off"*, so a two-word verb is matched around an object pronoun. Between
them they recovered a third of the list.

Each chunk carries its Indonesian meaning, because its parts do not compose —
that is the whole reason it is an item — and where there is an L1 trap the card
names it: *"take a shower: bahasa Indonesia cuma butuh satu kata, mandi."*

### §2.10 and §2.14 — the learner can pick topics

Twelve English topics and seven Japanese, chosen in settings. §2.14 promised
that *"the learner picks topic clusters"* and the app has never offered a
control for it; §2.10 said frequency order is *"modulated by learner-selected
topic goals"* and there was nothing to modulate by.

**It reorders, it never restricts** (D65). Someone who picks "food" still gets
the function words that hold a sentence together — filtering the queue to a
topic would starve them of exactly the words that make the topic usable. The map
is authored and **partial on purpose**: 6.9% of the English inventory, 2.0% of
the Japanese, published in the shard rather than implied, and a word in no topic
loses nothing.

This also makes §2.8's second interleaving rule real. *"Never more than 3 from
the same topic cluster"* has been running against the frequency band since M2,
which made it a near-duplicate of the band gate; now three food words in a row
is something the composer can see.

The compiler refuses a topic word that is not in the shipped inventory, which
caught three authoring errors on the first run — including a Cyrillic word that
had slipped into the Japanese list.

### The home screen got shorter

Seven links had accumulated between the learner and the button that starts a
session (D66). Habit, sync, diagnostics and attribution moved behind one
**Pengaturan** screen — which is also where the topic picker belongs. Home keeps
practice, the reader, progress, and the settings that change what a session *is*.

### Measured

| | v1.5.1 | v1.6.0 |
|---|---|---|
| unit tests | 720 | **745** |
| e2e tests | 43 | **44** |
| initial JS, gzipped | 134.5 KB | **135.4 KB** (68%) |
| §2 requirements with content behind them | 14 of 15 | **15 of 15** |

---

## v1.5.1 — 2026-08-13

**The device matrix has its first real row, and it was worth collecting.** One
phone — Chrome 151 on Android — reported working on-device voices in both
English and Japanese, completing at **932 ms** and **999 ms**.

### Changed

**`TTS_ONEND_DEADLINE_MS`: 500 ms → 2,000 ms.** That phone was being told it had
no usable audio. L4 dictation withheld, the mora-timing drills withheld, the
listening axis left unmeasured — on a device with genuine offline voices for
both languages. The old number rested on an argument ("an engine that cannot
finish a zero-volume full stop in half a second will not deliver a dictation
card either") that measurement refuted: nearly all of that second is engine
start-up, paid once, not per syllable.

Loosening it cannot let a broken engine through — one that fires `onend` has
finished speaking by definition — so the change can only stop excluding honest
engines that are slow. It also matches `VOICES_TIMEOUT_MS`, and the extra 1.5 s
is never in front of a learner: the probe runs after first paint and audio stays
withheld until it answers. D29 amended; a regression test pins the two measured
latencies so the deadline cannot quietly tighten back under them.

**The report now names the device.** The row came back as `Android 10; K` —
Chrome has frozen the UA model since v110, so the matrix could identify a
browser but not a phone, and "works on a cheap Android" is the claim under test.
The diagnostics screen now also collects model, platform version, RAM, cores and
screen via client hints, and falls back to the user agent where they are absent
(Firefox, Safari) rather than guessing.

### Still open

R1's prediction that `ja-JP` would be the first voice missing on a cheap Android
did **not** hold on this device — one row, and the first evidence either way.

The most valuable empty row is now the second: **a device with no TTS engine
installed**. It is the only configuration that can confirm or refute M4's ~15 s
first-call stall, and this phone had an engine, so `0 ms` here settles nothing.

---

## v1.5.0 — 2026-08-12

The four releases `docs/ROADMAP.md` planned for v1.2 through v1.5, executed in
one pass. Each was meant to close one entry in the risk register and turn one
`null` on the progress screen into a measurement. Three of the four did.

### Measured

| | v1.1.0 | v1.5.0 |
|---|---|---|
| unit tests | 653 | **715** |
| e2e tests | 41 | **43** |
| initial JS, gzipped | 128.3 KB | **136.2 KB** (68% of budget) |
| cleared datasets | 7 | **9** |
| radar axes with a measurement | 3 of 5 | **4 of 5** |
| §8 exercise catalog | 12 of 13 | **13 of 13** |
| paths by which learner data can leave the device | 1 (opt-in sync) | **1** (opt-in sync) |

Schema v6, additive: `readingAttempts` is a new append-only table and no
existing row changes shape.

### Audio, and the device we have never seen (was v1.2.0)

**The R1 device matrix is now a five-tap job.** It has been empty since M4
because the person with the phone is not the person with the debugger, so the
probes moved into the app: Settings → *"Uji suara di HP ini"* runs every probe
on demand and emits a markdown row for `docs/DECISIONS.md`.

It probes **from inside a tap**, which matters more than convenience. D29
recorded that iOS Safari will not speak outside a user gesture, so the boot
probe marks a working engine dead there; a probe fired from a button is the only
honest measurement that platform allows, and a good answer now counts for the
session — upward only, and still held to the same 500 ms deadline (D57).

**Listening stopped being an unmeasured axis** (D58), estimated from L4
dictation through the same 1PL model placement uses. Two bugs surfaced while
wiring it: the radar counted every rung ≥ 4 as listening, so production answers
were being reported as listening; and `production` had been hard-coded to `null`
since M5 — four milestones after production shipped.

**The audio pipeline exists and has never run.** `npm run ingest:audio` and a
new `npm run check:audio` CI gate are in place; no voice model has had its
licence read and dated, so invariant 5 refuses every clip. Stated plainly rather
than left looking finished.

### Meaning (was v1.3.0)

The release opened with a measurement and a **70% go/no-go**, and the
measurement said no: Indonesian glosses cover **40.3%** of English bands 1–3 and
**9.2%** of Japanese — worst on the commonest words, and en.wiktionary's
translation tables add coverage along with senses like `know → setubuh`.

**So L2 is unchanged** and D21's supported cloze stands. What shipped is the
distinction that makes partial coverage useful anyway (D59): a gloss is
*reference*, never an answer key — grading needs it right for every item,
showing it needs it right only where shown. 1,581 English and 274 Japanese
glosses now fill the reader's word panel and L0's long-missing gloss slot, and a
word without one says so.

Cleared by reading the terms at source, which is the route R3 recommended:
parsing the Wikimedia dump directly removes Kaikki's unstated extraction terms.
Own shards, CC BY-SA 4.0, so the English sentence corpus stays CC BY 2.0 FR.

**The kana keyboard** (§10) landed with it, and with `romajiToKana` — live
conversion that holds a trailing `n` while typing and makes っ from a doubled
consonant, because きって is not きて.

### Reading (was v1.4.0)

**Simple English Wikipedia, cleared and ingested**: 389,501 articles into banded
passages. The histogram is the finding — 96% of its prose bands at 6, and five
paragraphs in the entire corpus band at 1. *Simple English is not beginner
English on our scale*, which is a reason to say who the reader serves (the
default learner is intermediate English, D3) rather than to loosen the measure.

**§2.4's coverage band is finally operative.** [0.92, 0.98] is unreachable on a
ten-token sentence (D28); on a forty-token paragraph it is not, so the selector
applies the spec's threshold as written and drops anything under 0.85.

**Reading stopped being `null`**, measured by a cloze over a word in the text
just read — not a comprehension quiz, because 1,680 passages cannot carry
authored questions and generated ones are answerable by string-matching.

### The learner's own parameters (was v1.5.0)

**The error-correction drill** — §8's last unbuilt catalog item — ships as its
own drill type, 10 English and 5 Japanese, one per morphosyntax category. The
compiler refuses a correction whose answer equals its prompt.

**§14 question 5 is answered: there will be no AI layer** (D63). A
bring-your-own-key implementation was built during this pass and **deleted on
review** — not flagged off, not left as a seam. The claim that a learner's data
stays on their phone should rest on the shape of the code rather than on a
guard, and invariant 8 is explicit about preferring deletion to dormant
scaffolding. L6 continues to check only that the target word was used, and to
say so (D49).

**The FSRS optimizer was evaluated and not shipped** (D62). `fsrs-browser` is
BSD-3-Clause and 332 KB of WASM, which is fine lazily; what is unestablished is
single-threaded performance on the reference device, since its parallelism needs
cross-origin isolation. A parameter fit that silently degrades a schedule is
worse than D39's bounded nudge, so the nudge stays and the numbers are on record.

### Fixed

**The attribution screen was naming a dataset the build does not use.**
`jmnedict` entered `datasets` at M6 for proper-name disambiguation that was
never implemented — no fetch step, no parser, no shard referencing it — so the
screen has been claiming it since. Demoted to `candidates`, removed from
`NOTICE.md`, and `npm run check:licenses` now fails on any declared dataset that
no asset references, which is the mirror of the rule it already enforced. Found
by building the guard that stops a voice model being promoted before its clips
exist (`docs/AUDIO-RUNBOOK.md`).

### Not in this release

**Chunks** (§2.5) and **topic clusters** (§2.10) were planned and are not built.
Neither is blocked technically; both need authored content and a reviewer, and
shipping an unreviewed collocation list or a topic taxonomy nobody trusts would
put content in front of learners that nobody read. `ItemKind = 'chunk'` stays
typed and unproduced, and §2.8's per-cluster rule stays inert.

Unchanged and still blocked on things code cannot supply: the **R1 device
matrix** needs a phone, **Piper audio** needs a voice-model licence chosen and
dated (now risk R7), the **sync Worker** is written and still undeployed, and
the **Indonesian copy** wants a native pass — now including the diagnostics
screen, the AI screen, the passage reader and 15 new drill explanations.

---

## v1.1.0 — 2026-08-11

**Every `§2` requirement now has an implementation.** v1.0.0 shipped with three
of them unbuilt — one of which had a table sitting in the schema since M0,
typed, indexed, exported, and written by nothing. This release closes that debt
rather than adding features beside it.

### §2.13 — the habit cue

The `Habit` row has existed since M0 and nothing ever wrote it. Onboarding never
asked for the implementation intention §2.13 requires, and no reminder was ever
scheduled.

The screen is now a sentence the learner completes in their own words —
*"Setiap hari setelah ___, saya latihan di ___"* — not a settings form.
Gollwitzer's finding is about binding the plan to a cue they already have, and
asking for a "reminder time" does not do that.

**What can honestly be delivered without a server is the whole design problem.**
Web Push needs VAPID keys and a per-device subscription: recurring cost, so
invariant 4 rules it out. That leaves Notification Triggers, which fires with
the app closed and is Chromium-only, and otherwise an in-app cue on the next
open after the time has passed. The screen names which of the two this device
gets. The rejected option is the easy one — take the permission, store a time,
never fire (D54).

### §2.14 — *"belum perlu"*

The learner can now decline any item. The only skip in the app before this was
placement's.

A skip is **not an answer**: it writes no card, no rating and no review log,
because invariant 0 forbids it and because filing a skip as a lapse would let a
learner exercising autonomy damage their own schedule. It records a request, and
the composer honours it for new items *and* for cards already due — a deferred
card stays due with its FSRS state untouched; only what is shown changes.

The window escalates 3 → 7 → 21 → 60 days and then stops, because §2.14 is
autonomy rather than deletion and a permanently vanished item could never be
reconsidered (D55).

### §9 — the weekly recap

The last §9 line, flagged at M5 as needing a product call. It lives on the
progress screen with the rest of §9.

The arithmetic is easy; the restraint is not. No total, no score, no target — a
quiet week is a fact, not a shortfall, and there is no "you missed three days"
because that sentence has no use except to make someone feel behind. "First met"
is read from the learner's whole history rather than the window, or a word met
months ago would be relabelled new every week. The comparison with the previous
week is withheld until the profile is two weeks old, because comparing a first
week against a range that did not exist manufactures a decline out of being new
(D56).

### Measured

| | v1.0.1 | v1.1.0 |
|---|---|---|
| unit tests | 609 | **653** |
| e2e tests | 32 | **41** |
| initial JS, gzipped | 125.6 KB | **128.3 KB** (64% of budget) |
| §2 requirements with an implementation | 12 of 15 | **15 of 15** |

Schema v5, additive. No migration risk: `deferredItems` is a new table and no
existing row changes shape.

### Fixed

**The attribution screen was naming a dataset the build does not use.**
`jmnedict` entered `datasets` at M6 for proper-name disambiguation that was
never implemented — no fetch step, no parser, no shard referencing it — so the
screen has been claiming it since. Demoted to `candidates`, removed from
`NOTICE.md`, and `npm run check:licenses` now fails on any declared dataset that
no asset references, which is the mirror of the rule it already enforced. Found
by building the guard that stops a voice model being promoted before its clips
exist (`docs/AUDIO-RUNBOOK.md`).

### Not in this release

Unchanged and still blocked on things code cannot supply: the **R1 device
matrix** needs real phones, **Piper audio** needs a voice-model licence chosen
and dated before a clip may enter `assets/`, the **sync Worker** is written and
still undeployed, and the **Indonesian copy** wants a native pass — now
including the habit and recap strings added here.

Also still open, and a product decision rather than a defect: the app teaches
**one language at a time** while `targets` is an array and first run offers a
multi-select (D53).

---

## v1.0.1 — 2026-08-11

Five bugs, all one idea held in too many places. `targets[0]` is the language
being taught — the content loader, item queue, drill picker, ability estimate
and speech probe all read it — but nothing kept the things derived from it in
step when it changed. Reported from the live build.

### Fixed

- **Choosing the other language did nothing.** The home control *appended* to
  `targets` instead of changing which language was active, so tapping "Bahasa
  Jepang" while learning English changed a heading and kept teaching English.
  It is now a switch: the chosen language moves to the head, and the other one
  keeps its cards, its ability estimate and its own unfinished session.
- **An unfinished session followed the learner across languages.** `Session`
  recorded no language and resume was found by profile alone, so an English
  queue resumed under a Japanese heading — and logged against Japanese.
  Sessions now carry `lang` and resume is scoped to it, which makes the failure
  structurally impossible rather than merely fixed.
- **The skill check never appeared for a newly chosen language.** The placement
  offer was computed at boot and never recomputed, so a learner who had been
  placed in English was treated as placed in Japanese, and a first-time
  Japanese learner could not be placed at all.
- **One speech verdict spoke for every language.** The TTS probe cached a
  single app-wide result, so on a device with an en-US voice and no ja-JP one —
  the configuration R1 names as most likely on a cheap Android — English
  vouched for Japanese: audio reported ready, L4 dictation and mora
  minimal-pair drills scheduled, and nothing to speak them with. The verdict is
  now per language (D29 amended).
- **A first-time Japanese learner started in kanji.** `scriptMode` was computed
  once at profile creation, so a learner who began in English carried `kanji`
  into Japanese, skipping the kana entry point §4.3 requires. It is recomputed
  on switch, and only when Japanese is genuinely new — `kanji` is also the top
  of the script ladder, and resetting on its value would demote someone who had
  earned it.

### Tests

596 → **609 unit tests**, 29 → **32 e2e**. The three e2e tests were confirmed
red against the unfixed build before being taken as green. Bundle unchanged at
125.6 KB.

### Still open

The app teaches **one language at a time**, while `targets` is an array and
first run offers a multi-select. Nothing is lost — each language keeps its own
progress — but a learner who picks both on first run is taught only the first,
and the home screen now names the active one rather than both. Making the
composer interleave two languages is a product decision, not a bug fix (D53).

---

## v1.0.0 — 2026-08-11

The first release. An offline-first PWA that teaches **English and Japanese to
Indonesian speakers**: no account, no paywall, no ads, and none of the
engagement mechanics the category runs on.

The premise the whole thing was built against: a learner in Bogor taps an icon
on a cheap Android phone and is answering a *useful* question within three
seconds, offline — useful because a memory model predicts they are about to
forget it, or because it targets a mistake Indonesian speakers specifically
make.

### What ships

**The practice loop.** FSRS scheduling via `ts-fsrs`, a seven-rung card ladder
(L0 exposure → L6 free production), a session composer that interleaves card
types, and lossless resume. One active card per item; the rung selects the task
and FSRS state carries across promotion. Nothing advances without a learner
response — there is no browse-the-list study mode, and that is enforced by the
data layer rather than by convention.

**Level awareness.** Adaptive placement in under 90 seconds — a 1PL item loop
and a Yes/No pseudoword check folded into one sequence of single taps, with
false-alarm correction for over-claiming. Placement is offered and never
enforced; skipping costs nothing. New items come from the learner's frontier
band, and the new-item allowance throttles itself against projected review load.

**The Indonesian-L1 contrastive engine** — the differentiator. Authored
Indonesian notes in a fixed three-part order (*what Indonesian does*, *what
English does instead*, *one minimal pair*), targeted drills, and interference
detection on ordinary wrong answers so the heatmap is built from what a learner
does when they are **not** being tested on it. English: 21 categories, 116
drills, 75 curated false friends. Japanese: 14 categories and 32 drills, six of
which name a **positive transfer** — the shared five-vowel system, open CV
syllables, familiar numeral classifiers, no plural/article/gender marking, topic
fronting as a bridge into は, and politeness registers a ngoko/krama speaker
already has the instinct for.

**Japanese.** 15,324 sentence pairs (5,919 direct Indonesian, 9,405 triangulated
through English, every one carrying its route and bridge id), 6,904 lexemes, and
all 1,748 kanji with component breakdowns. Kana→kanji script ladder, furigana
that fades per token as the kanji in it stabilise, and editable mnemonics that
survive a stale backup.

**The graded reader.** A feed of level-matched sentences with tap-to-gloss and
one-tap mining, entirely local — an e2e test cuts the network before tapping.
Mining records an intention rather than minting a card; the word arrives in the
next session and becomes a card when it is answered.

**Progress, honest by construction.** Vocabulary estimate with an asymmetric
interval (counted floor, extrapolated middle, unsampled bands added whole),
coverage curve, retention against target with a confidence interval, 14-day
forecast, skill radar, and calibration. Every figure has an explicit *not
measured yet* state and shows it. Charts take `number | null` and draw a gap for
null, so "no data" can never render as a bar of zero.

**Offline and ownership.** Installable PWA, fully functional after first load
with the network cut. All data is local; JSON export and restore need no
account, and a restore merges the append-only review log rather than replacing
it, so it can never destroy history.

**Optional sync**, off by default and structurally so: nothing in `src/features`
or `src/data` imports the sync module, there is no boot registration, timer or
listener, and no default endpoint. An e2e test drives a full session and asserts
that **zero requests leave the origin**.

### Measured, on this build

| | budget | actual |
|---|---|---|
| icon tap → first answerable question | ≤ 3 s | **1.4 s** |
| initial JS, gzipped | ≤ 200 KB | **125.5 KB** (63%) |
| initial CSS, gzipped | ≤ 40 KB | **6.5 KB** (16%) |
| first-load precache, both languages, bands 1–3 | ≤ 8 MB | **1.31 MB** gzipped (5.38 MB raw, 30 entries) |
| unit tests | — | **596**, 39 files |
| e2e tests | — | **29**, emulated Pixel 5 |
| datasets declared and attributed | 100% | **7**, 38 asset files traced |
| §2.8 interleaving over 1,000 generated sessions | 0 violations | **0**, 0 relaxations |
| recurring cost | zero | **zero** |

English corpus: 23,497 banded sentence pairs, 5,245 lexemes. Band 1 is 481 words
and **70.3% of every token** in the corpus we teach from; mastering everything
shipped reaches **87.3%**, not 100% — proper nouns are filtered out of the
inventory and band 6 is not shipped, and the app says so rather than letting the
learner infer that the last 13% is their fault.

### What this release deliberately does not do

No streak that can break. No lives, no gems, no leaderboards, no XP divorced
from measured ability. No CEFR or JLPT level claim, because no licence-cleared
alignment exists and inventing one from corpus frequency is exactly the fake
precision the spec bans — frequency bands are the honest signal. No AI layer:
the core loop never calls a model, and there is no flag pretending otherwise.
See `docs/ETHICS.md`.

### Known limitations, stated rather than buried

- **The pre-cached audio clip set is empty.** Tatoeba audio is licensed per
  contributor, some clips with no licence at all, so nothing may enter
  `assets/` under it. The per-item fallback chain is built and tested and has
  nothing to serve, so on a device whose speech engine is dead, L4 dictation is
  withheld everywhere. The app stays fully usable: a silent device skips L4 and
  nothing else — promotion runs 3 → 5 — and the home screen says in Indonesian
  that listening practice is hidden and why.
- **The speech device matrix has never been run on real hardware.** Every
  degradation path is tested against stubs. What is unverified is whether the
  500 ms liveness deadline is right on a cheap Android, and whether iOS
  Safari's user-gesture requirement costs real learners their listening
  material. See R1 in `docs/DECISIONS.md`.
- **The sync Worker has never been deployed or run.** Client, delta format and
  merge rules are unit-tested; the free-tier limits were read from Cloudflare's
  documentation on 2026-08-11, not measured against a live account. The app has
  never depended on it.
- **No per-word dictionary.** No Indonesian gloss source is licence-cleared, so
  meaning is anchored in translated sentences. The reader's word panel shows
  what the app knows and says plainly that there is no dictionary.
- **L6 grades on whether the target word was used**, and tells the learner that
  is what it checks. There is no grammar model here and inventing a quality
  score would add a number nobody could defend.
- **The Indonesian copy has not had a native pass**, particularly the Japanese
  drills, the phonology tips and the reader's word panel.
- **Kanji component groupings are a derived heuristic** (`UNVALIDATED` in the
  source), firing on 1,149 of 1,748. Raw KRADFILE radicals ship alongside, so
  nothing is lost where a grouping is wrong.
- **Frequency is type-level with no POS tagging.** The exposure card for the
  article *a* can pick *"She got an A."* Real, visible, and not worth a tagger
  yet.

### Attribution and licences

Content derives from Tatoeba (CC BY 2.0 FR), and JMdict / JMnedict / KANJIDIC2 /
KRADFILE (EDRDG, CC BY-SA 4.0, share-alike) plus IPAdic for build-time
tokenization. Japanese shards ship **CC BY-SA 4.0** — mixing Tatoeba with EDRDG
takes the stricter term. EDRDG requires acknowledgement in the UI, so the
in-app attribution screen renders from `data/licenses.json`, the same file the
CI gate reads: a dataset cannot enter the build without appearing there, and
sources listed as uncleared candidates never appear. Full terms in `NOTICE.md`.

**The code licence is still `UNLICENSED`** (D12). EDRDG's share-alike binds the
data, not the code, so this is a free choice — and it should be settled before
the repo is public.
