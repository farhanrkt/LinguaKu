import { db } from '../db.ts';
import {
  drillPriority,
  emptyRating,
  standingFor,
  updateRating,
  type CategoryRating,
  type CategoryStanding,
} from '../../core/elo.ts';
import { flag } from '../types.ts';
import type { CategoryScore, DrillAttempt, TargetLang, Timestamp } from '../types.ts';

/**
 * Per-category ability, the substrate of the interference heatmap (SPEC §3.3).
 *
 * Two things move these numbers, and both are real learner behaviour:
 *
 *  1. **Drill answers** — a targeted item for a category, right or wrong.
 *  2. **Interference hits on ordinary reviews** — a cloze answered `he` when
 *     `she` was wanted moves `PRONOUN_GENDER`, because that is a measurement of
 *     the same thing, taken in the wild rather than in a drill.
 *
 * That second source is what makes the heatmap say something a quiz could not:
 * it is built from what the learner does when they are not being tested on it.
 *
 * Note what does *not* move them: showing a note, reading a category, or opening
 * the progress screen. Only answers count (SPEC §2.2).
 */

const toRating = (score: CategoryScore | undefined): CategoryRating =>
  score
    ? { rating: score.elo, attempts: score.attempts, correct: score.correct }
    : emptyRating();

const key = (profileId: string, lang: TargetLang, categoryId: string): [string, string, string] => [
  profileId,
  lang,
  categoryId,
];

export const getCategoryScore = async (
  profileId: string,
  lang: TargetLang,
  categoryId: string,
): Promise<CategoryRating> => toRating(await db.categoryScores.get(key(profileId, lang, categoryId)));

export const allCategoryScores = async (
  profileId: string,
  lang: TargetLang,
): Promise<Map<string, CategoryRating>> => {
  const rows = await db.categoryScores.where('[profileId+lang]').equals([profileId, lang]).toArray();
  return new Map(rows.map((row) => [row.categoryId, toRating(row)]));
};

export interface RecordAttemptInput {
  profileId: string;
  lang: TargetLang;
  categoryIds: readonly string[];
  correct: boolean;
  /** Elo difficulty of the item answered; omit for a median item. */
  itemDifficulty?: number;
  now: Timestamp;
}

/**
 * Records one answer against every category it exercised.
 *
 * An answer can legitimately touch more than one category — `is` for `was` is
 * both a copula choice and a tense choice — and both estimates move, because
 * both were genuinely tested.
 */
export const recordCategoryAttempt = async (
  input: RecordAttemptInput,
): Promise<Map<string, CategoryRating>> => {
  const updated = new Map<string, CategoryRating>();
  if (input.categoryIds.length === 0) return updated;

  await db.transaction('rw', db.categoryScores, async () => {
    for (const categoryId of input.categoryIds) {
      const current = toRating(await db.categoryScores.get(key(input.profileId, input.lang, categoryId)));
      const next = updateRating({
        current,
        correct: input.correct,
        ...(input.itemDifficulty !== undefined ? { itemDifficulty: input.itemDifficulty } : {}),
      });
      await db.categoryScores.put({
        profileId: input.profileId,
        lang: input.lang,
        categoryId,
        elo: next.rating,
        attempts: next.attempts,
        correct: next.correct,
        updatedAt: input.now,
      });
      updated.set(categoryId, next);
    }
  });

  return updated;
};

/**
 * Standings for every category the pack defines — including the ones with no
 * attempts, which come back `measured: false`. The heatmap needs to be able to
 * say "not measured yet" out loud, so those rows have to reach it.
 */
export const categoryStandings = async (
  profileId: string,
  lang: TargetLang,
  categoryIds: readonly string[],
): Promise<CategoryStanding[]> => {
  const scores = await allCategoryScores(profileId, lang);
  return categoryIds.map((categoryId) =>
    standingFor(categoryId, scores.get(categoryId) ?? emptyRating()),
  );
};

/** SPEC §3.3: which categories the session composer should target, weakest first. */
export const weakestCategories = async (
  profileId: string,
  lang: TargetLang,
  categoryIds: readonly string[],
): Promise<string[]> => drillPriority(await categoryStandings(profileId, lang, categoryIds));

// -------------------------------------------------------------- drill history

export interface RecordDrillInput {
  profileId: string;
  lang: TargetLang;
  drillId: string;
  categoryId: string;
  correct: boolean;
  answerRaw: string;
  latencyMs: number;
  itemDifficulty?: number;
  now: Timestamp;
}

/**
 * The single writer of drill state, mirroring what `recordReview` is for FSRS
 * (invariant 0): it cannot be called without an outcome, and it writes the
 * attempt and the rating together in one transaction — so a rating can never
 * move without the answer that moved it being on record.
 */
export const recordDrillAnswer = async (
  input: RecordDrillInput,
): Promise<CategoryRating> => {
  const attempt: DrillAttempt = {
    id: crypto.randomUUID(),
    profileId: input.profileId,
    lang: input.lang,
    drillId: input.drillId,
    categoryId: input.categoryId,
    correct: flag(input.correct),
    answerRaw: input.answerRaw,
    latencyMs: input.latencyMs,
    answeredAt: input.now,
  };

  let rating = emptyRating();
  await db.transaction('rw', db.drillAttempts, db.categoryScores, async () => {
    await db.drillAttempts.add(attempt);
    const updated = await recordCategoryAttempt({
      profileId: input.profileId,
      lang: input.lang,
      categoryIds: [input.categoryId],
      correct: input.correct,
      ...(input.itemDifficulty !== undefined ? { itemDifficulty: input.itemDifficulty } : {}),
      now: input.now,
    });
    rating = updated.get(input.categoryId) ?? rating;
  });

  return rating;
};

/**
 * Drills answered recently, so a session does not serve the same one twice.
 */
export const recentDrillIds = async (
  profileId: string,
  lang: TargetLang,
  limit = 40,
): Promise<Set<string>> => {
  const rows = await db.drillAttempts
    .where('[profileId+answeredAt]')
    .between([profileId, 0], [profileId, Number.MAX_SAFE_INTEGER])
    .reverse()
    .limit(limit)
    .toArray();
  return new Set(rows.filter((row) => row.lang === lang).map((row) => row.drillId));
};

export const drillAttemptCount = async (profileId: string): Promise<number> =>
  db.drillAttempts.where('profileId').equals(profileId).count();
