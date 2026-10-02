import { db } from '../db.ts';
import type { BuildAttempt, TargetLang, Timestamp } from '../types.ts';
import { flag } from '../types.ts';

/**
 * The only writer of sentence-building state (SPEC §3.1).
 *
 * The same shape invariant 15 gives drills: the record and nothing else. A
 * rebuilt sentence has no FSRS card — the learner is practising word order, not
 * a lexeme — so nothing here touches `recordReview`, and putting it in
 * `ReviewLog` would put an unscheduled item into the §9 retention rate
 * (invariant 31).
 */

export interface RecordBuildInput {
  profileId: string;
  lang: TargetLang;
  sentenceId: string;
  correct: boolean;
  /** The order the learner assembled, joined — kept for later forensics. */
  answerRaw: string;
  latencyMs: number;
  now: Timestamp;
}

export const recordBuildAnswer = async (input: RecordBuildInput): Promise<void> => {
  const attempt: BuildAttempt = {
    id: crypto.randomUUID(),
    profileId: input.profileId,
    lang: input.lang,
    sentenceId: input.sentenceId,
    correct: flag(input.correct),
    answerRaw: input.answerRaw,
    latencyMs: input.latencyMs,
    answeredAt: input.now,
  };
  await db.buildAttempts.add(attempt);
};

/** Every attempt, for the §9 grammar axis. */
export const buildAttempts = async (profileId: string): Promise<BuildAttempt[]> =>
  db.buildAttempts.where('profileId').equals(profileId).toArray();

/** Sentences rebuilt recently, so the composer does not serve the same one twice. */
export const recentBuildIds = async (
  profileId: string,
  since: Timestamp,
): Promise<Set<string>> => {
  const attempts = await db.buildAttempts
    .where('[profileId+answeredAt]')
    .between([profileId, since], [profileId, Number.MAX_SAFE_INTEGER])
    .toArray();
  return new Set(attempts.map((attempt) => attempt.sentenceId));
};

