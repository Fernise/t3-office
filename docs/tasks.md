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

Initial milestone verification (superseded by OFF-008/009/010 below): npm test (12 passed), npm run build (TypeScript and client bundle passed), npm run test:e2e (two-user consent/rendering/status/pause/revocation/logout race, private API/SQLite isolation, mobile and German checks passed). Runtime screenshots inspected from synthetic data. Local CI configuration exists but remote CI has not run. Fresh-harness instruction auto-loading, actual private T3 publishing and a public production environment remain unverified.

## Handoff format

For substantial work record: objective; completed work; files; branch/worktree; actual verification; material decisions; limitations/blockers; remaining work; next action; integration/deployment status. Link existing artifacts rather than copying conversation history.

## OFF-008 — Preserve original office and add optional friends/customization menu

- Priority/owner/status: P0 / HQ / Done.
- Scope: User correction: original full-screen office/HUD first; optional account/invites/shared floor selection in an in-office menu. Persistent local character names/areas, owner-controlled shared profiles and category summaries visible only to activity guests. Keep original private data local.
- Dependencies: OFF-004/OFF-005; explicit user request and office-first correction.
- Acceptance: No account/dashboard before own office; local rename persists; explicit sharing transmits only allowed fields; invited visitor sees shared name/area; presence guests cannot; original standalone interactions remain available.
- Verification: Typecheck/build and 13 API/bridge tests passed. Original-office browser acceptance passed for account-free startup/HUD, local rename persistence, names/areas shared to an invited guest, status transitions, pause/revoke, mobile and German menus. Independent read-only review identified pending sharing/account-response races; HQ fixed them. Additional browser protocol checks passed for stale account results, logout during delayed session/unpause, and covered/recovering stalled snapshots independent of a renderer. Synthetic screenshots inspected. Upstream copy at b14eb1c remains clean, and usage calculation modules are unchanged.
- Handoff: entry.ts/main.ts/officemenu.ts and compact building menu; character metadata API/table and tests; shared-source category grouping and network recovery; stable CLI pseudonyms; explicit local launcher; documentation. Integrated on feat/collaborative-building in the local checkout, not pushed/deployed. Next: try the original-office flow with the optional menu; public hosting remains a separate release task.

## OFF-009 — Repair token accounting and modern T3 cache compatibility

- Priority/owner/status: P0 / HQ / Done (confirmed implementation defects).
- Scope: User requested trying to solve the reported token-accountability error. Reproduce and repair undercounts/reader incompatibilities while preserving the original interface and upstream copy.
- Findings/fixes: Cached input was excluded from HUD token totals; only legacy v5 cache was read despite this machine having v9 only; signature-only Codex deduplication swallowed equal-sized real requests. Also corrected fork baselines, malformed counters, tentative tails, guarded append/rewrite handling, complete chunked scans, retained negative-size legacy history and billing-model override/alias precedence. Scan failures are surfaced.
- Acceptance: Synthetic cases follow installed T3 Code 0.1.3's processed-token/cumulative/cache rules; no duplicated cached input/reasoning or overlapping cache generations; read-only source caches; unchanged office layout and private-data boundary.
- Verification: 23 tests passed, including 10 new accounting regressions; npm run build passed. Independent native read-only review findings repaired by HQ. All fixtures use an isolated T3_HOME/CODEX_HOME/CLAUDE_CONFIG_DIR. Actual private data was not read; inspected only public app code/version and cache-file existence.
- Files: server/tokens.ts, costs.ts, t3.ts, accounting.test.ts; cost-view provenance/warnings and receipt tooltip; package test command; docs and upstream MIT attribution.
- Branch/worktree: feat/collaborative-building, project root. Integrated locally; not pushed or deployed.
- Limitation: The user's exact figures/time ranges are still missing, so complete numerical reconciliation is not claimed. Provider-wide detail and today's completed-T3-turn receipt remain different scopes; API cost is an estimate.
- Next action: Reload the local office and compare matching detail ranges/timezone/refresh states. Report the now-confirmed cache/parser/receipt bugs to upstream only if explicitly instructed to send a report.

