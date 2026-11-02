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
- Opt-in human profiles, admitted office conversations, text chat and synchronized main-office walking; see OFF-019 for verification and local-runtime limits.

Not implemented: a walkable exterior/city, remote agent control, account recovery, managed hosting, production TLS/proxy configuration or operational monitoring. Real private T3 data has not been used for development verification.

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

The current actionable queue and cross-harness handoff are at the top of [tasks](tasks.md); use that record for ownership/status rather than historical “next” notes in completed handoffs. OFF-024 input isolation is locally verified and the user confirmed it works. Cloudflare account preparation and GitHub OAuth registration instructions were supplied, but neither registration is confirmed. OFF-025 covers the future cloud adapter; OFF-026 covers secure live-provider configuration and a real OAuth trial. Public deployment remains unauthorized.

The user plans to add a Claude subscription to collaborate alongside GPT Sol. This is a preference/intention, not confirmed provider availability. Share canonical repository records, claim ownership before work, and avoid simultaneous edits to the same files. CLAUDE.md already points to AGENTS.md; automatic instruction discovery and actual Claude authentication remain unverified.

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

User requested direct character selection rather than menu-based renaming. Clicking an owned coworker opens the existing side sheet on Customize; the menu's character picker routes to the same editor. Keep overview/transcript tabs. Names, work areas and bounded appearance choices persist in the existing local profile key and apply to the live character without restarting the office. Following the 2026-10-30 user request, successful Save character closes the sidebar, confirms the change and returns the camera to the full office overview; validation/storage failures do not trigger that return. Preserve position, scale, backpack state and shared materials when replacing geometry. Unsaved input survives periodic inspector refreshes; office shortcuts ignore active form fields. Visitors have no customization editor for host characters.

The sharing contract now optionally includes validated, owner-chosen fictional character appearance (hairstyle, outfit, skin/hair/clothing palette choices and glasses). Local appearance stays private until explicit publishing, follows the same activity grant and revocation boundaries as names/areas, and is never included for presence-only visitors. Store styles separately from activity heartbeats; legacy name/area writes preserve styles. No arbitrary URLs/assets or work information are accepted as appearance. This is browser-scoped customization, not modification of actual agent identities or T3 thread names.

## Animated elevator transition (2026-10-29)

The user approved a short cutaway building transition: camera pullback, cabin doors closing, movement with a changing directory-floor indicator, arrival doors opening and camera entry into the destination office. Approximately 2.1 seconds of animation plus genuine network/renderer preparation. Skip and reduced motion bypass motion, while destination readiness and authorization remain mandatory. Main office rendering and HUD remain the default home.

The artwork uses only the authorized floor directory, capped at six illustrated rows while retaining the trip endpoints. These are stylized furniture thumbnails, not live video or exact office layouts. Presence-only rows show no interior furniture/agents; inaccessible floors are omitted. Access is revalidated after moving and again by the shared source. Failed trips clear artwork and let the user return. Arrival continuity stores only same-page path, timestamp and motion choice in session storage, never office contents, names or credentials. History restoration cancels old travel; long loading offers an escape. The simulated-building banner uses the same travel flow.

## Persistent whole-building UI (2026-10-29)

The user clarified that the primary building experience is a persistent interactive place to navigate, beyond a travel animation. Add an optional full-screen Three.js cutaway building reached by a prominent Building view button, the friends menu or ?building=1. Click actual floor geometry, labels or the directory to focus an office; focus isolates that floor, exposes permitted metadata and offers Enter. Whole building restores the stack, and Back closes it while preserving the original own-office scene. Original home remains available without an account.

Use one overview renderer for every visible floor and pause the underlying office render loop while it is open. Dispose its GPU context/resources on close. The personal building contains only owned/granted floors; presence-only rooms are opaque and expose no furniture or activity. API failure clears stale scenes/details, logout falls back to the local own-floor view, and entry reuses revalidated travel. These are stylized previews from consented metadata, not live office video or exact copies. Very tall directories show 24 modelled floors at a time; the complete directory can focus any authorized floor. New demo route /preview/building opens this view directly in the isolated simulation.

