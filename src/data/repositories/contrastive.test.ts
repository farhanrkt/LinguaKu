import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db.ts';
import {
  allCategoryScores,
  categoryStandings,
  drillAttemptCount,
  getCategoryScore,
  recentDrillIds,
  recordCategoryAttempt,
  recordDrillAnswer,
  weakestCategories,
} from './contrastive.ts';
import { DEFAULT_RATING, MIN_ATTEMPTS_TO_CLAIM } from '../../core/elo.ts';

const NOW = Date.UTC(2026, 7, 11, 9, 0, 0);
const PROFILE = 'p1';

const answer = async (categoryId: string, correct: boolean, at = NOW) =>
  recordDrillAnswer({
    profileId: PROFILE,
    lang: 'en',
    drillId: `${categoryId}-${at % 1000}`,
    categoryId,
    correct,
    answerRaw: correct ? 'right' : 'wrong',
    latencyMs: 1200,
    now: at,
  });

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('category scores', () => {
  it('starts every category at the default rating with no attempts', async () => {
    expect(await getCategoryScore(PROFILE, 'en', 'ARTICLES')).toEqual({
      rating: DEFAULT_RATING,
      attempts: 0,
      correct: 0,
    });
  });

  it('moves the rating up on a right answer and down on a wrong one', async () => {
    await answer('ARTICLES', true, NOW);
    const up = await getCategoryScore(PROFILE, 'en', 'ARTICLES');
    expect(up.rating).toBeGreaterThan(DEFAULT_RATING);

    await answer('PLURAL_S', false, NOW + 1);
    const down = await getCategoryScore(PROFILE, 'en', 'PLURAL_S');
    expect(down.rating).toBeLessThan(DEFAULT_RATING);
  });

  it('keeps a raw hit count alongside the rating', async () => {
    await answer('ARTICLES', true, NOW);
    await answer('ARTICLES', false, NOW + 1);
    await answer('ARTICLES', true, NOW + 2);
    expect(await getCategoryScore(PROFILE, 'en', 'ARTICLES')).toMatchObject({
      attempts: 3,
      correct: 2,
    });
  });

  it('keeps languages apart', async () => {
    await answer('ARTICLES', false, NOW);
    expect((await getCategoryScore(PROFILE, 'ja', 'ARTICLES')).attempts).toBe(0);
  });

  it('moves every category an answer exercised, not just one', async () => {
    // `is` for `was` is genuinely both a copula and a tense error.
    await recordCategoryAttempt({
      profileId: PROFILE,
      lang: 'en',
      categoryIds: ['COPULA_BE', 'TENSE_ASPECT'],
      correct: false,
      now: NOW,
    });
    const scores = await allCategoryScores(PROFILE, 'en');
    expect(scores.get('COPULA_BE')?.attempts).toBe(1);
    expect(scores.get('TENSE_ASPECT')?.attempts).toBe(1);
  });

  it('does nothing at all when no category was matched', async () => {
    await recordCategoryAttempt({
      profileId: PROFILE,
      lang: 'en',
      categoryIds: [],
      correct: false,
      now: NOW,
    });
    expect((await allCategoryScores(PROFILE, 'en')).size).toBe(0);
  });
});

describe('drill attempts', () => {
  it('records the answer and the rating together', async () => {
    await answer('ARTICLES', true, NOW);
    expect(await drillAttemptCount(PROFILE)).toBe(1);
    expect((await getCategoryScore(PROFILE, 'en', 'ARTICLES')).attempts).toBe(1);
  });

  it('never writes a drill answer into the review log', async () => {
    // SPEC §9's retention rate is computed over scheduled cards. A drill has no
    // card and no schedule, so letting one in would corrupt that number.
    await answer('ARTICLES', true, NOW);
    expect(await db.reviewLogs.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
  });

  it('remembers what was asked recently, so a session does not repeat itself', async () => {
    await answer('ARTICLES', true, NOW);
    await answer('PLURAL_S', false, NOW + 1);
    const recent = await recentDrillIds(PROFILE, 'en');
    expect(recent.has(`ARTICLES-${NOW % 1000}`)).toBe(true);
    expect(recent.has(`PLURAL_S-${(NOW + 1) % 1000}`)).toBe(true);
  });
});

describe('standings and targeting (SPEC §3.3)', () => {
  const CATEGORIES = ['ARTICLES', 'PLURAL_S', 'PRONOUN_GENDER'];

  it('returns a row for every category, including the untouched ones', async () => {
    await answer('ARTICLES', false, NOW);
    const standings = await categoryStandings(PROFILE, 'en', CATEGORIES);
    expect(standings.map((s) => s.categoryId).sort()).toEqual([...CATEGORIES].sort());
    // The untouched ones say so rather than reading as an average score.
    expect(standings.find((s) => s.categoryId === 'PLURAL_S')?.measured).toBe(false);
  });

  it('targets the category the learner is actually worst at', async () => {
    for (let i = 0; i < MIN_ATTEMPTS_TO_CLAIM + 3; i++) {
      await answer('ARTICLES', false, NOW + i);
      await answer('PLURAL_S', true, NOW + 100 + i);
    }
    const priority = await weakestCategories(PROFILE, 'en', CATEGORIES);
    expect(priority[0]).toBe('ARTICLES');
    // And it still explores the one with no evidence at all.
    expect(priority).toContain('PRONOUN_GENDER');
  });

  it('will not name a weakness on a single bad answer', async () => {
    await answer('ARTICLES', false, NOW);
    const standings = await categoryStandings(PROFILE, 'en', CATEGORIES);
    expect(standings.every((standing) => !standing.weak)).toBe(true);
  });
});
