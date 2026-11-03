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

/**
 * The four ratings FSRS accepts.
 *
 * Not four things a learner says: nothing in this app asks them. The rating is
 * derived from the answer (`gradeForOutcome`), and Easy is never produced at
 * all, because the only honest source for "that felt effortless" would be the
 * learner saying so and §2.12 forbids reading it off the confidence tap.
 *
 * It exists so §2.1's determinism property can be proved over the whole rating
 * space rather than over the subset the app happens to emit.
 */
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

/*
 * `preview` lived here: "what each rating would do, without committing — SPEC
 * §2.1 asks for this so the UI can show real intervals on the answer buttons".
 *
 * There are no answer buttons, and that is a design decision rather than an
 * omission: this app grades the learner's *answer* and derives the rating
 * (`gradeForOutcome`), so there is nothing for a four-way preview to label.
 * §2.1 names `scheduler.repeat()` as an API capability; its acceptance criteria
 * are about determinism and the log, not an interval UI. Deleted under
 * invariant 8 rather than kept as a seam for a screen the design excludes.
 */

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

/** ts-fsrs `State.Review`: learned, and retrieved successfully since. */
const REVIEW = 2;

/**
 * SPEC §2.4's "known": retrievable now, **and** retrieved at least once.
 *
 * Retrievability alone counted a word as known after one errorless exposure —
 * the learner tapped "Oke, paham" on a card that says "belum perlu dihafal",
 * FSRS rated it Good, and with the shipped parameters R stays above 0.6 for 63
 * days. The home screen then called it "terkunci", the coverage figures and the
 * reader treated it as readable, and a kana seen once was assumed legible. A
 * card in Learning (just introduced) or Relearning (just failed) has not shown
 * that the learner can produce it; one in Review has.
 */
export const isKnown = (state: StoredFsrsState, now: Timestamp): boolean =>
  state.state === REVIEW && retrievability(state, now) > KNOWN_RETRIEVABILITY;