## OFF-010 — Elevator, sharing visibility and room customization

- Priority/owner/status: P1 / HQ / Done.
- Scope: User-approved improvements 5, 7 and 10: optional elevator floor selector, explicit audience/scope/freshness controls and original/focus/lounge furniture presets with theme and lighting choices. Original office remains home.
- Dependencies: OFF-008/009. No conflicting active file ownership found; implemented directly because menu, renderer and consent contract overlap.
- Acceptance: Only authorized floors appear; visiting has a one-click home action; owners see guests and scope plus snapshot freshness; local style survives reload; authorized activity guests render saved owner style, presence guests cannot read it; original theme/layout defaults retained.
- Verification: npm test passed 24 tests; npm run build passed TypeScript and production bundling. npm run test:e2e passed full synthetic browser checks for style persistence, actual lounge/focus furniture, host-style rendering, current-floor/home navigation, sharing audience, pause/revoke, mobile overflow and German entry. Final node scripts/menu-races.mjs passed added late-style-save/logout and pagehide/pending-start regressions; final build passed. Synthetic desktop/mobile screenshots inspected. A large WebGL screenshot timeout was resolved with smaller test viewports; an intermediate HMR navigation interruption was resolved by rerunning without concurrent source edits. No remaining check failures.
- Files/artifacts: src/appearance.ts and roomstyle.ts; menu, localization, styles, main/shared source; building API and consent regression; browser scripts; README and project records.
- Decisions/limitations: Furniture presets use established geometry/navigation; no freeform furniture editor or continuous 3D elevator travel. Local preferences are browser-scoped; account saves publish room style to authorized activity guests. Applying style reloads and ends browser publishing; pagehide now invalidates pending starts. Access lists are grants, not active viewers.
- Workspace/integration: feat/collaborative-building, project root; integrated locally. No push, public deployment or private-data use.
- Next action: Try Friends → Elevator, Sharing, and Office style with a second participant using synthetic activity; OFF-007 remains the release/trial follow-up.

## OFF-011 — Run an isolated simulated friend

- Priority/owner/status: P1 / HQ / Done.
- Objective/scope: User requested seeing another player. Add a reusable local-only demo launcher, without modifying production authentication or normal office data.
- Completed: Synthetic visitor and Maya accounts, seeded/accepted activity invitation, eight named agents with areas and eight-second rotating publication, warm lounge appearance, elevator/home flow and visible simulation banner. Auto-login exists only in the disposable launcher. Host canonicalization keeps demo cookies on 127.0.0.1 and normal office cookies on localhost.
- Files: scripts/friend-preview.mjs, package.json, README.md and this handoff.
- Verification: node --check scripts/friend-preview.mjs and git diff --check passed. node scripts/friend-preview.mjs --check-browser passed live API checks, anonymous denial, disabled private endpoint, localhost redirect without cookies, changing statuses, style persistence and real browser visit/elevator/home flow with no page errors. Initial test assertion corrected to account for consecutive running states and the original demo's extra intern.
- Workspace/integration: feat/collaborative-building, project root; local only, no push or deployment. No real T3 data, third-party accounts or credentials used.
- Limitations/next action: A synthetic two-player preview, not a real networked human trial. Run npm run demo:friends and visit the displayed preview links; clean shutdown deletes the temporary database.

## OFF-012 — Direct character customization sidebar