## Original environment preserved in building mode (2026-10-30)

The user rejected the separate dashboard-style building window. This supersedes the separate renderer/layout described in the initial whole-building implementation. Building mode now temporarily reuses the original #scene canvas and PixelPipeline, with the original HUD elements moved into the scene overlay and restored unchanged on close. The main office geometry stays resident; its render/update loop pauses while its environment, clock and source updates continue. Shared day/night background, sun/hemi lighting and pixel postprocessing match the office. The building uses upstream toon materials, floor/wall textures and character models with themed room lamps/shadows.

Replace the full-width header and permanent sidebar with compact paper controls styled from the original HUD variables. The floor inspector/directory appears only when selected/opened; private own-office finance and world tags are hidden in building mode. Original music/clock controls remain. Entry from building mode animates the actual scene behind the same themed travel controls, instead of switching to a second illustrated building window. No permission/data-contract changes; presence volumes stay opaque and snapshots remain consented metadata. Standalone test harnesses use the same pixel pipeline in a disposable fallback; the actual app allocates no additional WebGL renderer.

## Shared focus, owner moments and guided tour (2026-10-30)

The user approved improvements 1–3 from the bounded app review, with a maximum 45-minute implementation iteration: shared focus, owner-approved milestones and a playable first tour. HQ owns integration; bounded native workers supplied the social API/UI and synthetic browser test. The UI/test workers hit their provider usage limit after writing their files; HQ completed and verified the remaining work directly. No provider failover or extra paid route was used.

New explicit sharing contract:
- A signed-in owner can host a 25/50-minute focus session. Only the host and people currently granted access to that office can see/join it. Starting/joining explicitly shares the participant's display name and quiet preference with the host and joined peers. A nonjoined invited person sees only the host, office, timing and participant count; names of other participants require joining. This is a separate voluntary social feature; presence-only grants still reveal no agent activity, character/room detail or milestones.
- One active session membership per person; up to 24 people per session. End/expiry removes the session; leaving removes only the participant. Revocation removes membership and regrant does not silently restore it. Sessions persist until their server-timed end, independently of whether a browser tab is open. The countdown is a commitment timer, not proof of a person's live presence. A small badge revalidates active membership while the dialog is closed and after navigation. Quiet mode suppresses the local, dismissible halfway check-in; no audio or external notifications.
- Moments are manual owner publications with an allowlisted kind, up to 80 characters of chosen title, owner/office display names and date. They require a local preview and a separate publish click. Only owners and current activity-granted guests receive them; presence guests and publisher keys cannot. Nothing is inferred from agents, transcripts, costs or verification commands. “Shipped” is owner-entered, not a claim of independently verified work. The authorized building view shows the latest chosen moment and a warm celebration lantern; a fresh publication gives one gentle light swell, with no motion in reduced-motion mode. Presence-only floors receive neither the moment nor lantern. Owners can delete moments; visibility is seven days (expired entries are pruned on subsequent social requests) and at most 20 per office/feed.
- Owners can preview/download a 1200×630 PNG containing only the selected moment title, kind, owner display name and date. This uses a new safe canvas, never a screenshot of the office or private HUD. Export does not upload or publicly host anything. Previously disclosed/downloaded information cannot be recalled.
- Focus and moments are independent of browser agent publishing/pause. End a session, delete a moment or revoke the underlying grant to remove the corresponding access. Stopping agent activity alone does not unpublish chosen moments.
- Social mutations carry a UI actor precondition, checked after reading the request body, to prevent a draft/action being transferred to a newly signed-in account. Social responses identify their viewer so account checks cannot accidentally combine different accounts' results.

Historical OFF-017 tour (replaced by OFF-021 below): original office → authorized building/floor → friend visit → focus → moment preview → home. It does not create grants, join a session, publish a moment or start activity sharing on its own. Replay/Skip and reduced motion are supported; transient tour state expires after ten minutes. `npm run demo:friends` exposes `/preview/tour` with disposable synthetic accounts, reciprocal demo grants, Maya's focus session and one clearly simulated moment. Automatic demo sign-in remains confined to that loopback-only disposable launcher, never the normal service. The tour is designed as a short first visit; its duration remains user-paced, not a timed promise.

