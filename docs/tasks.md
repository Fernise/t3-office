# Tasks and handoffs

Canonical task board. Check ownership before starting or delegating. Significant records include priority, scope, dependencies, acceptance, verification and status. Claim shared records sequentially; parallel workers report results to HQ when this file has another editor.

Statuses: Backlog, Ready, In Progress, Review, Done, Blocked. Done requires verified acceptance; integration/deployment are separate. The user delegated ongoing project leadership to HQ on 2026-10-28: the former per-task approval gates are superseded for routine work within this project. External spending, public deployment, destructive actions and private-data exposure remain restricted.

## OFF-001 — Establish project operating setup

- Priority/owner/status: P0 / HQ / Done.
- Scope: Shared instructions, context, task board, starter prompts and thin Claude pointer; reuse current conversation as HQ.
- Dependencies: Initial assessment (satisfied).
- Acceptance: Canonical records linked, shared protocol/model authority recorded, existing work preserved.
- Verification: Five documents, seven local links, unique task IDs and whitespace checks passed; rename response and thread read confirmed Project HQ — T3 Office.
- Handoff: README.md, AGENTS.md, CLAUDE.md, docs/project.md, docs/tasks.md. Fresh-session instruction discovery and Claude auto-loading remain unverified. Superseded initial planning assumptions are reflected in current context.

## OFF-002 — Establish upstream baseline

- Priority/owner/status: P0 / HQ / Done.
- Scope: Choose a pinned source import, retain upstream attribution/history reference and preserve starter work. Do not create an external repository.
- Dependencies: OFF-001; user delegated implementation decisions.
- Acceptance: Exact source revision recorded; MIT license retained; original application builds before modification; no deployment workflow inherited.
- Verification: Upstream b14eb1c1f02933df071f62f32f79ed954dceadd8 imported from the inspected checkout. npm ci succeeded with zero reported vulnerabilities; unmodified npm run build passed.
- Handoff: Imported src/, server/, bin/, public/, scripts/, configuration, license and reference documents. Original README is docs/upstream-readme.md. No external fork/remote created. Package lock preserved and updated for local scripts/engine declaration.

## OFF-003 — Define first milestone and consent model

- Priority/owner/status: P0 / HQ / Done.
- Scope: Define presence/activity scopes, invitations, revocation, snapshot freshness, data fields and release boundaries.
- Dependencies: OFF-001 and delegated leadership authority.
- Acceptance: Prior-consent offices with explicit recipient acceptance; no raw work disclosure; concrete owner/visitor/uninvited/revoked/offline semantics.
- Verification: Rules recorded in docs/project.md and exercised by HTTP and browser scenarios. Presence has no agent counts; pause clears snapshots; grants/keys rechecked on use.
- Handoff: Native SQLite identity/session service; single-use 24-hour invitations; seven-day sessions; 30-day least-privilege publisher keys. Release remains local, with public TLS/proxy/abuse/recovery work outstanding.

## OFF-004 — Build floor navigation and owner experience

- Priority/owner/status: P0 / HQ / Done.
- Scope: Lightweight responsive building directory, login/signup, selected-floor renderer, invitation acceptance, owner controls, synthetic activity and bilingual UI.
- Dependencies: OFF-002, OFF-003.
- Acceptance: Two synthetic users can create offices, explicitly share, view changing agent status, pause and revoke. Only owned/granted floors appear. One renderer runs for the selected office.
- Verification: Browser acceptance checks passed for signup/invites/status transitions/pause/revocation/logout race, mobile overflow and German UI. Shared pages made no private T3 API requests. Screenshots inspected using synthetic data.
- Handoff: src/entry.ts, building.ts, building-api.ts, sharedsource.ts, building.css, i18n/building.ts; integration in main.ts/style.css/index.html. Shared view omits private/fake finance and project controls. Continuous exterior/elevator animation is deferred until user testing.

## OFF-005 — Implement collaborative service and bridge

- Priority/owner/status: P0 / backend implementation agent + HQ integration / Done.
- Scope: Persistent native SQLite API, ownership/grants/session enforcement, publisher keys, loopback companion boundary, CLI allowlist/pseudonymization, verification and CI configuration.
- Dependencies: OFF-002, OFF-003; explicit bounded agent brief.
- Acceptance: Authorization per read, single-use consent, least-privilege publishing, no raw local T3 data on the shared server, durable accounts/grants, meaningful negative and concurrent tests.
- Verification: npm test passed 12 tests covering real HTTP identity/permissions/persistence/expiry/replay/concurrency/origins/malformed inputs and bridge filtering/transport/failure behavior. npm run build passed. Browser checks exercised shared UI/private endpoint boundaries and denied SQLite dev-file access. CI configuration added but not run remotely.
- Handoff: server/building.ts and building.test.ts (agent), scripts/bridge.mjs and bridge.test.mjs, Vite boundary/configuration, package scripts, CI and user/security documentation (HQ). No real private data read. Bridge tests use synthetic snapshots; real T3 publishing not exercised.

