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
npm run ingest:contrastive  # compile data/contrastive/en.yaml → contrastive.json
```

Ingest scripts are TypeScript run directly by Node — no transpiler — so they
share `src/core` with the app rather than duplicating the tokenizer or the
difficulty scorer. That is why **every relative import in this repo carries its
file extension** (`./frequency.ts`, not `./frequency`).

`npm run verify` is what CI runs. If it is red, the milestone is not done.

## Architecture

```
src/core/        pure logic — no React, no Dexie, no DOM. 100% unit tested.   (from M2)
                 scheduler · ladder · sessionComposer · grader · cloze · rng
                 coverage · forecast · placement · pseudoword · difficulty
                 recap
                 frequency · tokenize · properNoun · elo · interference
                 vocabulary · retention · reader · delta · kana · furigana
src/data/        Dexie schema, migrations, repositories. The source of truth.
src/features/    session, reader, placement, progress, habit, settings — screens.
src/ui/          presentational primitives.
src/platform/    browser capability wrappers: speech, storage, notifications.
src/i18n/        all learner-facing copy. Components hold no literal strings.
scripts/         offline build-time tooling (content pipeline, CI gates).
workers/         optional sync Worker + D1 schema. Deployed separately; nothing
                 in src/ imports it, and the app is complete without it.
data/            authored, versioned content: licences, contrastive YAML.
assets/content/  generated content shards (from M1).
```

Dependency direction is one-way: `features → core, data, ui, platform`.
`core` imports nothing from the other four. If a scheduling or selection rule
needs React state to work, it is in the wrong place.

## Invariants

0. **`recordReview` is the only writer of FSRS state** (`src/data/repositories/`).
   It cannot be called without a rating, and it writes the card and appends the
   log in one transaction. That is what makes §2.2 structural rather than a
   convention. One active card per item; the ladder level selects the task
   (decision D18).
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
11. **Lexemes go in IndexedDB; sentences do not.** Importing bands 1–3's 27,650
    sentence rows measured 43s on an emulated mid-range phone against a 3s
    budget (decision D19). Sessions read `anchors.b*.json` from memory; the full
    `sentences.b*.json` shards exist for M3's selector and M7's reader.
12. **≤ 3s from icon tap to first answerable question**, on a warm cache.
    Enforced by `e2e/coldstart.spec.ts` against a real production build.
13. **Placement is offered, never enforced.** Skipping leaves the learner at the
    prior and costs nothing; an e2e test holds that line. Only the `vocab`
    ability is estimated — listening and grammar rows stay absent rather than
    guessed (decision D25).
14. **Audio must be proven before L4 is offered.** The TTS probe runs once per
    language per boot and requires `onend` within 500 ms (D29) — per *language*,
    because a device with an en-US voice and no ja-JP one is exactly what R1
    predicts; `ladderCeiling(hasAudio)` in
    `src/core/ladder.ts` is the gate, and it defaults to *no audio* so a
    forgotten argument withholds the rung rather than faking it. A card resting
    above the ceiling is demoted visibly and logged at the rung it was actually
    answered at — never presented as text while the log claims otherwise.
15. **`recordDrillAnswer` is the only writer of contrastive state**, and drill
    answers are `DrillAttempt` rows, never `ReviewLog` rows (D32). A drill has no
    FSRS card; mixing them would put unscheduled items into the §9 retention
    rate. Both writers keep their record and their state change in one
    transaction.
16. **No category is called a weakness under five attempts** (D33). The heatmap
    says "belum cukup data" and how many answers are still needed. The composer
    may drill an unmeasured category; the UI may not score it.
17. **Contrastive content is authored YAML, compiled at build time.**
    `data/contrastive/*.yaml` is the source of truth; the compiler fails the
    build on an MCQ whose answer is missing from its options, a category with no
    minimal pair, or a drill with no explanation. No YAML parser ships.
18. **Every progress figure has an explicit "not measured yet" state, and it is
    shown rather than hidden** (§2.15, D35). Estimates carry an interval;
    unsampled bands widen it rather than being read as zero. Chart components
    take `number | null` and draw a gap for null — never a bar of zero.
19. **An import merges the append-only log and overwrites current state**
    (D37). `ReviewLog` and `DrillAttempt` are UUID-keyed, so a restore adds what
    it lacks and can never destroy review history; cards and scores are replaced.
20. **No charting or plotting dependency.** Five figures of inline SVG in
    `src/features/progress/charts.tsx` (D38). The budget in invariant 6 is the
    reason.
21. **Sync is off unless the learner turns it on, and that is structural.**
    Nothing in `src/features` or `src/data` imports `src/platform/sync.ts`; the
    settings screen is the only caller, and there is no boot registration,
    timer or listener. An e2e test asserts zero requests leave the origin during
    a full session (D52).
22. **Audio gates one rung, not the ladder's top** (D48). `audioAvailable`
    withholds L4 and nothing else; promotion runs 3 → 5 on a silent device. A
    missing *listening* rung must never cost a learner *production*.
23. **A skip records a request, never a rating** (D55). `deferredItems` holds
    "belum perlu"; the composer honours it for new items *and* for cards already
    due, and a deferred card stays due with its FSRS state untouched. Filing a
    skip as a lapse would let autonomy damage the learner's own schedule.
24. **A reminder is local, or the screen says it is not one** (D54). There is no
    push server and there will not be one — that is invariant 4. `TimestampTrigger`
    where it exists, an in-app cue otherwise, and `scheduleReminder` returns
    whether anything was actually scheduled.
25. **The weekly recap has no total and no target** (D56). Capability lines only;
    a quiet week is a fact, not a shortfall.
26. **Mining records an intention, never a card** (D46). A card is the product
    of an answer (invariant 0); `minedItems` holds the intention and the
    composer acts on it next session.

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

Static build (`dist/`) → **Cloudflare Workers Static Assets**, connected from
the repo via Workers Builds: build `npm run build`, deploy `npx wrangler deploy`,
configured by `wrangler.jsonc` at the root. No secrets, no server.

D2 said "Cloudflare Pages"; Cloudflare now routes Git-connected static sites
through Workers instead. Same account, same free tier, and an assets-only
Worker has no `main`, so nothing is billed as an invocation and invariant 4
holds unchanged.

Optional sync (Workers + D1) is M7 and behind a flag; `workers/sync/` is a
*separate* deployment with its own config, and the app must stay fully
functional with it disabled.
