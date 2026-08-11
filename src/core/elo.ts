/**
 * SCIENCE: per-category ability estimation — SPEC §3.3, step 2. *"Wrong answers
 * increment an Elo-style ability estimate per category (not just per item)."*
 *
 * Why Elo rather than the 1PL grid that `placement.ts` uses: placement asks one
 * question once and wants a posterior with an honest standard error. This asks a
 * question that never stops being asked, over twenty categories at once, and it
 * has to stay cheap and incremental — one number per category, updated in place
 * after every answer. Elo is exactly that shape, and its expected-score curve is
 * the same logistic the 1PL model uses, just on a 400-point scale instead of
 * logits.
 *
 * What this file will **not** do is turn a rating into a level claim. A rating is
 * ordering information — "your articles are weaker than your plurals" — and
 * SPEC §2.15 bans dressing that up as precision it does not have. Hence
 * `MIN_ATTEMPTS_TO_CLAIM`: below it, the honest report is "not measured yet".
 */

/** Classic Elo scale, so the numbers stay legible while debugging. */
export const DEFAULT_RATING = 1200;

/** A drill with no authored difficulty is assumed to be a median drill. */
export const DEFAULT_ITEM_DIFFICULTY = 1200;

/** Points per unit on the logistic scale. */
const SCALE = 400;

/**
 * How fast the estimate moves. High while the estimate is provisional, then
 * damped — a learner who has answered forty articles items should not have
 * their whole estimate rewritten by one slip.
 */
export const kFactor = (attempts: number): number => {
  if (attempts < 10) return 48;
  if (attempts < 30) return 24;
  return 12;
};

/** Probability this learner answers a drill of this difficulty correctly. */
export const expectedScore = (rating: number, itemDifficulty: number): number =>
  1 / (1 + 10 ** ((itemDifficulty - rating) / SCALE));

export interface CategoryRating {
  rating: number;
  attempts: number;
  correct: number;
}

export const emptyRating = (): CategoryRating => ({
  rating: DEFAULT_RATING,
  attempts: 0,
  correct: 0,
});

export interface EloUpdate {
  current: CategoryRating;
  /** Elo difficulty of the drill just answered. */
  itemDifficulty?: number;
  correct: boolean;
}

export const updateRating = (input: EloUpdate): CategoryRating => {
  const difficulty = input.itemDifficulty ?? DEFAULT_ITEM_DIFFICULTY;
  const expected = expectedScore(input.current.rating, difficulty);
  const actual = input.correct ? 1 : 0;
  return {
    rating: input.current.rating + kFactor(input.current.attempts) * (actual - expected),
    attempts: input.current.attempts + 1,
    correct: input.current.correct + (input.correct ? 1 : 0),
  };
};

// ------------------------------------------------------------- weakness

/**
 * Below this many attempts a category has no estimate worth reporting. Five is
 * a judgement call, not a finding: it is enough that one unlucky answer cannot
 * put a category at the top of the heatmap, and few enough that a learner sees
 * their weaknesses within a couple of sessions.
 */
export const MIN_ATTEMPTS_TO_CLAIM = 5;

/**
 * A category counts as weak when the learner would be expected to get fewer
 * than this share of median drills right. 0.75 rather than 0.5 because the
 * point is to catch categories that need work, not only the ones already lost.
 */
export const WEAKNESS_EXPECTED_ACCURACY = 0.75;

/** The rating at which expected accuracy on a median drill hits the threshold. */
export const WEAKNESS_RATING =
  DEFAULT_ITEM_DIFFICULTY +
  SCALE * Math.log10(WEAKNESS_EXPECTED_ACCURACY / (1 - WEAKNESS_EXPECTED_ACCURACY));

export const isWeak = (rating: CategoryRating): boolean =>
  rating.attempts >= MIN_ATTEMPTS_TO_CLAIM && rating.rating < WEAKNESS_RATING;

export interface CategoryStanding<Id extends string = string> {
  categoryId: Id;
  rating: number;
  attempts: number;
  correct: number;
  /** Expected accuracy on a median drill, 0..1. The learner-facing number. */
  expected: number;
  /** False when there is not yet enough evidence to say anything. */
  measured: boolean;
  weak: boolean;
}

export const standingFor = <Id extends string>(
  categoryId: Id,
  rating: CategoryRating,
): CategoryStanding<Id> => ({
  categoryId,
  rating: rating.rating,
  attempts: rating.attempts,
  correct: rating.correct,
  expected: expectedScore(rating.rating, DEFAULT_ITEM_DIFFICULTY),
  measured: rating.attempts >= MIN_ATTEMPTS_TO_CLAIM,
  weak: isWeak(rating),
});

/**
 * The heatmap's order (SPEC §3.3, step 4): weakest first, and **only categories
 * we have actually measured**. An unattempted category is not a strength and it
 * is not a weakness; it is unknown, and saying so is the whole difference
 * between this screen and a horoscope.
 */
export const rankWeaknesses = <Id extends string>(
  standings: readonly CategoryStanding<Id>[],
): CategoryStanding<Id>[] =>
  standings
    .filter((standing) => standing.measured)
    .sort(
      (a, b) =>
        a.rating - b.rating ||
        b.attempts - a.attempts ||
        a.categoryId.localeCompare(b.categoryId),
    );

/**
 * Which categories the session composer should drill next.
 *
 * Two pools, in order: measured weaknesses (weakest first — SPEC §3.3's "below
 * threshold" rule), then categories with too little evidence to judge, so the
 * heatmap fills in rather than staying permanently blank on the categories the
 * learner happens never to have been tested on. Categories already at or above
 * threshold are left alone; drilling what someone can already do is how a
 * session stops being worth four minutes.
 */
export const drillPriority = <Id extends string>(
  standings: readonly CategoryStanding<Id>[],
): Id[] => {
  const weak = rankWeaknesses(standings).filter((standing) => standing.weak);
  const unmeasured = standings
    .filter((standing) => !standing.measured)
    .sort((a, b) => a.attempts - b.attempts || a.categoryId.localeCompare(b.categoryId));
  return [...weak, ...unmeasured].map((standing) => standing.categoryId);
};
