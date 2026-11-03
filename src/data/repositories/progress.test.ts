import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db.ts';
import { buildProgressReport, slippingSoon } from './progress.ts';
import { sessionTally } from './sessions.ts';
import type { Card, Item, LadderLevel, Profile, ReviewLog, TargetLang } from '../types.ts';

const NOW = Date.UTC(2026, 9, 1, 9, 0, 0);
const DAY = 86_400_000;
const PROFILE = 'p1';

const profile = (target: TargetLang): Profile => ({
  id: PROFILE,
  uiLang: 'id',
  targets: [target, target === 'en' ? 'ja' : 'en'],
  dailyMinutes: 4,
  scriptMode: 'kana',
  createdAt: NOW - 30 * DAY,
});

const item = (id: string): Item => ({
  id,
  lang: id.startsWith('ja:') ? 'ja' : 'en',
  kind: 'lexeme',
  headword: id.split(':').pop() ?? id,
  anchorSentenceIds: ['s'],
  freqRank: 100,
  band: 1,
  sourceRef: { dataset: 'tatoeba', externalId: id },
});

const card = (itemId: string, level: LadderLevel, dueInDays: number): Card => {
  const dueAt = NOW + dueInDays * DAY;
  return {
    id: `${PROFILE}::${itemId}`,
    profileId: PROFILE,
    itemId,
    ladderLevel: level,
    dueAt,
    suspended: 0,
    fsrs: {
      dueAt,
      stability: 3,
      difficulty: 5,
      elapsedDays: 2,
      scheduledDays: 3,
      learningSteps: 0,
      reps: 3,
      lapses: 0,
      state: 2,
      lastReviewAt: NOW - 2 * DAY,
    },
  };
};

const log = (itemId: string, level: LadderLevel, at: number, extra: Partial<ReviewLog> = {}): ReviewLog => ({
  id: crypto.randomUUID(),
  profileId: PROFILE,
  cardId: `${PROFILE}::${itemId}`,
  ladderLevel: level,
  rating: 3,
  confidence: null,
  latencyMs: 1000,
  answerRaw: 'x',
  correct: 1,
  reviewedAt: at,
  scheduledDays: 3,
  elapsedDays: 3,
  stateBefore: card(itemId, level, -3).fsrs,
  ...extra,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('the progress screen is about the language being studied', () => {
  it('leaves the other language out of every language figure', async () => {
    const english = ['en:lex:as', 'en:lex:can', 'en:lex:did'];
    const japanese = ['ja:lex:猫'];
    await db.items.bulkPut([...english, ...japanese].map(item));
    await db.cards.bulkPut([...english.map((id) => card(id, 2, 1)), card('ja:lex:猫', 2, 2)]);
    await db.reviewLogs.bulkAdd([
      ...english.map((id) => log(id, 2, NOW - 2 * DAY)),
      log('ja:lex:猫', 2, NOW - 2 * DAY),
    ]);

    const report = await buildProgressReport(profile('ja'), NOW);
    expect(report.totalReviews).toBe(1);
    expect(report.forecast.reduce((sum, day) => sum + day.dueCount, 0)).toBe(1);
    expect(report.skills.find((skill) => skill.skill === 'vocab')?.answers).toBe(1);
    expect(report.recap.met + report.recap.strengthened).toBe(1);

    const slipping = await slippingSoon(PROFILE, NOW, 5, 'ja');
    expect(slipping.map((word) => word.itemId)).toEqual(['ja:lex:猫']);
  });

  it('does not score a first exposure on the vocabulary axis', async () => {
    await db.items.bulkPut([item('en:lex:among')]);
    await db.cards.bulkPut([card('en:lex:among', 1, 1)]);
    await db.reviewLogs.bulkAdd([log('en:lex:among', 0, NOW - DAY, { introduction: 1 })]);
    const report = await buildProgressReport(profile('en'), NOW);
    expect(report.skills.find((skill) => skill.skill === 'vocab')?.score).toBeNull();
  });
});

describe('sessionTally', () => {
  it('counts an exposure once, as new — not as strengthened or promoted', async () => {
    const started = NOW - 10 * 60_000;
    await db.cards.bulkPut([card('en:lex:among', 1, 0), card('en:lex:house', 3, 10)]);
    await db.reviewLogs.bulkAdd([
      // Introduced this session: L0 → L1, which is not a promotion.
      log('en:lex:among', 0, started + 1000, { introduction: 1 }),
      // A graded answer at L2 that moved the card to L3.
      log('en:lex:house', 2, started + 2000),
      // Before the session started: not this session's.
      log('en:lex:house', 2, started - DAY),
    ]);
    const tally = await sessionTally({
      id: 's1',
      profileId: PROFILE,
      lang: 'en',
      startedAt: started,
      endedAt: null,
      plannedMinutes: 4,
      itemIds: ['en:lex:among', 'en:lex:house'],
      completed: 0,
      resumeCursor: 2,
    });
    expect(tally).toEqual({
      newWords: 1,
      newCharacters: 0,
      strengthened: 1,
      promoted: 1,
      drills: 0,
      builds: 0,
    });
  });
});
