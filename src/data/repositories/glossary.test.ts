import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db.ts';
import { buildGlossary } from './glossary.ts';
import { clearGlossCache } from '../glosses.ts';
import type { Card, Item, TargetLang } from '../types.ts';

const PROFILE = 'p1';
const NOW = Date.UTC(2026, 5, 1, 9, 0, 0);
const DAY = 86_400_000;

const item = (id: string, headword: string, lang: TargetLang = 'en'): Item => ({
  id,
  lang,
  kind: 'lexeme',
  headword,
  anchorSentenceIds: [],
  freqRank: 100,
  band: 1,
  interferenceTags: [],
  sourceRef: { dataset: 'tatoeba', externalId: headword },
});

const card = (
  itemId: string,
  overrides: Partial<Card['fsrs']> & { level?: number } = {},
): Card => ({
  id: `${PROFILE}:${itemId}`,
  profileId: PROFILE,
  itemId,
  ladderLevel: (overrides.level ?? 3) as Card['ladderLevel'],
  fsrs: {
    dueAt: NOW + 5 * DAY,
    stability: overrides.stability ?? 20,
    difficulty: 5,
    elapsedDays: 1,
    scheduledDays: 5,
    learningSteps: 0,
    reps: 4,
    lapses: overrides.lapses ?? 0,
    state: 2,
    lastReviewAt: NOW - DAY,
  },
  dueAt: NOW + 5 * DAY,
  suspended: 0,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  clearGlossCache();
  // No content shards in a unit test: the glossary must still build.
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));
});

describe('buildGlossary (SPEC §2.2)', () => {
  it('lists only what the learner has answered, never the whole inventory', async () => {
    await db.items.bulkPut([item('en:lex:one', 'one'), item('en:lex:two', 'two')]);
    await db.cards.put(card('en:lex:one'));

    const { entries, total } = await buildGlossary(PROFILE, 'en', NOW);
    expect(total).toBe(1);
    expect(entries[0]?.headword).toBe('one');
  });

  it('creates and advances nothing — the whole condition §2.2 attaches', async () => {
    await db.items.put(item('en:lex:one', 'one'));
    await db.cards.put(card('en:lex:one'));
    const before = await db.cards.get(`${PROFILE}:en:lex:one`);

    await buildGlossary(PROFILE, 'en', NOW + 30 * DAY);

    expect(await db.cards.get(`${PROFILE}:en:lex:one`)).toEqual(before);
    expect(await db.reviewLogs.count()).toBe(0);
  });

  it('puts what is secured first, and what is slipping after it', async () => {
    await db.items.bulkPut([
      item('en:lex:strong', 'strong'),
      item('en:lex:faded', 'faded'),
      item('en:lex:leech', 'leech'),
    ]);
    await db.cards.bulkPut([
      card('en:lex:faded', { stability: 1 }),
      card('en:lex:leech', { lapses: 8 }),
      card('en:lex:strong', { stability: 400 }),
    ]);

    const { entries } = await buildGlossary(PROFILE, 'en', NOW + 20 * DAY);
    expect(entries.map((entry) => entry.headword)).toEqual(['strong', 'faded', 'leech']);
    expect(entries[0]?.strength).toBe('mastered');
    expect(entries[2]?.strength).toBe('leech');
  });

  it('searches headwords and readings without touching the schedule', async () => {
    await db.items.bulkPut([
      { ...item('ja:lex:neko', '猫', 'ja'), reading: 'ネコ' },
      item('ja:lex:inu', '犬', 'ja'),
    ]);
    await db.cards.bulkPut([card('ja:lex:neko'), card('ja:lex:inu')]);

    expect((await buildGlossary(PROFILE, 'ja', NOW, { search: 'ネコ' })).total).toBe(1);
    expect((await buildGlossary(PROFILE, 'ja', NOW, { search: '犬' })).entries[0]?.headword).toBe(
      '犬',
    );
  });

  it('scopes to one language, like every other per-language view', async () => {
    await db.items.bulkPut([item('en:lex:one', 'one'), item('ja:lex:ichi', '一', 'ja')]);
    await db.cards.bulkPut([card('en:lex:one'), card('ja:lex:ichi')]);

    expect((await buildGlossary(PROFILE, 'en', NOW)).total).toBe(1);
    expect((await buildGlossary(PROFILE, 'ja', NOW)).total).toBe(1);
  });

  it('caps what it renders but reports the real total', async () => {
    const items = Array.from({ length: 12 }, (_, i) => item(`en:lex:w${i}`, `w${i}`));
    await db.items.bulkPut(items);
    await db.cards.bulkPut(items.map((entry) => card(entry.id)));

    const { entries, total } = await buildGlossary(PROFILE, 'en', NOW, { limit: 5 });
    expect(entries).toHaveLength(5);
    expect(total).toBe(12);
  });

  it('returns nothing for a learner who has answered nothing', async () => {
    expect(await buildGlossary(PROFILE, 'en', NOW)).toEqual({ entries: [], total: 0 });
  });
});
