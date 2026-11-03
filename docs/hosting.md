# Hosted trial runbook (Cloudflare Workers + D1)

Two people on different computers use the same building. This page covers everything from an empty Cloudflare account to a running trial, plus backup, monitoring and shutdown. Local development is unchanged (`npm run cloud:office`, `npm run dev`).

## What the trial runs

- One Worker, `t3-office-trial`, serving the built office and `/api/building/*` from a single HTTPS origin (`https://t3-office-trial.<account-subdomain>.workers.dev`). Other hosts and plain HTTP fail closed.
- One D1 database, `t3-office-trial`. It holds accounts, invitations, grants, published office snapshots, conversations and social data. No private T3 data: `/api/t3/*` and `/api/board` do not exist on the Worker.
- Sign-in is **GitHub only**, limited to the GitHub logins in `GITHUB_ALLOWED_LOGINS`. Password sign-up is closed (`ALLOW_PASSWORD_SIGNUP=0`).
- Abuse limits are per connection and per account, never global: 20 sign-in attempts per 15 min per connection, 10 per account handle, 10 new accounts per connection per day, 20 new sign-in contexts per connection per 15 min. These sit alongside the existing invitation, publishing, conversation and doorbell limits.

## Cost

Stay on the **Workers Free** plan for the trial. Free-plan overages are blocked rather than billed: Workers answers with error 1027, and D1 refuses queries until the next 00:00 UTC reset. Relevant free limits ([Workers](https://developers.cloudflare.com/workers/platform/limits/), [D1](https://developers.cloudflare.com/d1/platform/limits/)):

| Limit | Free plan | Trial estimate |
| --- | --- | --- |
| Worker requests | 100,000 / day | A viewer polls every 3 s (~1,200/h) and a person in a conversation sends about one heartbeat per second (~3,600/h). Two people together for two hours ≈ 20–30k. |
| CPU per request | 10 ms | GitHub sign-in avoids password hashing. Password sign-in (scrypt) would likely exceed this, which is one reason the trial is GitHub-only. |
| D1 rows read / written | 5M / 100k per day | Small tables; well within limits for two people. |
| D1 storage | 500 MB per database | Message, moment and snapshot counts are already capped. |
| Point-in-time restore (Time Travel) | 7 days | Plus manual exports below. |

Upgrading to Workers Paid is a separate, explicit decision.

## One-time setup (needs your Cloudflare and GitHub accounts)

Run these from the repository root. Steps 1–2 and 5–7 change your Cloudflare account; step 4 changes your GitHub account.

1. **Sign in to Cloudflare:** `npx wrangler login`, then `npx wrangler whoami`.
2. **Create the database:** `npx wrangler d1 create t3-office-trial`. Copy the printed `database_id` into `env.trial.d1_databases[0].database_id` in `cloud/wrangler.jsonc`.
3. **Set the address and guest list** in `env.trial.vars`:
   - `APP_ORIGIN`: `https://t3-office-trial.<account-subdomain>.workers.dev`. The account subdomain is shown in the Cloudflare dashboard under Workers & Pages.
   - `GITHUB_ALLOWED_LOGINS`: comma-separated GitHub logins of the trial participants, e.g. `you,your-friend`. An empty list would let any GitHub user in, so preflight refuses it.
4. **Register a GitHub OAuth app** for the hosted address (separate from the localhost app). In GitHub, go to Settings → Developer settings → OAuth Apps → New:
   - Homepage URL: the `APP_ORIGIN` value.
   - Authorization callback URL: `<APP_ORIGIN>/api/building/auth/github/callback`.
   - No extra scopes or repository access are requested; the app reads only the public profile.
5. **Store the credentials as secrets**, entering them at the prompt. Never put them in files, chat or `vars`.
   ```sh
   npx wrangler secret put GITHUB_CLIENT_ID --env trial --config cloud/wrangler.jsonc
   npx wrangler secret put GITHUB_CLIENT_SECRET --env trial --config cloud/wrangler.jsonc
   ```
6. **Create the tables:** `npm run cloud:trial:migrate`.
7. **Deploy:** `npm run cloud:trial:deploy`. This builds, runs preflight (HTTPS origin, real database id, non-empty guest list, sign-up closed, request-URL logging off, secrets not in vars) and then deploys.
8. **Smoke-check from outside:** `npm run cloud:trial:smoke -- https://t3-office-trial.<account-subdomain>.workers.dev`. It checks security headers, private-route 404s, the locked anonymous API, GitHub configuration, Secure cookies, closed sign-up and cross-origin refusal, without signing in or creating data.

Before the first deploy, also run `npm run test:cloud` and `npm run test:cloud:ui`.

## Running the trial

1. Both participants open the address and choose **Continue with GitHub** in People & chat.
2. One person creates an invitation (Friends panel) and sends the link. The other accepts it explicitly.
3. Try visiting, admitting, walking, chat, sharing, pause and revoke. Then close one browser, reopen it and check that reconnecting keeps the right permissions.
4. Note anything confusing or broken in `docs/tasks.md` (OFF-007).

Agent activity on the hosted building comes only from explicit browser sharing or the publisher bridge (`npm run bridge -- --server <APP_ORIGIN> …`). The private local companion is never exposed.

## Operations

| Need | Command |
| --- | --- |
| Live error stream | `npm run cloud:trial:logs` |
| Back up now | `npm run cloud:trial:backup`. Writes `.local/backups/trial-<UTC time>.sql`, which is ignored by Git. The file contains account rows and hashed session tokens, so keep it private and delete it after the trial. |
| Restore to a point in time (last 7 days) | `npx wrangler d1 time-travel info t3-office-trial --env trial --config cloud/wrangler.jsonc`, then `… time-travel restore t3-office-trial --timestamp <ISO time> --env trial --config cloud/wrangler.jsonc` |
| Restore from an export | Create a fresh database, then `npx wrangler d1 execute <db> --remote --file .local/backups/<file>.sql`, and point `database_id` at it. |
| Close the trial immediately | `npm run cloud:trial:close`. Pages still load, but every API call answers 503 "closed for maintenance". Reopen with `npm run cloud:trial:deploy`. |
| Remove a participant | Revoke their access in the app; to block them entirely, remove their login from `GITHUB_ALLOWED_LOGINS` and deploy again. |
| Tear everything down | `npx wrangler delete --env trial --config cloud/wrangler.jsonc` and `npx wrangler d1 delete t3-office-trial`, then delete the GitHub OAuth app. Irreversible; take a backup first if needed. |

**What gets logged.** The Worker logs only unexpected failures, as `{event, method, route with long ids masked, error name}`. It never logs bodies, cookies, handles, messages or SQL values. Cloudflare's per-request invocation logs are off (`invocation_logs: false`), so request URLs are not stored. This keeps one-time OAuth callback codes out of the logs too.

## Known trial limitations

- No account recovery and no email. Recovery is through GitHub, since the same GitHub account signs back into the same office.
- Worker accounts are separate from the Node service's `.local/building.sqlite`. Nothing is migrated.
- Rate-limit counters live in D1 (fixed 15-minute or daily windows). They are suitable for a small trial, not for a public launch.
- A public launch needs its own review: custom domain, open sign-up policy, recovery, moderation and paid-plan limits.

## Updating the existing trial from a prepared candidate

Preparation produces an ignored local directory under `.local/releases/` containing the built `dist/`, bundled Worker, trial configuration, migrations for reference, `manifest.json`, and `SHA256SUMS`. Use the candidate directory recorded in your preparation handoff. It is specific to this account and should stay private. No secret values or trial database rows belong in this package.

Before deployment, verify the package hashes from inside its directory with `shasum -a 256 -c SHA256SUMS`. Use `wrangler deployments status --config <candidate-dir>/wrangler.json --json` to compare the active version with `rollback_worker_version` in its manifest. If the active version changed since preparation, update the baseline and rollback plan before proceeding. Confirm the intended guest list, origin, API-open setting and existing D1 binding.

Take a fresh backup immediately before deployment, using the existing backup command after confirming its target matches the candidate. Preserve the backup path privately; do not print or commit its contents. A local candidate package is not a database backup.

Deploy the exact verified payload with:

```sh
npx wrangler deploy --no-bundle --config <candidate-dir>/wrangler.json
```

The candidate uses its own copied assets and bundled Worker, so subsequent changes in the root `dist/` do not change this deployment. Record the resulting Worker version. Run `npm run cloud:trial:smoke -- <configured-origin>`, then perform real GitHub login and the two-person checklist above. Synthetic/local tests do not verify live GitHub consent or two-computer behaviour.

For a frontend-only candidate with no new database migrations, restore the pre-update Worker version if the smoke check or essential flows fail:

```sh
npx wrangler rollback <rollback_worker_version-from-manifest> --config <candidate-dir>/wrangler.json --message "Restore pre-update trial version"
```

Re-run smoke after rollback and record its result. Worker rollback does not restore D1 data; keep accounts, invitations and conversations in place. Do not apply a database restore to fix a visual regression. If rollback is unavailable and access must be stopped, deploy the same candidate with `--no-bundle --var API_OPEN:0`, then investigate. These are deployment/rollback instructions; preparation only runs dry-runs.
