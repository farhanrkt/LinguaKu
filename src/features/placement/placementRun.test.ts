import { describe, expect, it } from 'vitest';
import {
  abilityFrom,
  buildProbePool,
  correctedAbility,
  emptyPlacement,
  nextProbe,
  PSEUDO_EVERY,
  recordAnswer,
  tallyFrom,
  type PlacementState,
} from './placementRun.ts';
import { MAX_DURATION_MS, MAX_ITEMS, PRIOR_MEAN, PRIOR_SD } from '../../core/placement.ts';

const NOW = 1_000_000;

const words = Array.from({ length: 60 }, (_, i) => ({
  id: `en:lex:w${i}`,
  headword: `w${i}`,
  freqRank: 50 + i * 140,
}));
const pseudowords = Array.from({ length: 20 }, (_, i) => `blorf${i}`);
const pool = buildProbePool(words, pseudowords, 1);

/** Runs a whole placement against a learner who knows words up to `knownRank`. */
const simulate = (knownRank: number, alsoClaimsPseudowords = false): PlacementState => {
  let state = emptyPlacement(NOW);
  for (let step = 0; step < 60; step++) {
    const probe = nextProbe({ state, pool, now: NOW + step * 2000 });
    if (!probe) break;
    const knows =
      probe.kind === 'pseudo'
        ? alsoClaimsPseudowords
        : (words.find((word) => word.id === probe.id)?.freqRank ?? 0) <= knownRank;
    state = recordAnswer(state, probe, knows);
  }
  return state;
};

describe('probe pool', () => {
  it('gives real words a difficulty and pseudowords none', () => {
    expect(Number.isFinite(pool.real[0]!.difficulty)).toBe(true);
    expect(Number.isNaN(pool.pseudo[0]!.difficulty)).toBe(true);
  });

  it('is deterministic for a seed', () => {
    expect(buildProbePool(words, pseudowords, 5).pseudo.map((p) => p.word)).toEqual(
      buildProbePool(words, pseudowords, 5).pseudo.map((p) => p.word),
    );
  });
});

describe('running a placement (SPEC §4.2)', () => {
  it('stays inside the item cap', () => {
    expect(simulate(4000).asked.length).toBeLessThanOrEqual(MAX_ITEMS);
  });

  it('stops at 90 seconds', () => {
    let state = emptyPlacement(NOW);
    const probe = nextProbe({ state, pool, now: NOW });
    state = recordAnswer(state, probe!, true);
    expect(nextProbe({ state, pool, now: NOW + MAX_DURATION_MS })).toBeNull();
  });

  it('interleaves pseudowords rather than clustering them', () => {
    const state = simulate(4000);
    const positions = state.asked.flatMap((probe, i) => (probe.kind === 'pseudo' ? [i] : []));
    expect(positions.length).toBeGreaterThan(1);
    for (const position of positions) expect((position + 1) % PSEUDO_EVERY).toBe(0);
  });

  it('never asks the same probe twice', () => {
    const state = simulate(4000);
    expect(new Set(state.asked.map((probe) => probe.id)).size).toBe(state.asked.length);
  });

  it('separates learners of different sizes', () => {
    const beginner = abilityFrom(simulate(300)).theta;
    const intermediate = abilityFrom(simulate(2500)).theta;
    const advanced = abilityFrom(simulate(8000)).theta;

    expect(beginner).toBeLessThan(intermediate);
    expect(intermediate).toBeLessThan(advanced);
  });

  it('is more certain at the end than the prior was at the start', () => {
    expect(abilityFrom(simulate(2500)).standardError).toBeLessThan(PRIOR_SD);
  });
});

describe('over-claiming (SPEC §4.2)', () => {
  it('leaves an honest learner alone', () => {
    const honest = simulate(2500, false);
    expect(correctedAbility(honest).theta).toBeCloseTo(abilityFrom(honest).theta, 5);
  });

  it('pulls a learner who claims every pseudoword back toward the prior', () => {
    const inflated = simulate(8000, true);
    const corrected = correctedAbility(inflated);
    expect(Math.abs(corrected.theta - PRIOR_MEAN)).toBeLessThan(
      Math.abs(abilityFrom(inflated).theta - PRIOR_MEAN),
    );
  });

  it('widens the uncertainty when the self-report cannot be trusted', () => {
    const inflated = simulate(8000, true);
    expect(correctedAbility(inflated).standardError).toBeGreaterThan(
      abilityFrom(inflated).standardError,
    );
  });

  it('never ends up less certain than the prior it started from', () => {
    // Evidence can fail to narrow what we knew; it cannot un-know it. An
    // uncapped correction produced bands spanning the whole scale.
    const inflated = simulate(8000, true);
    expect(correctedAbility(inflated).standardError).toBeLessThanOrEqual(PRIOR_SD);
  });

  it('counts hits and false alarms separately', () => {
    const tally = tallyFrom(simulate(8000, true));
    expect(tally.realShown).toBeGreaterThan(0);
    expect(tally.pseudoShown).toBeGreaterThan(0);
    expect(tally.falseAlarms).toBe(tally.pseudoShown);
  });

  it('does not correct when no pseudowords were shown', () => {
    const state = recordAnswer(emptyPlacement(NOW), pool.real[0]!, true);
    expect(correctedAbility(state)).toEqual(abilityFrom(state));
  });
});

describe('a skipped placement', () => {
  it('leaves the estimate exactly at the prior', () => {
    const estimate = abilityFrom(emptyPlacement(NOW));
    expect(estimate.theta).toBeCloseTo(PRIOR_MEAN, 5);
    expect(estimate.standardError).toBeCloseTo(PRIOR_SD, 1);
  });
});
