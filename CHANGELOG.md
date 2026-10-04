# Changelog

All notable changes to LinguaKu. Dates are ISO. This file is the release
record; `docs/PROGRESS.md` is the per-milestone engineering log behind it.

---

## v1.28.0 — 2026-10-04

### Removed — an index nothing ever wrote to

`items.*interferenceTags` was declared in schema v1 and documented as *"a
multi-entry index so the contrastive engine can pull drills by category"*. M4
built that engine and it pulls drills from the compiled `contrastive.json`; the
error tagger reads the learner's answer text instead.

Nothing ever queried the index, and nothing ever wrote a tag: 0 of 5,245 English
and 0 of 6,904 Japanese shipped lexemes carry one, and the required `Item` field
was set to `[]` at all three of its writers. Invariant 8's *"do not build a seam
for a feature two milestones out"*, found two milestones out.

Dropped in schema v8. Index-only, so no row moves, and `items` is generated
content that is not in the export bundle — the migration test upgrades a real v7
store and counts them.

### Documented — §2.9's error-triggered note is English only

`detectInterference` can emit seven category ids and the Japanese pack shares
none of them, so a Japanese wrong answer is tagged with nothing. No wrong data
results — the session filters hits against the active language's pack — but the
contrastive note never appears.

Not fixed: writing は/が and に/で heuristics against a typed answer is the
wrong-tag risk D34 refuses, in a language that needs a native speaker to check
the output. Recorded in `docs/SCIENCE.md` §2.9 with the measurement, and §2.9's
status no longer says "Japanese waits for M6" — the content shipped in M6 and
compiles 14 categories.

915 unit · 74 e2e.

---

## v1.27.0 — 2026-10-04

### Fixed — the Japanese placement check had nothing to catch over-claiming

SPEC §4.2 asks for a Yes/No vocabulary check *with generated pseudowords*, and
`pseudoword.ts` says what happens without them: *"a Yes/No test without
pseudowords measures confidence, not vocabulary — a learner who says yes to
everything scores 100%."*

Only English ships a `pseudowords.json`. `loadPseudowords('ja')` 404s, the
screen catches it into an empty list, no pseudoword is ever shown, and
`correctedAbility` returned the raw estimate with its raw standard error —
indistinguishable from one that had been checked. Nothing documented it.

- `wasControlled` makes the absence explicit instead of a silent `return raw`.
- The result screen says so: *"Buat bahasa ini kami belum punya kata-kata
  jebakan, jadi angka ini murni dari jawabanmu sendiri."*
- The estimate is not discarded — it is still the honest reading of the answers
  given — and no discount is invented for it, because there is no measurement
  behind one.

Filed as **R10**. Generating Japanese pseudowords risks emitting a real word,
which would make the correction wrong rather than absent, so the fix needs a
native speaker — the same category as R7's voice licence.

### Changed

- `placement.result.overclaimed` said *"bukan bahasa Inggris"*. It says *"bukan
  kata asli"* now, which is true in any language.

913 unit · 74 e2e.

---

## v1.26.1 — 2026-10-04

### Fixed — the heatmap said "your English patterns" to Japanese learners

§3.3's contrastive heatmap was headed *"Pola bahasa Inggrismu"* with no language
in it, so a Japanese profile saw that sentence above は dan が, hiragana dan
katakana, and あげる・くれる・もらう.

The data underneath was correct — `allCategoryScores` is scoped by language — so
no test caught it: every assertion about the heatmap was about its rows. Found
by reading the screen after v1.26.0 moved the numbers on it.

910 unit · 74 e2e.

---

## v1.26.0 — 2026-10-04

### Fixed — the Japanese capability figure was a percentage of itself

`build-en.ts` states the rule where it computes the English number: *"a learner
who mastered every word we ship would still not reach 100%… reporting a
percentage without saying what it is a percentage of would overstate it."*
English comes out at 0.873. Japanese came out at **1**.

Its `counts` map was built over `pair.lemmas` — the tokens that had already
passed `TEACHABLE_POS` — and divided by the sum of that same map, so every share
was a fraction of what the app already covers and they summed to exactly 1 by
construction. §9's copy rendered it as *"kalau semua kata yang kami punya kamu
kuasai, angkanya sampai 100%"*: master our inventory and you understand
everything you read, for a language where particles alone are a large share of
running text.

The denominator is now every word-like token — particles and auxiliaries in,
punctuation out, because English's tokenizer strips punctuation and counting it
on one side only would make the two figures mean different things.

**63,065 teachable words of 117,729 running ones: 53.6%.** Band 1 falls from
69.6% to 37.3%. R9 independently measured Japanese token resolution at 53.0%
from a different direction, which corroborates it.

### Changed

- Both capability sentences take the language. *"Sisanya nama orang dan kata
  yang sangat jarang"* is true of English's missing 12.7% and false of
  Japanese's missing 46.4%, which is grammar the app teaches through sentences
  and drills rather than as vocabulary. Correcting the number without the
  sentence would have swapped one false statement for another.
- The five Japanese lexeme shards and the manifest change hash, so Japanese
  learners re-download them. Invariant 10's documented price for a content
  change.
- `CLAUDE.md` now lists `ingest:ja`, and warns that it rewrites `manifest.json`
  from scratch: `ingest:chunks`, `ingest:glosses` and `ingest:topics` have to
  re-run after it. `chunks.test.ts` catches the omission and the build goes red,
  but its message does not say what to do about it.

908 unit · 74 e2e.

---

## v1.25.1 — 2026-10-04

### Removed — three exports that claimed a caller they did not have

