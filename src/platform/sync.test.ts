import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db.ts';
import {
  applyDelta,
  defaultSyncSettings,
  readSyncSettings,
  syncNow,
  writeSyncSettings,
} from './sync.ts';
import { buildDelta } from '../core/delta.ts';
import { recordReview } from '../data/repositories/reviews.ts';
import type { Card, ReviewLog, Session, StoredFsrsState } from '../data/types.ts';

/**
 * M7's acceptance criterion: *"the app remains fully functional with sync
 * disabled"*. The first block is that criterion, tested directly — everything
 * else here is about not losing data when it is enabled.
 */

const NOW = Date.UTC(2026, 7, 11, 9, 0, 0);

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('disabled by default, and silent when it is (SPEC §5.1)', () => {
  it('starts off', () => {
    expect(defaultSyncSettings().enabled).toBe(false);
    expect(readSyncSettings().enabled).toBe(false);
    // No endpoint either: there is no LinguaKu server to default to.
    expect(readSyncSettings().endpoint).toBe('');
  });

  it('makes no network call at all when disabled', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    expect(await syncNow('p1')).toEqual({ status: 'disabled' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('makes no network call when enabled but unconfigured', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    writeSyncSettings({ ...defaultSyncSettings(), enabled: true });

    expect(await syncNow('p1')).toEqual({ status: 'disabled' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('survives storage that refuses to be written', () => {
    // Private mode. Sync stays off, which is the safe state.
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(readSyncSettings().enabled).toBe(false);
    expect(() => writeSyncSettings({ ...defaultSyncSettings(), enabled: true })).not.toThrow();
  });
});

describe('a failed sync costs the learner nothing', () => {
  const enable = () =>
    writeSyncSettings({
      enabled: true,
      endpoint: 'https://example.invalid',
      token: 'secret',
      lastSyncedAt: null,
    });

  it('reports a network failure rather than throwing', async () => {
    enable();
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    expect(await syncNow('p1')).toMatchObject({ status: 'failed' });
  });

  it('reports an HTTP failure rather than throwing', async () => {
    enable();
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('nope', { status: 401 })));
    expect(await syncNow('p1')).toMatchObject({ status: 'failed', reason: 'HTTP 401' });
  });

  it('leaves local state untouched when the server is unreachable', async () => {
    await recordReview({
      profileId: 'p1',
      itemId: 'en:lex:x',
      grade: 3,
      confidence: null,
      latencyMs: 800,
      answerRaw: 'x',
      correct: true,
      now: NOW,
    });
    enable();
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));

    await syncNow('p1');
    expect(await db.reviewLogs.count()).toBe(1);
    expect(await db.cards.count()).toBe(1);
  });

  it('does not advance the cursor on failure, so nothing is skipped', async () => {
    enable();
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    await syncNow('p1');
    expect(readSyncSettings().lastSyncedAt).toBeNull();
  });
});

// --------------------------------------------------------------- applying

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

const session: Session = {
  id: 's1',
  profileId: 'p1',
  lang: 'en',
  startedAt: NOW,
  endedAt: NOW + 60_000,
  plannedMinutes: 4,
  itemIds: ['en:lex:x'],
  completed: 1,
  resumeCursor: 1,
};

const incoming = (logs: ReviewLog[], cards: Card[]) =>
  buildDelta({
    profileId: 'p1',
    session,
    reviewLogs: logs,
    drillAttempts: [],
    cards,
    producedAt: NOW,
  });

const log = (id: string, at: number): ReviewLog => ({
  id,
  profileId: 'p1',
  cardId: 'p1::en:lex:x',
  ladderLevel: 2,
  rating: 3,
  confidence: null,
  latencyMs: 900,
  answerRaw: 'x',
  correct: 1,
  reviewedAt: at,
  scheduledDays: 10,
  elapsedDays: 1,
  stateBefore: fsrs(at - 1000),
});

describe('applyDelta', () => {
  it('writes a delta from another device', async () => {
    const changed = await applyDelta(
      incoming(
        [log('remote-1', NOW)],
        [
          {
            id: 'p1::en:lex:x',
            profileId: 'p1',
            itemId: 'en:lex:x',
            ladderLevel: 2,
            fsrs: fsrs(NOW),
            dueAt: NOW,
            suspended: 0,
          },
        ],
      ),
    );
    expect(changed).toBe(2);
    expect(await db.reviewLogs.count()).toBe(1);
    expect(await db.sessions.count()).toBe(1);
  });

  it('is idempotent — replaying changes nothing', async () => {
    const delta = incoming([log('remote-1', NOW)], []);
    await applyDelta(delta);
    expect(await applyDelta(delta)).toBe(0);
    expect(await db.reviewLogs.count()).toBe(1);
  });

  it('never violates the append-only invariant', async () => {
    // The hook would throw on a `put` over an existing log, and it should. The
    // merge only ever adds ids it does not have.
    const delta = incoming([log('remote-1', NOW)], []);
    await applyDelta(delta);
    await expect(applyDelta(delta)).resolves.toBe(0);
  });

  it('keeps a local card that is newer than the incoming one', async () => {
    await db.cards.put({
      id: 'p1::en:lex:x',
      profileId: 'p1',
      itemId: 'en:lex:x',
      ladderLevel: 3,
      fsrs: fsrs(NOW + 10_000),
      dueAt: NOW,
      suspended: 0,
    });

    await applyDelta(
      incoming([], [
        {
          id: 'p1::en:lex:x',
          profileId: 'p1',
          itemId: 'en:lex:x',
          ladderLevel: 1,
          fsrs: fsrs(NOW),
          dueAt: NOW,
          suspended: 0,
        },
      ]),
    );

    // Last-write-wins per card: a stale delta must not roll a schedule back.
    expect((await db.cards.get('p1::en:lex:x'))?.ladderLevel).toBe(3);
  });
});
