import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db.ts';
import {
  activeDeferrals,
  deferItem,
  deferralWindow,
  deferredItemIds,
  undeferItem,
} from './deferrals.ts';
import type { Item } from '../types.ts';

/**
 * SPEC §2.14: *"can always skip an item (belum perlu)"*.
 *
 * The property that matters most here is a negative one — a skip must leave the
 * scheduler completely alone. Recording it as a lapse would let a learner
 * exercising autonomy damage their own schedule, and would put an item nobody
 * answered into the §9 retention rate.
 */

const NOW = Date.UTC(2026, 7, 11, 9, 0, 0);
const DAY = 86_400_000;

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('deferralWindow escalates and then stops', () => {
  it('treats the first skip as "not today", not "never"', () => {
    expect(deferralWindow(1)).toBe(3 * DAY);
  });

  it('lengthens as the learner keeps declining', () => {
    expect(deferralWindow(2)).toBe(7 * DAY);
    expect(deferralWindow(3)).toBe(21 * DAY);
    expect(deferralWindow(4)).toBe(60 * DAY);
  });

  it('caps rather than deleting — §2.14 is autonomy, not removal', () => {
    expect(deferralWindow(9)).toBe(60 * DAY);
    expect(deferralWindow(100)).toBe(60 * DAY);
  });
});

describe('deferItem', () => {
  it('hides the item until its window lapses', async () => {
    await deferItem('p1', 'en:lex:the', NOW);
    expect(await deferredItemIds('p1', NOW)).toEqual(new Set(['en:lex:the']));
    expect(await deferredItemIds('p1', NOW + 2 * DAY)).toEqual(new Set(['en:lex:the']));
    expect(await deferredItemIds('p1', NOW + 4 * DAY)).toEqual(new Set());
  });

  it('writes nothing to the scheduler — no card, no log', async () => {
    await deferItem('p1', 'en:lex:the', NOW);
    // Invariant 0 and §2.2: a skip is not an answer, so it produces neither.
    expect(await db.cards.count()).toBe(0);
    expect(await db.reviewLogs.count()).toBe(0);
  });

  it('escalates when the same item is declined again', async () => {
    await deferItem('p1', 'en:lex:the', NOW);
    await deferItem('p1', 'en:lex:the', NOW + 4 * DAY);
    const row = await db.deferredItems.get(['p1', 'en:lex:the']);
    expect(row?.times).toBe(2);
    expect(row?.until).toBe(NOW + 4 * DAY + 7 * DAY);
  });

  /**
   * The escalation has to survive the window lapsing, or the fifth refusal is
   * treated as the first and the learner is asked forever.
   */
  it('remembers past refusals after a window has expired', async () => {
    await deferItem('p1', 'en:lex:the', NOW);
    expect(await deferredItemIds('p1', NOW + 10 * DAY)).toEqual(new Set());
    // Expired, but not forgotten.
    expect((await db.deferredItems.get(['p1', 'en:lex:the']))?.times).toBe(1);
    await deferItem('p1', 'en:lex:the', NOW + 10 * DAY);
    expect((await db.deferredItems.get(['p1', 'en:lex:the']))?.times).toBe(2);
  });

  it('keeps profiles apart', async () => {
    await deferItem('p1', 'en:lex:the', NOW);
    expect(await deferredItemIds('p2', NOW)).toEqual(new Set());
  });

  it('can be undone by a learner who changes their mind', async () => {
    await deferItem('p1', 'en:lex:the', NOW);
    await undeferItem('p1', 'en:lex:the', NOW);
    expect(await deferredItemIds('p1', NOW)).toEqual(new Set());
  });

  it('keeps the escalation record when it is undone', async () => {
    // `times` is why the fourth skip buries a word for 60 days and the first
    // for 3. Deleting the row on undo would treat a learner who had declined
    // four times and reconsidered once as someone who never declined at all.
    await deferItem('p1', 'en:lex:the', NOW);
    await deferItem('p1', 'en:lex:the', NOW);
    await undeferItem('p1', 'en:lex:the', NOW);

    expect(await deferredItemIds('p1', NOW)).toEqual(new Set());
    expect((await db.deferredItems.get(['p1', 'en:lex:the']))?.times).toBe(2);

    // So the next skip is the third, not the first: 21 days, not 3.
    await deferItem('p1', 'en:lex:the', NOW);
    expect((await db.deferredItems.get(['p1', 'en:lex:the']))?.until).toBe(
      NOW + deferralWindow(3),
    );
  });

  it('does nothing when there is nothing to undo', async () => {
    await expect(undeferItem('p1', 'en:lex:never', NOW)).resolves.toBeUndefined();
  });
});

describe('the words a learner has set aside (SPEC §2.14)', () => {
  const item = (id: string, headword: string): Item => ({
    id,
    lang: 'en',
    kind: 'lexeme',
    headword,
    anchorSentenceIds: [],
    freqRank: 1,
    band: 1,
    sourceRef: { dataset: 'tatoeba', externalId: id },
  });

  it('lists them soonest to return first, with the word itself', async () => {
    await db.items.bulkPut([item('en:lex:the', 'the'), item('en:lex:bank', 'bank')]);
    // Two skips on `bank` buries it for 7 days; one on `the` for 3.
    await deferItem('p1', 'en:lex:bank', NOW);
    await deferItem('p1', 'en:lex:bank', NOW);
    await deferItem('p1', 'en:lex:the', NOW);

    const rows = await activeDeferrals('p1', NOW);
    expect(rows.map((row) => row.headword)).toEqual(['the', 'bank']);
    expect(rows[0]?.times).toBe(1);
  });

  it('leaves out the ones that have already lapsed', async () => {
    await db.items.put(item('en:lex:the', 'the'));
    await deferItem('p1', 'en:lex:the', NOW);
    expect(await activeDeferrals('p1', NOW + deferralWindow(1) + 1)).toEqual([]);
  });

  it('drops a word the content no longer carries rather than inventing one', async () => {
    await deferItem('p1', 'en:lex:gone', NOW);
    expect(await activeDeferrals('p1', NOW)).toEqual([]);
  });

  it('keeps profiles apart', async () => {
    await db.items.put(item('en:lex:the', 'the'));
    await deferItem('p1', 'en:lex:the', NOW);
    expect(await activeDeferrals('p2', NOW)).toEqual([]);
  });
});
