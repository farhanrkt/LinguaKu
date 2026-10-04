import { db } from '../data/db.ts';
import {
  buildDelta,
  deltaSize,
  isDelta,
  mergeDelta,
  scoreKey,
  type Delta,
} from '../core/delta.ts';
import type { Timestamp } from '../data/types.ts';

/**
 * Optional delta sync (SPEC §5.1, Phase 2).
 *
 * ## Off unless the learner turns it on, and the app never notices
 *
 * SPEC §5.1: *"The app must be 100% functional with sync disabled."* That is
 * M7's acceptance criterion, and it is enforced structurally rather than by
 * care: **nothing in `src/features` or `src/data` imports this module.** The
 * only caller is the settings screen. There is no background timer, no
 * registration, no listener — a learner who never opens settings has an app in
 * which this code never runs.
 *
 * It is also opt-in rather than default-on, and that is a privacy decision, not
 * a technical one. Sync means a learner's review history leaves their phone.
 * Nothing about the core product needs that to happen, so it happens only when
 * they ask for it, to an endpoint they supply.
 *
 * ## Verified limits (SPEC §5.1 asks for this explicitly)
 *
 * Read 2026-08-11 at developers.cloudflare.com:
 *
 *   Workers free   100,000 requests/day · 10 ms CPU/request · 50 subrequests
 *   D1 free        5,000,000 rows read/day · 100,000 rows written/day · 5 GB
 *
 * One delta is one request *and* one row — see the arithmetic in
 * src/core/delta.ts, which is why it is one row and not thirty.
 */

export interface SyncSettings {
  enabled: boolean;
  /** The learner's own Worker. There is no default, and no LinguaKu server. */
  endpoint: string;
  /** Shared secret, so a URL alone does not grant access to a history. */
  token: string;
  lastSyncedAt: Timestamp | null;
}

/**
 * Held in `localStorage`, not in Dexie, and deliberately so.
 *
 * The endpoint and token are **device-local secrets**. Everything in Dexie is
 * exportable by design (SPEC §9: the learner owns their data and can hand the
 * file to anyone), and a bearer token inside a shared backup would be a quiet
 * way to leak access to someone's whole history. Keeping these out of the
 * database keeps them out of the export by construction rather than by
 * remembering to filter them.
 */
const SETTINGS_KEY = 'linguaku.sync';

export const defaultSyncSettings = (): SyncSettings => ({
  enabled: false,
  endpoint: '',
  token: '',
  lastSyncedAt: null,
});

export const readSyncSettings = (): SyncSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSyncSettings();
    return { ...defaultSyncSettings(), ...(JSON.parse(raw) as Partial<SyncSettings>) };
  } catch {
    return defaultSyncSettings();
  }
};

export const writeSyncSettings = (settings: SyncSettings): void => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private mode, or storage full. Sync stays off, which is the safe state.
  }
};

export type SyncOutcome =
  | { status: 'disabled' }
  | { status: 'ok'; pushed: number; pulled: number; merged: number }
  | { status: 'failed'; reason: SyncFailure; detail: string };

/**
 * Why a sync did not happen, as a code the UI can translate.
 *
 * The outcome used to carry the raw string — `HTTP 401`, `Failed to fetch` —
 * and the screen printed it. An Indonesian learner was shown *"Gagal: HTTP
 * 401"* and left to work out what to do about it, which for the commonest
 * failure of all (a token that does not match) is the one thing worth saying.
 *
 * `detail` keeps the raw text, because a learner reporting a problem should be
 * able to read it out; it is just not the sentence they are shown first.
 */
export type SyncFailure =
  /** The token is wrong, or the server has none set. */
  | 'unauthorized'
  /** The endpoint answered, but not with a sync endpoint. */
  | 'not-found'
  /** No answer at all: offline, wrong host, blocked. */
  | 'unreachable'
  /** It answered with a failure of its own. */
  | 'server'
  | 'unknown';

/** Classifies an HTTP status into something a learner can act on. */
const failureFor = (status: number): SyncFailure => {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not-found';
  if (status >= 500) return 'server';
  return 'unknown';
};

