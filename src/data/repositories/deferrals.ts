import { db } from '../db.ts';
import type { Timestamp } from '../types.ts';

/**
 * SPEC §2.14, autonomy: *"can always skip an item (belum perlu)"*.
 *
 * A skip is **not an answer**. It writes no card, no FSRS state and no review
 * log — invariant 0 makes `recordReview` the only writer of scheduling state and
 * it cannot be called without a rating, and §2.2 makes a card the product of a
 * retrieval. Recording a skip as a lapse would be worse than not offering one:
 * it would let a learner exercising autonomy damage their own schedule, and it
 * would put an unanswered item into the §9 retention rate.
 *
 * So a skip records only a request: *not this, not now*. Its own table rather
 * than a flag on `Card`, because a learner may decline a word they have never
 * answered — and that word has no card to carry a flag.
 *
 * **The window escalates.** One skip is "not today"; four is "stop showing me
 * this". A fixed window would either nag someone who has clearly declined or
 * bury a word they merely postponed once. It is capped, because §2.14 is about
 * autonomy rather than deletion, and a permanently vanished item cannot be
 * reconsidered.
 */

const DAY = 86_400_000;

/** 3 days, then 7, then 21, then 60 — and no further. */
export const deferralWindow = (times: number): number => {
  const days = [3, 7, 21, 60];
  const index = Math.min(Math.max(times, 1), days.length) - 1;
  return (days[index] ?? 60) * DAY;
};

export const deferItem = async (
  profileId: string,
  itemId: string,
  now: Timestamp,
): Promise<void> => {
  const existing = await db.deferredItems.get([profileId, itemId]);
  const times = (existing?.times ?? 0) + 1;
  await db.deferredItems.put({
    profileId,
    itemId,
    deferredAt: now,
    until: now + deferralWindow(times),
    times,
  });
};

/**
 * Item ids the composer must leave alone right now.
 *
 * Expired deferrals are not returned and are not deleted: `times` is the record
 * of how often this learner has declined a word, and losing it would reset the
 * escalation every time a window lapsed — so the fifth refusal would be treated
 * as the first.
 */
export const deferredItemIds = async (
  profileId: string,
  now: Timestamp,
): Promise<Set<string>> => {
  const rows = await db.deferredItems.where('profileId').equals(profileId).toArray();
  return new Set(rows.filter((row) => row.until > now).map((row) => row.itemId));
};

/** Undo, for a learner who changes their mind. */
export const undeferItem = async (profileId: string, itemId: string): Promise<void> => {
  await db.deferredItems.delete([profileId, itemId]);
};
