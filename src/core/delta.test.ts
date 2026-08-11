import { describe, expect, it } from 'vitest';
import { buildDelta, DELTA_VERSION, isDelta, mergeDelta } from './delta.ts';
import type { Card, ReviewLog, Session, StoredFsrsState } from '../data/types.ts';

/**
 * SPEC §5.1 and §6. The rule under test is §6's own sentence — *"last-write-wins
 * per card with the log as tiebreaker"* — and the property that matters most is
 * that **no path here can lose a review**.
 */

const NOW = Date.UTC(2026, 7, 11, 9, 0, 0);

const fsrs = (lastReviewAt: number | null): StoredFsrsState => ({
  dueAt: NOW,
  stability: 10,
  difficulty: 5,
  elapsedDays: 1,
  scheduledDays: 10,
  learningSteps: 0,
  reps: 2,
  lapses: 0,
  state: 2,
  lastReviewAt,
});

const card = (id: string, lastReviewAt: number | null): Card => ({
  id,
  profileId: 'p1',
  itemId: `item-${id}`,
  ladderLevel: 2,
  fsrs: fsrs(lastReviewAt),
  dueAt: NOW,
  suspended: 0,
});

const log = (id: string): ReviewLog => ({
  id,
  profileId: 'p1',
  cardId: 'c1',
  ladderLevel: 2,
  rating: 3,
  confidence: null,
  latencyMs: 900,
  answerRaw: 'x',
  correct: 1,
  reviewedAt: NOW,
  scheduledDays: 10,
  elapsedDays: 1,
  stateBefore: fsrs(NOW - 1000),
});

const session: Session = {
  id: 's1',
  profileId: 'p1',
  startedAt: NOW,
  endedAt: NOW + 60_000,
  plannedMinutes: 4,
  itemIds: ['item-c1'],
  completed: 1,
  resumeCursor: 1,
};

const delta = (logs: ReviewLog[], cards: Card[]) =>
  buildDelta({
    profileId: 'p1',
    session,
    reviewLogs: logs,
    drillAttempts: [],
    cards,
    producedAt: NOW,
  });

describe('buildDelta', () => {
  it('packs a whole session into one delta', () => {
    const built = delta([log('l1'), log('l2')], [card('c1', NOW)]);
    expect(built.version).toBe(DELTA_VERSION);
    // One delta, one row, one request — the arithmetic in the module header.
    expect(built.sessionId).toBe('s1');
    expect(built.reviewLogs).toHaveLength(2);
  });

  it('round-trips through JSON, which is how it travels', () => {
    const built = delta([log('l1')], [card('c1', NOW)]);
    const wire = JSON.parse(JSON.stringify(built)) as unknown;
    expect(isDelta(wire)).toBe(true);
    expect(wire).toEqual(built);
  });

  it('rejects anything that is not one of ours', () => {
    expect(isDelta({ hello: 'world' })).toBe(false);
    expect(isDelta(null)).toBe(false);
    expect(isDelta('{}')).toBe(false);
  });
});

describe('mergeDelta — logs merge, cards contest', () => {
  const empty = {
    knownLogIds: new Set<string>(),
    knownAttemptIds: new Set<string>(),
    localCards: new Map<string, Card>(),
  };

  it('adds logs the device has never seen', () => {
    const result = mergeDelta({ delta: delta([log('l1'), log('l2')], []), ...empty });
    expect(result.newReviewLogs.map((l) => l.id)).toEqual(['l1', 'l2']);
  });

  it('is a no-op when the same delta arrives twice', () => {
    const result = mergeDelta({
      delta: delta([log('l1')], []),
      ...empty,
      knownLogIds: new Set(['l1']),
    });
    expect(result.newReviewLogs).toEqual([]);
    // Idempotence is what makes a flaky connection harmless rather than a way
    // to double a learner's history.
    expect(result.updatedCards).toEqual([]);
  });

  it('unions two devices’ histories rather than choosing between them', () => {
    const result = mergeDelta({
      delta: delta([log('phone-1'), log('tablet-1')], []),
      ...empty,
      knownLogIds: new Set(['phone-1']),
    });
    expect(result.newReviewLogs.map((l) => l.id)).toEqual(['tablet-1']);
  });

  it('takes the newer card and keeps the older one out', () => {
    const result = mergeDelta({
      delta: delta([], [card('c1', NOW + 5_000)]),
      ...empty,
      localCards: new Map([['c1', card('c1', NOW)]]),
    });
    expect(result.updatedCards).toHaveLength(1);
    expect(result.keptLocal).toBe(0);
  });

  it('keeps the local card when it is newer', () => {
    // Last-write-wins per card (SPEC §6): a stale delta must not roll a
    // schedule backwards.
    const result = mergeDelta({
      delta: delta([], [card('c1', NOW - 5_000)]),
      ...empty,
      localCards: new Map([['c1', card('c1', NOW)]]),
    });
    expect(result.updatedCards).toEqual([]);
    expect(result.keptLocal).toBe(1);
  });

  it('still keeps the reviews behind a discarded card', () => {
    // The log is the tiebreaker in the sense that survives: even where a card
    // update loses, nothing that could be recomputed from it is thrown away.
    const result = mergeDelta({
      delta: delta([log('l9')], [card('c1', NOW - 5_000)]),
      ...empty,
      localCards: new Map([['c1', card('c1', NOW)]]),
    });
    expect(result.updatedCards).toEqual([]);
    expect(result.newReviewLogs.map((l) => l.id)).toEqual(['l9']);
  });

  it('accepts a card the device has never seen', () => {
    const result = mergeDelta({ delta: delta([], [card('brand-new', NOW)]), ...empty });
    expect(result.updatedCards).toHaveLength(1);
  });

  it('treats a card that was never reviewed as the oldest possible', () => {
    const result = mergeDelta({
      delta: delta([], [card('c1', null)]),
      ...empty,
      localCards: new Map([['c1', card('c1', NOW)]]),
    });
    expect(result.updatedCards).toEqual([]);
  });
});
