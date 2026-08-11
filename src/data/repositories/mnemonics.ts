import { db } from '../db.ts';
import { flag } from '../types.ts';
import type { Mnemonic, Timestamp } from '../types.ts';

/**
 * SCIENCE: the generation effect applied to mnemonics — SPEC §2.11. *"Learners
 * can edit the mnemonic (self-generated mnemonics are stronger than given
 * ones)."*
 *
 * That finding is the whole reason this table exists, and it shapes two rules:
 *
 *  1. **A learner's own text always wins.** `authoredByUser` is not decoration;
 *     it is what stops a content update from overwriting the thing that is
 *     working better than anything we could ship. It is also the sync tiebreaker
 *     SPEC §2.11 asks for ("user-authored mnemonics persist and survive sync").
 *  2. **The shipped one is a starting point, not the answer.** A baseline
 *     mnemonic is offered so the card is never empty, but it is stored only when
 *     the learner edits it — an untouched default is content, not learner data,
 *     and writing it would make every card look authored.
 */

export const getMnemonic = async (
  profileId: string,
  itemId: string,
): Promise<Mnemonic | null> => (await db.mnemonics.get([profileId, itemId])) ?? null;

export const saveMnemonic = async (
  profileId: string,
  itemId: string,
  text: string,
  now: Timestamp,
): Promise<Mnemonic | null> => {
  const trimmed = text.trim();

  // Clearing it returns the learner to the shipped baseline rather than leaving
  // an empty card. Deleting is right: an empty row would claim authorship of
  // nothing, and would then win over the baseline on sync.
  if (trimmed.length === 0) {
    await db.mnemonics.delete([profileId, itemId]);
    return null;
  }

  const mnemonic: Mnemonic = {
    profileId,
    itemId,
    text: trimmed,
    authoredByUser: flag(true),
    updatedAt: now,
  };
  await db.mnemonics.put(mnemonic);
  return mnemonic;
};

/** Every mnemonic this learner has written, for the export bundle (SPEC §9). */
export const authoredMnemonics = async (profileId: string): Promise<Mnemonic[]> =>
  db.mnemonics.filter((row) => row.profileId === profileId && row.authoredByUser === 1).toArray();