D90's rule is *nothing is exported that nothing reads*, and the scan enforcing
it counted test files, so it could never see this class. Rerunning it over
non-test source finished the list D96 opened.

- `preview` promised *"so the UI can show real intervals on the answer
  buttons"*. There are no answer buttons: this app grades the learner's answer
  and derives the rating, so there is nothing for a four-way preview to label.
- `isMined` and `pendingMined` duplicated `minedItemIds`, and `pendingMined`'s
  comment described a prioritisation `newCandidates` already performs.

### Changed

- `getCategoryScore`, `isContentReady`, `ttsReport` and `GRADES` are kept and
  now say they are test seams. Each is how a test reads a property the app
  really has, and deleting them would have degraded the tests —
  `allCategoryScores` has no default, so routing the contrastive tests through
  it would lose the behaviour under test.
- `GRADES`'s comment said "the four things a learner can say about a card",
  which describes a different app. Nothing here asks them, and Easy is never
  produced at all.

### Fixed

- `knownItemIds` inlined `isKnown`'s body, so §2.4's 0.6 threshold had two
  definitions in neighbouring files agreeing by coincidence. It delegates now.
- The L4 dictation length gate counted `tokenizeLatin(anchor.text)` — D99's
  defect again. Over the shipped band-1 anchors it admitted 100% of them where
  real tokens admit 99.9%. It counts the anchor's own tokens now.

902 unit · 74 e2e.

---

## v1.25.0 — 2026-10-04

### Fixed — the Japanese reader was offering four sentences out of 2,152

`coverageOf` tokenized with `tokenizeLatin`, which finds no Japanese words: it
splits on punctuation and returns the runs between. So a Japanese sentence's
§2.4 coverage was decided by where its commas fell. `彼はよく学校を欠席する。`
scored **0.00** (one run, no match) while `あの、すみません...` scored **1.00**,
because `、` and `.` split it into two runs that happened to be lexeme ids.

2,148 of 2,152 band-1 anchors were dropped, and the four that survived were all
interjections — the least useful reading material in the corpus, since §2.4
wants comprehensible input *with something new in it*.

Two more selectors ranked on the same number. `selectGraded` rejected every
Japanese anchor as below the floor and fell through to "the first one", so
§2.4's i+1 choice was a no-op for a whole language; and `buildCandidates`
carried a comment explaining the zeros as a dictionary-form mismatch, citing a
figure that had been measured through the same broken function.

This is v1.15.1's defect in a second place, and the same fix: **take tokens, not
text.** `coverageOfTokens` is the implementation and `coverageOf` is the
Latin-only convenience in front of it, so English is unchanged by construction.

Counted through the real selector over the real shard, the reader goes from 4
sentences to **113** at band 1, 187 at bands 1–3, and 249 knowing every word the
app ships — with coverage figures that are measurements rather than artifacts.

### Added — the script ladder reaches the reader

§4.3's romaji → kana → kanji now applies to the reading feed as well as the
practice card, with §10's per-kanji furigana fade. A control labelled "Tulisan
Jepang" previously took effect on one screen and not the other.

- `TextPart` separates what is shown from what a tap *means*. Kana and romaji
  rewrite the surface, and the lookup behind the word has to reach the token the
  sentence contains, or the reader stops being able to gloss anything in kanji.
- Ruby renders inside the word's button, so `TappableText`'s roving tabindex and
  invariant 35's one-stop-per-block promise are untouched.

### Changed

- **R9 is corrected.** Two of the figures it was filed with had been measured
  through the broken `coverageOf`. "294 of 300 band-1 anchors score exactly 0"
  re-measures to **6 of 300**, mean coverage **0.428**. The risk stands
  unchanged in substance — 0.428 is still far below §2.4's 0.92–0.98, because
  particles are not vocabulary — but the number is now a measurement.
- `buildCandidates` keeps its coverage gate off for Japanese: the real figure
  clears `BUILD_MIN_COVERAGE` for only 21 of 2,152 anchors, against the 1,521
  buildable sentences v1.15.1 recovered. It is now a choice against a real
  number rather than a limitation.

906 unit · 74 e2e.

---

## v1.24.1 — 2026-10-04

### Fixed — a bad moment was remembered as a fact

All three in-memory content loaders — glosses, topics and the reader's sentence
shards — wrote the result of a *failed* fetch into their cache. Each reasoned
correctly about the first call and not at all about the second: one flaky
moment, offline before a shard had been cached or a service worker still
installing, became permanent for the rest of the session even after the network
came back.

The gloss case is the worst and is undetectable. Every word in the band reports
*"Kata ini belum ada di kamus kami"* — invariant 38's false branch — and D59
measured gloss coverage at 30% of English lexemes and 4% of Japanese, so a wrong
"no entry" looks exactly like a right one.

Topics are silent by design: a topic only reorders new items (invariant 33), so
an un-topiced session is indistinguishable from a learner who chose no topic.
Sentences cost money: §5.4's learner is on mobile data and D80 makes the reader
state its download before spending it, so a cached failure means the reader
reports itself empty after the learner agreed to pay.

`fetchShard` draws the line: **a 404 is a fact about the build and may be
remembered; anything else is a fact about right now and may not.** Japanese
ships gloss shards for bands 1–2 only, so simply never caching would re-fetch a
genuinely absent shard once per card. Each loader still returns its empty value
on failure — it no longer writes it down.

### Changed

- `clearGlossCache`'s comment claimed it was "also used when a language switch
  invalidates what is in memory". The cache is keyed `lang:band`, so a switch
  needs no clearing, and nothing outside the tests calls it. It is a test seam,
  and now says so.

