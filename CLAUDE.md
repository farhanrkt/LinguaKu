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
npm run test:e2e     # Playwright against a real production build, including
                     # the WCAG 2.1 AA and keyboard-operation gates (§10)
npm run icons        # regenerate public/icons/ (committed; run only on redesign)

npm run ingest:fetch # download Tatoeba exports into .cache/ (needs bunzip2)
npm run ingest:en    # rebuild assets/content/en/ (committed; deterministic)
npm run ingest:contrastive  # compile data/contrastive/*.yaml → contrastive.json
npm run ingest:chunks       # compile data/chunks/*.yaml, validated against the corpus
npm run ingest:topics       # compile data/topics/*.yaml → topics.json

npm run ingest:fetch:wiki   # download the Wikimedia dumps into .cache/ (needs bunzip2)
npm run ingest:glosses      # id.wiktionary → assets/content/*/glosses.b*.json
npm run ingest:passages     # Simple English Wikipedia → passages.b*.json
npm run ingest:audio        # Piper → pre-cached clips. Never run: see R7.
```

Ingest scripts are TypeScript run directly by Node — no transpiler — so they
share `src/core` with the app rather than duplicating the tokenizer or the
difficulty scorer. That is why **every relative import in this repo carries its
file extension** (`./frequency.ts`, not `./frequency`).

`npm run verify` is what CI runs — typecheck → lint → unit → licences → **audio
budget** → build → bundle budget → **offline integrity**. If it is red, the
milestone is not done.

## Architecture

```
src/core/        pure logic — no React, no Dexie, no DOM. 100% unit tested.   (from M2)
                 scheduler · ladder · sessionComposer · grader · cloze · rng
                 coverage · forecast · placement · pseudoword · difficulty
                 recap · listening
                 frequency · tokenize · properNoun · elo · interference
                 vocabulary · retention · reader · delta · kana · furigana
src/data/        Dexie schema, migrations, repositories. The source of truth.
src/features/    session, reader, placement, progress, habit, settings — screens.
                 settings holds attribution, sync and diagnostics (R1).
src/ui/          presentational primitives.
src/platform/    browser capability wrappers: speech, storage, notifications.
src/i18n/        all learner-facing copy. Components hold no literal strings.
scripts/         offline build-time tooling (content pipeline, CI gates).
workers/         optional sync Worker + D1 schema. Deployed separately; nothing
                 in src/ imports it, and the app is complete without it.
data/            authored, versioned content: licences, contrastive YAML,
                 chunks (§2.5) and topic clusters (§2.10).
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
5. **The licence manifest and the build agree in both directions.** No dataset
   in `assets/` without an entry in `data/licenses.json` and a matching section
   in `NOTICE.md` — *and* no entry in `datasets` that no asset references, since
   the in-app attribution screen renders that list and would otherwise claim a
   provenance the app does not have. `npm run check:licenses` enforces both.
   Datasets under `candidates` are **not** cleared for use.
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
27. **No audio clip exists without a licence-cleared *voice model*** (D57, R7).
    Invariant 5 applied to a generator rather than a corpus: `build-audio.ts`
    refuses to write before checking `data/licenses.json`, and
    `npm run check:audio` polices the budget and the index in CI. The clip set
    is empty today because no voice has been chosen — that is the honest state,
    not an oversight.
28. **Glosses and passages ship in their own share-alike shards** (D60). Both
    are CC BY-SA 4.0; the Tatoeba-derived English shards are CC BY 2.0 FR.
    A shard's licence is never widened by mixing sources into it, and the
    content tests assert the split in both directions.
29. **A gloss is reference, never an answer key** (D59). Coverage is 30% of
    English lexemes and 4% of Japanese, measured. Displaying one where it exists
    is honest; grading against a set that thin would mark good answers wrong,
    which is what §2.7 exists to prevent. L2 stays D21's supported cloze.
