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

Not implemented: a walkable exterior/city, human avatars/chat, remote agent control, account recovery, managed hosting, production TLS/proxy configuration or operational monitoring. Real private T3 data has not been used for development verification.

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
3. Evaluate whole-building navigation, floor focus, elevator timing and accessibility in the two-person trial.

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

## Elevator, sharing visibility and room styles (2026-10-29)

User approved improvements 5, 7 and 10. Keep the original office as home; add an optional elevator selector within Friends, showing only authorized floors and a current-location marker. Floor numbers are directory positions, not stable globally assigned addresses. Visiting has a persistent return-home button. The initial selector is extended by the animated cutaway transition below.

Sharing controls distinguish browser publishing from server snapshot freshness, show explicit per-guest scope and revocation, and explain the 45-second offline threshold. Access lists are permissions, not live visitor telemetry. Failed refreshes mark access/freshness unavailable instead of presenting stale details as current.

Office style uses the existing four themes with Original/Focus/Lounge furniture presets and Original/Warm/Cool lighting. Original defaults remain unchanged. Presets use existing furniture builders and their navigation/interaction spots; desk capacity stays the same. Browser preferences remain local; explicit style save with an account and browser-sharing start save only allowlisted style identifiers to the owner's office. Activity guests receive the saved style; presence-only visitors do not. Publisher keys cannot edit style. Applying style reloads the page and ends browser publishing; guests reload when saved style changes. This intentionally extends the sharing contract with public room preferences, not work details.

## Direct character editing (2026-10-29)

User requested direct character selection rather than menu-based renaming. Clicking an owned coworker opens the existing side sheet on Customize; the menu's character picker routes to the same editor. Keep overview/transcript tabs. Names, work areas and bounded appearance choices persist in the existing local profile key and apply to the live character without restarting the office. Preserve position, scale, backpack state and shared materials when replacing geometry. Unsaved input survives periodic inspector refreshes; office shortcuts ignore active form fields. Visitors have no customization editor for host characters.

The sharing contract now optionally includes validated, owner-chosen fictional character appearance (hairstyle, outfit, skin/hair/clothing palette choices and glasses). Local appearance stays private until explicit publishing, follows the same activity grant and revocation boundaries as names/areas, and is never included for presence-only visitors. Store styles separately from activity heartbeats; legacy name/area writes preserve styles. No arbitrary URLs/assets or work information are accepted as appearance. This is browser-scoped customization, not modification of actual agent identities or T3 thread names.

## Animated elevator transition (2026-10-29)

The user approved a short cutaway building transition: camera pullback, cabin doors closing, movement with a changing directory-floor indicator, arrival doors opening and camera entry into the destination office. Approximately 2.1 seconds of animation plus genuine network/renderer preparation. Skip and reduced motion bypass motion, while destination readiness and authorization remain mandatory. Main office rendering and HUD remain the default home.

The artwork uses only the authorized floor directory, capped at six illustrated rows while retaining the trip endpoints. These are stylized furniture thumbnails, not live video or exact office layouts. Presence-only rows show no interior furniture/agents; inaccessible floors are omitted. Access is revalidated after moving and again by the shared source. Failed trips clear artwork and let the user return. Arrival continuity stores only same-page path, timestamp and motion choice in session storage, never office contents, names or credentials. History restoration cancels old travel; long loading offers an escape. The simulated-building banner uses the same travel flow.

## Persistent whole-building UI (2026-10-29)

The user clarified that the primary building experience is a persistent interactive place to navigate, beyond a travel animation. Add an optional full-screen Three.js cutaway building reached by a prominent Building view button, the friends menu or ?building=1. Click actual floor geometry, labels or the directory to focus an office; focus isolates that floor, exposes permitted metadata and offers Enter. Whole building restores the stack, and Back closes it while preserving the original own-office scene. Original home remains available without an account.

Use one overview renderer for every visible floor and pause the underlying office render loop while it is open. Dispose its GPU context/resources on close. The personal building contains only owned/granted floors; presence-only rooms are opaque and expose no furniture or activity. API failure clears stale scenes/details, logout falls back to the local own-floor view, and entry reuses revalidated travel. These are stylized previews from consented metadata, not live office video or exact copies. Very tall directories show 24 modelled floors at a time; the complete directory can focus any authorized floor. New demo route /preview/building opens this view directly in the isolated simulation.