899 unit · 72 e2e.

---

## v1.24.0 — 2026-10-04

### Added — a word you set aside can be asked for again

SPEC §2.14 is autonomy, and autonomy includes changing your mind.
`deferrals.ts` says so itself: *"§2.14 is about autonomy rather than deletion,
and a permanently vanished item cannot be reconsidered."* `undeferItem` was
written for it — *"Undo, for a learner who changes their mind"* — and no screen
called it.

The window escalates: 3 days at the first skip, then 7, 21 and 60. "Belum perlu
kata ini" is a 56px control in the thumb zone directly below the primary action,
so a mis-tap removed a word for up to two months with no way back.

- The glossary now lists the words the composer is still leaving alone, soonest
  to return first, each with the day it would come back on its own and a button
  to ask for it now. It sits outside the search-dependent branch, so a learner
  hunting for a word they set aside finds it whether or not they have answered
  anything yet.
- It is in the glossary rather than the session on purpose: an answered card
  retires (invariant 39) and a skip leaves no card at all, so a control reaching
  back into it is the second code path D77 refuses.

### Changed

- `undeferItem` **expires** the deferral instead of deleting the row. `times` is
  the escalation record and `deferredItemIds` already keeps lapsed rows for that
  reason; deleting would have treated a learner who declined four times and
  reconsidered once as one who had never declined at all.

892 unit · 72 e2e.

---

## v1.23.0 — 2026-10-04

### Added — the script ladder nobody could see

SPEC §10 lists *"Furigana auto-fades per-kanji as stability rises"* among the UX
requirements, and §4.3 defines the ladder: romaji → kana → kanji. M6 built all
of it — `furiganaFor`, `isFaded`, `kanjiIn`, D42's token-level ruby, and
`Profile.scriptMode`, written at first run and re-derived on a language switch.

`furiganaFor` was called by no screen, and `scriptMode` was read by none. A
Japanese learner saw raw kanji with no readings, permanently, while the database
recorded them on the kana rung.

- Sentences in a session render through the ladder, with per-kanji fading. The
  tokens, readings and stability ride on the task; the segments are built in the
  view, because the mode can change while a card is on screen and stability
  cannot. A kanji with no card is `null`, never `0` — null means never studied,
  which is exactly when the reading is needed.
- `headwordIn` writes the word chip and the free-production prompt at the same
  rung as the sentence. Rendering かれはよくがっこうをけっせきする。 above a chip
  reading 欠席 put the learner at two rungs at once. `headword` stays the answer
  and what a verdict shows, so display and grading cannot drift.
- Romaji is set with spaces. `karehayokugakkouokessekisuru` defeats the only
  thing that rung exists for; `furigana.test.ts` had asserted the spaced form
  since M6 and no renderer honoured it. The separator is suppressed before
  closing punctuation so `suru。` stays attached.
- A script-mode control on the home screen, Japanese-only. Part of the minimum
  rather than a follow-up: kana mode *replaces* kanji, so the renderer without a
  control would have meant a Japanese learner never saw one.
- `<ruby>` with `<rp>` brackets rather than positioned spans — it wraps with the
  line, survives text zoom, and `rt` inherits its colour.

### Changed

- The dead-export scan now excludes test files. An export whose only caller is
  its own test is not covered code; it is code that was built and never
  connected, which is this repository's most common defect. The rerun found
  fifteen names.

886 unit · 71 e2e.

---

## v1.22.0 — 2026-10-04

### Fixed — the app marked its own output wrong

SPEC §2.7's acceptance criterion names *"romaji↔kana equivalence"* first. The
grader carried a note where the implementation should have been — *"Romaji↔kana
equivalence is M6 and plugs in as another normalization pass"* — and M6 shipped
`src/core/kana.ts` with every conversion it needed. Nothing plugged it in.

Two live consequences.

**`KanaInput` has a katakana toggle**, so the app handed the learner a button
that writes ネコ and then graded ネコ against ねこ as two mistakes at a tolerance
of zero: flatly wrong, not even a near-miss. Half-width katakana from an IME
failed the same way.

**`KanaInput` has no kanji conversion step**, and 71.9% of the Japanese lexemes
this app ships are written with kanji (4,963 of 6,904; 97.1% of those carry a
hiragana reading). The production rung grades against the headword, so for most
of the vocabulary the expected answer could not be typed at all, and the reading
was marked wrong. §4.3 starts a Japanese learner at `kana` script mode, the rung
below kanji — so asking for 私 while teaching わたし grades a rung they have not
reached.

Against the unfixed build, answering 私 with わたし returned *"Jawabannya “私”.
Kita pelan-pelan lagi untuk kata ini."* — wrong **and demoted**. The demotion is
a `ReviewLog` row, and that log is append-only (invariant 1), so it is not a bad
grade but an uncorrectable one, and it lands in the retention rate §9 reports.

### Changed

- `foldKana` (NFKC, then katakana → hiragana) and a romaji route, both gated on
  kana appearing in the expected answer: `romajiToKana('bank')` is ばんk, and
  comparing that could only ever make English grading worse.
- Where kana is involved the edit distance is measured on one script. タベマス
  against たべます is not five mistakes.
- `acceptedAnswers` puts the reading beside a kanji headword, headword first
  because that is the form the verdict shows. The cloze rung gets it too —
  `makeCloze` slices the matched headword out of the sentence, so a cloze answer
  *is* the headword — and the free rung checks `usesWord` against every form.
- New `GradeReason: 'script'`. Internal: the UI reports correct, near-miss or
  wrong and never the reason.
