import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db.ts';
import { advanceCursor, completeSession, findResumable, sessionProgress, startSession } from './sessions.ts';
import { recordReview } from './reviews.ts';
import { deferItem } from './deferrals.ts';
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
    const resumed = await findResumable(profile.id, 'en');
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

    const resumed = await findResumable(profile.id, 'en');
    expect(resumed?.resumeCursor).toBe(3);
    expect(await db.reviewLogs.count()).toBe(3);
    expect(sessionProgress(resumed!)).toEqual({ done: 3, total: session.itemIds.length });
  });

  it('stops offering a session once it is finished', async () => {
    await seed(40);
    const session = await startSession(profile, NOW);
    await completeSession(session.id, NOW + 240_000);

    expect(await findResumable(profile.id, 'en')).toBeNull();
    const stored = await db.sessions.get(session.id);
    expect(stored?.completed).toBe(1);
    expect(stored?.endedAt).toBe(NOW + 240_000);
  });

  it('offers the most recent unfinished session, not an ancient one', async () => {
    await seed(40);
    const old = await startSession(profile, NOW - 7 * 86_400_000);
    const recent = await startSession(profile, NOW);
    expect(await findResumable(profile.id, 'en')).toMatchObject({ id: recent.id });
    expect(old.id).not.toBe(recent.id);
  });
});

describe('a skipped item is left alone (SPEC §2.14)', () => {
  it('drops a declined word out of the next session', async () => {
    await seed(40);
    const before = await startSession(profile, NOW);
    const declined = before.itemIds[0];
    expect(declined).toBeDefined();

    await deferItem(profile.id, declined!, NOW);
    await db.sessions.clear();

    const after = await startSession(profile, NOW + 1000);
    expect(after.itemIds).not.toContain(declined);
    // And the session is still a full one — declining costs the learner nothing.
    expect(after.itemIds.length).toBeGreaterThan(5);
  });

  it('brings it back once the window lapses', async () => {
    // A corpus small enough to fit in one session, so what is being measured is
    // eligibility rather than the composer's day-seeded choice of which
    // eligible items to spend the budget on.
    await seed(6);
    const declined = 'en:lex:word0';

    await deferItem(profile.id, declined, NOW);
    const during = await startSession(profile, NOW + 1000);
    expect(during.itemIds).not.toContain(declined);

    await db.sessions.clear();
    const after = await startSession(profile, NOW + 5 * 86_400_000);
    expect(after.itemIds).toContain(declined);
  });

  it('hides a due card without touching its schedule', async () => {
    await seed(10);
    await recordReview({
      profileId: profile.id,
      itemId: 'en:lex:word0',
      grade: 1,
      confidence: null,
      latencyMs: 900,
      answerRaw: 'wrong',
      correct: false,
      now: NOW,
    });
    const card = await db.cards.where('itemId').equals('en:lex:word0').first();
    const dueBefore = card?.dueAt;

    await deferItem(profile.id, 'en:lex:word0', NOW + 60_000);
    await db.sessions.clear();
    const session = await startSession(profile, NOW + 120_000);

    expect(session.itemIds).not.toContain('en:lex:word0');
    // The skip changed what is *shown*. The memory model is untouched.
    const after = await db.cards.where('itemId').equals('en:lex:word0').first();
    expect(after?.dueAt).toBe(dueBefore);
    expect(after?.fsrs.reps).toBe(card?.fsrs.reps);
    expect(await db.reviewLogs.count()).toBe(1);
  });
});

/**
 * A session's queue is built from one language's items, so resuming it under a
 * different target language hands the learner the wrong content while the UI
 * says otherwise. The session records the language it was composed for, and
 * resume is scoped to it.
 */
describe('a session belongs to the language it was composed for', () => {
  it('records the target language it was planned for', async () => {
    await seed(10);
    const session = await startSession(profile, NOW);
    expect(session.lang).toBe('en');
  });

  it('does not resume an English session for a learner who switched to Japanese', async () => {
    await seed(40);
    const english = await startSession(profile, NOW);
    await advanceCursor(english.id, 2);

    expect(await findResumable(profile.id, 'ja')).toBeNull();
    expect(await findResumable(profile.id, 'en')).toMatchObject({ id: english.id });
  });

  it('keeps each language its own resumable session', async () => {
    await seed(40);
    const english = await startSession(profile, NOW);
    const japanese = await startSession({ ...profile, targets: ['ja'] }, NOW + 1000);

    expect(await findResumable(profile.id, 'en')).toMatchObject({ id: english.id });
    expect(await findResumable(profile.id, 'ja')).toMatchObject({ id: japanese.id });
  });
});
