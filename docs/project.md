# Project context

## Vision and implementation

A shared building based on [Felix Gollnhuber's T3 Office](https://github.com/felixgollnhuber/t3-office), where friends visit one another's agent offices only after prior consent.

The first local MVP imports upstream revision **b14eb1c1f02933df071f62f32f79ed954dceadd8**. Its MIT license and authorship are preserved. This is a pinned source import into the existing starter repository: no GitHub fork, remote, push or public deployment has been created. The original README is retained in docs/upstream-readme.md. Existing starter files, history, operating setup and concept sketch were preserved. Upstream deployment workflows were deliberately not imported.

Implemented locally:

- Accounts and seven-day cookie sessions; one office per account.
- An optional in-office friends menu containing owned and explicitly granted floors only; the original own office/HUD is the default, without mandatory accounts.
- Single-use, 24-hour invitations for presence-only or anonymous activity access, explicit acceptance, invitation cancellation and visitor revocation.
- Owner office naming and pause/resume; pause clears the current snapshot.
- Persistent SQLite state and hashed passwords/tokens.
- Synthetic activity publishing, revocable 30-day publish-only credentials and an explicit local-to-relay bridge.
- Full-screen original Three.js rendering with authorized snapshots when visiting a shared floor; no hidden floor renderers. The menu uses a separate iframe to preserve original DOM/styles.
- Persistent local character names and work-area categories, with explicit optional sharing and owner-controlled shared profile overrides.
- English/German shell, responsive layout, permission/concurrency tests and browser acceptance checks.

Not implemented: continuous 3D exterior/elevator animation, human avatars/chat, remote agent control, account recovery, managed hosting, production TLS/proxy configuration or operational monitoring. Real private T3 data has not been used for development verification.

## Product and architecture decisions

- 2026-10-28: Prior-consent access is a user requirement. Offices start private. Owners generate scoped single-use invitations; signed-in recipients explicitly accept. A link grants access to whoever redeems it first, so delivery to the intended recipient matters. No email verification/identity assurance is claimed.
- 2026-10-28: The user delegated project leadership, model selection and implementation decisions to HQ and requested continued execution without routine approval pauses. This supersedes earlier per-task approval gates; spending, public production deployment, third-party contact, destructive actions and private-data exposure remain outside routine implementation authority.
- 2026-10-28: Use a pinned upstream source import to preserve this starter checkout and avoid creating an external fork/account resource. Record the exact revision and retain original license, authorship and README.
- 2026-10-28: Keep one persistent HQ; use bounded temporary tasks/agents when useful. Product and architecture coordination remain combined. No permanent specialist threads yet.
- 2026-10-28: Use the existing TypeScript/Vite/Three.js stack and native Node SQLite/crypto, adding no runtime dependencies for collaboration. The first milestone used a lightweight lobby and iframe office renderer; that layout was superseded by the office-first correction below. HTTP polling suits this milestone; multiplayer avatars or chat could justify streaming later.
- 2026-10-28: Share only up to 24 opaque agent IDs, provider and status. The bridge pseudonymizes original IDs locally with a per-run key; the server assigns generic names. No titles, task descriptions, model details, prompts, file paths, raw tools, transcript, context or cost sharing.
- 2026-10-28: Presence-only means online/offline state, without agent counts or agents. Activity access reveals the allowlisted snapshot. Names chosen for profiles/offices are visible to accepted visitors. Grants persist until revoked.
- 2026-10-28: Pause clears snapshots and blocks further publishing until resumed. No fresh publication for 45 seconds means offline. Authorization is enforced per read; the browser refreshes normally every 3–5 seconds, with seven-second request timeouts. Already disclosed information cannot be recalled from recipients.
- 2026-10-28: The shared server disables private upstream T3/GitHub-board endpoints. Real publishing uses an explicitly launched separate loopback companion and a least-privilege bridge credential. Do not expose the companion. Development/testing uses synthetic sources.
- 2026-10-28: Keep deployment local; do not inherit automatic GitHub Pages publishing. A public service requires a separate release review, especially trusted proxy/TLS, identity recovery, abuse controls and backups.

## Sources and ownership

- Code/configuration: actual implementation.
- This file: scope, material decisions, constraints and release limits.
- docs/tasks.md: ownership, dependencies, acceptance, verification and handoffs.
- AGENTS.md: canonical universal working protocol; CLAUDE.md is a thin entry pointer.
- README.md: runnable setup, bridge, verification and privacy instructions.
- docs/upstream-readme.md and CONTRIBUTING.md: upstream reference; current project instructions take precedence for extension behavior.
- Conversations: temporary working context and tool evidence; record material outcomes above.

Investigate conflicting sources rather than silently replacing decisions. Keep proposed, implemented, verified, integrated and deployed states distinct. Read only relevant additional documentation. The concept sketch is an early illustration, not a screenshot of implementation.

## Environment and continuity

The repository began on main at 13869af with no remote and one checkout. The existing conversation was renamed Project HQ — T3 Office. No historical migration or unavailable chat import is assumed. Codex delegation was enabled at assessment; other listed providers, including Claude, were disabled. Recheck capabilities when needed.

Native same-provider agents were used for a bounded backend implementation and independent review. HQ owns integration. Cross-harness automatic instruction loading and fresh-session Codex discovery have not been verified. Tests/builds are local evidence, not CI or deployment results.

## Next priorities

1. Run the app with two real participants using synthetic sharing first and collect usability feedback.
2. Review release identity/hosting requirements before any public deployment.
3. Consider a richer building/elevator transition after validating consent, publishing and navigation.

After the first user trial, simplify redundant process or split responsibilities only if recurring work warrants it.

## Office-first revision (2026-10-28)

The user's explicit correction supersedes the first milestone's dashboard-first shell: start directly in the original full-screen own office, preserving its HUD and behavior. Accounts, invitations, visiting shared floors and customization belong in an optional Friends & characters menu. No account is needed to see or rename local characters.

Work areas are owner-chosen categories, never inferred from tasks, project paths or prompts. Local aliases/areas stay in browser storage until the owner explicitly shares. Browser publication includes pseudonymous IDs, provider/status, character names and chosen areas; the server stores profile overrides independently of heartbeats. Presence-only access still excludes all names, areas and activity. Same-area shared coworkers sit together in six-seat pods without exceeding the office's four-pod capacity.

Browser sharing is opt-in for the current page, with an explicit Stop sharing action that pauses/clears the office. CLI IDs now remain stable for a publisher key across restarts; a key rotation changes pseudonyms. This supersedes the initial per-run ID decision. The shared service's defaults still disable private local T3 routes; npm run local is an explicit loopback-only launcher for the original live experience.

The user also reported different cost and token figures in T3 Code and upstream T3 Office. Code inspection confirms non-equivalent measures: the small receipt uses completed T3 turns since local midnight and excludes cached input; detailed usage scans provider-native sessions for its selected range, includes cached input, and has a 45-second cache plus richer pricing logic. The public demo is synthetic. Both differing metrics are confirmed by user report, but exact values/ranges/timezones and the matching T3 Code view are missing. No arithmetic bug or exact reconciliation is claimed. No actual private cost/session data was read for this investigation; do not contact upstream without a separate explicit instruction.


## Token accounting repair (2026-10-28)

The user explicitly requested fixing the reported token discrepancy. Confirmed source defects have now been repaired: the HUD excluded cached input; the office read only usage-scan-cache-v5.json while this machine has only v9; older Codex signature-only deduplication dropped genuine identical-sized requests; tentative final lines and rewritten/large files could be undercounted. The reader now follows installed T3 Code 0.1.3 cumulative validation and v9 checkpoint behavior, preserves retained/migrated history, streams to EOF, and respects display-model override/alias precedence over cached billing-model hints. Read failures use marked cached fallbacks or refuse unavailable totals.

Evidence: installed app metadata identifies version 0.1.3; its public application bundle defines cache version 9 and cumulative Codex accounting. Only v9 usage-cache existence was inspected on this machine (no cache contents, private transcripts, prompts or actual usage figures were read). Public upstream reference revision is 9e09926d97824179d97311d1a810c6b5bb60d2d1, especially apps/server/src/provider/Drivers/codexUsage.ts, apps/server/src/usage/usageScanCache.ts and usageAggregation.ts. The installed code is the compatibility target; current public HEAD is supporting reference, not proof of the installed build revision. Adapted token reconciliation retains T3 Tools Inc.'s MIT notice in docs/licenses/t3-code-MIT.txt.

Verification: ten new synthetic accounting regressions plus the prior thirteen API/bridge checks pass (23 total); TypeScript and production build pass. Independent read-only review identified precedence/null/legacy-size/large-file edge cases; HQ repaired them and added regressions. Original UI layout and untouched upstream checkout are preserved. Receipt and provider-wide detail still have different time/source scopes, and simple HUD cost estimates do not inherit every detail-pricing rule. Exact reconciliation of the user's two observed values remains unverified without paired ranges/values.
