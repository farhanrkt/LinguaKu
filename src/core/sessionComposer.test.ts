import { describe, expect, it } from 'vitest';
import {
  cardTypeFor,
  cardTypeForLevel,
  composeSession,
  MAX_CONSECUTIVE_SAME_CLUSTER,
  MAX_CONSECUTIVE_SAME_TYPE,
  type Candidate,
} from './sessionComposer.ts';
import { mulberry32 } from './rng.ts';
import type { LadderLevel } from '../data/types.ts';

const candidate = (overrides: Partial<Candidate> & Pick<Candidate, 'id'>): Candidate => ({
  itemId: `item-${overrides.id}`,
  cardId: `card-${overrides.id}`,
  slice: 'review',
  ladderLevel: 1,
  clusterId: 'b1',
  retrievability: 0.8,
  lapses: 0,
  ...overrides,
});

/** A varied pool, the shape a real learner's queue has. */
const generatePool = (seed: number, size: number, slice: 'review' | 'new'): Candidate[] => {
  const rng = mulberry32(seed);
  return Array.from({ length: size }, (_, index) => {
    const level = Math.floor(rng() * 4) as LadderLevel;
    return candidate({
      id: `${slice}-${seed}-${index}`,
      slice,
      cardId: slice === 'new' ? null : `card-${slice}-${seed}-${index}`,
      ladderLevel: level,
      clusterId: `b${1 + Math.floor(rng() * 5)}`,
      retrievability: slice === 'new' ? 0 : rng(),
      lapses: rng() < 0.1 ? 7 : 0,
    });
  });
};

const violations = (entries: readonly Candidate[]) => {
  let typeRun = 1;
  let clusterRun = 1;
  let typeViolations = 0;
  let clusterViolations = 0;
  for (let i = 1; i < entries.length; i++) {
    const previous = entries[i - 1]!;
    const current = entries[i]!;
    typeRun = cardTypeFor(current) === cardTypeFor(previous) ? typeRun + 1 : 1;
    clusterRun = current.clusterId === previous.clusterId ? clusterRun + 1 : 1;
    if (typeRun > MAX_CONSECUTIVE_SAME_TYPE) typeViolations++;
    if (clusterRun > MAX_CONSECUTIVE_SAME_CLUSTER) clusterViolations++;
  }
  return { typeViolations, clusterViolations };
};

describe('cardTypeForLevel', () => {
  it('maps the ladder onto tasks', () => {
    expect(cardTypeForLevel(0)).toBe('exposure');
    expect(cardTypeForLevel(1)).toBe('recognition');
    expect(cardTypeForLevel(2)).toBe('recall');
    expect(cardTypeForLevel(3)).toBe('cloze');
  });
});

describe('budget (SPEC §2.13, §7.2)', () => {
  it('keeps a 4-minute session inside four minutes', () => {
    const session = composeSession({
      budgetMinutes: 4,
      seed: 1,
      due: generatePool(1, 100, 'review'),
      fresh: generatePool(2, 100, 'new'),
    });
    expect(session.estimatedSeconds).toBeLessThanOrEqual(240);
    expect(session.entries.length).toBeGreaterThan(5);
  });

  it('scales with the learner-chosen budget', () => {
    const of = (budgetMinutes: number) =>
      composeSession({
        budgetMinutes,
        seed: 1,
        due: generatePool(1, 200, 'review'),
        fresh: generatePool(2, 200, 'new'),
      }).entries.length;
    expect(of(4)).toBeLessThan(of(8));
    expect(of(8)).toBeLessThan(of(15));
  });

  it('gives reviews the larger share when both pools are deep', () => {
    const session = composeSession({
      budgetMinutes: 8,
      seed: 7,
      due: generatePool(1, 200, 'review'),
      fresh: generatePool(2, 200, 'new'),
    });
    expect(session.allocation.review).toBeGreaterThan(session.allocation.new);
  });

  it('spends the reserved input/contrastive share on reviews until those pools exist', () => {
    const session = composeSession({
      budgetMinutes: 4,
      seed: 3,
      due: generatePool(1, 200, 'review'),
      fresh: [],
    });
    // Without spillover a review-only session would stop at 60% of the budget.
    expect(session.estimatedSeconds).toBeGreaterThan(240 * 0.6);
  });

  it('returns an empty session rather than inventing work', () => {
    const session = composeSession({ budgetMinutes: 4, seed: 1, due: [], fresh: [] });
    expect(session.entries).toEqual([]);
    expect(session.interleaveRelaxed).toBe(false);
  });
});

describe('review prioritization (SPEC §7.2)', () => {
  it('puts the card closest to being forgotten before a comfortable one', () => {
    const session = composeSession({
      budgetMinutes: 4,
      seed: 1,
      due: [
        candidate({ id: 'safe', retrievability: 0.95, clusterId: 'a' }),
        candidate({ id: 'at-risk', retrievability: 0.62, clusterId: 'b' }),
      ],
      fresh: [],
    });
    expect(session.entries[0]?.id).toBe('at-risk');
  });

  it('does not let leeches crowd out healthy reviews', () => {
    const session = composeSession({
      budgetMinutes: 4,
      seed: 1,
      due: [
        candidate({ id: 'leech', retrievability: 0.1, lapses: 9, clusterId: 'a' }),
        candidate({ id: 'normal', retrievability: 0.7, clusterId: 'b' }),
      ],
      fresh: [],
    });
    expect(session.entries[0]?.id).toBe('normal');
  });
});

