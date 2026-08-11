# Changelog

All notable changes to LinguaKu. Dates are ISO. This file is the release
record; `docs/PROGRESS.md` is the per-milestone engineering log behind it.

---

## v2.0.0 — 2026-08-11

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

| | v1.0.1 | v2.0.0 |
|---|---|---|
| unit tests | 609 | **653** |
| e2e tests | 32 | **41** |
| initial JS, gzipped | 125.6 KB | **128.3 KB** (64% of budget) |
| §2 requirements with an implementation | 12 of 15 | **15 of 15** |

Schema v5, additive. No migration risk: `deferredItems` is a new table and no
existing row changes shape.

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
