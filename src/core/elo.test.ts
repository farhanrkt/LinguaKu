import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ITEM_DIFFICULTY,
  DEFAULT_RATING,
  drillPriority,
  emptyRating,
  expectedScore,
  isWeak,
  kFactor,
  MIN_ATTEMPTS_TO_CLAIM,
  rankWeaknesses,
  standingFor,
  updateRating,
  WEAKNESS_RATING,
  type CategoryRating,
} from './elo.ts';

const rate = (overrides: Partial<CategoryRating> = {}): CategoryRating => ({
  ...emptyRating(),
  ...overrides,
});

/** Answers a run of drills at median difficulty. */
const run = (start: CategoryRating, outcomes: readonly boolean[]): CategoryRating =>
  outcomes.reduce((current, correct) => updateRating({ current, correct }), start);

describe('expectedScore', () => {
  it('is a coin flip when learner and item are level', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5);
  });

  it('rises with the learner and falls with the item', () => {
    expect(expectedScore(1600, 1200)).toBeGreaterThan(0.5);
    expect(expectedScore(800, 1200)).toBeLessThan(0.5);
  });

  it('puts a 400-point gap at the classic ~91%', () => {
    expect(expectedScore(1600, 1200)).toBeCloseTo(10 / 11, 3);
  });
});

describe('kFactor', () => {
  it('moves fast while the estimate is provisional and slows as evidence piles up', () => {
    expect(kFactor(0)).toBeGreaterThan(kFactor(15));
    expect(kFactor(15)).toBeGreaterThan(kFactor(100));
  });

  it('never lets one late slip rewrite a well-evidenced estimate', () => {
    const settled = rate({ rating: 1400, attempts: 60, correct: 45 });
    const after = updateRating({ current: settled, correct: false });
    expect(settled.rating - after.rating).toBeLessThan(15);
  });
});

describe('updateRating', () => {
  it('rises on a right answer and falls on a wrong one', () => {
    expect(updateRating({ current: emptyRating(), correct: true }).rating).toBeGreaterThan(
      DEFAULT_RATING,
    );
    expect(updateRating({ current: emptyRating(), correct: false }).rating).toBeLessThan(
      DEFAULT_RATING,
    );
  });

  it('counts every answer, right or wrong', () => {
    const after = run(emptyRating(), [true, false, true]);
    expect(after.attempts).toBe(3);
    expect(after.correct).toBe(2);
  });

  it('rewards a hard item more than an easy one', () => {
    const hard = updateRating({ current: emptyRating(), correct: true, itemDifficulty: 1500 });
    const easy = updateRating({ current: emptyRating(), correct: true, itemDifficulty: 900 });
    expect(hard.rating).toBeGreaterThan(easy.rating);
  });

  it('punishes failing an easy item more than failing a hard one', () => {
    const hard = updateRating({ current: emptyRating(), correct: false, itemDifficulty: 1500 });
    const easy = updateRating({ current: emptyRating(), correct: false, itemDifficulty: 900 });
    expect(easy.rating).toBeLessThan(hard.rating);
  });

  it('converges towards a learner who really is at a given level', () => {
    // Someone who gets ~90% of median drills right should settle well above
    // the median, not oscillate around it.
    const outcomes = Array.from({ length: 60 }, (_, i) => i % 10 !== 0);
    const after = run(emptyRating(), outcomes);
    expect(after.rating).toBeGreaterThan(DEFAULT_ITEM_DIFFICULTY + 200);
    expect(expectedScore(after.rating, DEFAULT_ITEM_DIFFICULTY)).toBeGreaterThan(0.8);
  });
});