/** Contrastive drills, weakest category first (SPEC §3.3). */
const generateDrills = (seed: number, size: number): Candidate[] => {
  const rng = mulberry32(seed);
  return Array.from({ length: size }, (_, index) => ({
    id: `DRILL_${index}-${seed}`,
    itemId: `DRILL_${index}-${seed}`,
    cardId: null,
    slice: 'drill' as const,
    ladderLevel: 0 as const,
    clusterId: `c:CAT${Math.floor(rng() * 4)}`,
    retrievability: 0,
    lapses: 0,
  }));
};

describe('interleaving (SPEC §2.8 acceptance)', () => {
  it('finds no violation across 1,000 generated sessions', () => {
    let relaxedCount = 0;
    for (let seed = 0; seed < 1000; seed++) {
      const session = composeSession({
        budgetMinutes: 15,
        seed,
        due: generatePool(seed, 60, 'review'),
        fresh: generatePool(seed + 10_000, 30, 'new'),
        drills: generateDrills(seed + 20_000, 2),
      });
      const { typeViolations, clusterViolations } = violations(session.entries);
      expect(typeViolations).toBe(0);
      expect(clusterViolations).toBe(0);
      if (session.interleaveRelaxed) relaxedCount++;
    }
    expect(relaxedCount).toBe(0);
  });

  it('says so when the pool makes the rule impossible instead of pretending', () => {
    // Every card the same type and cluster: no ordering can satisfy §2.8.
    const session = composeSession({
      budgetMinutes: 4,
      seed: 1,
      due: Array.from({ length: 10 }, (_, index) =>
        candidate({ id: `same-${index}`, ladderLevel: 1, clusterId: 'b1' }),
      ),
      fresh: [],
    });
    expect(session.entries.length).toBeGreaterThan(2);
    expect(session.interleaveRelaxed).toBe(true);
  });
});

describe('determinism (SPEC §7.2)', () => {
  it('returns the identical session for the same seed', () => {
    const build = () =>
      composeSession({
        budgetMinutes: 8,
        seed: 42,
        due: generatePool(1, 80, 'review'),
        fresh: generatePool(2, 40, 'new'),
      });
    expect(build()).toEqual(build());
  });

  it('varies between seeds, so two days do not feel identical', () => {
    const idsFor = (seed: number) =>
      composeSession({
        budgetMinutes: 8,
        seed,
        due: generatePool(1, 80, 'review'),
        fresh: generatePool(2, 40, 'new'),
      }).entries.map((entry) => entry.id);
    expect(idsFor(1)).not.toEqual(idsFor(2));
  });

  it('never repeats a card inside one session', () => {
    const session = composeSession({
      budgetMinutes: 15,
      seed: 5,
      due: generatePool(1, 120, 'review'),
      fresh: generatePool(2, 60, 'new'),
    });
    expect(new Set(session.entries.map((entry) => entry.id)).size).toBe(session.entries.length);
  });
});

/**
 * SPEC §7.2's last 5%, and SPEC §3.3 step 3: *"the session composer injects
 * targeted drills when a category's estimate is below threshold."*
 */
describe('contrastive drills (SPEC §7.2, §3.3)', () => {
  const drills = (count: number): Candidate[] =>
    Array.from({ length: count }, (_, index) => ({
      id: `ARTICLES-${index}`,
      itemId: `ARTICLES-${index}`,
      cardId: null,
      slice: 'drill' as const,
      ladderLevel: 0 as const,
      clusterId: 'c:ARTICLES',
      retrievability: 0,
      lapses: 0,
    }));

  it('includes a drill when one is offered', () => {
    const session = composeSession({
      budgetMinutes: 4,
      seed: 1,
      due: generatePool(1, 20, 'review'),
      fresh: [],
      drills: drills(1),
    });
    expect(session.allocation.drill).toBe(1);
    expect(session.entries.some((entry) => entry.slice === 'drill')).toBe(true);
  });

  it('keeps drills to roughly the 5% the spec asks for, not a session full', () => {
    // Twenty are offered; the budget buys one or two. A composer that let the
    // weakest category fill the session would turn practice into remediation.
    const session = composeSession({
      budgetMinutes: 4,
      seed: 2,
      due: generatePool(2, 40, 'review'),
      fresh: generatePool(3, 20, 'new'),
      drills: drills(20),
    });
    expect(session.allocation.drill).toBeGreaterThan(0);
    expect(session.allocation.drill).toBeLessThanOrEqual(2);
  });

  it('does not hand the drill slice its leftovers when reviews run dry', () => {
    // Nothing due, nothing new, twenty drills waiting: still not a drill
    // session. The spare goes unspent rather than to the smallest slice.
    const session = composeSession({
      budgetMinutes: 15,
      seed: 3,
      due: [],
      fresh: [],
      drills: drills(20),
    });
    expect(session.allocation.drill).toBeLessThanOrEqual(4);
  });

  it('composes a perfectly ordinary session when there are no drills at all', () => {
    // A learner with no measured weakness — and Japanese, until M6 authors its
    // pack — gets no drills, and nothing else changes.
    const session = composeSession({
      budgetMinutes: 4,
      seed: 4,
      due: generatePool(4, 20, 'review'),
      fresh: [],
    });
    expect(session.allocation.drill).toBe(0);
    expect(session.entries.length).toBeGreaterThan(0);
    expect(violations(session.entries).typeViolations).toBe(0);
  });

  it('treats a drill as its own card type for §2.8 purposes', () => {
    // Three drills back to back is blocked practice, whatever their ladder
    // level says.
    const session = composeSession({
      budgetMinutes: 15,
      seed: 5,
      due: generatePool(5, 30, 'review'),
      fresh: [],
      drills: drills(6),
    });
    expect(violations(session.entries).typeViolations).toBe(0);
  });
});
