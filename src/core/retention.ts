import { wilsonInterval } from './vocabulary.ts';
import type { Confidence, Grade } from '../data/types.ts';

/**
 * SCIENCE: measured retention against the scheduler's target — SPEC §9 and
 * §2.1. *"True retention rate vs. target (from real logs) — if actual retention
 * is far off 90%, say so and offer to retune."*
 *
 * This is the app auditing itself, which makes it the one screen where being
 * wrong is worse than being silent. Two rules follow:
 *
 *  1. **Only scheduled reviews count.** A card in learning has not been left
 *     alone for an interval, so answering it says nothing about whether the
 *     interval was right. Counting first exposures would inflate the number
 *     towards 100% and make a badly-tuned scheduler look perfect.
 *  2. **No verdict without enough reviews.** Twenty answers cannot distinguish
 *     85% from 90%, and saying so is the honest output.
 */

/** SPEC §2.1: `request_retention`. */
export const TARGET_RETENTION = 0.9;

/** Below this many scheduled reviews, the rate is not worth reporting. */
export const MIN_REVIEWS_TO_JUDGE = 50;

/**
 * How far off target we call "off target". The confidence interval does the
 * real work — this only decides when to say something out loud.
 */
export const RETENTION_TOLERANCE = 0.05;

/** ts-fsrs `State`: 2 is Review, 3 is Relearning. */
export type FsrsState = 0 | 1 | 2 | 3;

export interface RetentionInput {
  /** The card's state *before* this answer — the interval it was actually tested at. */
  stateBefore: FsrsState;
  rating: Grade;
  reviewedAt: number;
}

export type RetentionVerdict = 'unknown' | 'on-target' | 'below' | 'above';

export interface RetentionReport {
  reviews: number;
  recalled: number;
  rate: number;
  low: number;
  high: number;
  target: number;
  verdict: RetentionVerdict;
  measured: boolean;
}

/**
 * A review counts as successful when the learner retrieved the item at all.
 * Again means the retrieval failed; Hard means it was effortful but succeeded,
 * which is exactly what FSRS treats as a success too.
 */
const recalled = (rating: Grade): boolean => rating > 1;

/** SPEC §2.1: only cards that were genuinely due after an interval. */
const isScheduled = (log: RetentionInput): boolean => log.stateBefore === 2;

export const measureRetention = (
  logs: readonly RetentionInput[],
  target = TARGET_RETENTION,
): RetentionReport => {
  const scheduled = logs.filter(isScheduled);
  const hits = scheduled.filter((log) => recalled(log.rating)).length;
  const rate = scheduled.length > 0 ? hits / scheduled.length : 0;
  const { low, high } = wilsonInterval(hits, scheduled.length);

  const measured = scheduled.length >= MIN_REVIEWS_TO_JUDGE;
  let verdict: RetentionVerdict = 'unknown';
  if (measured) {
    // The interval decides, not the point estimate: a rate of 0.87 whose
    // interval comfortably contains 0.90 is not evidence of anything.
    if (high < target - RETENTION_TOLERANCE) verdict = 'below';
    else if (low > target + RETENTION_TOLERANCE) verdict = 'above';
    else verdict = 'on-target';
  }

  return {
    reviews: scheduled.length,
    recalled: hits,
    rate,
    low,
    high,
    target,
    verdict,
    measured,
  };
};

// ----------------------------------------------------------------- retuning

/**
 * SPEC §9: *"if actual retention is far off 90%, say so **and offer to
 * retune**."*
 *
 * This is a **nudge, not an optimization**, and the distinction matters enough
 * to name. Real per-user FSRS parameter fitting is what §2.1 buys the review log
 * for, and it needs the optimizer (`@open-spaced-repetition/binding`) and rather
 * more history than a learner has when they first notice the number is off. What
 * this does is move the one parameter whose meaning is unambiguous —
 * `request_retention`, the target the scheduler aims at — one step in the
 * direction the evidence points, and let the learner do it again later when
 * there is more evidence.
 *
 * Direction: forgetting *more* than the target means intervals are too long, so
 * the target goes **up** and intervals shorten. Forgetting less than the target
 * means the learner is doing more work than they need, so it goes **down**.
 * That second case is a real kindness — it hands time back.
 */