/**
 * Deltas for finished sessions the server has not seen.
 *
 * ## Selected by when a session *ended*
 *
 * This used to ask for sessions with `startedAt >= since`, which silently
 * dropped every session that straddled a sync: begin a session, sync, come back
 * and finish it, and the session sat behind the cursor permanently — along with
 * every review in it. SPEC §2.13 makes sessions resumable across days
 * (`resumeCursor` is persisted after every single answer), so straddling is
 * ordinary rather than exotic.
 *
 * It has to be `endedAt`, not "push it unfinished and replace it later": the
 * Worker keys on session id and does `ON CONFLICT DO NOTHING`, so a session
 * gets exactly one push upstream and it must be the finished one.
 *
 * The scan is over one profile's sessions, which is what `findResumable`
 * already does — a four-minute session is one row, so a year of daily use is a
 * few hundred of them.
 */
const pendingDeltas = async (profileId: string, since: Timestamp): Promise<Delta[]> => {
  const sessions = await db.sessions
    .where('[profileId+startedAt]')
    .between([profileId, 0], [profileId, Number.MAX_SAFE_INTEGER])
    .toArray();

  const finished = sessions.filter(
    (session) => session.completed === 1 && (session.endedAt ?? session.startedAt) >= since,
  );
  if (finished.length === 0) return [];

  // Rows are read from the earliest session being pushed, not from `since`. A
  // straddling session must travel with the answers given *before* the sync
  // that skipped it, or the fix above would send a session missing half its
  // reviews — worse than not sending it.
  const earliest = Math.min(...finished.map((session) => session.startedAt));
  const upTo = Number.MAX_SAFE_INTEGER;

  const [logs, attempts, cards, mnemonics, scores] = await Promise.all([
    db.reviewLogs.where('[profileId+reviewedAt]').between([profileId, earliest], [profileId, upTo]).toArray(),
    db.drillAttempts.where('[profileId+answeredAt]').between([profileId, earliest], [profileId, upTo]).toArray(),
    db.cards.where('profileId').equals(profileId).toArray(),
    // `mnemonics` is keyed `[profileId+itemId]` and holds one row per kanji the
    // learner actually edited, so a filter is the honest read here.
    db.mnemonics.filter((row) => row.profileId === profileId).toArray(),
    db.categoryScores.where('profileId').equals(profileId).toArray(),
  ]);

  return finished.map((session) => {
    const from = session.startedAt;
    const to = session.endedAt ?? Number.MAX_SAFE_INTEGER;
    const inWindow = <T>(rows: readonly T[], at: (row: T) => number): T[] =>
      rows.filter((row) => at(row) >= from && at(row) <= to);

    const sessionLogs = inWindow(logs, (log) => log.reviewedAt);
    const touched = new Set(sessionLogs.map((log) => log.cardId));

    return buildDelta({
      profileId,
      session,
      reviewLogs: sessionLogs,
      drillAttempts: inWindow(attempts, (attempt) => attempt.answeredAt),
      cards: cards.filter((card) => touched.has(card.id)),
      // Current state, windowed the same way the history is. Both are only ever
      // written during a session — `saveMnemonic` from the session screen,
      // `recordCategoryAttempt` from a drill answer — so a row's `updatedAt`
      // falls inside exactly one session, and rides exactly one delta.
      mnemonics: inWindow(mnemonics, (row) => row.updatedAt),
      categoryScores: inWindow(scores, (row) => row.updatedAt),
      producedAt: Date.now(),
    });
  });
};

/**
 * Pushes finished sessions and applies whatever came back.
 *
 * Returns rather than throws on every failure: a sync that cannot reach the
 * network must be indistinguishable, from the learner's point of view, from one
 * they never enabled. The local store is the source of truth and has lost
 * nothing.
 */
/**
 * Wire bytes waiting to be sent (SPEC §5.4).
 *
 * Sync is the one thing in this app that uploads, and the learner it is written
 * for is on mobile data — the same reason the reader states its download cost
 * before spending it (D80). `deltaSize` has existed since M7 for exactly this
 * note and was never called by anything.
 *
 * Counted the way the reader counts: what actually travels, before it travels.
 */
export const pendingBytes = async (profileId: string): Promise<number> => {
  const settings = readSyncSettings();
  // Never synced means everything is pending, which is what `0` asks for.
  const deltas = await pendingDeltas(profileId, settings.lastSyncedAt ?? 0);
  return deltas.reduce((total, delta) => total + deltaSize(delta), 0);
};

