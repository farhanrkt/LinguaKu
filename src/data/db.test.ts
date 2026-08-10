import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { db, DB_NAME } from './db.ts';
import { emptyFsrsState } from './fsrsState.ts';
import type { Card, ReviewLog } from './types.ts';
import { createProfile, getCurrentProfile, updateProfile } from './repositories/profiles.ts';

const NOW = Date.UTC(2026, 0, 1);

const makeCard = (overrides: Partial<Card> = {}): Card => {
  const fsrs = emptyFsrsState(NOW);
  return {
    id: 'card-1',
    profileId: 'p1',
    itemId: 'item-1',
    ladderLevel: 0,
    fsrs,
    dueAt: fsrs.dueAt,
    suspended: 0,
    ...overrides,
  };
};

const makeLog = (overrides: Partial<ReviewLog> = {}): ReviewLog => ({
  id: 'log-1',
  profileId: 'p1',
  cardId: 'card-1',
  ladderLevel: 1,
  rating: 3,
  confidence: 'yakin',
  latencyMs: 1840,
  answerRaw: 'kucing',
  correct: 1,
  reviewedAt: NOW,
  scheduledDays: 0,
  elapsedDays: 0,
  stateBefore: emptyFsrsState(NOW),
  ...overrides,
});

beforeEach(async () => {
  // Not `table.clear()` — clearing reviewLogs is itself an append-only
  // violation. Dropping the database is how a real reset has to work too.
  await db.delete();
  await db.open();
});

describe('schema', () => {
  it('opens at the current version with every SPEC §6 table', () => {
    expect(db.verno).toBe(2);
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      'abilities',
      'cards',
      'categoryScores',
      'contentShards',
      'habits',
      'items',
      'mnemonics',
      'profiles',
      'reviewLogs',
      'sentences',
      'sessions',
    ]);
  });

  it('carries v1 data forward into v2 (SPEC §6: every change ships a migration)', async () => {
    db.close();
    await db.delete();

    // A store written by the previous release.
    const v1 = new Dexie(DB_NAME);
    v1.version(1).stores({
      profiles: 'id, createdAt',
      abilities: '[profileId+lang+dimension], profileId, updatedAt',
      items: 'id, [lang+band], [lang+kind], freqRank, *interferenceTags',
      sentences: 'id, [lang+difficulty], translationId',
      cards: 'id, itemId, profileId, [profileId+itemId], [profileId+suspended+dueAt]',
      reviewLogs: 'id, cardId, [profileId+reviewedAt], reviewedAt',
      categoryScores: '[profileId+lang+categoryId], profileId, elo',
      sessions: 'id, [profileId+startedAt], completed',
      mnemonics: '[profileId+itemId], itemId',
      habits: 'id, profileId',
    });
    await v1.open();
    await v1.table('profiles').add({
      id: 'p1',
      uiLang: 'id',
      targets: ['en'],
      dailyMinutes: 4,
      scriptMode: 'kanji',
      createdAt: NOW,
    });
    await v1.table('cards').add(makeCard());
    await v1.table('reviewLogs').add(makeLog());
    v1.close();

    // Upgrading must not lose a single review log.
    await db.open();
    expect(db.verno).toBe(2);
    expect((await db.profiles.get('p1'))?.dailyMinutes).toBe(4);
    expect(await db.cards.get('card-1')).toBeTruthy();
    expect(await db.reviewLogs.count()).toBe(1);
    expect(await db.contentShards.count()).toBe(0);
  });
});

describe('profiles', () => {
  it('creates an anonymous profile and reads it back unchanged', async () => {
    const created = await createProfile({ targets: ['en'], dailyMinutes: 4, now: NOW });
    expect(await getCurrentProfile()).toEqual(created);
  });

  it('returns null before first launch has completed', async () => {
    expect(await getCurrentProfile()).toBeNull();
  });

  it('defaults Japanese learners to kana, never romaji', async () => {
    const profile = await createProfile({ targets: ['ja'], dailyMinutes: 8, now: NOW });
    expect(profile.scriptMode).toBe('kana');
  });

  it('persists edits to the daily load', async () => {
    const profile = await createProfile({ targets: ['en'], dailyMinutes: 4, now: NOW });
    await updateProfile(profile.id, { dailyMinutes: 15 });
    expect((await getCurrentProfile())?.dailyMinutes).toBe(15);
  });
});

describe('card dueAt mirror', () => {
  it('derives dueAt on insert', async () => {
    const card = makeCard();
    await db.cards.add({ ...card, dueAt: 0 });
    expect((await db.cards.get(card.id))?.dueAt).toBe(card.fsrs.dueAt);
  });

  it('follows the fsrs state on update', async () => {
    const card = makeCard();
    await db.cards.add(card);
    const rescheduled = { ...card.fsrs, dueAt: NOW + 86_400_000 };
    await db.cards.update(card.id, { fsrs: rescheduled });
    expect((await db.cards.get(card.id))?.dueAt).toBe(NOW + 86_400_000);
  });

  it('refuses to let dueAt drift from the fsrs state', async () => {
    const card = makeCard();
    await db.cards.add(card);
    await db.cards.update(card.id, { dueAt: NOW + 999_999 });
    expect((await db.cards.get(card.id))?.dueAt).toBe(card.fsrs.dueAt);
  });
});

describe('reviewLogs are append-only (SPEC §6)', () => {
  it('accepts new logs', async () => {
    await db.reviewLogs.add(makeLog());
    expect(await db.reviewLogs.count()).toBe(1);
  });

  it('rejects updates and leaves the row intact', async () => {
    const log = makeLog();
    await db.reviewLogs.add(log);
    await expect(db.reviewLogs.update(log.id, { correct: 0 })).rejects.toThrow(/append-only/i);
    expect(await db.reviewLogs.get(log.id)).toEqual(log);
  });

  it('rejects put() over an existing log', async () => {
    const log = makeLog();
    await db.reviewLogs.add(log);
    await expect(db.reviewLogs.put({ ...log, rating: 1 })).rejects.toThrow(/append-only/i);
    expect((await db.reviewLogs.get(log.id))?.rating).toBe(3);
  });

  it('rejects deletes', async () => {
    const log = makeLog();
    await db.reviewLogs.add(log);
    await expect(db.reviewLogs.delete(log.id)).rejects.toThrow(/append-only/i);
    expect(await db.reviewLogs.count()).toBe(1);
  });

  it('rejects clear(), so a stray reset cannot erase the log', async () => {
    await db.reviewLogs.add(makeLog());
    await expect(db.reviewLogs.clear()).rejects.toThrow(/append-only/i);
    expect(await db.reviewLogs.count()).toBe(1);
  });
});