## OFF-006 — Independent review and integration repairs

- Priority/owner/status: P0 / independent native review + HQ fixes / Done.
- Scope: Audit permission, async, freshness and renderer boundaries. Reviewer made no edits; HQ owns fixes.
- Dependencies: OFF-004, OFF-005.
- Acceptance: Resolve material findings with evidence before handoff.
- Verification: Fixed delayed rename undoing pause, revoked-key/session requests completing after body wait, stale worker object references, signed-out directory-response races and unbounded read waits. Added slow-body server regressions and browser status/logout-race checks; fetch timeout is bounded to seven seconds. Vite dev file deny blocks private SQLite. Fixed upstream IPv4 bridge lifecycle so verification server shutdown releases its listener.
- Handoff: Changes integrated in the local checkout. Public deployment still needs release-specific security review; no claim of production readiness.

## OFF-007 — Trial feedback and public release readiness

- Priority/owner/status: P1 / HQ / Backlog.
- Scope: First two-person usability trial with synthetic data; then define public identity/recovery, TLS/proxy trust, account abuse controls, backups and hosting requirements. Richer elevator navigation can follow trial evidence.
- Dependencies: Local MVP and trial feedback. Public deployment requires explicit release authorization.
- Acceptance: Record feedback and concrete release decisions; do not expose the private companion or silently disable origin/cookie checks.
- Verification: Trial evidence and a reviewed deployment plan; service-specific checks only once a target is chosen.
- Integration/deployment: Not started.

## Integration and release state

All completed work is integrated locally on branch feat/collaborative-building in the project root checkout. A local milestone commit records the baseline and implementation; use git log for its exact SHA. No changes have been pushed and no application has been publicly deployed.

Final verification: npm test (12 passed), npm run build (TypeScript and client bundle passed), npm run test:e2e (two-user consent/rendering/status/pause/revocation/logout race, private API/SQLite isolation, mobile and German checks passed). Runtime screenshots inspected from synthetic data. Local CI configuration exists but remote CI has not run. Fresh-harness instruction auto-loading, actual private T3 publishing and a public production environment remain unverified.

## Handoff format

For substantial work record: objective; completed work; files; branch/worktree; actual verification; material decisions; limitations/blockers; remaining work; next action; integration/deployment status. Link existing artifacts rather than copying conversation history.

## OFF-008 — Preserve original office and add optional friends/customization menu

- Priority/owner/status: P0 / HQ / Done.
- Scope: User correction: original full-screen office/HUD first; optional account/invites/shared floor selection in an in-office menu. Persistent local character names/areas, owner-controlled shared profiles and category summaries visible only to activity guests. Keep original private data local.
- Dependencies: OFF-004/OFF-005; explicit user request and office-first correction.
- Acceptance: No account/dashboard before own office; local rename persists; explicit sharing transmits only allowed fields; invited visitor sees shared name/area; presence guests cannot; original standalone interactions remain available.
- Verification: Typecheck/build and 13 API/bridge tests passed. Original-office browser acceptance passed for account-free startup/HUD, local rename persistence, names/areas shared to an invited guest, status transitions, pause/revoke, mobile and German menus. Independent read-only review identified pending sharing/account-response races; HQ fixed them. Additional browser protocol checks passed for stale account results, logout during delayed session/unpause, and covered/recovering stalled snapshots independent of a renderer. Synthetic screenshots inspected. Upstream copy at b14eb1c remains clean, and usage calculation modules are unchanged.
- Handoff: entry.ts/main.ts/officemenu.ts and compact building menu; character metadata API/table and tests; shared-source category grouping and network recovery; stable CLI pseudonyms; explicit local launcher; documentation. Integrated on feat/collaborative-building in the local checkout, not pushed/deployed. Next: try the original-office flow with the optional menu; public hosting remains a separate release task.

## OFF-009 — Investigate usage discrepancy

- Priority/owner/status: P1 / HQ / Blocked.
- Scope: Explain reported differences in both cost and tokens between T3 Code and upstream office without inventing a numerical reconciliation or changing calculations speculatively.
- Dependencies/blocker: Exact paired values, selected ranges, timezone and specific views were not provided. User confirmed both cost and tokens differ.
- Findings: Small receipt counts completed T3 turns since local midnight and excludes cached input; detailed costs include provider-native sessions/cached tokens over their own range and use a 45-second cache plus richer pricing. Static demo figures are simulated. This can explain differences, but does not confirm the user's specific root cause.
- Verification: Inspected server/t3.ts freshTokens/turnCost/today totals and server/costs.ts collect/aggregate/pricing/TTL; no private transcripts or actual usage totals read. Added an explanatory receipt tooltip without changing layout or amounts.
- Next action: Reconcile matching detailed views once paired values/ranges are available. Describe any upstream report as an observed discrepancy pending confirmation; do not send messages on the user's behalf.
