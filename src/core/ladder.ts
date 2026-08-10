import type { Grade, LadderLevel } from '../data/types.ts';

/**
 * SCIENCE: desirable difficulty — retrieval that is effortful but successful
 * builds more durable memory than easy retrieval. See SPEC §2.3.
 *
 * **One active card per item** (decision R5 in docs/DECISIONS.md). The ladder
 * level is a property of that card: it selects which task the learner is given,
 * and FSRS state carries across promotion rather than restarting. The
 * alternative — a separate FSRS card per rung — multiplies review load by up to
 * 7×, which caps a 4-minute-a-day learner at a vocabulary in the low hundreds.
 *
 * Every review records the level it was answered at (`ReviewLog`), so the
 * ladder's effect on accuracy stays measurable even though the state is shared.
 */

/** SPEC §2.3. L4–L6 are defined here but not yet reachable; see `MAX_ENABLED_LEVEL`. */
export const LADDER_TASKS: Record<LadderLevel, string> = {
  0: 'first exposure — sentence, audio and gloss, learner confirms',
  1: 'multiple choice ID → target',
  2: 'target → meaning, produced',
  3: 'cloze inside a known sentence',
  4: 'audio-only cloze or dictation',
  5: 'ID → target, produced',
  6: 'open prompt — use it in a sentence about your own life',
};

/**
 * Stability (in days) a card must reach before its item graduates to the next
 * rung. These are a **calibration choice, not a finding** — SPEC §2.3 specifies
 * that a threshold exists, not what it is. They should be revisited against
 * real retention data once there are enough review logs (SPEC §9).
 */
export const PROMOTION_STABILITY_DAYS: Record<LadderLevel, number> = {
  0: 0, // errorless exposure graduates on the first successful confirm
  1: 4,
  2: 10,
  3: 21,
  4: 45,
  5: 90,
  6: Number.POSITIVE_INFINITY, // nowhere left to go
};

/**
 * L0–L3 are what M2 ships. L4 needs working audio (SPEC §2.6, risk R1) and
 * L5–L6 need production input, which is M7.
 */
export const MAX_ENABLED_LEVEL: LadderLevel = 3;

/** SPEC §7.2: at this many lapses a card is a leech and needs re-teaching. */
export const LEECH_LAPSE_THRESHOLD = 6;

/** SPEC §2.3: promotion needs at least this share of the last three answers right. */
export const PROMOTION_ACCURACY = 2 / 3;
const ACCURACY_WINDOW = 3;

/**
 * Again means the retrieval failed. Hard, Good and Easy all mean the learner
 * *did* retrieve it, just with differing effort — so Hard counts as a success
 * for promotion purposes, exactly as it does for FSRS.
 */
export const isSuccess = (grade: Grade): boolean => grade > 1;

export const recentAccuracy = (grades: readonly Grade[]): number => {
  const window = grades.slice(0, ACCURACY_WINDOW);
  if (window.length === 0) return 0;
  return window.filter(isSuccess).length / window.length;
};

export interface LadderInput {
  level: LadderLevel;
  /** The grade the learner just gave. */
  grade: Grade;
  /** FSRS stability after that grade, in days. */
  stabilityDays: number;
  /** Grades at this level, most recent first, including the one just given. */
  recentGrades: readonly Grade[];
  /** FSRS lapse count after that grade. */
  lapses: number;
}

export interface LadderDecision {
  level: LadderLevel;
  change: 'promoted' | 'demoted' | 'held';
  /**
   * SPEC §7.2: a leech is demoted *and* re-taught with a fresh sentence —
   * never simply shown again, which is how learners end up staring at the same
   * card for months.
   */
  leech: boolean;
}

const clampLevel = (level: number): LadderLevel =>
  Math.min(MAX_ENABLED_LEVEL, Math.max(0, level)) as LadderLevel;

export const nextLadderLevel = (input: LadderInput): LadderDecision => {
  const leech = input.lapses >= LEECH_LAPSE_THRESHOLD;

  // Demote on lapse. A failed retrieval means the current task is too hard for
  // the current strength, and repeating it unchanged is how leeches are made.
  if (!isSuccess(input.grade)) {
    const level = clampLevel(input.level - 1);
    return { level, change: level === input.level ? 'held' : 'demoted', leech };
  }

  const canPromote =
    input.level < MAX_ENABLED_LEVEL &&
    input.stabilityDays >= PROMOTION_STABILITY_DAYS[input.level] &&
    recentAccuracy(input.recentGrades) >= PROMOTION_ACCURACY;

  if (canPromote) {
    return { level: clampLevel(input.level + 1), change: 'promoted', leech };
  }
  return { level: input.level, change: 'held', leech };
};

/**
 * SPEC §2.3 acceptance: a learner who has only ever answered an item at L1
 * cannot see it as mastered. That holds by construction — mastery requires
 * having been promoted past the recognition rungs.
 *
 * When production (L5–L6) ships, mastery should require reaching it: producing
 * a word is the claim "I know this", and recognizing it is not.
 */
export const MASTERY_MIN_LEVEL: LadderLevel = 3;
export const MASTERY_MIN_STABILITY_DAYS = 21;

export const isMastered = (level: LadderLevel, stabilityDays: number): boolean =>
  level >= MASTERY_MIN_LEVEL && stabilityDays >= MASTERY_MIN_STABILITY_DAYS;