- `isKana`, `toHiragana` and `romajiToKana` now have callers outside their own
  tests. `docs/SCIENCE.md` §2.7 no longer says "M6".

881 unit · 69 e2e.

---

## v1.21.0 — 2026-10-04

### Fixed — sync did not carry what three documents said it carried

SPEC §2.11's acceptance criterion is *"every kanji item renders its component
breakdown; **user-authored mnemonics persist and survive sync**."* The type
comment over `Mnemonic` says a learner's edit "wins on sync"; `mnemonics.ts`
quotes the criterion in its own doc comment and calls `authoredByUser` the
tiebreaker it asks for; `docs/SCIENCE.md` restated it and marked §2.11
*planned*.

A `Delta` carried no mnemonics, and never had. The one piece of content in this
app the learner writes themselves — asked for *because* self-generated
mnemonics beat given ones — never left the phone it was typed on, and
`authoredByUser` was a tiebreaker with nothing to tie against.

Two more defects sat beside it in the same function.

**The heatmap contradicted its own log.** `DrillAttempt` rows travelled and the
`CategoryScore` they produce did not, and `recordDrillAnswer` is the only writer
of contrastive state (invariant 15), so a merge cannot rebuild one. A second
device held twenty answers in its append-only log while the §3.3 heatmap read
`attempts: 0` off the missing row and told the learner to answer five more
(invariant 16). Invariant 18 exists to stop an *unmeasured* figure being drawn
as zero; this was a measured one, drawn as zero, with the measurement in the
same database.

**A session that straddled a sync was dropped permanently.** `pendingDeltas`
selected sessions by `startedAt >= since`, so a session begun before a sync and
finished after it sat behind the cursor forever, with every review in it. §2.13
persists `resumeCursor` after every single answer precisely so a session
survives interruption, which makes straddling the ordinary case. Sessions are
now selected by when they **ended** — it cannot be "push it unfinished and
replace it later", because the Worker does `ON CONFLICT(session_id) DO NOTHING`
— and rows are read from the earliest session being pushed rather than from
`since`, or the fix would have sent a session missing half its history.

### Changed

- `DELTA_VERSION` is 2. A version 1 delta from a device that has not updated
  still reads: refusing its session over two absent fields would lose review
  history, which is the one unrecoverable outcome.
- `localMnemonics` and `localScores` are **required** on `MergeInput`, not
  defaulted. A caller that forgot them would silently discard the learner's own
  text, so the compiler asks. Nine call sites were reviewed as a result.
- The sync cursor is taken *before* the read instead of `Date.now()` after the
  write, which had skipped anything written while the request was in flight.
- The sync screen names what it uploads, and what it does not. Consent was
  asked for *"riwayat latihanmu"*; free text the learner typed is not that.
- `docs/PROGRESS.md` had stopped at v1.15.0 while the app was at v1.20.1.
  Nine releases are indexed there now; their reasoning was already in
  `docs/DECISIONS.md` as D84–D93.

864 unit · 69 e2e.

---

## v1.20.1 — 2026-10-03

### Fixed — the app claimed a reminder it had not set

Invariant 24 says a reminder is local or the screen says it is not one, and
`scheduleReminder` returns whether anything was **actually** scheduled for
exactly that purpose. Its own comment calls the failure *"the speech-probe
failure again: report not-scheduled rather than assume it worked"*.

**Both callers discarded the boolean.**

`reminderSupport()` only says the API exists. A browser can advertise it, grant
permission, and then refuse the call — and the learner was shown *"HP ini bisa
mengingatkan walau aplikasinya tertutup"*, navigated away, and got nothing.

The habit screen stays put now and says the reminder could not be set and that
the in-app cue will carry it instead, which is true and is what §2.13's fallback
exists for.

The e2e drives it with a browser that claims the capability and throws on use,
and was checked against the unfixed screen to be sure it failed. The lesson is
the one M4 already learned about speech and wrote down: **a capability check is
not a result.**

854 unit · 68 e2e.

---

## v1.20.0 — 2026-10-03

### Changed — a failed sync says what to do about it

`SyncOutcome` carried the raw string and the screen printed it. An Indonesian
learner met **"Gagal: HTTP 401"** and was left to work out what that meant.

401 is the commonest failure there is — a token that does not match — and it is
the one case where naming it *is* the remedy. It also became the likely case the
moment the Worker went live with `SYNC_TOKEN` unset, which answers 401 to
everything.

| was | is |
|---|---|
| Gagal: HTTP 401 | Token-nya tidak cocok dengan server. Periksa lagi token di atas. |
| Gagal: HTTP 404 | Alamat itu tidak punya layanan sinkron. Periksa lagi alamatnya. |
| Gagal: Failed to fetch | Server tidak bisa dihubungi. Periksa koneksimu, lalu coba lagi. |
| Gagal: HTTP 503 | Servernya sedang bermasalah. Coba lagi nanti. |

The distinction that matters most is the last pair: `fetch` **rejects** when it
cannot reach the host at all — offline, wrong hostname, blocked — rather than
resolving with a status. Telling that learner to check their token would send
them to fix something that is not broken.

`detail` keeps the raw text for anyone reporting a problem; it is just not the
sentence they are shown first. Every message still ends by saying the data on
this phone is unchanged, which is always true and is what a learner actually
wants to know.

854 unit · 67 e2e.

---

## v1.19.2 — 2026-10-03

### Fixed — a failed import told you something untrue

`parseBundle` has distinguished three failures since M5: not JSON, not a bundle,
and **a bundle from a newer version of the app**. The screen collapsed all three
into one sentence — *"File itu bukan salinan LinguaKu"*, that file is not a
LinguaKu backup.

