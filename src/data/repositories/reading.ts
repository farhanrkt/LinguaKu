import { db } from '../db.ts';
import { flag } from '../types.ts';
import type { ReadingAttempt, TargetLang, Timestamp } from '../types.ts';

/**
 * The single writer of reading evidence (SPEC §9's reading axis).
 *
 * Mirrors `recordDrillAnswer` deliberately (D32): one function, one table, one
 * transaction, and no path that records a comprehension check without the
 * answer that produced it. Reading is the last radar axis that was `null`
 * forever, and the only way it stops being null is real evidence.
 */

export interface RecordReadingInput {
  profileId: string;
  lang: TargetLang;
  passageId: string;
  itemId: string;
  correct: boolean;
  answerRaw: string;
  coverage: number;
  now: Timestamp;
}

export const recordReadingAttempt = async (input: RecordReadingInput): Promise<ReadingAttempt> => {
  const attempt: ReadingAttempt = {
    id: crypto.randomUUID(),
    profileId: input.profileId,
    lang: input.lang,
    passageId: input.passageId,
    itemId: input.itemId,
    correct: flag(input.correct),
    answerRaw: input.answerRaw,
    coverage: input.coverage,
    answeredAt: input.now,
  };
  await db.readingAttempts.add(attempt);
  return attempt;
};

export const readingAttempts = async (
  profileId: string,
  lang: TargetLang,
): Promise<ReadingAttempt[]> =>
  (await db.readingAttempts.where('profileId').equals(profileId).toArray()).filter(
    (attempt) => attempt.lang === lang,
  );
