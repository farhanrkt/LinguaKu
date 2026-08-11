import { describe, expect, it } from 'vitest';
import { buildRecap, RECAP_DAYS } from './recap.ts';

/**
 * SPEC §9's weekly recap. Most of what is worth testing is restraint: the recap
 * must summarise a week without inventing a scoreboard, a target or a decline.
 */

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 11, 9, 0, 0);
const LONG_AGO = NOW - 120 * DAY;

const review = (at: number, itemId: string, correct = true) => ({ at, itemId, correct });

const base = {
  reviews: [],
  drillsAt: [],
  masteredAt: [],
  now: NOW,
};

describe('buildRecap', () => {
  it('says plainly when the week holds nothing', () => {
    const recap = buildRecap(base, new Map(), LONG_AGO);
    expect(recap.hasData).toBe(false);
    expect(recap.met).toBe(0);
    expect(recap.daysPractised).toBe(0);
  });

  /**
   * "First time" is a fact about the learner's whole history, not about the
   * window. A word first met three months ago and reviewed today is
   * strengthened; deriving it from the window would call it new every week.
   */
  it('separates a word met this week from one met months ago', () => {
    const firstSeen = new Map([
      ['new-word', NOW - 2 * DAY],
      ['old-word', LONG_AGO],
    ]);
    const recap = buildRecap(
      {
        ...base,
        reviews: [review(NOW - 2 * DAY, 'new-word'), review(NOW - DAY, 'old-word')],
      },
      firstSeen,
      LONG_AGO,
    );
    expect(recap.met).toBe(1);
    expect(recap.strengthened).toBe(1);
  });

  it('counts a word once however often it came round', () => {
    const firstSeen = new Map([['word', LONG_AGO]]);
    const recap = buildRecap(
      {
        ...base,
        reviews: [review(NOW - 3 * DAY, 'word'), review(NOW - DAY, 'word'), review(NOW, 'word')],
      },
      firstSeen,
      LONG_AGO,
    );
    // Capability, not volume: three retrievals of one word is one word stronger.
    expect(recap.strengthened).toBe(1);
  });

  it('ignores everything outside the window', () => {
    const firstSeen = new Map([['word', LONG_AGO]]);
    const recap = buildRecap(
      {
        ...base,
        reviews: [review(NOW - (RECAP_DAYS + 2) * DAY, 'word')],
      },
      firstSeen,
      LONG_AGO,
    );
    expect(recap.hasData).toBe(false);
    expect(recap.strengthened).toBe(0);
  });

  it('counts days, not answers', () => {
    const firstSeen = new Map([['a', LONG_AGO], ['b', LONG_AGO]]);
    const recap = buildRecap(
      {
        ...base,
        reviews: [
          review(NOW - 2 * DAY, 'a'),
          review(NOW - 2 * DAY + 3_600_000, 'b'),
          review(NOW - DAY, 'a'),
        ],
      },
      firstSeen,
      LONG_AGO,
    );
    expect(recap.daysPractised).toBe(2);
  });

  it('counts a day on which only drills were answered', () => {
    const recap = buildRecap(
      { ...base, drillsAt: [NOW - DAY] },
      new Map(),
      LONG_AGO,
    );
    // A drill is practice even though it is not a review (D32).
    expect(recap.drills).toBe(1);
    expect(recap.daysPractised).toBe(1);
    expect(recap.hasData).toBe(true);
  });

  /**
   * §2.14 bans anything that reads as a shortfall. A learner in their first
   * week has no previous week; comparing against an empty range would
   * manufacture a decline out of the fact that they are new.
   */
  it('offers no comparison to a week that did not exist', () => {
    const recap = buildRecap({ ...base, reviews: [review(NOW, 'a')] }, new Map(), NOW - 3 * DAY);
    expect(recap.previousDaysPractised).toBeNull();
  });

  it('compares to the previous week once there is one', () => {
    const firstSeen = new Map([['a', LONG_AGO]]);
    const recap = buildRecap(
      {
        ...base,
        reviews: [
          review(NOW - DAY, 'a'),
          review(NOW - 9 * DAY, 'a'),
          review(NOW - 10 * DAY, 'a'),
        ],
      },
      firstSeen,
      LONG_AGO,
    );
    expect(recap.daysPractised).toBe(1);
    expect(recap.previousDaysPractised).toBe(2);
  });

  it('reports mastery reached inside the window only', () => {
    const recap = buildRecap(
      { ...base, masteredAt: [NOW - 2 * DAY, NOW - 30 * DAY] },
      new Map(),
      LONG_AGO,
    );
    expect(recap.mastered).toBe(1);
  });
});
