import { describe, expect, it } from 'vitest';
import {
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
    typeRun =
      cardTypeForLevel(current.ladderLevel) === cardTypeForLevel(previous.ladderLevel)
        ? typeRun + 1
        : 1;
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

describe('interleaving (SPEC §2.8 acceptance)', () => {
  it('finds no violation across 1,000 generated sessions', () => {
    let relaxedCount = 0;
    for (let seed = 0; seed < 1000; seed++) {
      const session = composeSession({
        budgetMinutes: 15,
        seed,
        due: generatePool(seed, 60, 'review'),
        fresh: generatePool(seed + 10_000, 30, 'new'),
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