For the third case that is simply false. It *is* a LinguaKu backup. Saying it is
not sends the learner hunting for a different file when what they need is to
update the app — and leaves them believing their backup is corrupt.

Each reason has its own sentence now, and the newer-version one names the
version it read and says the data is safe. An unexpected failure gets its own
too, because "not a LinguaKu backup" is equally untrue of a database error.

All four state that current data is unchanged, which is a promise the database
keeps rather than a reassurance: `importProfile` runs inside one `rw`
transaction, so a failure part-way rolls the whole thing back.

This is the screen where someone hands over their entire history. It is the last
place to be vague about what went wrong.

849 unit · 67 e2e.

---

## v1.19.1 — 2026-10-03

### Added — sync says what it is about to upload

`deltaSize` has existed since M7 *"for the workload note in the settings
screen"*, and the note was never written. Sync is the one thing in this app that
**sends**, and the learner it is written for is on mobile data — the same
argument v1.13.0 makes for the reader's download.

> Sekitar 4 KB menunggu dikirim.

Null while it is being read, never a flashed zero (invariant 18).

### Removed — five exports nothing read

Invariant 8 bans dead scaffolding; seven exports had accumulated behind it,
found by the same scan that turned up shadowing and the audio that never
stopped. Two became features. Five are gone.

One is worth naming: **`RESERVED_SHARE`** declared §7.2's 15% reservation as a
constant while `composeSession` has always let spare time spill back into
reviews — it asserted a behaviour the code did not have. The fact now lives in
the comment that explains the split, where it cannot drift out of agreement with
a value nothing reads. **`LADDER_TASKS`** went the same way and took a stale
claim with it: *"L4–L6 … not yet reachable"*, untrue since `MAX_ENABLED_LEVEL`
became 6.

The scan is clean: no export in `src/` or `scripts/` now appears only at its own
declaration.

845 unit · 67 e2e.

---

## v1.19.0 — 2026-10-03

### Fixed — audio played over the top of the next card

Tap "Dengarkan", then advance. The sentence kept reading, over the card that
replaced it.

`cancelSpeech` was written at M4 and **called by nothing**. `playClip` pauses
its element only when starting a *new* clip, so neither route was covered.
`stopAudio` now handles both, and runs when a card is left and when the session
unmounts.

**No test could have caught this.** The browser the suite runs in has no speech
engine, so nothing ever plays. It was found by scanning for exports that appear
only at their own declaration — the single trace a capability that was built and
never wired leaves behind, and the same scan that turned up shadowing.

v1.17.0's shadowing made it much easier to hit by accident: the model plays on
demand, right next to the button that advances.

The learner's own recording is a plain `Audio` element that `stopAudio` does not
reach, so `Shadowing` pauses its own playback on unmount — the same bug by a
different route.

845 unit · 67 e2e.

---

## v1.18.1 — 2026-10-03

### Fixed — two more tables were missing from the backup, and now a test says so

Having found `buildAttempts` missing, I checked the rest of the schema against
the bundle. Two more were absent, and both are the learner's own **intent**:

- **`minedItems`** — a word they went looking for in the reader and asked to be
  taught (invariant 26). A restore lost it, so the word never arrived.
- **`deferredItems`** — a word they asked not to be shown yet (invariant 23). A
  restore lost it, so declined words came straight back.

Neither can be reconstructed from anything else. The bundle's own description is
"everything the learner made", and these are exactly that.

**The structural fix matters more than the two rows.** The bundle is a
hand-maintained list, and nothing failed when it fell behind the schema — which
is the only reason three tables could go missing without anyone noticing. A test
now walks `db.tables` and requires every name to be either carried in the bundle
or named as generated content (the shards: downloaded, identical for everyone,
re-fetchable). Adding a table and doing neither fails the suite.

Checked against the unfixed code to be sure it fails.

843 unit · 67 e2e.

---

## v1.18.0 — 2026-10-03

### Fixed — a backup silently lost every sentence you had rebuilt

`buildAttempts` arrived with sentence building in v1.15.0 and was never added to
the export bundle. A learner who exported and restored lost the lot — and with
it the share of §9's grammar axis those attempts carry, so the restored learner
was also scored lower than they had earned.

`drillAttempts` and `readingAttempts` were both already in. This one was simply
forgotten, which is the point: the bundle is a hand-maintained list that has to
be extended every time a table appears, and **nothing fails when it is not**.

It merges the way invariant 19 requires — UUID-keyed and append-only, so a
restore adds what it lacks and can never destroy evidence — and the field is
optional, so a bundle written before this release still restores. Exactly what
`readingAttempts` needed at v1.4.0, for the same reason.

Three tests, and the first was checked against the unfixed code to be sure it
failed.

### Removed — `authoredMnemonics`

Dead: it claimed to be "for the export bundle", and the export queries
`db.mnemonics` directly. Reading it to confirm that is what turned up the gap
above.

840 unit · 67 e2e.

---

## v1.17.0 — 2026-10-03

### Added — shadowing, which four documents already said existed

§8 lists *"shadowing (play → record → compare)"*. `docs/PROGRESS.md` recorded it
as shipped in M7, with a deviation row explaining why it has no score. The
launch checklist has a manual step for it. The README called the §8 catalog
finished.

It was not in the app.

The platform half was real and complete — `startRecording` samples a peak
envelope while recording and hands back a playable URL. So was every line of its
Indonesian: `Rekam suaramu`, `Merekam… ketuk untuk berhenti`, `Dengar
rekamanmu`, `Dengar contohnya`, `Bandingkan sendiri: mana yang beda?`.

