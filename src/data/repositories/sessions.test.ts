import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db.ts';
import { advanceCursor, completeSession, findResumable, sessionProgress, startSession } from './sessions.ts';
import { recordReview } from './reviews.ts';
import type { FrequencyBand } from '../../core/frequency.ts';
import type { Profile } from '../types.ts';

const NOW = Date.UTC(2026, 5, 1, 9, 0, 0);

const profile: Profile = {
  id: 'p1',
  uiLang: 'id',
  targets: ['en'],
  dailyMinutes: 4,
  scriptMode: 'kanji',
  createdAt: NOW,
};

/** A small corpus shaped like the real one, enough to compose a session from. */
const seed = async (count: number) => {
  await db.profiles.add(profile);
  for (let i = 0; i < count; i++) {
    const band = ((i % 3) + 1) as FrequencyBand;
    await db.sentences.add({
      id: `tatoeba:eng:${i}`,
      lang: 'en',
      band,
      text: `The word${i} is here.`,
      tokens: ['the', `word${i}`, 'is', 'here'],
      translationId: `tatoeba:ind:${i}`,
      difficulty: 0.3,
      coverageMeta: { totalTokens: 4, maxFreqRank: 100, lexemeIds: [] },
      sourceRef: { dataset: 'tatoeba', externalId: `${i}` },
    });
    await db.sentences.add({
      id: `tatoeba:ind:${i}`,
      lang: 'id',
      band,
      text: `Kata${i} ada di sini.`,
      tokens: [`kata${i}`, 'ada', 'di', 'sini'],
      translationId: `tatoeba:eng:${i}`,
      difficulty: 0,
      coverageMeta: { totalTokens: 4, maxFreqRank: 0, lexemeIds: [] },
      sourceRef: { dataset: 'tatoeba', externalId: `${i}` },
    });
    await db.items.add({
      id: `en:lex:word${i}`,
      lang: 'en',
      kind: 'lexeme',
      headword: `word${i}`,
      anchorSentenceIds: [`tatoeba:eng:${i}`],
      freqRank: i + 1,
      band,
      interferenceTags: [],
      sourceRef: { dataset: 'tatoeba', externalId: `word${i}` },
    });
  }
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('startSession', () => {
  it('fills a queue from the available items', async () => {
    await seed(40);
    const session = await startSession(profile, NOW);
    expect(session.itemIds.length).toBeGreaterThan(5);
    expect(session.resumeCursor).toBe(0);
    expect(session.completed).toBe(0);
  });

  it('never queues an item twice', async () => {
    await seed(40);
    const session = await startSession(profile, NOW);
    expect(new Set(session.itemIds).size).toBe(session.itemIds.length);
  });

  it('skips items the learner has already started', async () => {
    await seed(10);
    await recordReview({
      profileId: profile.id,
      itemId: 'en:lex:word0',
      grade: 3,
      confidence: null,
      latencyMs: 900,
      answerRaw: 'word0',
      correct: true,
      // Answered far in the past, and not yet due again.
      now: NOW,
    });
    const session = await startSession(profile, NOW);
    expect(session.itemIds).not.toContain('en:lex:word0');
  });

  it('returns an empty queue rather than failing when there is no content', async () => {
    await db.profiles.add(profile);
    const session = await startSession(profile, NOW);
    expect(session.itemIds).toEqual([]);
  });

  it('respects the learner-chosen daily budget', async () => {
    await seed(80);
    const short = await startSession(profile, NOW);
    await db.sessions.clear();
    const long = await startSession({ ...profile, dailyMinutes: 15 }, NOW);
    expect(long.itemIds.length).toBeGreaterThan(short.itemIds.length);
  });
});

describe('resume safety (SPEC §2.13)', () => {
  it('finds an unfinished session and resumes at the exact cursor', async () => {
    await seed(40);
    const session = await startSession(profile, NOW);
    await advanceCursor(session.id, 3);

    // Simulate a cold start: nothing in memory, only what was persisted.
    const resumed = await findResumable(profile.id);
    expect(resumed?.id).toBe(session.id);
    expect(resumed?.resumeCursor).toBe(3);
  });

  it('loses no review logs when the app dies mid-session', async () => {
    await seed(40);
    const session = await startSession(profile, NOW);

    for (const [index, itemId] of session.itemIds.slice(0, 3).entries()) {
      await recordReview({
        profileId: profile.id,
        itemId,
        grade: 3,
        confidence: 'yakin',
        latencyMs: 1000,
        answerRaw: 'x',
        correct: true,
        now: NOW + index,
      });
      await advanceCursor(session.id, index + 1);
    }

    const resumed = await findResumable(profile.id);
    expect(resumed?.resumeCursor).toBe(3);
    expect(await db.reviewLogs.count()).toBe(3);
    expect(sessionProgress(resumed!)).toEqual({ done: 3, total: session.itemIds.length });
  });

  it('stops offering a session once it is finished', async () => {
    await seed(40);
    const session = await startSession(profile, NOW);
    await completeSession(session.id, NOW + 240_000);

    expect(await findResumable(profile.id)).toBeNull();
    const stored = await db.sessions.get(session.id);
    expect(stored?.completed).toBe(1);
    expect(stored?.endedAt).toBe(NOW + 240_000);
  });

  it('offers the most recent unfinished session, not an ancient one', async () => {
    await seed(40);
    const old = await startSession(profile, NOW - 7 * 86_400_000);
    const recent = await startSession(profile, NOW);
    expect(await findResumable(profile.id)).toMatchObject({ id: recent.id });
    expect(old.id).not.toBe(recent.id);
  });
});
