# CLAUDE.md — orientation for future sessions

LinguaKu is an offline-first PWA that teaches **English and Japanese to
Indonesian (L1) speakers**. `SPEC.md` is the contract; this file is the map.
Read `SPEC.md §2` before touching anything learner-facing — every mechanic in
this app is supposed to trace to a named finding there.

## Commands

```bash
npm run dev          # Vite dev server (no service worker — offline is prod-only)
npm run verify       # the gate: typecheck → lint → unit → licences → build → bundle budget
npm run test:watch   # Vitest in watch mode
npm run test:e2e     # Playwright smoke against a real production build
npm run icons        # regenerate public/icons/ (committed; run only on redesign)

npm run ingest:fetch # download Tatoeba exports into .cache/ (needs bunzip2)
npm run ingest:en    # rebuild assets/content/en/ (committed; deterministic)
```

Ingest scripts are TypeScript run directly by Node — no transpiler — so they
share `src/core` with the app rather than duplicating the tokenizer or the
difficulty scorer. That is why **every relative import in this repo carries its
file extension** (`./frequency.ts`, not `./frequency`).

`npm run verify` is what CI runs. If it is red, the milestone is not done.

## Architecture

```
src/core/        pure logic — no React, no Dexie, no DOM. 100% unit tested.   (from M2)
src/data/        Dexie schema, migrations, repositories. The source of truth.
src/features/    session, reader, placement, progress, settings — screens.
src/ui/          presentational primitives.
src/platform/    browser capability wrappers: speech, storage, notifications.
src/i18n/        all learner-facing copy. Components hold no literal strings.
scripts/         offline build-time tooling (content pipeline, CI gates).
data/            authored, versioned content: licences, contrastive YAML.
assets/content/  generated content shards (from M1).
```

Dependency direction is one-way: `features → core, data, ui, platform`.
`core` imports nothing from the other four. If a scheduling or selection rule
needs React state to work, it is in the wrong place.

## Invariants

1. **`ReviewLog` is append-only.** Enforced by Dexie hooks in `src/data/db.ts`
   — updates, `put()` over an existing row, deletes and `clear()` all throw.
   A full reset drops the database instead. The log is the substrate for FSRS
   parameter optimization (§2.1) and for honest retention numbers (§9); code
   that mutates it corrupts both silently.
2. **No card advances without a learner response** (§2.2). There is no
   "browse the list" study mode.
3. **`Card.dueAt` mirrors `Card.fsrs.dueAt`** and is derived by a Dexie hook,
   never by callers. It exists because IndexedDB cannot index a nested path
   inside a compound key.
4. **Zero recurring cost** (§0 rule 1). No dependency, dataset or service that
   is not free at the tier we use. If there is no free path, stop and report.
5. **No dataset in `assets/` without an entry in `data/licenses.json`** and a
   matching section in `NOTICE.md`. `npm run check:licenses` enforces it.
   Datasets under `candidates` in that file are **not** cleared for use.
6. **Initial JS ≤ 200 KB gzipped**, initial CSS ≤ 40 KB. `npm run check:bundle`
   enforces it against the real build manifest. Language content is lazy and
   never enters the JS bundle.
7. **No banned mechanics** (§2.15, `docs/ETHICS.md`): no streak that can break,
   no lives, no gems, no leaderboards, no XP divorced from measured ability,
   no fake-precision level claims.
8. **TypeScript strict, no `any`, no dead scaffolding.** Prefer deleting code
   over commenting it out. Do not build a seam for a feature two milestones out.
9. **No level claim without a licence-cleared alignment.** Frequency bands are
   the honest signal; CEFR and JLPT labels wait for real wordlists (§2.15,
   decision D16). Sentences are banded by their 90th-percentile token rank, and
   the composite difficulty score only orders *within* a band.
10. **The pipeline is deterministic.** Same corpus in, byte-identical shards
    out — no timestamps, ties broken explicitly. Content hashes in
    `assets/content/*/manifest.json` are the cache-busting signal, so churn
    there means every learner re-downloads for nothing.

## Conventions

- Every learner-facing mechanic carries a `// SCIENCE: <mechanism> — see SPEC §2.x`
  comment. Anything invented without a basis is marked `// UNVALIDATED:` and
  reported to the human.
- Timestamps are epoch milliseconds. Indexed booleans are `Flag` (`0 | 1`).
- Copy lives in `src/i18n/id.ts`, addresses the learner as "kamu", and never
  uses loss or shame framing.
- Dark mode, WCAG AA contrast, `motion-safe:` on every transition, 56px+ tap
  targets, primary actions in the thumb zone.

## Where things stand

See `docs/PROGRESS.md` for the current milestone, deviations, and the open
decisions waiting on the human. `docs/DECISIONS.md` holds the standing
technical decisions and the risk register; `docs/SCIENCE.md` maps every §2
requirement to its implementation and acceptance test.

## Hosting

Static build (`dist/`) → Cloudflare Pages, connected from the repo:
build command `npm run build`, output directory `dist`. No secrets, no server.
Optional sync (Workers + D1) is M7 and behind a flag; the app must stay fully
functional with it disabled.