## Personal floors and polite doorbell (2026-10-30)

User approved improvements 4 and 5. Personal floor identity extends the existing allowlisted appearance with one accent (Original/Sage/Amber/Rose/Sky), one emblem (None/Leaf/Star/Moon), and West/Center/East raised shelves containing Empty/Plant/Books/Lamp. No arbitrary coordinates, URLs, uploads or free-text assets are accepted. The existing office name remains the floor name. Defaults add no visible decor. Choices render with the original toon materials in the actual office and cutaway; shelves are above walking space and do not change desk capacity or paths. Local preferences remain local until explicit style save with an account or activity publication; only owner/activity guests receive saved identity. Presence floors remain opaque. Unknown appearance metadata is stripped before persistence; invalid identity values are rejected.

The doorbell is a separate voluntary way to join a focus session, disabled by default. A host enables it from Friends → Doorbell. While enabled, new invited participants must ring and be accepted; direct joins cannot bypass approval. Do Not Disturb blocks new focus participants and rings, even if ringing itself is disabled, and declines pending requests. Existing members stay. With both ringing and DND off, the original explicit direct-join behavior remains.

A ring sends only the requester's chosen account name, quiet preference, target session and expiry. Its explicit action consents to focus membership if the host accepts; acceptance adds membership only, never an office grant or wider activity scope. Only host/requester can read their request records. Requests expire after two minutes, permit at most 12 pending requests per session, and have a one-minute requester/host cooldown that cancellation cannot reset. The cooldown table is pruned after a day. Host End session, expiry and revocation invalidate requests; every mutation rechecks current session/permission after reading its body and supports actor identity preconditions. Publisher keys cannot use doorbell routes. Declines do not create membership; dismissing an accepted receipt does not leave focus (use Leave session).

Doorbell status polling runs while its dialog is open, the owner opted in, or a request receipt remains; a small optional badge contains only a count/status. Host notifications have no audio, third-party messages or live visitor tracking. Account changes and request failures clear displayed details. State persists in the building's SQLite database; transient browser hints contain no credentials or work content. Human avatars/chat were added separately in OFF-019 below; public hosting remains out of scope.

## Human identity, conversation rooms and walking visits (2026-10-30)

User approved stages 1–3 of the social-building plan, bounded to one hour. Human profiles are separate from agent characters and local T3 thread identity: chosen name, fixed clothing colors, hairstyle and manual availability. Only the account owner may edit them. Colored rings and PERSON/YOU labels distinguish humans in the original Three.js scene. No GitHub identity assurance is claimed; GitHub linking, internet hosting, voice and public publishing are later stages.

Conversation rooms are separate explicit permissions. An owner opens an office for visits; a currently invited friend asks to enter, the host admits/declines, and the guest explicitly enters. Neither an activity/presence grant nor a focus-doorbell acceptance implies human chat access. Requests reveal only the chosen human name to the host and expire in two minutes with a one-minute cooldown. Up to twelve admitted guests may be retained per office. Do Not Disturb prevents new requests/admissions and absent guests from re-entering; currently present participants may stay. Existing admission records remain. Closing conversations removes guest admissions/presence. Removing a visitor or revoking their grant removes admission, pending requests and live presence. Regranting does not restore it. Owner controls can be used without joining their own room.

Entering explicitly shares chosen human profile, availability, main-office coordinates and manually written room messages with admitted current participants. Profile editing alone stays private. One active room lease per account lasts twenty seconds between heartbeats; a new tab takes over and stale tabs cannot move/leave the new lease. Leave, logout, expiry, permission removal and connection failure clear local human/chat views. Client refreshes human state about every 750ms and heartbeats about every 1–1.5 seconds while active; observed revocation is per read, not instantaneous recall. No participant names/messages are disclosed to unadmitted or absent users.

