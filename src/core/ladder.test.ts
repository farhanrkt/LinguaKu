import { describe, expect, it } from 'vitest';
import {
  isMastered,
  LEECH_LAPSE_THRESHOLD,
  MAX_ENABLED_LEVEL,
  nextLadderLevel,
  PROMOTION_STABILITY_DAYS,
  recentAccuracy,
} from './ladder.ts';
import type { Grade, LadderLevel } from '../data/types.ts';

const decide = (overrides: Partial<Parameters<typeof nextLadderLevel>[0]> = {}) =>
  nextLadderLevel({
    level: 1,
    grade: 3,
    stabilityDays: 100,
    recentGrades: [3, 3, 3],
    lapses: 0,
    ...overrides,
  });

describe('recentAccuracy', () => {
  it('counts Hard as a success — the learner did retrieve it', () => {
    expect(recentAccuracy([2, 2, 2])).toBe(1);
  });

  it('counts only Again as a failure', () => {
    expect(recentAccuracy([3, 1, 3])).toBeCloseTo(2 / 3);
    expect(recentAccuracy([1, 1, 3])).toBeCloseTo(1 / 3);
  });

  it('looks at the last three only', () => {
    expect(recentAccuracy([3, 3, 3, 1, 1, 1])).toBe(1);
  });

  it('works with a short history rather than blocking on three reviews', () => {
    expect(recentAccuracy([3])).toBe(1);
    expect(recentAccuracy([])).toBe(0);
  });
});

describe('promotion (SPEC §2.3)', () => {
  it('advances when stability and accuracy both clear the bar', () => {
    expect(decide({ level: 1, stabilityDays: PROMOTION_STABILITY_DAYS[1] })).toMatchObject({
      level: 2,
      change: 'promoted',
    });
  });

  it('holds when stability is short of the threshold', () => {
    expect(decide({ level: 1, stabilityDays: PROMOTION_STABILITY_DAYS[1] - 0.1 })).toMatchObject({
      level: 1,
      change: 'held',
    });
  });

  it('holds when the last three answers are worse than 2/3', () => {
    expect(decide({ recentGrades: [3, 1, 1] })).toMatchObject({ level: 1, change: 'held' });
  });

  it('lets a first exposure graduate straight out of L0', () => {
    expect(decide({ level: 0, stabilityDays: 0, recentGrades: [3] })).toMatchObject({
      level: 1,
      change: 'promoted',
    });
  });

  it('does not promote past the rungs that are actually implemented', () => {
    const decision = decide({ level: MAX_ENABLED_LEVEL, stabilityDays: 10_000 });
    expect(decision.level).toBe(MAX_ENABLED_LEVEL);
    expect(decision.change).toBe('held');
  });
});

describe('demotion', () => {
  it('drops a level when the retrieval failed', () => {
    expect(decide({ level: 2, grade: 1 })).toMatchObject({ level: 1, change: 'demoted' });
  });

  it('cannot fall below the first rung', () => {
    expect(decide({ level: 0, grade: 1 })).toMatchObject({ level: 0, change: 'held' });
  });

  it('never promotes on a failed answer, however strong the card looks', () => {
    expect(decide({ level: 1, grade: 1, stabilityDays: 10_000 }).change).not.toBe('promoted');
  });
});

describe('leeches (SPEC §7.2)', () => {
  it('flags a card that has lapsed too many times', () => {
    expect(decide({ grade: 1, lapses: LEECH_LAPSE_THRESHOLD }).leech).toBe(true);
    expect(decide({ grade: 1, lapses: LEECH_LAPSE_THRESHOLD - 1 }).leech).toBe(false);
  });

  it('demotes the leech rather than repeating the same task', () => {
    expect(decide({ level: 3, grade: 1, lapses: 7 })).toMatchObject({
      level: 2,
      change: 'demoted',
      leech: true,
    });
  });
});

describe('mastery (SPEC §2.3 acceptance)', () => {
  it('cannot be reached by an item only ever answered at L1', () => {
    // Recognition alone must never read as "mastered", however stable it is.
    for (const level of [0, 1, 2] as LadderLevel[]) {
      expect(isMastered(level, 10_000)).toBe(false);
    }
  });

  it('needs both a high rung and real strength', () => {
    expect(isMastered(3, 20)).toBe(false);
    expect(isMastered(3, 21)).toBe(true);
  });
});

describe('a whole item lifecycle', () => {
  it('climbs on success and falls back on failure', () => {
    let level: LadderLevel = 0;
    const history: Grade[] = [];
    const step = (grade: Grade, stabilityDays: number, lapses = 0) => {
      history.unshift(grade);
      level = nextLadderLevel({ level, grade, stabilityDays, recentGrades: history, lapses }).level;
      return level;
    };

    expect(step(3, 3)).toBe(1); // out of errorless exposure
    expect(step(3, 3)).toBe(1); // not stable enough for recall yet
    expect(step(3, 6)).toBe(2); // recognition is solid → recall
    expect(step(1, 2, 1)).toBe(1); // forgot it → back to recognition
    expect(step(3, 12)).toBe(2);
    expect(step(3, 15)).toBe(3); // → cloze
    expect(isMastered(level, 30)).toBe(true);
  });
});