**Nothing called either.** The component was the one layer missing, and the dead
export was the evidence — found by scanning for exports that nothing references.

It is offered at first exposure, because "listen and repeat" belongs where a
learner first meets a sentence, and **withheld on a device that cannot speak**
exactly as L4 is: there is nothing to shadow without a model. No score — M7's
recorded deviation, and the better tool anyway. A recognizer tells you whether a
*machine* understood you; your own ear tells you how far you are from the model,
and it works on every device with a microphone, which recognition does not.

It grades nothing and writes nothing, so §5.1's "never block progression on
speech" holds by construction.

837 unit · 67 e2e.

---

## v1.16.0 — 2026-10-03

### Added — the memory model shows its working

SPEC §1's thesis is that the item a learner meets is there *"because a memory
model predicts they are about to forget it"*. That has been true since M2, and
the app had never once shown it.

`slippingSoon` — which returns the words closest to being forgotten, in the
model's own order — was written, exported, and **called by nothing**. Dead by
invariant 8, and the most interesting query in the repository.

The progress screen now lists them, beside the forecast that says how many
reviews are coming:

> **Paling dekat terlupa**
> `as` `ask` `does` `first` `morning`

**No retrievability figure on screen.** It is a real number and tempting to
print, but a percentage beside a word reads as a mark out of a hundred — the
score §2.15 bans. The order carries the information.

It reads and advances nothing, so §2.2's ban on browsing-as-study does not reach
it, for the same reason the glossary does not (D67). And the empty state is the
ordinary one for a new learner: a card answered moments ago has retrievability 1
and is correctly not slipping, so it says so rather than showing a blank list.

837 unit · 66 e2e.

---

## v1.15.1 — 2026-10-03

### Fixed — sentence building was silently English-only

v1.15.0 shipped the new exercise with a Japanese explanation string that could
never render, because a Japanese learner never met the exercise at all.

`makePuzzle` took the sentence **text** and tokenized it with `tokenizeLatin`,
which returns a Japanese sentence as **one token** — it is one unbroken run of
letters. So `isBuildable` rejected every Japanese sentence, `buildCandidates`
filtered them all out, and the feature was absent for half the app's learners.
Nothing crashed. No test failed.

Japanese anchors ship build-time morphological tokens (D10) and all **2,152** of
them have them. The API takes tokens now, and the caller passes `tokensOf`,
which already knew the difference.

**Measured: 1,521 buildable sentences at Japanese band 1, against 0 before.**

Punctuation is dropped from tiles and decoys — the morphological tokenizer emits
。and ！as tokens of their own, and placing a full stop is not word-order
practice.

### Fixed — and the coverage gate would have rejected Japanese a second time

`coverageOf` carries the same Latin assumption, and it is worse than that:
Japanese lexeme ids are dictionary forms (`ja:lex:する`) while the shipped tokens
are surface forms (`読み`, `ます`). The ratio reads near zero — **294 of 300
band-1 anchors score exactly 0**.

Anchors are already the curated set a band's vocabulary is taught through (D19),
so band membership carries the level guarantee on its own. Coverage refines it
where it is measurable and is left out where it is not, rather than faked.

### Known, and not fixed here

The same mismatch degrades the **Japanese reader**: with 500 known lexemes it
returns 10 items where English returns 20. The real fix is shipping lemma ids
alongside the morphological tokens, which is a content-pipeline change and a
re-run of the Japanese ingest.

837 unit · 65 e2e.

---

## v1.15.0 — 2026-10-02

### Added — rebuild the sentence from its words

The variety half of the brief. Every card in the §8 catalog asks for **a word**
— pick it, type it, recall it, hear it. None of them asks the learner to put
words in the right **order**.

§3.1 names word order as a *systematic* Indonesian-L1 error rather than a
careless one: Indonesian is head-initial, so *mobil merah* comes out as "a car
red". The authored contrastive drills cover `NP_WORD_ORDER` with a finite
hand-written set; the corpus can generate practice for it without limit.

It is also the only card whose **interaction** is different — tapping tiles
rather than typing or choosing — which is the actual complaint being answered.
A session where every card presents identically reads as unstructured however
varied the pedagogy underneath it is.

> **Susun kalimatnya** — *Terima kasih banyak!*
> `Thank` `the` `much` `very` `your` `you`

Four decisions make it honest rather than a word-salad:

- **Anchors, not the full sentence shards.** Costs nothing extra on a metered
  connection (v1.13.0), and they are the sentences the band is already taught
  through.
- **Offered only when the learner already knows 80% of the sentence.**
  Reassembling words you do not know is a jigsaw, not a language exercise.
- **A decoy is never a word that is already in the sentence** — it would make a
  second, equally correct arrangement and then mark a right answer wrong.
- **Case and punctuation are not graded.** The learner was handed the tiles;
  marking them wrong for a capital letter they never chose is what §2.7 exists
  to prevent.

It takes two thirds of §7.2's reserved 15% for *"one input activity"* — a share
that had spilled into reviews on **every session ever composed**, because the
activity §7.2 names is the reader, which is a screen of its own.

Attempts land in their own append-only table for the third time and the same
reason (a sentence has no FSRS card), and they feed §4.2's **grammar** axis
alongside the contrastive drills, which is what word order is.

### Fixed — an optional extra could stop a session being planned

`buildCandidates` runs inside `planSession` and loads a content shard.
`loadAnchors` throws when the shard is not there — offline before that band was
cached, or any fetch failure — and that took the whole plan down with it. It
catches now and returns nothing. Found by the unit suite, which has no base URL
to fetch from; it would have reached a learner as a session that refused to
start.