30. **There is no AI layer, and there is no seam for one** (D63). Not a flag,
    not a dormant module, not a key field. §14 question 5 is answered *declined*:
    the app must be structurally incapable of sending a learner's data to a
    model, and a guarded implementation is not that. It was built once during
    v1.5.0 and deleted; do not rebuild it.
31. **Reading and drill attempts are not review logs** (D32, extended). Neither
    a passage nor a drill has an FSRS card, so `ReadingAttempt` and
    `DrillAttempt` are their own append-only tables. Putting either into
    `ReviewLog` would corrupt the retention rate §9 reports.
32. **Authored content is validated against the corpus, never trusted** (D64,
    D65). A chunk without a real example sentence fails the build (§2.5's own
    ingestion rule); a topic word that is not in the shipped inventory fails the
    build. Both compilers exist so that a hand-written file cannot rot silently
    as the corpus changes.
33. **A topic reorders new items; it never restricts them** (D65). Coverage is
    partial by design and published in the shard, and a word in no topic keeps
    its band as its §2.8 cluster — the behaviour the app had before topics.
34. **The offline promise is checked against `dist/sw.js`** (D69). The runtime
    cache cap must exceed the shard count or a learner silently loses content
    they already downloaded, and every content type needs a rule that matches
    it — audio is not JSON. `npm run check:offline` reads the built worker.
35. **Running text costs one tab stop per block, not one per word** (D70).
    `src/ui/TappableText.tsx` is a roving-tabindex composite: Tab enters and
    leaves a passage or a sentence, Left/Right and Home/End move inside it.
    Withdrawing the stops is only half — an e2e gate asserts the words are still
    individually reachable, because a reader you cannot gloss from the keyboard
    is a worse §10 failure than the one this fixed.
36. **Both themes are scanned, not just the light one** (D71). §10 promises
    "dark mode, WCAG AA contrast" as one clause; `e2e/a11y.spec.ts` runs axe
    under `colorScheme: 'dark'` as well, and over the reader **with content in
    it**. A shade that clears AA on the page background can fail inside a
    tinted panel, and only the scan knows which.

37. **One click is one answer** (D72). Every session write is latched twice: a
    synchronous ref against two clicks racing, and a refusal to answer a card
    whose verdict is already showing. `ReviewLog` is append-only, so a duplicate
    row is permanent and lands in the retention rate §9 reports. Both halves
    have e2e gates.
38. **A card shows what the word means, or says it has no entry** (D73). The
    gloss is resolved for every rung, not just L0, and coverage is 30% / 4% —
    so the absent branch is the common one and it is never rendered as blank
    space. It is still reference, never an answer key (invariant 29).

39. **An answered card retires** (D75). Its content stays — a verdict refers to
    the sentence it came from — but every control goes, which makes a second
    answer impossible rather than merely refused. Never dimmed: opacity on text
    is what D71's contrast gate exists to catch.

40. **New words are capped per day, not just per session** (D76). The debt
    throttle reacts to a backlog; `dailyNewWords` stops one forming, counted
    from `ReviewLog.introduction` since local midnight. The default is derived
    from `dailyCapacityFor` so the two halves of §7.2 cannot drift. Zero is a
    valid setting, and early sessions being short is the correct consequence.
41. **A swipe is a shortcut, never a second code path** (D77). Every swipe is
    also a button, it is `aria-hidden`, it only goes on cards whose primary
    action is already a tap, and it commits through the same latch as a tap
    (invariant 37) — one swipe is one review.

42. **A review queue holds one language** (D79). `dueCandidates` scopes by
    `langOfItemId`, matching `newCandidates` and `drillCandidates`, and the
    filter runs *inside* the query so the 200-row page cannot be filled by the
    other language's backlog. `todaySnapshot` counts through the same predicate.

43. **An optional download is announced before it is spent** (D80). §5.4's
    learner is on mobile data; the reader states its real cost from the
    manifest's `gzipBytes` and waits. Never for content already cached, never
    for the practice session, and `unknown` connectivity does not hold back —
    withholding on a guess is worse than the download.


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
