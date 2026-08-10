import { bandForRank, type FrequencyBand } from './frequency.ts';

/**
 * Adaptive placement (SPEC §4.2, §7.4).
 *
 * Constraints that shape every choice here: ≤90 seconds, ≤25 items, and it must
 * feel like learning rather than an exam. And it is **skippable** — a learner
 * who declines cold-starts instead, and the first ~50 answers do the estimating
 * implicitly. Nothing in the app may require a placement result to exist.
 *
 * Estimation is 1PL (Rasch) with a Bayesian posterior over a grid of ability
 * values. Grid EAP rather than maximum likelihood because MLE diverges on an
 * all-correct or all-wrong run — which is exactly what a 25-item test produces
 * for learners at either extreme — and because the posterior hands us the
 * standard error the stopping rule and SPEC §4.1's uncertainty band both need.
 */

// ------------------------------------------------------------- item difficulty

/** Ability grid, in logits. Wide enough to hold a true beginner and an expert. */
const GRID_MIN = -4;
const GRID_MAX = 4;
const GRID_STEP = 0.1;


/**
 * Zero on the ability scale is the learner who is at the edge of this rank.
 * Chosen to match decision D3: the default profile — an intermediate English
 * speaker who skipped placement — sits at θ = 0 and starts in band 3.
 */
const CENTRE_RANK = 2000;
/** Logits per natural-log unit of rank. Spreads ranks 50–8000 across ±4. */
const RANK_SPREAD = 0.9;

/**
 * Maps a frequency rank onto the 1PL difficulty scale, in logits.
 *
 * Log-spaced, because the step from rank 100 to 200 is a far bigger jump in
 * difficulty than 8,000 to 8,100. Clamped to the ability grid: on any log
 * scale the very first ranks run off to negative infinity, and "the" being
 * easier than every learner is true but useless — items that far below anyone
 * carry no information and are never worth asking.
 */
export const difficultyForRank = (rank: number): number => {
  const safe = Math.max(1, rank);
  const raw = (Math.log(safe) - Math.log(CENTRE_RANK)) / RANK_SPREAD;
  return Math.min(GRID_MAX, Math.max(GRID_MIN, raw));
};

/** Inverse: the frequency rank a learner of this ability is at the edge of. */
export const rankForAbility = (theta: number): number =>
  Math.round(Math.exp(theta * RANK_SPREAD + Math.log(CENTRE_RANK)));

/**
 * The band new items should be introduced from.
 *
 * The frontier band itself, not one below it. A new item enters the ladder at
 * L0 — errorless exposure, where the learner just reads and confirms — so
 * introducing at the frontier costs them nothing; SPEC §2.3's desirable
 * difficulty is delivered by the ladder afterwards, and by the coverage
 * selector choosing which sentence to teach it in.
 */
export const bandForAbility = (theta: number): FrequencyBand =>
  bandForRank(rankForAbility(theta));

// -------------------------------------------------------------- 1PL estimation

export const THETA_GRID: readonly number[] = Array.from(
  { length: Math.round((GRID_MAX - GRID_MIN) / GRID_STEP) + 1 },
  (_, index) => GRID_MIN + index * GRID_STEP,
);

/** Prior: most learners are near the middle, but the tails stay reachable. */
export const PRIOR_MEAN = 0;
export const PRIOR_SD = 1.5;

export interface PlacementResponse {
  /** 1PL difficulty of the item, in logits. */
  difficulty: number;
  correct: boolean;
}

export interface AbilityEstimate {
  theta: number;
  standardError: number;
}

/** 1PL response probability. */
export const probabilityCorrect = (theta: number, difficulty: number): number =>
  1 / (1 + Math.exp(-(theta - difficulty)));

const normalDensity = (x: number, mean: number, sd: number): number =>
  Math.exp(-((x - mean) ** 2) / (2 * sd * sd));

/**
 * Expected a posteriori estimate over the grid.
 *
 * With no responses this returns the prior — which is the honest answer for a
 * learner who skipped placement, and why a skipped placement needs no special
 * case anywhere else.
 */
