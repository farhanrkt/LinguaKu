# LinguaKu

An offline-first PWA that teaches **English and Japanese to Indonesian
speakers** — no account, no paywall, no ads, and no engagement dark patterns.

The premise: a learner in Bogor should be able to tap an icon on a cheap
Android phone and be answering a *useful* question within three seconds,
offline — and that question should be there because a memory model predicts
they are about to forget it, or because it targets a mistake Indonesian
speakers specifically make.

## Quick start

```bash
npm install
npm run dev
```

Offline behaviour only exists in a production build:

```bash
npm run build && npm run preview
```

## Documentation

| File | What's in it |
|---|---|
| [`SPEC.md`](SPEC.md) | The contract: product thesis, learning-science requirements, milestones |
| [`CLAUDE.md`](CLAUDE.md) | Architecture, commands, invariants |
| [`docs/SCIENCE.md`](docs/SCIENCE.md) | Every mechanic traced to the finding it implements |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Standing decisions and the risk register |
| [`docs/ETHICS.md`](docs/ETHICS.md) | Mechanics this project will not ship, and why |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | Current state, deviations, open decisions |
| [`NOTICE.md`](NOTICE.md) | Data attribution and licence terms |

## Status

Milestone 1 complete: foundations plus the English content pipeline —
23,497 banded English↔Indonesian sentence pairs and 5,245 ranked lexemes,
1.05 MB gzipped for the whole corpus. The practice loop lands in M2.
