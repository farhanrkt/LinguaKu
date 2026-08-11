# LinguaKu

An offline-first PWA that teaches **English and Japanese to Indonesian
speakers** — no account, no paywall, no ads, and no engagement dark patterns.

The premise: a learner in Bogor should be able to tap an icon on a cheap
Android phone and be answering a *useful* question within three seconds,
offline — and that question should be there because a memory model predicts
they are about to forget it, or because it targets a mistake Indonesian
speakers specifically make.

## Status — v1.0.0

**Milestones 0 through 7 complete.** See [`CHANGELOG.md`](CHANGELOG.md) for the
release notes and [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) for the
production verification procedure.

| | |
|---|---|
| icon tap → first answerable question | **1.4 s** (budget 3 s) |
| initial JS / CSS, gzipped | **125.5 KB** / **6.5 KB** (budgets 200 / 40) |
| first-load precache, both languages | **1.31 MB** gzipped (budget 8 MB) |
| tests | **596** unit · **29** e2e |
| recurring cost | **zero** |

English: 23,497 banded sentence pairs, 5,245 lexemes, 21 contrastive categories,
116 drills, 75 false friends. Japanese: 15,324 pairs, 6,904 lexemes, all 1,748
kanji with component breakdowns, 14 contrastive categories including **six
positive-transfer notes**.

## Quick start

```bash
npm install
npm run dev
```

Offline behaviour only exists in a production build:

```bash
npm run build && npm run preview
```

`npm run verify` is the gate — typecheck → lint → unit → licences → build →
bundle budget. It is what CI runs; if it is red, nothing is done.

## How it works

**The loop.** FSRS scheduling (`ts-fsrs`) over a seven-rung card ladder — L0
exposure through L6 free production. One active card per item; the rung selects
the task and FSRS state carries across promotion. No card advances without a
learner response, and that is enforced by the data layer: `recordReview` is the
only writer of scheduling state, it cannot be called without a rating, and the
review log is append-only at the Dexie hook.

**The contrastive engine** is the differentiator. Authored Indonesian notes in a
fixed order — *what Indonesian does*, *what English does instead*, *one minimal
pair* — compiled from versioned YAML at build time, with a compiler that fails
the build on an unanswerable question. Interference detection tags ordinary
wrong answers by category, so the weakness heatmap is built from what a learner
does when they are **not** being tested on it. For Japanese it also names six
places where Indonesian gives the learner an advantage, which is the half of
contrastive teaching this audience never hears.

**The graded reader** is a feed of level-matched sentences — Tatoeba is
independent pairs, not documents, and stringing them into a "passage" would read
like nonsense. Tap-to-gloss and one-tap mining are entirely local. Mining
records an *intention*, not a card: the word arrives in the next session and
becomes a card when it is answered.

**Honesty is structural.** Every progress figure has an explicit "not measured
yet" state and shows it; charts take `number | null` and draw a gap rather than a
bar of zero. There is no CEFR or JLPT claim, because no licence-cleared
alignment exists and deriving one from frequency would be fake precision.
Optional sync is off by default and nothing in `src/features` or `src/data` even
imports it — an e2e test asserts zero requests leave the origin during a full
session.

## Documentation

| File | What's in it |
|---|---|
| [`CHANGELOG.md`](CHANGELOG.md) | Release notes, measured budgets, known limitations |
| [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) | Production build verification, deploy and rollback |
| [`SPEC.md`](SPEC.md) | The contract: product thesis, learning-science requirements, milestones |
| [`CLAUDE.md`](CLAUDE.md) | Architecture, commands, invariants |
| [`docs/SCIENCE.md`](docs/SCIENCE.md) | Every mechanic traced to the finding it implements |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Standing decisions and the risk register |
| [`docs/ETHICS.md`](docs/ETHICS.md) | Mechanics this project will not ship, and why |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | Per-milestone engineering log and deviations |
| [`NOTICE.md`](NOTICE.md) | Data attribution and licence terms |

## Licence

**Code is [MIT](LICENSE)** — `src/`, `scripts/`, `workers/`, and the authored
contrastive content in `data/contrastive/`.

**The bundled datasets are not.** English content shards are Tatoeba-derived and
stay **CC BY 2.0 FR**; Japanese shards mix Tatoeba with EDRDG data (JMdict,
JMnedict, KANJIDIC2, KRADFILE) and therefore ship under **CC BY-SA 4.0**, with
share-alike attaching to anything you redistribute. EDRDG also requires visible
acknowledgement, which the in-app attribution screen provides — it renders from
the same manifest the CI licence gate reads, so a dataset cannot enter the build
without appearing there. Full terms in [`NOTICE.md`](NOTICE.md).