export const estimateAbility = (responses: readonly PlacementResponse[]): AbilityEstimate => {
  const posterior = THETA_GRID.map((theta) => {
    let density = normalDensity(theta, PRIOR_MEAN, PRIOR_SD);
    for (const response of responses) {
      const p = probabilityCorrect(theta, response.difficulty);
      density *= response.correct ? p : 1 - p;
    }
    return density;
  });

  const total = posterior.reduce((sum, value) => sum + value, 0);
  if (total === 0 || !Number.isFinite(total)) {
    return { theta: PRIOR_MEAN, standardError: PRIOR_SD };
  }

  const mean = THETA_GRID.reduce((sum, theta, i) => sum + theta * posterior[i]!, 0) / total;
  const variance =
    THETA_GRID.reduce((sum, theta, i) => sum + (theta - mean) ** 2 * posterior[i]!, 0) / total;

  return { theta: mean, standardError: Math.sqrt(variance) };
};

// ---------------------------------------------------------------- item choice

export interface PlacementItem {
  id: string;
  difficulty: number;
}

/**
 * Maximum-information selection: for a 1PL model, information peaks where item
 * difficulty equals the learner's current ability, so the most informative next
 * question is the one they have roughly a coin-flip chance on.
 *
 * That is also what stops placement feeling like an exam — a learner is never
 * marched through twenty items far above or far below them.
 */
export const selectNextItem = <T extends PlacementItem>(
  pool: readonly T[],
  theta: number,
  askedIds: ReadonlySet<string>,
): T | null => {
  let best: T | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const item of pool) {
    if (askedIds.has(item.id)) continue;
    const distance = Math.abs(item.difficulty - theta);
    if (distance < bestDistance || (distance === bestDistance && best !== null && item.id < best.id)) {
      best = item;
      bestDistance = distance;
    }
  }
  return best;
};

// -------------------------------------------------------------- stopping rule

/** SPEC §4.2 caps. */
export const MAX_ITEMS = 25;
export const MAX_DURATION_MS = 90_000;
/** Stop once the estimate is this precise; ±0.6 logits is a useful band. */
export const TARGET_STANDARD_ERROR = 0.3;
/** Below this, the estimate is too raw to trust however precise it looks. */
export const MIN_ITEMS = 8;

export interface StopInput {
  answered: number;
  elapsedMs: number;
  standardError: number;
}

export const shouldStop = (input: StopInput): boolean => {
  if (input.answered >= MAX_ITEMS) return true;
  if (input.elapsedMs >= MAX_DURATION_MS) return true;
  return input.answered >= MIN_ITEMS && input.standardError <= TARGET_STANDARD_ERROR;
};

// ------------------------------------------------- Yes/No vocabulary checking

export interface YesNoTally {
  /** Real words the learner claimed to know. */
  hits: number;
  realShown: number;
  /** Pseudowords the learner claimed to know. */
  falseAlarms: number;
  pseudoShown: number;
}

export interface YesNoResult {
  hitRate: number;
  falseAlarmRate: number;
  /** Hit rate corrected for over-claiming, in 0..1. */
  corrected: number;
}

/**
 * SPEC §4.2: a Yes/No vocabulary check with pseudowords, corrected for false
 * alarms.
 *
 * Without the correction the test measures confidence rather than vocabulary:
 * a learner who says yes to everything scores 100%. The correction used here is
 * the standard one — (h − f) / (1 − f) — which asks what share of the words
 * they did *not* simply claim they actually knew. A learner who says yes to
 * every pseudoword tells us nothing, so the result is zero rather than negative.
 */
export const correctForFalseAlarms = (tally: YesNoTally): YesNoResult => {
  const hitRate = tally.realShown > 0 ? tally.hits / tally.realShown : 0;
  const falseAlarmRate = tally.pseudoShown > 0 ? tally.falseAlarms / tally.pseudoShown : 0;

  if (falseAlarmRate >= 1) return { hitRate, falseAlarmRate, corrected: 0 };

  const corrected = (hitRate - falseAlarmRate) / (1 - falseAlarmRate);
  return { hitRate, falseAlarmRate, corrected: Math.min(1, Math.max(0, corrected)) };
};
