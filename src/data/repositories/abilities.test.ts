import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db.ts';
import { getAbility, refreshListeningAbility } from './abilities.ts';
import { LISTENING_MIN_ANSWERS } from '../../core/listening.ts';
import type { Card, Item, LadderLevel, ReviewLog, TargetLang } from '../types.ts';

const PROFILE = 'p1';
const NOW = Date.UTC(2026, 5, 1, 9, 0, 0);

const item = (id: string, lang: TargetLang = 'en', freqRank = 900): Item => ({
  id,
  lang,
  kind: 'lexeme',
  headword: id.split(':').pop() ?? id,
  anchorSentenceIds: [],
  freqRank,
  band: 2,
  interferenceTags: [],
  sourceRef: { dataset: 'tatoeba', externalId: '1' },
});

const fsrs = {
  dueAt: NOW,
  stability: 10,
  difficulty: 5,
  elapsedDays: 1,
  scheduledDays: 3,
  learningSteps: 0,
  reps: 4,
  lapses: 0,
  state: 2 as const,
  lastReviewAt: NOW,
};

const card = (itemId: string, level: LadderLevel): Card => ({
  id: `${PROFILE}:${itemId}`,
  profileId: PROFILE,
  itemId,
  ladderLevel: level,
  fsrs,
  dueAt: NOW,
  suspended: 0,
});

const log = (cardId: string, level: LadderLevel, correct: boolean, at: number): ReviewLog => ({
  id: `${cardId}:${at}`,
  profileId: PROFILE,
  cardId,
  ladderLevel: level,
  rating: correct ? 3 : 1,
  confidence: null,
  latencyMs: 900,
  answerRaw: 'x',
  correct: correct ? 1 : 0,
  reviewedAt: at,
  scheduledDays: 3,
  elapsedDays: 1,
  stateBefore: fsrs,
});

/**
 * Seeded directly rather than driven through `recordReview`, because reaching
 * L4 honestly takes a dozen promotions per item and none of that is what these
 * cases are about. The rung under test is the one recorded in the log.
 */
const seedAnswers = async (
  count: number,
  level: LadderLevel,
  lang: TargetLang = 'en',
  correct = true,
): Promise<void> => {
  const items = Array.from({ length: count }, (_, i) => item(`${lang}:lex:l${level}w${i}`, lang));
  await db.items.bulkPut(items);
  await db.cards.bulkPut(items.map((entry) => card(entry.id, level)));
  await db.reviewLogs.bulkAdd(
    items.map((entry, i) => log(`${PROFILE}:${entry.id}`, level, correct, NOW + i * 1_000)),
  );
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('refreshListeningAbility (SPEC §4.2)', () => {
  it('writes no row until there is enough evidence to report one', async () => {
    // D25: a missing row reads as "not measured". A row from two answers would
    // read as a measurement, and §2.15 bans exactly that.
    await seedAnswers(LISTENING_MIN_ANSWERS - 1, 4);

    expect(await refreshListeningAbility(PROFILE, 'en', NOW)).toBeNull();
    expect(await getAbility(PROFILE, 'en', 'listening')).toBeNull();
  });

  it('estimates from dictation answers once there are enough of them', async () => {
    await seedAnswers(LISTENING_MIN_ANSWERS, 4);

    expect(await refreshListeningAbility(PROFILE, 'en', NOW)).not.toBeNull();
    expect(await getAbility(PROFILE, 'en', 'listening')).not.toBeNull();
  });

  it('ignores answers given at other rungs, however many there are', async () => {
    // A learner on a silent device answers plenty. None of it is listening, and
    // a listening score derived from typing would be a fabricated measurement.
    await seedAnswers(20, 3);
    await seedAnswers(20, 5);

    expect(await refreshListeningAbility(PROFILE, 'en', NOW)).toBeNull();
  });

  it('does not let one language vouch for the other', async () => {
    await seedAnswers(LISTENING_MIN_ANSWERS, 4, 'ja');

    expect(await refreshListeningAbility(PROFILE, 'ja', NOW)).not.toBeNull();
    expect(await refreshListeningAbility(PROFILE, 'en', NOW)).toBeNull();
  });
});