- Priority/owner/status: P1 / HQ / Done.
- Scope: Clicking an owned coworker opens the existing side sheet on a customization tab. Persistent name, work area, hairstyle, outfit, bounded colors and glasses; immediate renderer updates; explicit activity-only style sharing. Existing overview/transcript remain available. Friends menu becomes a character picker for the same editor.
- Dependencies: OFF-008/010/011; user explicitly requested this flow. HQ owns intertwined menu/inspector/renderer/profile/API changes in the project root.
- Acceptance/verification: Name/style persist across reload, unsaved typing survives activity refresh, appearance updates retain character placement and behavior, other characters keep their own profiles, visitors cannot edit hosts, presence guests receive no appearance, old profile storage remains readable. Synthetic API and browser checks required before Done.

- Completed/files: src/character-editor.ts, character-profiles.ts and character-style.ts; inspector/main/worker rendering, menu routing, permission API/shared source, localization/styles, synthetic API/browser regressions, README and project context.
- Verification: npm test passed 25 tests, including owner/style validation, durable profiles, stripped extra fields, heartbeat preservation, presence/activity isolation and revocation. npm run build passed. npm run test:e2e passed desktop/mobile direct selection, stable typing across inspector refresh, shortcut-safe name input, appearance/persistence/sharing, read-only visitor inspection and existing consent/navigation scenarios. A final targeted synthetic browser check confirmed live avatar replacement after preserving scale/backpack state and captured shots/character-editor.png for visual inspection; final build passed. The initial automation attempted a moving/occluded nametag; the regression now dispatches its actual click handler deterministically. No real data used.
- Decisions/limitations: Browser-local profiles remain compatible with old names/areas. Style edits are display preferences and do not rename actual T3 threads or control agents. Bounded palettes avoid arbitrary assets/colors and unbounded material allocations. Activity sharing adds fictional appearance only after explicit publishing; presence guests receive no characters. Original overview/thread tabs remain intact. No new account recovery or cross-device preference sync.
- Branch/integration: feat/collaborative-building, project root; integrated locally, not pushed/deployed. Next: refresh the office or demo own-floor page and click a coworker; the normal two-person usability trial remains OFF-007.

## OFF-013 — Animated building and elevator travel

- Priority/owner/status: P1 / HQ / Done.
- Scope: User-approved camera pullback, authorized cutaway building, closing cabin doors, moving elevator/floor indicator and opening destination doors. About two seconds of animation plus actual loading; Skip and reduced-motion support.
- Acceptance: Only granted/owned floors appear; presence thumbnails reveal no activity; recheck access after moving; arrival covers the destination until the renderer is ready; failures stay safe and recoverable; original office remains home.
- Ownership/dependencies: HQ / root checkout feat/collaborative-building; depends on OFF-010 and existing read authorization. No new backend privileges or private data.

- Completed/files: src/elevator.ts and elevator.css, early arrival bootstrap in entry.ts, camera/readiness events in main.ts, unified menu/home/standalone navigation, animated demo banner, scripts/elevator-test.mjs and package verification command, README/project records.
- Verification: npm test passed all 25 API/accounting/bridge tests. npm run build passed. npm run test:e2e passed new permission/timing/readiness/Skip/reduced-motion/mobile/history tests plus existing account-race and full two-user office checks. Real mid-trip grant revocation prevented navigation; inaccessible floors never appeared; presence rows had no interior detail. A mobile width failure was corrected with scoped border-box sizing. Desktop/mobile cutaway screenshots inspected. Final build and node scripts/friend-preview.mjs --check-browser passed actual demo banner navigation, destination readiness and private API isolation with no page errors.
- Decisions/limitations: Stylized cutaway thumbnails with at most six authorized rows, preserving endpoints; no new live office video, private data or server permissions. Directory numbers are local positions. About 2.1 seconds of animation plus actual destination loading. Arrival tickets contain path/time/motion only; stale/history-restored trips cancel. Skip accelerates motion, not authorization or loading. A delayed load offers a return action.
- Branch/integration: feat/collaborative-building, project root; integrated locally, not pushed/deployed. Next: use the simulated building's Visit Maya or Friends → Elevator to try the sequence; gather trial feedback in OFF-007.
