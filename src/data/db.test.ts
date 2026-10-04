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
    expect(db.verno).toBe(8);
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      'abilities',
      'buildAttempts',
      'cards',
      'categoryScores',
      'contentShards',
      'deferredItems',
      'drillAttempts',
      'habits',
      'items',
      'minedItems',
      'mnemonics',
      'profiles',
      'readingAttempts',
      'reviewLogs',
      'sentences',
      'sessions',
    ]);
  });

  it('carries v1 data forward (SPEC §6: every change ships a migration)', async () => {
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
    expect(db.verno).toBe(8);
    expect((await db.profiles.get('p1'))?.dailyMinutes).toBe(4);
    expect(await db.cards.get('card-1')).toBeTruthy();
    expect(await db.reviewLogs.count()).toBe(1);
    expect(await db.contentShards.count()).toBe(0);
    expect(await db.drillAttempts.count()).toBe(0);
    expect(await db.minedItems.count()).toBe(0);
  });

  it('backfills the v3 `correct` tally on category scores rather than inventing one', async () => {
    db.close();
    await db.delete();

    const old = new Dexie(DB_NAME);
    old.version(2).stores({
      profiles: 'id, createdAt',
      categoryScores: '[profileId+lang+categoryId], profileId, elo',
      contentShards: 'path, lang',
    });
    await old.open();
    // A row written before M4 knew nothing about how many were right.
    await old.table('categoryScores').add({
      profileId: 'p1',
      lang: 'en',
      categoryId: 'ARTICLES',
      elo: 1180,
      attempts: 7,
      updatedAt: NOW,
    });
    old.close();

    await db.open();
    const score = await db.categoryScores.get(['p1', 'en', 'ARTICLES']);
    expect(score?.attempts).toBe(7);
    // Zero, not a guess proportional to the rating: the old row never recorded
    // this, and a fabricated number would reach the heatmap as a measurement.
    expect(score?.correct).toBe(0);
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

  it('starts Japanese learners at romaji, which is where §4.3 starts them', async () => {
    // This test used to be called "never romaji", asserting `kana` on the
    // strength of a comment that reversed its own source: §4.3's ladder is
    // romaji → kana → kanji, and romaji is the rung you *leave* once kana is
    // fluent. Starting a learner who has not been taught a character one rung
    // above where they are is what put hiragana sentences in front of a
    // beginner (v1.32.0).
    const profile = await createProfile({ targets: ['ja'], dailyMinutes: 8, now: NOW });
    expect(profile.scriptMode).toBe('romaji');
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

/**
 * SPEC §3.1's sentence-building attempts, held to the same rule as every other
 * attempt log (invariant 31, D32): evidence that can be edited is not evidence.
 */
describe('buildAttempts is append-only', () => {
  const attempt = {
    id: 'b1',
    profileId: 'p1',
    lang: 'en' as const,
    sentenceId: 'tatoeba:eng:1',
    correct: 1 as const,
    answerRaw: 'she got an a today',
    latencyMs: 4_000,
    answeredAt: 1,
  };

  it('accepts an append', async () => {
    await db.buildAttempts.add(attempt);
    expect(await db.buildAttempts.count()).toBe(1);
  });

  it('refuses an update, a put over an existing row, and a delete', async () => {
    await db.buildAttempts.add(attempt);
    await expect(db.buildAttempts.update('b1', { correct: 0 })).rejects.toThrow();
    await expect(db.buildAttempts.delete('b1')).rejects.toThrow();
    // Still exactly what was written.
    expect((await db.buildAttempts.get('b1'))?.correct).toBe(1);
  });
});

/**
 * `items.*interferenceTags` was a multi-entry index declared in v1, documented
 * as *"so the contrastive engine can pull drills by category (SPEC §3.3)"*.
 *
 * The contrastive engine was built in M4 and pulls drills from the compiled
 * `contrastive.json`, not from the item table; the error tagger analyses the
 * learner's answer text (D34). Nothing ever queried the index, and nothing ever
 * wrote a tag: measured over the shipped shards, **0 of 5,245 English and 0 of
 * 6,904 Japanese lexemes** carry one. The field was required on `Item` and set
 * to `[]` at all three of its writers.
 *
 * Invariant 8's "do not build a seam for a feature two milestones out", caught
 * two milestones later. What matters here is that dropping it costs no data.
 */
describe('v8 drops an index nothing ever wrote to', () => {
  it('keeps every item across the upgrade', async () => {
    db.close();
    await db.delete();

    const old = new Dexie(DB_NAME);
    old.version(7).stores({
      items: 'id, [lang+band], [lang+kind], freqRank, *interferenceTags, *anchorSentenceIds',
    });
    await old.open();
    await old.table('items').bulkAdd([
      { id: 'en:lex:the', lang: 'en', kind: 'lexeme', headword: 'the', band: 1, freqRank: 1,
        anchorSentenceIds: ['s1'], sourceRef: { dataset: 't', externalId: '1' } },
      { id: 'ja:lex:私', lang: 'ja', kind: 'lexeme', headword: '私', band: 1, freqRank: 3,
        anchorSentenceIds: ['s2'], sourceRef: { dataset: 't', externalId: '2' } },
    ]);
    old.close();

    await db.open();
    expect(await db.items.count()).toBe(2);
    expect((await db.items.get('ja:lex:私'))?.headword).toBe('私');
    // The indexes the app actually queries still work.
    expect(await db.items.where('[lang+band]').equals(['ja', 1]).count()).toBe(1);
    expect(await db.items.where('anchorSentenceIds').equals('s1').count()).toBe(1);
  });

  it('no longer indexes the tags', async () => {
    await db.open();
    const schema = db.items.schema.indexes.map((index) => index.name);
    expect(schema).not.toContain('interferenceTags');
    expect(schema).toContain('anchorSentenceIds');
  });
});