Messages use plaintext local SQLite storage, not E2E encryption. The server accepts max500 characters, enforces 1/second and20/minute, keeps at most200 messages/room and returns last100 after a guest's admission sequence boundary. Seven-day messages/receipts are pruned on room requests. A monotonic sequence prevents pre-admission history leaking at identical timestamps. Stable client IDs and separate receipts make retries idempotent even after moderation deletes a message; insertion/receipt updates commit together. Authors and hosts may delete messages; previously seen copies cannot be recalled. No attachments, direct messages, audio or automated agent information are included.

Avatars use original character/material assets and an optional walk mode. Tap open floor or use arrow keys; the existing NavGrid chooses local paths and rejects blocked next steps. The server bounds coordinates and speed within the main office; it does not run authoritative 3D collision physics. Other avatars interpolate the shared positions. Scene movement grants no data access. Activity-only appearance remains protected: presence-only human visitors see a generic room shell, not host customization or agent activity. The original office/HUD, agents, building, camera pan and other features remain available; enabling walk mode temporarily consumes floor clicks.

The disposable `/preview/people` route explicitly simulates Maya as a human: it opens only her synthetic room, admits demo requests and sends a labeled scripted greeting. No actual third party or provider is contacted. Tests use only synthetic accounts, messages and activity. New-room storage/routes live in server/humans.ts so a later hosting adapter can preserve the same contract; the current Node SQLite service is not a drop-in Cloudflare deployment.

## Simpler social navigation (2026-11-02)

After the user confirmed the two-account trial worked, OFF-020 consolidates presence-only invitation creation/acceptance and visits into People & chat → Friends. Open & join my office explicitly opens the room and enters as its owner; guests still request, receive admission and enter. The combined action displays the sharing explanation and expandable full privacy terms. Advanced activity-sharing invitations, revocation and account controls remain available in Account & office settings. Visit settings, participant moderation, optional social tools and demo shortcuts use native expandable sections. Backend authorization, grants, admission, retention and original-office defaults are unchanged.

## First-time onboarding (2026-11-02)

OFF-021 replaces the focus/milestone-led primary tour with the actual first-friend journey: welcome, optional coworker customization, invitation, admitted visit, walking/chat and privacy controls. A small dismissible first-visit prompt leaves the original office usable without an account. Guide progress uses a new browser session key (step, timestamp and pause flag only), resumes across navigation and can be skipped or replayed. It never mutates access or publishes on the user's behalf. The guide moves into the Friends panel and becomes compact while the user acts. Local registration/login and pending invitation acceptance are now native to that panel; errors do not silently accept invitations. Account/office settings revalidate their session when opened after native registration. Closed human rooms still allow an explicitly granted read-only office visit; that never enters the human conversation.

The normal first-visit command is npm run dev, which leaves private T3 endpoints disabled and keeps local accounts across restarts. The optional npm run local companion remains available for explicit private local agent access. Disposable demo accounts still reset when that separate simulation stops.

OFF-022 prepares a Web Crypto/Fetch GitHub protocol adapter and source-backed cloud migration brief in [identity-cloud.md](identity-cloud.md). The protocol foundation was initially unconnected; OFF-023 below adds gated local account/session integration. No live provider is configured. Public deployment and OAuth application activation remain separate from this bounded local work.

## Gated local GitHub integration (2026-11-02, OFF-023)

The OFF-022 protocol foundation is now connected to optional HTTP routes, a stable external-identity table and a native configured-provider sign-in/confirmation interface. The normal service has no injected broker, so GitHub remains unavailable by default. Callback only stages public identity; explicit confirmation rechecks current account state before transactional user/office mapping and session issuance. Existing local accounts are never linked or merged by username/email. Local sign-in/out invalidates unfinished provider proof. All tests use fake provider transport and intercepted browser redirects; real credentials, authorization and deployment remain outside this completed local slice. See identity-cloud.md for current endpoints, cookie/origin limits and activation gates.
