import Dexie from 'dexie';
import { db } from '../db.ts';
import { emptyFsrsState } from '../fsrsState.ts';
import { applyRating } from '../../core/scheduler.ts';
import { nextLadderLevel, type LadderDecision } from '../../core/ladder.ts';
import type {
  Card,
  Confidence,
  Grade,
  LadderLevel,
  ReviewLog,
  Timestamp,
} from '../types.ts';
import { flag } from '../types.ts';

/**
 * The single writer of FSRS state.
 *
 * SPEC §2.2 says no card advances without a recorded learner response. That is
 * enforced structurally here rather than by convention: `recordReview` cannot
 * be called without a rating, it always appends the log, and it does both
 * inside one transaction — so a card can never move without its log, and the
 * log can never be dropped to make a card look better.
 */

export const cardIdFor = (profileId: string, itemId: string): string =>
  `${profileId}::${itemId}`;

/** How many recent answers the promotion rule looks at (SPEC §2.3). */
const RECENT_WINDOW = 3;

export interface RecordReviewInput {
  profileId: string;
  itemId: string;
  grade: Grade;
  /** SPEC §2.12: asked before the reveal; never overrides the FSRS rating. */
  confidence: Confidence | null;
  latencyMs: number;
  answerRaw: string;
  correct: boolean;
  now: Timestamp;
}

export interface RecordReviewResult {
  card: Card;
  decision: LadderDecision;
  /** The rung the answer was given at, before any promotion or demotion. */
  answeredAt: LadderLevel;
}

/**
 * A card is created on the learner's first *answer*, not when the item is
 * queued — so an item they never responded to leaves no trace in the schedule.
 */
const loadOrCreateCard = async (
  profileId: string,
  itemId: string,
  now: Timestamp,
): Promise<Card> => {
  const id = cardIdFor(profileId, itemId);
  const existing = await db.cards.get(id);
  if (existing) return existing;

  const fsrs = emptyFsrsState(now);
  return { id, profileId, itemId, ladderLevel: 0, fsrs, dueAt: fsrs.dueAt, suspended: 0 };
};

export const recordReview = async (input: RecordReviewInput): Promise<RecordReviewResult> => {
  const card = await loadOrCreateCard(input.profileId, input.itemId, input.now);
  const answeredAt = card.ladderLevel;

  const scheduled = applyRating(card.fsrs, input.grade, input.now);

  // Promotion looks at the last three answers *at this rung* (SPEC §2.3), which
  // is why ReviewLog carries the level it was answered at.
  const previous = await db.reviewLogs
    .where('cardId')
    .equals(card.id)
    .reverse()
    .sortBy('reviewedAt');
  const recentGrades = [
    input.grade,
    ...previous
      .filter((log) => log.ladderLevel === answeredAt)
      .slice(0, RECENT_WINDOW - 1)
      .map((log) => log.rating),
  ];

  const decision = nextLadderLevel({
    level: answeredAt,
    grade: input.grade,
    stabilityDays: scheduled.state.stability,
    recentGrades,
    lapses: scheduled.state.lapses,
  });

  const log: ReviewLog = {
    id: crypto.randomUUID(),
    profileId: input.profileId,
    cardId: card.id,
    ladderLevel: answeredAt,
    rating: input.grade,
    confidence: input.confidence,
    latencyMs: input.latencyMs,
    answerRaw: input.answerRaw,
    correct: flag(input.correct),
    reviewedAt: input.now,
    scheduledDays: scheduled.scheduledDays,
    elapsedDays: scheduled.elapsedDays,
    stateBefore: card.fsrs,
  };

  const updated: Card = {
    ...card,
    ladderLevel: decision.level,
    fsrs: scheduled.state,
    dueAt: scheduled.state.dueAt,
  };

  // One transaction: the log and the state move together or not at all.
  await db.transaction('rw', db.cards, db.reviewLogs, async () => {
    await db.cards.put(updated);
    await db.reviewLogs.add(log);
  });

  return { card: updated, decision, answeredAt };
};

/** Cards due for review, most at risk first is the composer's job — not this. */
export const dueCards = async (
  profileId: string,
  now: Timestamp,
  limit = 200,
): Promise<Card[]> =>
  db.cards
    .where('[profileId+suspended+dueAt]')
    .between([profileId, 0, Dexie.minKey], [profileId, 0, now], true, true)
    .limit(limit)
    .toArray();
