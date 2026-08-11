import type { Card, DrillAttempt, ReviewLog, Session, Timestamp } from '../data/types.ts';

/**
 * The sync delta format (SPEC §5.1, Phase 2).
 *
 * ## Why one row per session and not one per review
 *
 * §5.1 says to "design sync as a batched delta log (one write per finished
 * session, not per card) so we sit far under any cap", and to verify the current
 * limits. Verified 2026-08-11:
 *
 *   Workers free   100,000 requests/day · 10 ms CPU/request · 50 subrequests
 *   D1 free        5,000,000 rows read/day · 100,000 rows written/day · 5 GB
 *
 * The arithmetic is not where the spec's sentence points. Batching per session
 * fixes the *request* count — 100k requests/day is 100k sessions, far more than
 * we will ever need — but a 4-minute session produces around thirty review logs,
 * and at one D1 row each that is 100,000 ÷ 30 ≈ **3,300 sessions a day**. Row
 * writes, not requests, are the binding constraint, and they bind an order of
 * magnitude sooner.
 *
 * So a delta is **one row**: the session plus its logs, its attempts and its
 * touched cards, as an opaque JSON payload. That is 100k sessions/day against
 * both caps rather than 3,300, and it costs nothing, because the server never
 * queries inside a delta. It cannot: §5.1 makes the local store the source of
 * truth, and the server is a post box.
 *
 * Everything in this file is pure. The network lives in src/platform/sync.ts.
 */

export const DELTA_VERSION = 1;

export interface Delta {
  version: number;
  profileId: string;
  /** The session this delta closes. Doubles as the idempotency key. */
  sessionId: string;
  /** When the client produced it, for ordering on the way back down. */
  producedAt: Timestamp;
  session: Session;
  reviewLogs: ReviewLog[];
  drillAttempts: DrillAttempt[];
  /** Card state after the session — last-write-wins per card (SPEC §6). */
  cards: Card[];
}

export interface BuildDeltaInput {
  profileId: string;
  session: Session;
  reviewLogs: readonly ReviewLog[];
  drillAttempts: readonly DrillAttempt[];
  cards: readonly Card[];
  producedAt: Timestamp;
}

export const buildDelta = (input: BuildDeltaInput): Delta => ({
  version: DELTA_VERSION,
  profileId: input.profileId,
  sessionId: input.session.id,
  producedAt: input.producedAt,
  session: input.session,
  reviewLogs: [...input.reviewLogs],
  drillAttempts: [...input.drillAttempts],
  cards: [...input.cards],
});

export const isDelta = (value: unknown): value is Delta => {
  if (typeof value !== 'object' || value === null) return false;
  const delta = value as Partial<Delta>;
  return (
    typeof delta.version === 'number' &&
    typeof delta.profileId === 'string' &&
    typeof delta.sessionId === 'string' &&
    Array.isArray(delta.reviewLogs) &&
    Array.isArray(delta.cards)
  );
};

export interface MergeResult {
  /** Logs and attempts that were not already present. */
  newReviewLogs: ReviewLog[];
  newDrillAttempts: DrillAttempt[];
  /** Cards whose incoming state is newer than what is held locally. */
  updatedCards: Card[];
  /** Cards where the local copy was newer and the delta was ignored. */
  keptLocal: number;
}

export interface MergeInput {
  delta: Delta;
  knownLogIds: ReadonlySet<string>;
  knownAttemptIds: ReadonlySet<string>;
  /** Local card state by id, for the last-write-wins comparison. */
  localCards: ReadonlyMap<string, Card>;
}

/**
 * Decides what a delta actually changes, without touching the database.
 *
 * SPEC §6's rule, applied literally: *"sync is last-write-wins per card with the
 * log as tiebreaker."*
 *
 *  - **Logs and attempts merge by id.** They are append-only and UUID-keyed, so
 *    a delta can only ever add. Two devices' histories union; replaying the same
 *    delta changes nothing. This is the same rule the M5 import follows (D37),
 *    and for the same reason — losing review history is the one unrecoverable
 *    outcome.
 *  - **Cards are last-write-wins on `lastReviewAt`.** A card is current state,
 *    and two schedules for one item cannot be interleaved after the fact. The
 *    *log* is the tiebreaker in the sense that it survives regardless: even when
 *    a card update is discarded, the reviews behind it are kept, so nothing is
 *    lost that could later be recomputed.
 */
export const mergeDelta = (input: MergeInput): MergeResult => {
  const newReviewLogs = input.delta.reviewLogs.filter((log) => !input.knownLogIds.has(log.id));
  const newDrillAttempts = input.delta.drillAttempts.filter(
    (attempt) => !input.knownAttemptIds.has(attempt.id),
  );

  const updatedCards: Card[] = [];
  let keptLocal = 0;
  for (const card of input.delta.cards) {
    const local = input.localCards.get(card.id);
    if (!local) {
      updatedCards.push(card);
      continue;
    }
    const incoming = card.fsrs.lastReviewAt ?? 0;
    const held = local.fsrs.lastReviewAt ?? 0;
    if (incoming > held) updatedCards.push(card);
    else keptLocal++;
  }

  return { newReviewLogs, newDrillAttempts, updatedCards, keptLocal };
};

/** Rough wire size, for the workload note in the settings screen. */
export const deltaSize = (delta: Delta): number => JSON.stringify(delta).length;
