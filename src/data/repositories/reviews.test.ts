import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db.ts';
import { cardIdFor, dueCards, recordReview } from './reviews.ts';
import { ladderCeiling } from '../../core/ladder.ts';
import type { Grade, LadderLevel } from '../types.ts';

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

/**
 * SPEC §2.6 acceptance: an item with no available audio is excluded from L4
 * scheduling rather than silently degraded to text. The exclusion is a ceiling
 * on the rung, applied here so the review log records the rung the learner was
 * actually shown.
 */
describe('the audio ceiling (SPEC §2.6)', () => {
  const parkAt = async (level: LadderLevel) => {
    await answer(3, NOW);
    const id = cardIdFor(PROFILE, ITEM);
    await db.cards.update(id, { ladderLevel: level });
    return id;
  };

  it('never promotes into L4 when audio is unavailable', async () => {
    const id = await parkAt(3);
    // A card ripe for promotion in every other respect.
    const card = (await db.cards.get(id))!;
    await db.cards.update(id, { fsrs: { ...card.fsrs, stability: 10_000 } });

    const { card: after } = await answer(3, NOW + 400 * DAY, {
      maxLadderLevel: ladderCeiling(false),
    });
    expect(after.ladderLevel).toBe(3);
  });

  it('does promote into L4 once audio is available', async () => {
    const id = await parkAt(3);
    const card = (await db.cards.get(id))!;
    await db.cards.update(id, { fsrs: { ...card.fsrs, stability: 10_000 } });

    const { card: after } = await answer(3, NOW + 400 * DAY, {
      maxLadderLevel: ladderCeiling(true),
    });
    expect(after.ladderLevel).toBe(4);
  });

  it('logs a demoted card at the rung it was really answered at', async () => {
    // The card sits at L4 from a session when the engine worked. Today it does
    // not, so the learner saw an L3 cloze — and that is what the log has to say,
    // or every later measurement of the ladder's effect is reading a fiction.
    await parkAt(4);
    const { answeredAt } = await answer(3, NOW + DAY, {
      maxLadderLevel: ladderCeiling(false),
    });
    expect(answeredAt).toBe(3);

    const logs = await db.reviewLogs.orderBy('reviewedAt').toArray();
    expect(logs.at(-1)?.ladderLevel).toBe(3);
  });

  it('withholds L4 by default, so a forgotten argument cannot open it', async () => {
    const id = await parkAt(3);
    const card = (await db.cards.get(id))!;
    await db.cards.update(id, { fsrs: { ...card.fsrs, stability: 10_000 } });

    const { card: after } = await answer(3, NOW + 400 * DAY);
    expect(after.ladderLevel).toBe(3);
  });
});

describe('interference tagging (SPEC §3.3)', () => {
  it('stores the categories a wrong answer matched', async () => {
    await answer(1, NOW, { interferenceHit: ['PRONOUN_GENDER'], answerRaw: 'he' });
    const logs = await db.reviewLogs.toArray();
    expect(logs[0]?.interferenceHit).toEqual(['PRONOUN_GENDER']);
  });

  it('leaves the field off entirely when nothing matched', async () => {
    await answer(1, NOW);
    const logs = await db.reviewLogs.toArray();
    expect(logs[0]?.interferenceHit).toBeUndefined();
  });
});

describe('per-learner scheduler parameters (SPEC §2.1, §9)', () => {
  it('uses the published defaults when the learner has not retuned', async () => {
    await db.profiles.add({
      id: PROFILE,
      uiLang: 'id',
      targets: ['en'],
      dailyMinutes: 4,
      scriptMode: 'kanji',
      createdAt: NOW,
    });
    const { card } = await answer(3, NOW);
    expect(card.fsrs.dueAt).toBeGreaterThan(NOW);
  });

  it('schedules more tightly for a learner who retuned upwards', async () => {
    // A higher `request_retention` means the scheduler aims to catch the card
    // sooner — which is what "I keep forgetting" should buy (SPEC §9).
    //
    // Measured on a *graduated* card: a card's first answers run on short-term
    // learning steps, which are fixed minutes and say nothing about the
    // retention target.
    await db.profiles.add({
      id: PROFILE,
      uiLang: 'id',
      targets: ['en'],
      dailyMinutes: 4,
      scriptMode: 'kanji',
      createdAt: NOW,
    });

    /** Answers until the card leaves learning, then returns the next interval. */
    const graduate = async (): Promise<number> => {
      let last = 0;
      for (let i = 0; i < 4; i++) {
        const { card } = await answer(3, NOW + i * 30 * DAY);
        last = card.fsrs.scheduledDays;
      }
      return last;
    };

    await db.profiles.update(PROFILE, { requestRetention: 0.95 });
    const tight = await graduate();

    await db.cards.clear();
    await db.reviewLogs.clear().catch(() => undefined);
    await db.delete();
    await db.open();
    await db.profiles.add({
      id: PROFILE,
      uiLang: 'id',
      targets: ['en'],
      dailyMinutes: 4,
      scriptMode: 'kanji',
      createdAt: NOW,
      requestRetention: 0.8,
    });
    const loose = await graduate();

    expect(tight).toBeLessThan(loose);
  });
});
