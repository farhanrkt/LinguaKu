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

## What is untested

The client, the delta format and the merge rules have unit tests that run in CI.
**The Worker itself has never been deployed or run** — that needs a Cloudflare
account, which the build environment does not have. The published limits above
were read from the documentation on the date given, not measured against a live
account. Treat the deployment steps as unverified until someone runs them.
