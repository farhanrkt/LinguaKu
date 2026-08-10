import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db.ts';
import { cardIdFor, dueCards, recordReview } from './reviews.ts';
import type { Grade } from '../types.ts';

const PROFILE = 'p1';
const ITEM = 'en:lex:try';
const NOW = Date.UTC(2026, 5, 1, 9, 0, 0);
const DAY = 86_400_000;

const answer = (grade: Grade, at: number, overrides: Partial<Parameters<typeof recordReview>[0]> = {}) =>
  recordReview({
    profileId: PROFILE,
    itemId: ITEM,
    grade,
    confidence: null,
    latencyMs: 1200,
    answerRaw: 'try',
    correct: grade > 1,
    now: at,
    ...overrides,
  });

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('recordReview (SPEC §2.2)', () => {
  it('creates the card on the first answer, not before', async () => {
    expect(await db.cards.count()).toBe(0);
    const { card } = await answer(3, NOW);
    expect(card.id).toBe(cardIdFor(PROFILE, ITEM));
    expect(await db.cards.count()).toBe(1);
  });

  it('always writes a log alongside the state change', async () => {
    await answer(3, NOW);
    const logs = await db.reviewLogs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      cardId: cardIdFor(PROFILE, ITEM),
      ladderLevel: 0,
      rating: 3,
      correct: 1,
      reviewedAt: NOW,
    });
  });

  it('records the state as it was *before* the answer, for later analysis', async () => {
    const first = await answer(3, NOW);
    await answer(3, NOW + DAY);
    const logs = await db.reviewLogs.orderBy('reviewedAt').toArray();
    expect(logs[1]?.stateBefore).toEqual(first.card.fsrs);
  });

  it('keeps the confidence signal without letting it touch the rating', async () => {
    // SPEC §2.12: the signal is recorded for calibration, never applied.
    const sure = await answer(3, NOW, { confidence: 'yakin' });
    await db.delete();
    await db.open();
    const unsure = await answer(3, NOW, { confidence: 'ragu' });

    expect((await db.reviewLogs.toArray())[0]?.confidence).toBe('ragu');
    expect(unsure.card.fsrs).toEqual(sure.card.fsrs);
  });

  it('advances the schedule into the future', async () => {
    const { card } = await answer(3, NOW);
    expect(card.dueAt).toBeGreaterThan(NOW);
    expect(card.dueAt).toBe(card.fsrs.dueAt);
  });

  it('never loses a log, however many reviews accumulate', async () => {
    let at = NOW;
    for (let i = 0; i < 6; i++) {
      const { card } = await answer(3, at);
      at = card.dueAt;
    }
    expect(await db.reviewLogs.count()).toBe(6);
  });
});

describe('ladder integration', () => {
  it('promotes off the exposure rung after one confirmed answer', async () => {
    const { card, decision, answeredAt } = await answer(3, NOW);
    expect(answeredAt).toBe(0);
    expect(decision.change).toBe('promoted');
    expect(card.ladderLevel).toBe(1);
  });

  it('demotes on a failed retrieval', async () => {
    let at = NOW;
    let card = (await answer(3, at)).card; // → L1
    at = card.dueAt;
    card = (await answer(1, at)).card;
    expect(card.ladderLevel).toBe(0);
  });

  it('counts only answers given at the current rung towards promotion', async () => {
    // Two right answers at L0 must not smuggle an L1 card up the ladder.
    const first = await answer(3, NOW);
    expect(first.card.ladderLevel).toBe(1);

    const logs = await db.reviewLogs.toArray();
    expect(logs.every((log) => log.ladderLevel === 0)).toBe(true);
  });
});

describe('dueCards', () => {
  it('returns a card once it is due and not before', async () => {
    const { card } = await answer(3, NOW);
    expect(await dueCards(PROFILE, NOW)).toEqual([]);
    expect((await dueCards(PROFILE, card.dueAt)).map((c) => c.id)).toEqual([card.id]);
  });

  it('ignores suspended cards', async () => {
    const { card } = await answer(3, NOW);
    await db.cards.update(card.id, { suspended: 1 });
    expect(await dueCards(PROFILE, card.dueAt + DAY)).toEqual([]);
  });

  it("ignores another profile's cards", async () => {
    const { card } = await answer(3, NOW);
    expect(await dueCards('someone-else', card.dueAt + DAY)).toEqual([]);
  });
});
