/**
 * SPEC §9: *"Weekly recap; consistency band, not a punishable streak."*
 *
 * The consistency band shipped at M5. This is the recap, and it is the last §9
 * line to be built — deliberately last, because it is the one screen that reads
 * better with a week behind it than with an empty state, and building it early
 * would have meant designing around data nobody had yet.
 *
 * What makes a recap hard is not the arithmetic. It is that every honest
 * summary of a week is one sentence away from becoming a scoreboard. The rules
 * this module holds to, all from §2.14 and docs/ETHICS.md:
 *
 *  - **Capability, never points.** Words met, words strengthened, words that
 *    reached mastery. No total, no score, no "XP", nothing that sums into a
 *    number whose only meaning is that it is bigger than last week's.
 *  - **No comparison to a target.** A quiet week is a fact, not a shortfall.
 *    There is no "you missed 3 days" because that sentence has no use except to
 *    make someone feel behind.
 *  - **A week with nothing in it says so.** Invariant 18: the empty state is
 *    shown, not hidden, and it is not dressed up as encouragement.
 *
 * The comparison to the previous week is included because it is genuinely
 * informative — *is this a normal week for me* — and deliberately unlabelled as
 * good or bad. It is a direction, not a verdict.
 */

export interface RecapInput {
  /** Review timestamps, with whether that answer was the item's first. */
  reviews: { at: number; itemId: string; correct: boolean }[];
  /** Drill answers in the window (SPEC §3.3) — never mixed with reviews (D32). */
  drillsAt: number[];
  /** Items whose card reached mastery, and when (SPEC §2.3). */
  masteredAt: number[];
  now: number;
}

export interface Recap {
  /** Distinct words answered for the first time in the last 7 days. */
  met: number;
  /** Distinct words answered again — retrieval, not exposure. */
  strengthened: number;
  /** Words that reached the mastery bar this week. */
  mastered: number;
  /** Contrastive drills answered. */
  drills: number;
  /** Distinct days with at least one answer, 0–7. */
  daysPractised: number;
  /**
   * Distinct days in the week before this one, for a direction rather than a
   * verdict. Null when the profile is not yet two weeks old — comparing a first
   * week against a week that did not exist would manufacture a decline.
   */
  previousDaysPractised: number | null;
  /** False when the window holds nothing at all; the screen says so plainly. */
  hasData: boolean;
}

const DAY = 86_400_000;
export const RECAP_DAYS = 7;

const dayKey = (at: number): number => Math.floor(at / DAY);

/**
 * `firstSeenAt` is passed in rather than derived from the window, because "first
 * time" is a fact about the learner's whole history: a word first met three
 * months ago and reviewed today is strengthened, not met, and a window-local
 * calculation would call it new every time it came round.
 */
export const buildRecap = (
  input: RecapInput,
  firstSeenAt: Map<string, number>,
  profileCreatedAt: number,
): Recap => {
  const from = input.now - RECAP_DAYS * DAY;
  const previousFrom = from - RECAP_DAYS * DAY;

  const inWindow = input.reviews.filter((review) => review.at >= from && review.at <= input.now);
  const previous = input.reviews.filter((review) => review.at >= previousFrom && review.at < from);

  const met = new Set<string>();
  const strengthened = new Set<string>();
  for (const review of inWindow) {
    const first = firstSeenAt.get(review.itemId);
    if (first !== undefined && first >= from) met.add(review.itemId);
    else strengthened.add(review.itemId);
  }

  const drills = input.drillsAt.filter((at) => at >= from && at <= input.now).length;
  const mastered = input.masteredAt.filter((at) => at >= from && at <= input.now).length;

  const days = new Set(inWindow.map((review) => dayKey(review.at)));
  for (const at of input.drillsAt) {
    if (at >= from && at <= input.now) days.add(dayKey(at));
  }

  const previousDays = new Set(previous.map((review) => dayKey(review.at)));

  return {
    met: met.size,
    strengthened: strengthened.size,
    mastered,
    drills,
    daysPractised: days.size,
    // A profile younger than two weeks has no previous week to compare with,
    // and inventing one out of an empty range would read as "you slipped".
    previousDaysPractised: profileCreatedAt <= previousFrom ? previousDays.size : null,
    hasData: inWindow.length > 0 || drills > 0,
  };
};
