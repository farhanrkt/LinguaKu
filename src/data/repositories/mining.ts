import { db } from '../db.ts';
import type { MinedItem, Timestamp } from '../types.ts';

/**
 * One-tap sentence mining (SPEC §8: *"tap-to-gloss graded reader with one-tap
 * card creation (frictionless sentence mining)"*).
 *
 * The name in the spec says "card creation", and this deliberately does not
 * create one. Invariant 0 and SPEC §2.2 make a card the product of an *answer* —
 * `recordReview` is the only writer of FSRS state and cannot be called without a
 * rating. A tap in the reader is an intention, not a retrieval, so minting a
 * card from it would put an item into the schedule that the learner has never
 * responded to and hand it an invented review history.
 *
 * So mining records the intention. The composer introduces mined words ahead of
 * the frontier queue next session, and the card appears when the learner answers
 * it — exactly like every other card. The learner sees the same "one tap and
 * it's in my deck" behaviour; what differs is that the deck stays honest.
 */

export const mineItem = async (
  profileId: string,
  itemId: string,
  fromSentenceId: string,
  now: Timestamp,
): Promise<void> => {
  // Idempotent: tapping the same word twice is one intention, not two.
  const existing = await db.minedItems.get([profileId, itemId]);
  if (existing) return;
  await db.minedItems.put({ profileId, itemId, fromSentenceId, minedAt: now });
};

export const unmineItem = async (profileId: string, itemId: string): Promise<void> => {
  await db.minedItems.delete([profileId, itemId]);
};

export const isMined = async (profileId: string, itemId: string): Promise<boolean> =>
  (await db.minedItems.get([profileId, itemId])) !== undefined;

export const minedItemIds = async (profileId: string): Promise<Set<string>> =>
  new Set((await db.minedItems.where('profileId').equals(profileId).toArray()).map((row) => row.itemId));

/**
 * Mined items still waiting to be introduced, oldest first.
 *
 * A word the learner went looking for is worth more than the next one off the
 * frequency list — they met it, wanted it, and have a context for it — so the
 * composer takes these before the frontier queue.
 */
export const pendingMined = async (
  profileId: string,
  startedItemIds: ReadonlySet<string>,
): Promise<MinedItem[]> => {
  const rows = await db.minedItems
    .where('[profileId+minedAt]')
    .between([profileId, 0], [profileId, Number.MAX_SAFE_INTEGER])
    .toArray();
  return rows.filter((row) => !startedItemIds.has(row.itemId));
};