### Measured on this build

| | |
|---|---|
| unit tests | **832**, 61 files |
| e2e | **65** |
| initial JS / CSS gzipped | **144.1 KB** / **6.8 KB** (budgets 200 / 40) |
| schema | **v7** — `buildAttempts`, additive, migration tested |

---

## v1.14.0 — 2026-10-02

### Added — the learning path: where you are, from 1 to the end

The app has had a curriculum since M1. Frequency order *is* one, and a strict
one. A learner could never see it, so an honest ordering read as an endless
queue of unrelated questions — which is a fair complaint about the app as it
stood, not a misunderstanding of it.

The progress screen now opens with the whole scale:

> **Kata yang sudah kamu kunci mencakup sekitar 44% kata yang muncul sehari-hari.**
>
> Tahap 1 · *Kamu di sini* · 300 dari 481 kata — *Kalau tahap ini selesai: 70% kata sehari-hari.*

**What makes this a path and not a level badge.** Every figure is measured from
the shipped corpus. Band 1 is 481 words, and those 481 words really are 70.3% of
all tokens — the pipeline has published that number since M1. "Finish this stage
and you will know seven words in every ten you meet" is a fact about English,
not a claim about the learner, which is precisely the claim invariant 9 forbids.

**Nothing unlocks, gates or expires.** SPEC §1 rules out "a course player with
fixed lesson order" and the loss-aversion mechanics that usually come with it;
what it does not rule out is telling someone where they are. The composer still
works across bands exactly as before. A stage is a position, not a door.

Two details carry the honesty:

- **Partial stages count.** A learner three-quarters through band 1 has not
  covered 0% of English, and rounding down to the last finished stage would make
  a true number read as a lie. Each band is credited in proportion.
- **The scale comes from the manifest, not IndexedDB.** Only the starter bands
  are imported (invariant 11), so building the stages from local items showed
  three stages out of five and claimed the app tops out at 82% when it teaches
  87.3%. Caught by looking at the screen, not by a test.

### Measured on this build

| | |
|---|---|
| unit tests | **817**, 60 files |
| e2e | **63** |
| initial JS / CSS gzipped | **142.6 KB** / **6.8 KB** (budgets 200 / 40) |

---

## v1.13.1 — 2026-10-02

### Fixed — free production counted "banana" as "an", and refused "took" for "take"

§2.3's L6 rung grades the one thing §2.3 says is honestly checkable: whether the
learner used the word. It did that with `sentence.includes(word)`.

| sentence | word | before |
|---|---|---|
| I have a banana. | **an** | counted |
| I want to educate people. | **cat** | counted |
| She is honest. | **on** | counted |
| I took the bus yesterday. | **take** | **rejected** |
| He studies every night. | **study** | **rejected** |

The false positives land on band-1 function words — the most-taught vocabulary
in the app. The false negatives are worse: a learner who produced the word in
the form their sentence needed was **blocked from submitting**, which is the
unfair "wrong" §2.7 exists to prevent.

`src/core/usage.ts` tokenizes, which fixes the first three outright, and knows
regular inflections by rule plus the common irregulars by table.

**And it asks rather than blocks.** The matcher is incomplete by construction,
so a miss now says *"we did not find it"* rather than *"you did not write it"*,
and saying it again sends the sentence. Something that is merely usually right
must not have the last word over a learner reading their own sentence.

Japanese keeps substring matching, and the module says why: the morphological
analyser is build-time only, so there is no honest way to tokenize a learner's
own Japanese sentence at runtime.

809 unit · 61 e2e.

---

## v1.13.0 — 2026-09-20

### Added — the reader says what it costs before spending your data

SPEC §5.4 names the reference device as *"Indonesian mid-range Android on
**mobile data**"*, and the architecture has respected that since M2: the first
download is budgeted at 8 MB and everything else is deferred until it is needed.

The half that was missing is that nothing told the learner when a tap was about
to spend their quota. Opening the reader fetches its band's sentence and passage
shards — **415 KB gzipped** for an English learner at band 2, **479 KB** for a
Japanese one — unannounced, on a prepaid plan.

It now says so, with the real figure from the manifest's own `gzipBytes`, and
waits for a yes. Three things keep that honest rather than merely cautious:

- **A shard already in the cache is never charged for.** The gate checks the
  Cache API first — warning about a cost that no longer exists is a false alarm,
  not care.
- **Practice is never gated.** Only the reader is. The session's content is
  precached, so a learner who declines still studies exactly as before.
- **Unknown connectivity does not hold back.** Two of the three target browsers
  have no Network Information API; treating silence as "probably metered" would
  withhold the reader from most desktop learners and every iPhone on Wi-Fi, on
  no evidence at all.

Three choices in settings: follow the phone's own Save-Data setting (the
default), always ask, or never ask.

### Changed — the reader's navigation recedes while a decision is on screen

Two full-width primaries — "download" and "back" — made the learner pick between
two things that looked equally like the answer. "Kembali" is quiet while the
gate is up and primary again once it is gone. The arrow-key hint for the
tap-to-gloss words is no longer announced when there are no words on screen.

### Measured on this build

| | |
|---|---|
| unit tests | **798**, 58 files |
| e2e | **61** |
| initial JS / CSS gzipped | **140.8 KB** / **6.7 KB** (budgets 200 / 40) |

---

## v1.12.1 — 2026-09-20

### Fixed — an English session could contain Japanese cards

`Session.lang` has recorded which language a queue was composed for since
v1.0.1, added precisely because resuming a session under a different target
handed the learner the other language's content. The queue itself was never
actually built that way.

