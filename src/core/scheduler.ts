import {
  fsrs,
  generatorParameters,
  Rating,
  type FSRSParameters,
} from 'ts-fsrs';
import { fromStoredFsrsState, toStoredFsrsState } from '../data/fsrsState.ts';
import type { Grade, StoredFsrsState, Timestamp } from '../data/types.ts';

/**
 * SCIENCE: spaced retrieval against a predicted forgetting curve, rather than
 * fixed intervals — see SPEC §2.1. This is a thin wrapper over `ts-fsrs`: it
 * owns the parameter defaults, the storage representation, and nothing else.
 * No scheduling logic lives here, because reimplementing FSRS is exactly the
 * kind of thing that looks fine and silently ruins a learner's retention.
 */

/** SPEC §2.1 defaults. */
export const DEFAULT_PARAMETERS: Readonly<FSRSParameters> = generatorParameters({
  request_retention: 0.9,
  enable_fuzz: true,
  enable_short_term: true,
});

/**
 * Per-user parameters, once we have enough review logs to optimize them
 * (SPEC §2.1). Until then every learner gets the published defaults.
 */
export interface SchedulerOptions {
  parameters?: Readonly<FSRSParameters>;
}

const schedulerFor = (options: SchedulerOptions = {}) =>
  fsrs(options.parameters ?? DEFAULT_PARAMETERS);

/** The four things a learner can say about a card. */
export const GRADES: readonly Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

export interface Scheduled {
  /** Card state *after* the review. The new interval is `state.scheduledDays`. */
  state: StoredFsrsState;
  /**
   * Review-log semantics, matching `ReviewLog.scheduledDays` in SPEC §6 and
   * Anki's revlog: the interval that was in force **before** this review, not
   * the one just committed to. Zero for a card's first ever review. Getting
   * these two confused silently corrupts any later retention analysis, which
   * is why they are named for the log rather than for the card.
   */
  scheduledDays: number;
  /** Days actually elapsed since the previous review. */
  elapsedDays: number;
}

/**
 * What each rating would do, without committing — SPEC §2.1 asks for this so
 * the UI can show real intervals on the answer buttons instead of guesses.
 */
export const preview = (
  state: StoredFsrsState,
  now: Timestamp,
  options?: SchedulerOptions,
): Record<Grade, Scheduled> => {
  const previews = schedulerFor(options).repeat(fromStoredFsrsState(state), new Date(now));
  const result = {} as Record<Grade, Scheduled>;
  for (const grade of GRADES) {
    const { card, log } = previews[grade];
    result[grade] = {
      state: toStoredFsrsState(card),
      scheduledDays: log.scheduled_days,
      elapsedDays: log.elapsed_days,
    };
  }
  return result;
};

/**
 * Apply a rating the learner has actually given.
 *
 * SPEC §2.2: nothing else in the app may advance FSRS state. This function is
 * the only writer, and it cannot be called without a rating — which is what
 * makes "no card advances without a learner response" structural rather than a
 * convention people remember.
 */
export const applyRating = (
  state: StoredFsrsState,
  grade: Grade,
  now: Timestamp,
  options?: SchedulerOptions,
): Scheduled => {
  const { card, log } = schedulerFor(options).next(
    fromStoredFsrsState(state),
    new Date(now),
    grade,
  );
  return {
    state: toStoredFsrsState(card),
    scheduledDays: log.scheduled_days,
    elapsedDays: log.elapsed_days,
  };
};

/**
 * Probability the learner still recalls this card right now, in 0..1.
 * SPEC §2.4 counts a lexeme as "known" above 0.6; SPEC §7.2 prioritizes the
 * cards closest to the retention threshold, i.e. the ones most at risk.
 */
export const retrievability = (
  state: StoredFsrsState,
  now: Timestamp,
  options?: SchedulerOptions,
): number => schedulerFor(options).get_retrievability(fromStoredFsrsState(state), new Date(now), false);

/** SPEC §2.4: the known-set threshold. */
export const KNOWN_RETRIEVABILITY = 0.6;

export const isKnown = (state: StoredFsrsState, now: Timestamp): boolean =>
  retrievability(state, now) > KNOWN_RETRIEVABILITY;
