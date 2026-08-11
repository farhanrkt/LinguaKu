import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db.ts';
import { recordReview } from './reviews.ts';
import { categoryStandings, recordCategoryAttempt } from './contrastive.ts';
import { detectInterference } from '../../core/interference.ts';
import { MIN_ATTEMPTS_TO_CLAIM } from '../../core/elo.ts';

/**
 * M4 acceptance (SPEC §12): *"wrong answers on tagged items produce an
 * Indonesian explanation; the heatmap renders from real logs."*
 *
 * The two halves of that are unit-tested separately — `interference.test.ts`
 * proves the detector fires on the right errors and stays quiet otherwise, and
 * `contrastive.test.ts` proves the ratings move. What neither covers is that
 * they **join up**: an ordinary cloze answered wrongly has to end as a number on
 * the progress screen, without going anywhere near a drill.
 *
 * That path is what makes the heatmap say something a quiz could not — it is
 * built from what the learner does when they are not being tested on it — so it
 * is worth a test of its own. This mirrors exactly what SessionScreen does on a
 * wrong answer; if that wiring is changed, this fails.
 */

const PROFILE = 'p1';
const NOW = Date.UTC(2026, 7, 11, 9, 0, 0);
const DAY = 86_400_000;

/** One wrong cloze answer, handled the way the session screen handles it. */
const answerWrongly = async (
  itemId: string,
  raw: string,
  expected: string,
  before: string,
  at: number,
): Promise<string[]> => {
  const hits = detectInterference({ raw, expected, before });

  await recordReview({
    profileId: PROFILE,
    itemId,
    grade: 1,
    confidence: 'yakin',
    latencyMs: 2_400,
    answerRaw: raw,
    correct: false,
    now: at,
    audioAvailable: false,
    ...(hits.length > 0 ? { interferenceHit: hits } : {}),
  });

  if (hits.length > 0) {
    await recordCategoryAttempt({
      profileId: PROFILE,
      lang: 'en',
      categoryIds: hits,
      correct: false,
      now: at,
    });
  }
  return hits;
};

const CATEGORIES = ['PRONOUN_GENDER', 'ARTICLES', 'PLURAL_S', 'TENSE_ASPECT'];

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('an ordinary wrong answer reaches the heatmap (SPEC §3.3)', () => {
  it('tags the review log and moves the category in one go', async () => {
    const hits = await answerWrongly('en:lex:she', 'he', 'she', 'My mother is a doctor.', NOW);
    expect(hits).toEqual(['PRONOUN_GENDER']);

    const logs = await db.reviewLogs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.interferenceHit).toEqual(['PRONOUN_GENDER']);
    // The learner's own words are kept, so the tag can be audited later.
    expect(logs[0]?.answerRaw).toBe('he');

    const [standing] = await categoryStandings(PROFILE, 'en', ['PRONOUN_GENDER']);
    expect(standing?.attempts).toBe(1);
    expect(standing?.correct).toBe(0);
  });

  it('says nothing about a category the learner has barely touched', async () => {
    await answerWrongly('en:lex:she', 'he', 'she', 'My mother is a doctor.', NOW);
    const standings = await categoryStandings(PROFILE, 'en', CATEGORIES);
    // One slip is not a finding (SPEC §2.15) — measured is false, and nothing
    // is flagged as a weakness on the strength of it.
    expect(standings.every((standing) => !standing.weak)).toBe(true);
    expect(standings.find((s) => s.categoryId === 'PRONOUN_GENDER')?.measured).toBe(false);
  });

  it('names the weakness once there is enough evidence, from reviews alone', async () => {
    // No drills at all here: every one of these is a normal cloze answered
    // wrongly, which is the whole point of the detector.
    for (let i = 0; i < MIN_ATTEMPTS_TO_CLAIM + 2; i++) {
      await answerWrongly(`en:lex:w${i}`, 'he', 'she', 'My sister is here.', NOW + i * DAY);
    }

    const [standing] = await categoryStandings(PROFILE, 'en', ['PRONOUN_GENDER']);
    expect(standing?.measured).toBe(true);
    expect(standing?.weak).toBe(true);
    expect(standing?.attempts).toBe(MIN_ATTEMPTS_TO_CLAIM + 2);
    expect(await db.drillAttempts.count()).toBe(0);
  });

  it('ranks the learner’s worst pattern first', async () => {
    for (let i = 0; i < 8; i++) {
      await answerWrongly(`en:lex:g${i}`, 'he', 'she', 'My sister is here.', NOW + i * DAY);
    }
    for (let i = 0; i < 6; i++) {
      await answerWrongly(`en:lex:a${i}`, 'a', 'the', 'Please close', NOW + (20 + i) * DAY);
      await recordCategoryAttempt({
        profileId: PROFILE,
        lang: 'en',
        categoryIds: ['ARTICLES'],
        correct: true,
        now: NOW + (40 + i) * DAY,
      });
    }

    const measured = (await categoryStandings(PROFILE, 'en', CATEGORIES))
      .filter((standing) => standing.measured)
      .sort((a, b) => a.rating - b.rating);

    // Eight straight misses beats six-and-six: the ordering is what the screen
    // leads with ("Kelemahan terbesarmu…"), so it has to reflect the evidence.
    expect(measured[0]?.categoryId).toBe('PRONOUN_GENDER');
    expect(measured.map((standing) => standing.categoryId)).toContain('ARTICLES');
    // And a category never seen stays off the ranking entirely.
    expect(measured.map((standing) => standing.categoryId)).not.toContain('TENSE_ASPECT');
  });

  it('leaves the categories alone when the error matches no known pattern', async () => {
    const hits = await answerWrongly('en:lex:x', 'elephant', 'tomorrow', 'See you', NOW);
    expect(hits).toEqual([]);

    const logs = await db.reviewLogs.toArray();
    expect(logs[0]?.interferenceHit).toBeUndefined();
    // A wrong answer is still a wrong answer — the card moved, the heatmap did not.
    expect(await db.cards.count()).toBe(1);
    expect((await categoryStandings(PROFILE, 'en', CATEGORIES)).every((s) => s.attempts === 0)).toBe(
      true,
    );
  });

  it('never files a review-caught error as a drill attempt', async () => {
    // The two sources move the same ratings but stay separately auditable, so
    // "how much of this came from drills" remains answerable (D32).
    await answerWrongly('en:lex:she', 'he', 'she', 'My mother is a doctor.', NOW);
    expect(await db.drillAttempts.count()).toBe(0);
    expect(await db.reviewLogs.count()).toBe(1);
  });
});
