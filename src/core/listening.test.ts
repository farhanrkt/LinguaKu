import { describe, expect, it } from 'vitest';
import { estimateListening, LISTENING_MIN_ANSWERS, type ListeningAnswer } from './listening.ts';

const answers = (count: number, correct: boolean, freqRank = 800): ListeningAnswer[] =>
  Array.from({ length: count }, () => ({ freqRank, correct }));

describe('estimateListening', () => {
  it('returns nothing until there is enough evidence to report', () => {
    // D25's rule: absent reads as "not measured"; a number from two answers
    // reads as a measurement, which is the fake precision §2.15 bans.
    expect(estimateListening(answers(LISTENING_MIN_ANSWERS - 1, true))).toBeNull();
    expect(estimateListening([])).toBeNull();
    expect(estimateListening(answers(LISTENING_MIN_ANSWERS, true))).not.toBeNull();
  });

  it('places a learner who hears rare words above one who misses common ones', () => {
    const strong = estimateListening(answers(10, true, 4_000));
    const weak = estimateListening(answers(10, false, 400));
    expect(strong).not.toBeNull();
    expect(weak).not.toBeNull();
    expect(strong!.theta).toBeGreaterThan(weak!.theta);
  });

  it('gets more certain as answers accumulate', () => {
    const few = estimateListening(answers(5, true))!;
    const many = estimateListening(answers(25, true))!;
    expect(many.standardError).toBeLessThan(few.standardError);
  });

  it('never returns an estimate more certain than the prior allows', () => {
    // Mixed answers can fail to narrow anything; the grid posterior is what
    // keeps that honest rather than an MLE running off to an extreme.
    const mixed = estimateListening([
      { freqRank: 500, correct: true },
      { freqRank: 500, correct: false },
      { freqRank: 2_000, correct: true },
      { freqRank: 2_000, correct: false },
      { freqRank: 6_000, correct: true },
      { freqRank: 6_000, correct: false },
    ])!;
    expect(Number.isFinite(mixed.theta)).toBe(true);
    expect(mixed.standardError).toBeGreaterThan(0);
  });
});
