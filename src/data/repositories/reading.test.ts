import { beforeEach, describe, expect, it } from 'vitest';
import { db, AppendOnlyViolation } from '../db.ts';
import { readingAttempts, recordReadingAttempt } from './reading.ts';

const NOW = Date.UTC(2026, 5, 1, 9, 0, 0);

const attempt = (overrides: Partial<Parameters<typeof recordReadingAttempt>[0]> = {}) =>
  recordReadingAttempt({
    profileId: 'p1',
    lang: 'en',
    passageId: 'simplewiki:Water:0',
    itemId: 'en:lex:water',
    correct: true,
    answerRaw: 'water',
    coverage: 0.95,
    now: NOW,
    ...overrides,
  });

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('recordReadingAttempt (SPEC §9)', () => {
  it('records the answer and the coverage it was given at', async () => {
    // A right answer at 0.99 coverage and one at 0.92 are not the same
    // evidence, and the difference cannot be recovered afterwards.
    const saved = await attempt({ coverage: 0.92 });
    expect(saved.coverage).toBe(0.92);
    expect(await db.readingAttempts.count()).toBe(1);
  });

  it('never becomes a review log or a card', async () => {
    // D32's rule, applied to passages: a passage has no FSRS state, so filing
    // this among the review logs would put an unscheduled item into the
    // retention rate §9 promises to report honestly.
    await attempt();
    expect(await db.reviewLogs.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
  });

  it('is append-only, like every other attempt log', async () => {
    const saved = await attempt();
    await expect(db.readingAttempts.update(saved.id, { correct: 0 })).rejects.toBeInstanceOf(
      AppendOnlyViolation,
    );
    await expect(db.readingAttempts.delete(saved.id)).rejects.toBeInstanceOf(AppendOnlyViolation);
  });

  it('scopes evidence to its language', async () => {
    await attempt();
    await attempt({ lang: 'ja', passageId: 'p2' });
    expect(await readingAttempts('p1', 'en')).toHaveLength(1);
    expect(await readingAttempts('p1', 'ja')).toHaveLength(1);
  });
});