New items were scoped by the `[lang+kind]` index and drills were scoped
throughout — but due cards came from the **whole profile**, so a learner who had
studied both languages could meet Japanese kanji inside an English session while
the screen said *"Kamu sedang belajar Inggris"*.

A card carries no language of its own — it is keyed `profileId::itemId` — so the
language is read off the namespace every item id already has (`en:lex:word`,
`ja:kanji:水`), with `langOfItemId`, the inverse of `lexemeIdFor`.

**The filter runs before the limit, and that ordering is the fix rather than a
detail.** `dueCards` pages at 200 rows; filtering an already-capped page would
let a Japanese backlog fill every row and leave the English session looking
empty. There is a test for exactly that, and it had to be rewritten once — the
first version passed against the bug by accident, because `en:` sorts before
`ja:` and the English card landed in the page for free.

`todaySnapshot` counts through the same predicate, so the home screen cannot
promise reviews the session will not contain.

786 unit · 59 e2e.

---

## v1.12.0 — 2026-09-20

Flashcards, in both halves of what that word means: the gesture you expect, and
the pacing machinery underneath that decides which card you see.

### The card can be pushed away with a thumb

`SwipeCard` (D77). Swipe right on a new word to take it, left to say *belum
perlu*; swipe the answered card to continue. The drag tracks the thumb 1:1 and
tilts, the action's own label reads out from behind the card, and letting go
short of the commit point springs it back.

**Every swipe is also a button.** The gesture is `aria-hidden`, the keyboard
route is untouched, and it only goes on cards whose primary action was already
a tap — on a cloze or production rung the learner is selecting text, and a
horizontal drag would fight them for it. It commits through the same latch a tap
does (v1.11.0's invariant 37), so one swipe is one review, with a test that says
so.

### New words are capped per day, not just per session

The bigger half, and the one that changes what a learner actually experiences.

§7.2 has called review debt *"the #1 cause of abandonment in SRS apps"* since M0,
and the debt throttle has existed since M5. But a brake is not a speed limit:
the throttle is computed **per session** from a 7-day forecast, and a forecast
only moves days after the evening that caused the problem. Five sessions in one
evening passed it five times.

**Measured on a fresh profile: a 4-minute learner's first session queued 30 new
words, against a review capacity of 20 a day.** A backlog bought on day one and
paid for on day four.

There is now a daily cap, counted from the review log since local midnight. The
default is derived from `dailyCapacityFor` rather than a second magic number —
**5 / 10 / 19** new words a day for the three session lengths — and the learner
can set their own, including zero, which is how anyone digs out of a backlog.

**The cost, stated rather than buried:** early sessions are now short. A learner
with no cards has nothing to review, so their queue is exactly one day's
allowance. That is the correct behaviour, and the home screen says so before
they start.

### The home screen says what today holds

*"0 ulangan · 5 kata baru"* — the one thing an SRS home screen owes its user and
the one thing this one never said. Counts, never targets, and a finished day is
reported in the same flat voice as a busy one. A learner who has switched new
words off is told *that*, rather than that new words resume tomorrow.

### Fixed — three things found while building it

- **Settings could persist out of order.** Every change started its own
  read-then-write chain, so two changes in flight raced and the row kept
  whichever *finished* last rather than whichever was asked for last. Stepping a
  control five times quickly saved the fourth value. Writes are now ordered.
- **A stepper lost taps.** Reading the number off the profile meant each tap
  waited for a write and a re-render before the next could count from the right
  base. A learner jabbing a control on a slow phone is the ordinary case.
- **A swiped card scrolled the page sideways** — 464px of document in a 375px
  viewport. `Screen` clips horizontally now, with `clip` rather than `hidden`,
  because `hidden` creates a scroll container and would have silently broken the
  sticky footer.

### Measured on this build

| | |
|---|---|
| unit tests | **779**, 57 files |
| e2e | **59** |
| initial JS / CSS gzipped | **139.9 KB** / **6.7 KB** (budgets 200 / 40) |
| WCAG 2.1 AA violations | **0**, light and dark |

---

## v1.11.1 — 2026-08-19

### Changed — an answered card retires

v1.11.0 closed the duplicate-review hole with two latches and left the layout
alone, which was the smaller half of the fix. The card is now replaced on answer
by a static **"Soal tadi"** panel: the sentence with the answer filled into the
blank, its translation, and the learner's own answer where it differed.

Keeping the content is the point — *"the answer was A"* means very little
without the sentence A belongs in, and a cloze's answer means nothing without
the gap it goes in. What goes is every control that could produce a second
answer, which makes v1.11.0's sequential double-click **impossible** rather than
refused. The guard in `handleAnswer` stays as a backstop: nothing on screen can
reach it now, but it writes permanently uncorrectable state, and one comparison
is cheaper than a layout that must never change back.

**It is deliberately not dimmed.** The obvious way to say "finished" is opacity,
and opacity on text is exactly what v1.10.0's dark-mode contrast gate exists to
catch — a shade that clears AA at full strength does not at 60%.

### Fixed — a dead band between a card and its own verdict

The feedback rendered inside a `max-h-[60vh]` scroller in the footer, nested
inside a scrolling page, while `flex-1` on the main column pushed it to the
bottom. With the retired card being shorter than the live one, that left an
empty band between the card and the verdict about it, and the verdict itself
scrolled independently.

The whole answered state now reads as one column and the footer carries only
**"Lanjut"** — which is what §10 wanted in the thumb zone in the first place.

Checked in both themes, at mobile width, with a short verdict and a long one.

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
