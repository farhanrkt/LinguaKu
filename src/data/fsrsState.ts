import { createEmptyCard, State, type Card as FsrsCard } from 'ts-fsrs';
import type { StoredFsrsState, Timestamp } from './types.ts';

/**
 * Serialization boundary between `ts-fsrs` (Date-based) and IndexedDB
 * (number-based). SPEC §2.1 requires scheduling to be deterministic given
 * (card state, rating, timestamp); that only holds if state survives a
 * store/load cycle exactly, which fsrsState.test.ts pins down.
 */

const asFsrsState = (state: State): StoredFsrsState['state'] => {
  switch (state) {
    case State.New:
      return 0;
    case State.Learning:
      return 1;
    case State.Review:
      return 2;
    case State.Relearning:
      return 3;
  }
};

export const toStoredFsrsState = (card: FsrsCard): StoredFsrsState => ({
  dueAt: card.due.getTime(),
  stability: card.stability,
  difficulty: card.difficulty,
  elapsedDays: card.elapsed_days,
  scheduledDays: card.scheduled_days,
  learningSteps: card.learning_steps,
  reps: card.reps,
  lapses: card.lapses,
  state: asFsrsState(card.state),
  lastReviewAt: card.last_review ? card.last_review.getTime() : null,
});

export const fromStoredFsrsState = (stored: StoredFsrsState): FsrsCard => {
  const card: FsrsCard = {
    due: new Date(stored.dueAt),
    stability: stored.stability,
    difficulty: stored.difficulty,
    elapsed_days: stored.elapsedDays,
    scheduled_days: stored.scheduledDays,
    learning_steps: stored.learningSteps,
    reps: stored.reps,
    lapses: stored.lapses,
    state: stored.state,
  };
  return stored.lastReviewAt === null
    ? card
    : { ...card, last_review: new Date(stored.lastReviewAt) };
};

/** A brand-new, never-reviewed card due immediately. */
export const emptyFsrsState = (now: Timestamp): StoredFsrsState =>
  toStoredFsrsState(createEmptyCard(new Date(now)));
