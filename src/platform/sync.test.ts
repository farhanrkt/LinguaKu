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
import { saveMnemonic } from '../data/repositories/mnemonics.ts';
import { recordCategoryAttempt } from '../data/repositories/contrastive.ts';
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
    // The raw text moved to `detail` so the UI can say something a learner can
    // act on; it is still carried, for anyone reporting a problem.
    expect(await syncNow('p1')).toMatchObject({
      status: 'failed',
      reason: 'unauthorized',
      detail: 'HTTP 401',
    });
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
    mnemonics: [],
    categoryScores: [],
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

/**
 * A failed sync says what to do about it.
 *
 * The outcome used to carry the raw string and the screen printed it: an
 * Indonesian learner met *"Gagal: HTTP 401"* and was left to work out what that
 * meant. 401 is the commonest failure there is — a token that does not match —
 * and it is the one case where saying so is the entire remedy.
 */
describe('sync failures are classified, not printed raw', () => {
  const enabled = {
    enabled: true,
    endpoint: 'https://example.test',
    token: 'wrong',
    lastSyncedAt: null,
  };

  beforeEach(() => {
    writeSyncSettings(enabled);
  });

  it('calls a 401 what it is: the token', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 401 })));
    const outcome = await syncNow('p1');
    expect(outcome).toMatchObject({ status: 'failed', reason: 'unauthorized', detail: 'HTTP 401' });
  });

  it('distinguishes a 404 from a bad token', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 404 })));
    expect(await syncNow('p1')).toMatchObject({ status: 'failed', reason: 'not-found' });
  });

  it('distinguishes a server fault from the learner’s settings', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 503 })));
    expect(await syncNow('p1')).toMatchObject({ status: 'failed', reason: 'server' });
  });

  it('distinguishes no answer at all, which is a different fix', async () => {
    // `fetch` rejects when it cannot reach the host: offline, wrong hostname,
    // blocked. Telling that learner to check their token would be wrong.
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    expect(await syncNow('p1')).toMatchObject({
      status: 'failed',
      reason: 'unreachable',
      detail: 'Failed to fetch',
    });
  });

  it('keeps the raw text, for a learner reporting a problem', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 418 })));
    const outcome = await syncNow('p1');
    expect(outcome).toMatchObject({ reason: 'unknown', detail: 'HTTP 418' });
  });
});

// ------------------------------------- what a delta actually carries upstream

/**
 * Three claims about sync that the code made and did not keep.
 *
 * SPEC §2.11's acceptance criterion is *"user-authored mnemonics persist and
 * **survive sync**"*; `src/data/types.ts` says a learner's mnemonic "wins on
 * sync", and `mnemonics.ts` quotes the criterion in its own doc comment. The
 * delta carried no mnemonics at all.
 *
 * The same shape of gap sat under the heatmap: drill *attempts* travelled and
 * the `CategoryScore` they produce did not, so a second device held twenty
 * answers in its append-only log while its own heatmap told the learner to
 * "answer 5 more" (invariant 16 reads `attempts` off the score row).
 *
 * And the window was wrong: sessions were selected by `startedAt >= since`, so
 * a session that began before a sync and finished after it was skipped — and
 * because the cursor had advanced, skipped permanently.
 *
 * The bodies are read as `unknown` on purpose, so these tests describe the
 * wire and fail at runtime against the unfixed code rather than failing to
 * compile against it.
 */
describe('a delta carries everything the learner made (SPEC §2.11, §6)', () => {
  let pushed: unknown[][] = [];

  const enable = () =>
    writeSyncSettings({
      enabled: true,
      endpoint: 'https://example.test',
      token: 'secret',
      lastSyncedAt: null,
    });

  const capture = () => {
    pushed = [];
    vi.stubGlobal('fetch', (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { deltas: unknown[] };
      pushed.push(body.deltas);
      return Promise.resolve(new Response(JSON.stringify({ deltas: [] }), { status: 200 }));
    });
  };

  /** The deltas sent by the most recent push. */
  const sent = (): Record<string, unknown>[] =>
    (pushed.at(-1) ?? []) as Record<string, unknown>[];

  const finishedSession = (over: Partial<Session> = {}): Session => ({
    id: 's-x',
    profileId: 'p1',
    lang: 'en',
    startedAt: NOW - 1_000,
    endedAt: NOW + 1_000,
    plannedMinutes: 4,
    itemIds: ['en:lex:x'],
    completed: 1,
    resumeCursor: 1,
    ...over,
  });

  const review = (itemId: string, at: number) =>
    recordReview({
      profileId: 'p1',
      itemId,
      grade: 3,
      confidence: null,
      latencyMs: 800,
      answerRaw: 'x',
      correct: true,
      now: at,
    });

  it('carries a mnemonic the learner wrote — §2.11 calls this an acceptance criterion', async () => {
    await review('ja:kanji:校', NOW);
    await saveMnemonic('p1', 'ja:kanji:校', 'pohon di samping persimpangan', NOW);
    await db.sessions.add(finishedSession({ id: 's-mn', lang: 'ja', itemIds: ['ja:kanji:校'] }));

    enable();
    capture();
    expect(await syncNow('p1')).toMatchObject({ status: 'ok' });
    expect(sent()[0]?.['mnemonics']).toEqual([
      expect.objectContaining({ itemId: 'ja:kanji:校', text: 'pohon di samping persimpangan' }),
    ]);
  });

  it('carries the category score, so the other device’s heatmap is not a lie', async () => {
    await review('en:lex:x', NOW);
    await recordCategoryAttempt({
      profileId: 'p1',
      lang: 'en',
      categoryIds: ['articles'],
      correct: true,
      now: NOW,
    });
    await db.sessions.add(finishedSession({ id: 's-cs' }));

    enable();
    capture();
    expect(await syncNow('p1')).toMatchObject({ status: 'ok' });
    expect(sent()[0]?.['categoryScores']).toEqual([
      expect.objectContaining({ categoryId: 'articles', lang: 'en', attempts: 1 }),
    ]);
  });

  it('pushes a session that began before a sync and finished after it', async () => {
    await review('en:lex:a', NOW);
    await db.sessions.add(
      finishedSession({ id: 's-straddle', startedAt: NOW, endedAt: null, completed: 0 }),
    );

    enable();
    capture();
    // Nothing to push yet: the session is not finished, which is honest.
    expect(await syncNow('p1')).toMatchObject({ status: 'ok' });
    expect(sent()).toEqual([]);

    const cursor = readSyncSettings().lastSyncedAt;
    expect(cursor).not.toBeNull();

    // The learner comes back after that sync and finishes the same session.
    await review('en:lex:b', (cursor ?? 0) + 60_000);
    await db.sessions.update('s-straddle', { completed: 1, endedAt: (cursor ?? 0) + 61_000 });

    capture();
    expect(await syncNow('p1')).toMatchObject({ status: 'ok' });
    expect(sent()[0]?.['sessionId']).toBe('s-straddle');
    // Both reviews, including the one answered before the first sync. The
    // server keys on session id and discards a replay, so a session gets one
    // push and it has to be the complete one.
    expect(sent()[0]?.['reviewLogs']).toHaveLength(2);
  });
});