describe('weakness (SPEC §2.15 — no claim without evidence)', () => {
  it('never calls a category weak on too little evidence', () => {
    // Four wrong answers is a bad afternoon, not a finding.
    const thin = run(emptyRating(), [false, false, false, false]);
    expect(thin.attempts).toBeLessThan(MIN_ATTEMPTS_TO_CLAIM);
    expect(isWeak(thin)).toBe(false);
  });

  it('does call it weak once the evidence is there', () => {
    const evidenced = run(emptyRating(), [false, false, false, false, false, false]);
    expect(evidenced.attempts).toBeGreaterThanOrEqual(MIN_ATTEMPTS_TO_CLAIM);
    expect(isWeak(evidenced)).toBe(true);
  });

  it('leaves a learner who is doing fine alone', () => {
    // Twelve, not five. Clearing the bar means "you would be expected to get
    // three median drills in four right", and the damped K-factor makes that a
    // claim you have to earn — which is the point of setting a bar at all.
    const solid = run(emptyRating(), Array.from({ length: 12 }, () => true));
    expect(solid.rating).toBeGreaterThan(WEAKNESS_RATING);
    expect(isWeak(solid)).toBe(false);
  });

  it('still counts a mostly-right learner as weak while the evidence is thin', () => {
    // Eight straight correct is genuinely good and still short of the bar. That
    // is deliberate: it costs a learner a few extra drills in a category they
    // are fine at, which is far cheaper than declaring a weakness resolved on
    // eight answers.
    const promising = run(emptyRating(), Array.from({ length: 8 }, () => true));
    expect(promising.rating).toBeLessThan(WEAKNESS_RATING);
  });

  it('reports an unattempted category as unmeasured, not as average', () => {
    const standing = standingFor('ARTICLES', emptyRating());
    expect(standing.measured).toBe(false);
    expect(standing.weak).toBe(false);
    expect(standing.attempts).toBe(0);
  });
});

describe('rankWeaknesses (the heatmap order)', () => {
  const standings = [
    standingFor('ARTICLES', rate({ rating: 1000, attempts: 12, correct: 4 })),
    standingFor('PLURAL_S', rate({ rating: 1400, attempts: 10, correct: 9 })),
    standingFor('COPULA_BE', rate({ rating: 1100, attempts: 8, correct: 4 })),
    standingFor('WORD_STRESS', rate({ rating: 900, attempts: 2, correct: 0 })),
  ];

  it('puts the weakest measured category first', () => {
    expect(rankWeaknesses(standings).map((s) => s.categoryId)).toEqual([
      'ARTICLES',
      'COPULA_BE',
      'PLURAL_S',
    ]);
  });

  it('excludes categories with too little evidence entirely', () => {
    // WORD_STRESS has the lowest rating of the lot and is still left out —
    // two answers is not a measurement, and topping the heatmap with it would
    // be the fake precision SPEC §2.15 bans.
    expect(rankWeaknesses(standings).map((s) => s.categoryId)).not.toContain('WORD_STRESS');
  });

  it('is stable when ratings tie', () => {
    const tied = [
      standingFor('BBB', rate({ rating: 1000, attempts: 10, correct: 3 })),
      standingFor('AAA', rate({ rating: 1000, attempts: 10, correct: 3 })),
    ];
    expect(rankWeaknesses(tied).map((s) => s.categoryId)).toEqual(['AAA', 'BBB']);
  });
});

describe('drillPriority (SPEC §3.3 — what the composer targets)', () => {
  it('targets measured weaknesses before anything else', () => {
    const priority = drillPriority([
      standingFor('SOLID', rate({ rating: 1500, attempts: 20, correct: 18 })),
      standingFor('WEAK', rate({ rating: 950, attempts: 20, correct: 6 })),
      standingFor('UNSEEN', emptyRating()),
    ]);
    expect(priority[0]).toBe('WEAK');
  });

  it('explores unmeasured categories rather than leaving them blank forever', () => {
    const priority = drillPriority([
      standingFor('SOLID', rate({ rating: 1500, attempts: 20, correct: 18 })),
      standingFor('UNSEEN', emptyRating()),
    ]);
    expect(priority).toContain('UNSEEN');
  });

  it('does not drill what the learner can already do', () => {
    const priority = drillPriority([
      standingFor('SOLID', rate({ rating: 1500, attempts: 20, correct: 18 })),
      standingFor('ALSO_SOLID', rate({ rating: 1600, attempts: 30, correct: 29 })),
    ]);
    expect(priority).toEqual([]);
  });
});
