-- LinguaKu optional sync — D1 schema (SPEC §5.1, Phase 2).
--
-- One row per finished session. Not one per review, and the difference is the
-- whole design: see src/core/delta.ts for the arithmetic. D1's free tier allows
-- 100,000 row writes a day, and a 4-minute session produces roughly thirty
-- reviews — so a row per review caps the free tier at ~3,300 sessions a day,
-- while a row per session caps it at 100,000.
--
-- The payload is opaque on purpose. The server never reads inside it, because
-- it never needs to: SPEC §5.1 makes the local store the source of truth and
-- this a post box. That is also what keeps the Worker inside its 10 ms CPU
-- budget — it does no parsing, only routing.

CREATE TABLE IF NOT EXISTS deltas (
  -- The session id. Doubles as the idempotency key: replaying a delta is a
  -- no-op, which is what makes a flaky connection harmless.
  session_id   TEXT PRIMARY KEY,
  profile_id   TEXT NOT NULL,
  produced_at  INTEGER NOT NULL,
  received_at  INTEGER NOT NULL,
  payload      TEXT NOT NULL
);

-- The only query the server runs: "everything for this profile since X".
CREATE INDEX IF NOT EXISTS deltas_by_profile
  ON deltas (profile_id, produced_at);
