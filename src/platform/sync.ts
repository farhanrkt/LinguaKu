import { db } from '../data/db.ts';
import { buildDelta, isDelta, mergeDelta, type Delta } from '../core/delta.ts';
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
  | { status: 'failed'; reason: string };

/** Deltas for finished sessions the server has not seen. */
const pendingDeltas = async (profileId: string, since: Timestamp): Promise<Delta[]> => {
  const sessions = await db.sessions
    .where('[profileId+startedAt]')
    .between([profileId, since], [profileId, Number.MAX_SAFE_INTEGER])
    .toArray();

  const finished = sessions.filter((session) => session.completed === 1);
  if (finished.length === 0) return [];

  const [logs, attempts, cards] = await Promise.all([
    db.reviewLogs
      .where('[profileId+reviewedAt]')
      .between([profileId, since], [profileId, Number.MAX_SAFE_INTEGER])
      .toArray(),
    db.drillAttempts
      .where('[profileId+answeredAt]')
      .between([profileId, since], [profileId, Number.MAX_SAFE_INTEGER])
      .toArray(),
    db.cards.where('profileId').equals(profileId).toArray(),
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
export const syncNow = async (profileId: string): Promise<SyncOutcome> => {
  const settings = readSyncSettings();
  if (!settings.enabled || settings.endpoint.length === 0) return { status: 'disabled' };

  const since = settings.lastSyncedAt ?? 0;

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
    if (!response.ok) return { status: 'failed', reason: `HTTP ${response.status}` };

    const payload = (await response.json()) as { deltas?: unknown[] };
    const incoming = (payload.deltas ?? []).filter(isDelta);

    let merged = 0;
    for (const delta of incoming) {
      merged += await applyDelta(delta);
    }

    writeSyncSettings({ ...settings, lastSyncedAt: Date.now() });
    return { status: 'ok', pushed: deltas.length, pulled: incoming.length, merged };
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : 'unknown' };
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
  const [knownLogs, knownAttempts, cards] = await Promise.all([
    db.reviewLogs.bulkGet(delta.reviewLogs.map((log) => log.id)),
    db.drillAttempts.bulkGet(delta.drillAttempts.map((attempt) => attempt.id)),
    db.cards.bulkGet(delta.cards.map((card) => card.id)),
  ]);

  const result = mergeDelta({
    delta,
    knownLogIds: new Set(knownLogs.flatMap((row) => (row ? [row.id] : []))),
    knownAttemptIds: new Set(knownAttempts.flatMap((row) => (row ? [row.id] : []))),
    localCards: new Map(cards.flatMap((row) => (row ? [[row.id, row] as const] : []))),
  });

  await db.transaction(
    'rw',
    [db.sessions, db.reviewLogs, db.drillAttempts, db.cards],
    async () => {
      await db.sessions.put(delta.session);
      if (result.newReviewLogs.length > 0) await db.reviewLogs.bulkAdd(result.newReviewLogs);
      if (result.newDrillAttempts.length > 0) {
        await db.drillAttempts.bulkAdd(result.newDrillAttempts);
      }
      if (result.updatedCards.length > 0) await db.cards.bulkPut(result.updatedCards);
    },
  );

  return result.newReviewLogs.length + result.newDrillAttempts.length + result.updatedCards.length;
};
