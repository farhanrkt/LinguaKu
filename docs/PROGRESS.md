# PROGRESS.md

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

**3. Two licence blockers that stop M1 from shipping.**
No Indonesian gloss source is cleared (Kaikki states no licence for its
extraction; parsing Wikimedia dumps directly may be the cleaner path) and no
English frequency list is chosen. Frequency banding is the backbone of §2.10,
so M1 cannot start in earnest until one is cleared. Do you want me to spend M1's
first block resolving these, or do you already have preferences?

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

**M1 — Content pipeline, English only.** Blocked on decision 3 above. Once a
gloss source and a frequency list are cleared, the pipeline itself
(`scripts/ingest/*` → normalize → dedupe → difficulty score → band → shard) is
straightforward, and the licence gate is already in place to catch anything
that tries to ship unattributed.