export const syncNow = async (profileId: string): Promise<SyncOutcome> => {
  const settings = readSyncSettings();
  if (!settings.enabled || settings.endpoint.length === 0) return { status: 'disabled' };

  const since = settings.lastSyncedAt ?? 0;
  // The next cursor is taken *before* anything is read. Taking it afterwards
  // (`Date.now()` at the end) silently skipped anything written while the
  // request was in flight, because the cursor would then sit past rows this
  // push never carried.
  const cursor = Date.now();

  try {
    const deltas = await pendingDeltas(profileId, since);

    const response = await fetch(`${settings.endpoint.replace(/\/$/, '')}/sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${settings.token}`,
      },
      body: JSON.stringify({ profileId, since, deltas }),
    });
    if (!response.ok) {
      return {
        status: 'failed',
        reason: failureFor(response.status),
        detail: `HTTP ${response.status}`,
      };
    }

    const payload = (await response.json()) as { deltas?: unknown[] };
    const incoming = (payload.deltas ?? []).filter(isDelta);

    let merged = 0;
    for (const delta of incoming) {
      merged += await applyDelta(delta);
    }

    writeSyncSettings({ ...settings, lastSyncedAt: cursor });
    return { status: 'ok', pushed: deltas.length, pulled: incoming.length, merged };
  } catch (error) {
    // `fetch` rejects rather than resolving when it cannot reach the host at
    // all — offline, wrong hostname, blocked by the network. That is a
    // different thing from a server that answered badly, and a different fix.
    return {
      status: 'failed',
      reason: 'unreachable',
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
};

/**
 * Applies one incoming delta. Returns how many rows it actually changed.
 *
 * The merge decision is pure and lives in `src/core/delta.ts`; this is only the
 * write. Review logs go in with `bulkAdd` over the ids we do not have, never a
 * `put` — the append-only hook would reject that, and it would be right to.
 */
export const applyDelta = async (delta: Delta): Promise<number> => {
  // A version 1 delta carries neither state array; `?? []` is the wire being
  // older than this build, not defensive clutter.
  const incomingMnemonics = delta.mnemonics ?? [];
  const incomingScores = delta.categoryScores ?? [];

  const [knownLogs, knownAttempts, cards, mnemonics, scores] = await Promise.all([
    db.reviewLogs.bulkGet(delta.reviewLogs.map((log) => log.id)),
    db.drillAttempts.bulkGet(delta.drillAttempts.map((attempt) => attempt.id)),
    db.cards.bulkGet(delta.cards.map((card) => card.id)),
    db.mnemonics.bulkGet(incomingMnemonics.map((row) => [row.profileId, row.itemId] as const)),
    db.categoryScores.bulkGet(
      incomingScores.map((row) => [row.profileId, row.lang, row.categoryId] as const),
    ),
  ]);

  const result = mergeDelta({
    delta,
    knownLogIds: new Set(knownLogs.flatMap((row) => (row ? [row.id] : []))),
    knownAttemptIds: new Set(knownAttempts.flatMap((row) => (row ? [row.id] : []))),
    localCards: new Map(cards.flatMap((row) => (row ? [[row.id, row] as const] : []))),
    localMnemonics: new Map(mnemonics.flatMap((row) => (row ? [[row.itemId, row] as const] : []))),
    localScores: new Map(scores.flatMap((row) => (row ? [[scoreKey(row), row] as const] : []))),
  });

  await db.transaction(
    'rw',
    [db.sessions, db.reviewLogs, db.drillAttempts, db.cards, db.mnemonics, db.categoryScores],
    async () => {
      await db.sessions.put(delta.session);
      if (result.newReviewLogs.length > 0) await db.reviewLogs.bulkAdd(result.newReviewLogs);
      if (result.newDrillAttempts.length > 0) {
        await db.drillAttempts.bulkAdd(result.newDrillAttempts);
      }
      if (result.updatedCards.length > 0) await db.cards.bulkPut(result.updatedCards);
      if (result.updatedMnemonics.length > 0) await db.mnemonics.bulkPut(result.updatedMnemonics);
      if (result.updatedScores.length > 0) await db.categoryScores.bulkPut(result.updatedScores);
    },
  );

  return (
    result.newReviewLogs.length +
    result.newDrillAttempts.length +
    result.updatedCards.length +
    result.updatedMnemonics.length +
    result.updatedScores.length
  );
};
