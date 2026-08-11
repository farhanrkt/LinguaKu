/**
 * LinguaKu optional sync — Cloudflare Worker (SPEC §5.1, Phase 2).
 *
 * **This is not part of the app build.** It is deployed separately, by the
 * learner or by whoever runs an instance, and the app is fully functional
 * without it — that is M7's acceptance criterion, and it is why nothing in
 * `src/` imports anything from this directory.
 *
 * ## What it deliberately does not do
 *
 * It does not read inside a delta, resolve conflicts, or hold any opinion about
 * scheduling. SPEC §5.1 makes the local store the source of truth; this is a
 * post box that accepts opaque payloads keyed by session id and hands back the
 * ones a device has not seen. Merge logic lives in `src/core/delta.ts`, on the
 * client, where it can be tested without a network.
 *
 * That restraint is also what keeps it inside the free tier's 10 ms CPU budget:
 * the Worker parses the envelope and nothing else.
 *
 * ## Limits, verified 2026-08-11 at developers.cloudflare.com
 *
 *   Workers free   100,000 requests/day · 10 ms CPU/request · 50 subrequests
 *   D1 free        5,000,000 rows read/day · 100,000 rows written/day · 5 GB
 *
 * One sync is one request and one row per finished session, so both caps land
 * at 100,000 sessions a day.
 *
 * ## Auth
 *
 * A shared bearer token, compared in constant time. This is deliberately modest:
 * there are no accounts in LinguaKu (SPEC §10) and adding one here would drag
 * the whole product into needing them. The token gates access to one profile's
 * deltas; anyone deploying this for more than themselves should put real auth in
 * front of it.
 */

export interface Env {
  DB: D1Database;
  /** Set with `wrangler secret put SYNC_TOKEN`. */
  SYNC_TOKEN: string;
}

interface SyncRequest {
  profileId: string;
  since: number;
  deltas: Array<{ sessionId: string; profileId: string; producedAt: number }>;
}

/** Constant-time compare, so the token cannot be guessed a byte at a time. */
const tokenMatches = (given: string, expected: string): boolean => {
  if (given.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < given.length; index++) {
    difference |= given.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/sync' || request.method !== 'POST') {
      return json({ error: 'not found' }, 404);
    }

    const given = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '');
    if (!env.SYNC_TOKEN || !tokenMatches(given, env.SYNC_TOKEN)) {
      return json({ error: 'unauthorized' }, 401);
    }

    let body: SyncRequest;
    try {
      body = (await request.json()) as SyncRequest;
    } catch {
      return json({ error: 'bad request' }, 400);
    }
    if (typeof body.profileId !== 'string' || !Array.isArray(body.deltas)) {
      return json({ error: 'bad request' }, 400);
    }

    const now = Date.now();

    // Idempotent by session id: a retried push writes nothing, which is what
    // makes a flaky connection harmless rather than duplicating a history.
    if (body.deltas.length > 0) {
      const statement = env.DB.prepare(
        `INSERT INTO deltas (session_id, profile_id, produced_at, received_at, payload)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO NOTHING`,
      );
      await env.DB.batch(
        body.deltas.map((delta) =>
          statement.bind(
            delta.sessionId,
            delta.profileId,
            delta.producedAt,
            now,
            JSON.stringify(delta),
          ),
        ),
      );
    }

    // Hand back what this device has not seen. The `since` cursor is the
    // client's own last successful sync.
    const { results } = await env.DB.prepare(
      `SELECT payload FROM deltas
       WHERE profile_id = ? AND produced_at > ?
       ORDER BY produced_at ASC
       LIMIT 200`,
    )
      .bind(body.profileId, body.since ?? 0)
      .all<{ payload: string }>();

    const deltas = (results ?? []).flatMap((row) => {
      try {
        return [JSON.parse(row.payload) as unknown];
      } catch {
        return [];
      }
    });

    return json({ deltas, receivedAt: now });
  },
};
