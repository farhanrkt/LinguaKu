# Optional sync

**The app does not need this.** SPEC §5.1 requires LinguaKu to be 100% functional
with sync disabled, and it is: nothing in `src/features` or `src/data` imports
the sync client, there is no background timer and no registration. A learner who
never opens the sync settings runs an app in which none of this code executes.

It is also **opt-in**, which is a privacy decision rather than a technical one.
Sync means a learner's review history leaves their phone. Nothing about the core
product needs that, so it happens only when they ask, to an endpoint they supply.
There is no LinguaKu server and no default endpoint.

## Deploying

```bash
npx wrangler d1 create linguaku          # paste the id into wrangler.toml
npx wrangler d1 execute linguaku --file schema.sql --remote
npx wrangler secret put SYNC_TOKEN       # any long random string
npx wrangler deploy
```

Then, in the app's sync settings, paste the Worker URL and the same token.

## Free-tier limits, verified 2026-08-11

| | |
|---|---|
| Workers requests | 100,000 / day |
| Workers CPU | 10 ms / request |
| D1 rows read | 5,000,000 / day |
| D1 rows written | 100,000 / day |
| D1 storage | 5 GB total |

**One delta is one row, and that is the whole design.** SPEC §5.1 says to batch
"one write per finished session, not per card", which fixes the request count —
but the binding constraint turns out to be elsewhere. A 4-minute session produces
around thirty review logs; at one D1 row each that is 100,000 ÷ 30 ≈ **3,300
sessions a day**, an order of magnitude below the request cap. Storing the whole
session as one opaque row moves both caps to 100,000 sessions a day.

The server can afford to be that dumb because it never queries inside a delta.
It cannot: the local store is the source of truth, merge logic lives in
`src/core/delta.ts` on the client, and the Worker only routes. That is also what
keeps it inside the 10 ms CPU budget.

## Auth

A shared bearer token, compared in constant time. Deliberately modest: LinguaKu
has no accounts (SPEC §10) and adding one here would drag the whole product into
needing them. Anyone running this for more than themselves should put real auth
in front of it.

## Deployed 2026-08-19

The steps above have now been run, and two of them needed correcting: `d1
execute` needs `--config` to resolve the binding from outside this directory,
and `d1 create` prints a binding name (`linguaku`) that does **not** match the
`DB` binding `index.ts` reads — take the `database_id` and nothing else.

| | |
|---|---|
| Worker | `linguaku-sync` → `https://linguaku-sync.farhanrangki.workers.dev` |
| D1 | `linguaku`, region **APAC** (served from SIN — the right side of the planet for this audience) |
| Schema | applied `--remote`; one table, one index |

**It is live and it is fail-closed.** `SYNC_TOKEN` is deliberately still unset,
and with no token every `POST /sync` answers **401** — verified over 14
consecutive requests. Anything that is not `POST /sync` answers 404. So the
endpoint exists and grants nothing until its owner sets the secret:

```bash
npx wrangler secret put SYNC_TOKEN --config workers/sync/wrangler.toml
```

A note on reading the output while it settles: for the first minutes after a
deploy, `workers.dev` returns intermittent Cloudflare `error code: 1042` pages
with a 404. Those are the edge, not the Worker — the Worker's own 404 is
`{"error":"not found"}`. They stopped within three minutes.

## What is still untested

The client, the delta format and the merge rules have unit tests that run in CI,
and the Worker now answers on a real account. **The authenticated round trip has
never run**, because that needs the token its owner has not set — so pushing a
delta, storing it, and reading it back on a second device is still unverified.
The free-tier limits above were read from documentation on the date given and
have not been measured against traffic.
