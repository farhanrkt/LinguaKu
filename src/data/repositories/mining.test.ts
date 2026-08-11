import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db.ts';
import { isMined, mineItem, minedItemIds, pendingMined, unmineItem } from './mining.ts';
import { recordReview } from './reviews.ts';
import { planSession } from './sessions.ts';
import { bandForRank } from '../../core/frequency.ts';
import type { Profile } from '../types.ts';

/**
 * SPEC §8's one-tap mining. The rule these tests exist to hold is the one the
 * feature is most likely to break: **mining does not create a card**.
 *
 * Invariant 0 and §2.2 make a card the product of an answer, so minting one from
 * a tap would put an item into the schedule with an invented review history and
 * a due date nobody earned. Mining records the intention; the composer acts on it.
 */

const NOW = Date.UTC(2026, 7, 11, 9, 0, 0);
const PROFILE = 'p1';

const profile: Profile = {
  id: PROFILE,
  uiLang: 'id',
  targets: ['en'],
  dailyMinutes: 8,
  scriptMode: 'kanji',
  createdAt: NOW,
};

const seedCorpus = async () => {
  for (let i = 0; i < 60; i++) {
    const freqRank = 20 + i * 40;
    await db.items.add({
      id: `en:lex:w${i}`,
      lang: 'en',
      kind: 'lexeme',
      headword: `w${i}`,
      anchorSentenceIds: [`tatoeba:eng:${i}`],
      freqRank,
      band: bandForRank(freqRank),
      interferenceTags: [],
      sourceRef: { dataset: 'tatoeba', externalId: `w${i}` },
    });
  }
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.profiles.add(profile);
  await seedCorpus();
});

describe('mining is an intention, not a card (SPEC §2.2, invariant 0)', () => {
  it('creates no card and no review log', async () => {
    await mineItem(PROFILE, 'en:lex:w5', 'tatoeba:eng:5', NOW);
    expect(await db.cards.count()).toBe(0);
    expect(await db.reviewLogs.count()).toBe(0);
    expect(await isMined(PROFILE, 'en:lex:w5')).toBe(true);
  });

  it('is idempotent — one word tapped twice is one intention', async () => {
    await mineItem(PROFILE, 'en:lex:w5', 'tatoeba:eng:5', NOW);
    await mineItem(PROFILE, 'en:lex:w5', 'tatoeba:eng:9', NOW + 1000);
    expect(await db.minedItems.count()).toBe(1);
    // The first context wins, so the sentence they actually mined it from is kept.
    expect((await db.minedItems.get([PROFILE, 'en:lex:w5']))?.fromSentenceId).toBe(
      'tatoeba:eng:5',
    );
  });

  it('can be undone', async () => {
    await mineItem(PROFILE, 'en:lex:w5', 'tatoeba:eng:5', NOW);
    await unmineItem(PROFILE, 'en:lex:w5');
    expect(await isMined(PROFILE, 'en:lex:w5')).toBe(false);
  });

  it('keeps the sentence it was mined from, so it can be taught in context', async () => {
    await mineItem(PROFILE, 'en:lex:w7', 'tatoeba:eng:42', NOW);
    expect((await db.minedItems.get([PROFILE, 'en:lex:w7']))?.fromSentenceId).toBe(
      'tatoeba:eng:42',
    );
  });

  it('scopes to the profile', async () => {
    await mineItem(PROFILE, 'en:lex:w5', 'tatoeba:eng:5', NOW);
    expect(await minedItemIds('someone-else')).toEqual(new Set());
  });
});

describe('pendingMined', () => {
  it('forgets a word once the learner has actually started it', async () => {
    await mineItem(PROFILE, 'en:lex:w5', 'tatoeba:eng:5', NOW);
    expect(await pendingMined(PROFILE, new Set())).toHaveLength(1);
    expect(await pendingMined(PROFILE, new Set(['en:lex:w5']))).toHaveLength(0);
  });
});

describe('the composer acts on it (SPEC §8)', () => {
  it('introduces a mined word ahead of the frequency queue', async () => {
    // Asserted as *selection*, not as position: the composer interleaves after
    // it selects (§2.8), so where an item lands is deliberately not the
    // priority order. What matters is that a mined word is chosen at all when
    // the session has room for only a fraction of the queue.
    await mineItem(PROFILE, 'en:lex:w50', 'tatoeba:eng:50', NOW);
    const plan = await planSession({ ...profile, dailyMinutes: 4 }, NOW);

    expect(plan.session.itemIds).toContain('en:lex:w50');
    // And it beat words that would otherwise have gone first: w50 is rank 2020,
    // far down the frequency queue, yet it is in a session that cannot hold
    // everything below it.
    const items = await db.items.bulkGet(plan.session.itemIds);
    const ranks = items.flatMap((item) => (item ? [item.freqRank] : []));
    expect(Math.max(...ranks)).toBeGreaterThanOrEqual(2020);
    expect(plan.session.itemIds.length).toBeLessThan(60);
  });

  it('lets a mined word past the frontier gate', async () => {
    // The learner asked for this one. Level gating exists to stop us marching
    // them through words they did not choose, not to overrule a choice.
    await mineItem(PROFILE, 'en:lex:w59', 'tatoeba:eng:59', NOW);
    const plan = await planSession(profile, NOW);
    const mined = await db.items.get('en:lex:w59');
    expect(mined!.band).toBeGreaterThan(plan.frontier);
    expect(plan.session.itemIds).toContain('en:lex:w59');
  });

  it('stops offering it once it has been answered', async () => {
    await mineItem(PROFILE, 'en:lex:w50', 'tatoeba:eng:50', NOW);
    await recordReview({
      profileId: PROFILE,
      itemId: 'en:lex:w50',
      grade: 3,
      confidence: null,
      latencyMs: 900,
      answerRaw: 'w50',
      correct: true,
      now: NOW,
    });
    // Now it is a normal card with a normal schedule; the mining intention is
    // spent rather than repeating forever.
    expect(await pendingMined(PROFILE, new Set(['en:lex:w50']))).toHaveLength(0);
  });
});
