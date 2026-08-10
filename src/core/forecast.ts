import type { Timestamp } from '../data/types.ts';

/**
 * Review-load projection and the new-item throttle (SPEC §7.8, §7.2).
 *
 * SCIENCE: this is the abandonment mechanism, not a nicety. An SRS that lets a
 * learner add new material faster than they can sustain the resulting reviews
 * builds a backlog that arrives days later, at which point the app is a chore
 * and they stop. SPEC §7.2 names it "the #1 cause of abandonment in SRS apps"
 * and requires the throttle to be automatic — the learner should never have to
 * diagnose their own review debt.
 */

const DAY_MS = 86_400_000;

export interface DueCard {
  dueAt: Timestamp;
}

export interface ForecastDay {
  /** 0 is today (everything already due), 1 is tomorrow, and so on. */
  dayOffset: number;
  dueCount: number;
}

/** SPEC §9: reviews due over the next 14 days, for the workload dashboard. */
export const FORECAST_DAYS = 14;

export const forecastLoad = (
  cards: readonly DueCard[],
  now: Timestamp,
  days = FORECAST_DAYS,
): ForecastDay[] => {
  const buckets = Array.from({ length: days }, (_, dayOffset) => ({ dayOffset, dueCount: 0 }));

  for (const card of cards) {
    // Anything already overdue lands on today: it is work waiting now, and
    // hiding it in a negative bucket would understate the debt.
    const offset = Math.max(0, Math.floor((card.dueAt - now) / DAY_MS));
    if (offset < days) buckets[offset]!.dueCount++;
  }
  return buckets;
};

/** SPEC §7.2 looks a week ahead. */
export const DEBT_WINDOW_DAYS = 7;

/** Above this ratio of daily capacity, new items get throttled. */
export const THROTTLE_RATIO = 1.5;

/** Beyond this, new items stop entirely until the backlog clears. */
export const HALT_RATIO = 3;

export interface ThrottleInput {
  forecast: readonly ForecastDay[];
  /** Reviews a session at the learner's chosen length can absorb per day. */
  dailyCapacity: number;
  /** New items we would introduce if there were no debt at all. */
  baseNewItems: number;
}

export interface ThrottleResult {
  allowed: number;
  /** Mean projected daily load over the next week, in units of daily capacity. */
  debtRatio: number;
  throttled: boolean;
}

/**
 * Mean rather than peak: FSRS clusters due dates, so a single busy Thursday is
 * normal and should not stop a learner adding words all week. Sustained load
 * above capacity is the signal that matters.
 */
export const newItemAllowance = (input: ThrottleInput): ThrottleResult => {
  if (input.dailyCapacity <= 0) {
    return { allowed: 0, debtRatio: Number.POSITIVE_INFINITY, throttled: true };
  }

  const window = input.forecast.slice(0, DEBT_WINDOW_DAYS);
  const total = window.reduce((sum, day) => sum + day.dueCount, 0);
  const debtRatio = total / Math.max(1, window.length) / input.dailyCapacity;

  if (debtRatio <= THROTTLE_RATIO) {
    return { allowed: input.baseNewItems, debtRatio, throttled: false };
  }
  if (debtRatio >= HALT_RATIO) {
    return { allowed: 0, debtRatio, throttled: true };
  }

  // Taper: at the throttle point the learner keeps their full allowance, and it
  // falls to zero as the debt approaches the halt point. Nothing cliff-edged,
  // so a learner never loses everything for one heavy day.
  const remaining = (HALT_RATIO - debtRatio) / (HALT_RATIO - THROTTLE_RATIO);
  return {
    allowed: Math.max(0, Math.floor(input.baseNewItems * remaining)),
    debtRatio,
    throttled: true,
  };
};

/** Reviews per day a session of this length can absorb, for the throttle. */
export const dailyCapacityFor = (budgetMinutes: number, secondsPerReview = 12): number =>
  Math.max(1, Math.floor((budgetMinutes * 60) / secondsPerReview));