export const RETUNE_STEP = 0.03;
/** Bounds. Below 0.8 the learner forgets too much to build anything; above 0.95 the workload explodes. */
export const RETUNE_MIN = 0.8;
export const RETUNE_MAX = 0.95;

export const retuneTarget = (current: number, verdict: RetentionVerdict): number => {
  if (verdict === 'below') return Math.min(RETUNE_MAX, Number((current + RETUNE_STEP).toFixed(2)));
  if (verdict === 'above') return Math.max(RETUNE_MIN, Number((current - RETUNE_STEP).toFixed(2)));
  // Nothing to do, and nothing pretending to be done.
  return current;
};

// ------------------------------------------------------------- calibration

/**
 * SPEC §2.12: judgment-of-learning calibration — confidence against actual
 * accuracy. The point is to train the learner's *judgement*, so the interesting
 * number is the gap between the two, not either alone.
 *
 * One binary tap gives two points on the curve, and two points is all this may
 * honestly draw. A smooth calibration curve here would be decoration.
 */
export interface CalibrationInput {
  confidence: Confidence | null;
  rating: Grade;
}

export interface CalibrationBucket {
  confidence: Confidence;
  answers: number;
  correct: number;
  accuracy: number;
  low: number;
  high: number;
}

export interface CalibrationReport {
  buckets: CalibrationBucket[];
  /** Accuracy when sure minus accuracy when unsure. Higher is better judgement. */
  discrimination: number | null;
  /**
   * True when "yakin" answers really are more often right than "ragu" ones —
   * i.e. the learner's sense of what they know is worth something.
   */
  discriminating: boolean;
  measured: boolean;
}

/** Enough taps of each kind before the comparison means anything. */
export const MIN_CALIBRATION_ANSWERS = 15;

const bucketFor = (
  logs: readonly CalibrationInput[],
  confidence: Confidence,
): CalibrationBucket => {
  const answers = logs.filter((log) => log.confidence === confidence);
  const correct = answers.filter((log) => recalled(log.rating)).length;
  const { low, high } = wilsonInterval(correct, answers.length);
  return {
    confidence,
    answers: answers.length,
    correct,
    accuracy: answers.length > 0 ? correct / answers.length : 0,
    low,
    high,
  };
};

export const measureCalibration = (logs: readonly CalibrationInput[]): CalibrationReport => {
  const sure = bucketFor(logs, 'yakin');
  const unsure = bucketFor(logs, 'ragu');
  const measured =
    sure.answers >= MIN_CALIBRATION_ANSWERS && unsure.answers >= MIN_CALIBRATION_ANSWERS;

  return {
    buckets: [sure, unsure],
    discrimination: measured ? sure.accuracy - unsure.accuracy : null,
    // Non-overlapping intervals, not a bare difference in the point estimates.
    discriminating: measured && sure.low > unsure.high,
    measured,
  };
};

// -------------------------------------------------------------- consistency

/**
 * SPEC §2.14: *"a rolling 7-day consistency band that heals itself"* — never a
 * streak that can be broken.
 *
 * The difference is not cosmetic. A streak counter's whole mechanism is the
 * threat of losing it, which is the loss-aversion lever docs/ETHICS.md bans. A
 * rolling window has no state to lose: miss a day and the number dips, practise
 * and it recovers, and nothing is ever "broken".
 */
export const CONSISTENCY_WINDOW_DAYS = 7;

export interface ConsistencyReport {
  /** Days practised within the window. */
  days: number;
  window: number;
  /** 0..1. */
  share: number;
}

export const measureConsistency = (
  reviewedAt: readonly number[],
  now: number,
  window = CONSISTENCY_WINDOW_DAYS,
): ConsistencyReport => {
  const DAY = 86_400_000;
  const today = Math.floor(now / DAY);
  const days = new Set<number>();
  for (const at of reviewedAt) {
    const day = Math.floor(at / DAY);
    if (today - day < window && today - day >= 0) days.add(day);
  }
  return { days: days.size, window, share: days.size / window };
};
