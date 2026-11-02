# Project working instructions

These rules apply to HQ, specialist and execution conversations, reviewers, manually started agents, and delegated agents in every harness. Read this file explicitly if your harness does not load it automatically. User instructions and higher-priority harness rules take precedence.

## Start with relevant context

1. Identify your role, task and repository. Read [project context](docs/project.md) and the relevant record in [tasks](docs/tasks.md); load additional context only as needed.
2. Inspect Git status, branch/worktree and relevant implementation. Preserve existing and uncommitted work. Read package.json for current build and verification commands.
3. Check ownership and dependencies before claiming work. Establish scope, acceptance criteria and verification. Avoid duplicating assigned or completed work.
4. On a fresh session or provider handoff, confirm active instruction sources and explicitly read this file plus CLAUDE.md where applicable. Never assume chat/session import or that compaction preserves accessible history.
5. Report consequential unresolved decisions or conflicts between records and code; do not silently replace approved decisions.

## Execute and coordinate

- Stay within approved scope. Preserve others' changes and coordinate overlapping files. Routine local decisions do not require HQ approval.
- Preserve the original full-screen own office and HUD as the home screen. Friends, invitations, floor visits and customization are optional in-office menu features, not a replacement dashboard or mandatory account flow.
- HQ combines product priorities, architecture coordination, ownership and integration oversight. It may handle small tasks directly. Prefer focused execution conversations or agents for substantial bounded work when the benefit exceeds coordination cost.
- The user authorizes HQ to select models and settings for approved tasks, balancing capability, latency, cost and independent review. Use available providers and respect runtime limits. If a requested provider/model is unavailable, report it rather than silently substituting. Recheck capabilities when needed; do not hard-code a model roster here.
- A task approval allows useful delegation within its scope, not unrelated future work. Include role, objective, scope, relevant context, critical constraints, dependencies, acceptance criteria, verification, workspace ownership and handoff destination explicitly; children may receive no parent history.
- Check task ownership before delegation. Use native agents for compatible same-provider work that finishes within the turn. Use T3 delegation for isolated worktrees, background work or required provider/settings; follow harness routing rules. Top-level conversations are distinct from child tasks.
- Begin with one execution task. Use two or three concurrent tasks only when dependencies, file ownership, integration effort and review capacity justify it. Use isolated worktrees for concurrent edits when appropriate. Shared services, ports, databases and credentials still need coordination.
- Follow tool continuation instructions and completion notifications; do not poll a running T3 delegate. Cancel work no longer needed. A fresh delegated review/re-check is a new task, not a message restarting the old review.
- Top-level thread creation requires an explicit user request under the current T3 harness; permission to delegate does not imply permission to create one. Do not create organizational threads or launch feature work during a configuration-only update. Before retrying a failed orchestration mutation, inspect whether it already succeeded to prevent duplicate work.
- Create no permanent specialist conversation without a recurring need. Keep temporary conversations focused; finish/archive after verification and handoff. Reuse for same-scope corrections. Replace stale context with a concise durable handoff.

## Authorization boundaries

- The user has delegated project leadership and routine product/architecture/security implementation decisions to HQ and asked it to proceed without approval pauses. Decide and record those choices within the collaborative-office objective. This supersedes the earlier per-task approval gates. Purchases, public production deployment, third-party contact, private-data exposure and destructive operations remain outside routine implementation authority.
- Preserve prior-consent access as a product requirement. Never expose an existing local T3 data endpoint to implement collaboration. Use the minimal sharing contract in docs/project.md.
- Do not read actual private T3 databases, prompts, provider credentials or transcripts merely to develop or test. Use synthetic data unless the user explicitly authorizes the specific real-data use. Handle needed secrets through supported secret tools, never chat or committed files.
- Separate proposed designs from approved decisions, and runtime capability from authorization.

## Adaptive routing and bounded execution

- Apply the updated APOS policy through these instructions and [operating details](docs/project.md#adaptive-apos-operation); reuse existing records rather than restarting setup or adding trackers. Preserve established routine HQ autonomy above. INTERACTIVE remains the default; that autonomy does not activate an unattended Ralph Loop.
- Discover actual provider instances, model IDs, supported effort/options, tools and runtime restrictions before routing; refresh after provider changes, rejection or material staleness, not every trivial edit. Evaluate model + effort + tools + authentication route jointly. Prefer the least resource-intensive reliable configuration; no permanent vendor ranking, routine high/max effort or speculative repeated switching. Record significant choices and observed outcomes, not invented prices/benchmarks.
- Use only eligible, authorized providers/settings. A catalog entry does not prove authentication or subscription entitlement. Confirm subscription versus API/extra-usage billing through supported status/configuration without reading secret values. Unknown billing blocks new provider-specific delegation/switching or unattended work until resolved; the current bounded configuration update does not expand spending authority. No silent paid fallback, new data destination, account rotation or quota evasion.
- Keep Codex and Claude allowances separate. For autonomous sessions, validate applicable account/model five-hour, weekly and other quota windows, units, source/timestamp/freshness and reset before proposing/starting work, each task/delegation/switch and costly operation. Preserve at least20% of every reliably observable applicable allowance: do not start at/below the threshold or likely to cross it. Context usage and elapsed time are not subscription quota. Unknown/stale readings stay UNKNOWN; use only explicitly approved conservative fallback ceilings and checkpoints, never fabricated percentages or resets.
- Ralph Loop is opt-in and needs session-specific approval of objective/eligible backlog, maximum duration, iteration/retry/concurrency ceilings, workspace operations/review gates, authorized provider/model alternatives, usage/spend or fallback bounds, stop conditions and permission for additional Ready tasks. Recommend a proportionate time box if missing; never work merely to fill it or treat a roadmap/previous session as new approval.
- Before unattended claims, verify continuation, completion/result delivery, next-turn relaunch, cancellation, elapsed-time/deadline controls, quota/budget visibility and recoverable state. Tool exposure alone is not a tested persistent runner. No new scheduler, external loop or automatic post-reset restart without approval; none is activated by this policy.
- For an approved session, repeat read current state → pick unowned dependency-ready scope → specify/route → implement → verify → record → continue only if authorized. Keep minimal session state in docs/tasks.md: approved limits/providers/billing route, start/deadline, owners, quota checks or UNKNOWN/fallbacks, completed/pending work, exact checks, blockers and next safe action. Default to at most two retries per failure mode unless the session sets a stricter/approved different limit.
- Stop at the earliest deadline, reserve/fallback/budget/retry/iteration ceiling, cancellation, exhausted eligible backlog, unsafe/conflicting state, approval/dependency blocker, or technical continuation failure. At a quota stop, schedule no further model work on that provider; perform only safe local cleanup and preserve a resumable handoff. Reroute only to a preauthorized alternative after checking its billing, quota and data boundary. Never guarantee a reserve when telemetry is delayed.

## Verify and hand off

- Run checks appropriate to the change and report actual commands/results. Never claim tests, integration or deployment that did not occur. Use meaningful behavioral tests for future permission boundaries, cross-user isolation and revocation.
- Update significant task records and material approved decisions. Keep trivial work lightweight. Record implementation, verification, integration and deployment separately.
- For substantial work, add a concise task handoff: task/objective; completed work; changed files/artifacts; branch/worktree; verification evidence; important decisions; limitations/blockers; remaining work; next action; integration/deployment status.
- Make results discoverable in docs/tasks.md, with links to commits/PRs or handoffs when available. HQ reviews the evidence before integration; a completed agent run alone is not completion.
- Review workflow usefulness after the first milestone or when friction appears; combine/remove redundant records and conversations instead of routinely adding process.

## Reusable entry points

HQ: "Act as Project HQ. Read AGENTS.md, project context and active tasks. Coordinate priorities, dependencies, approvals and verified outcomes. Delegate useful bounded work and handle small tasks directly. Start only approved work."

Task conversation or delegate brief:

```text
Role: [implementation / investigation / review]
Task: [ID and objective]
Scope: [included work and exclusions]
Context: AGENTS.md plus [relevant files]
Dependencies: [tasks or decisions]
Acceptance criteria: [observable outcomes]
Verification: [required checks]
Workspace ownership: [branch/worktree and affected areas]
Routing: [eligible provider/model/options if configurable; rationale and limits]
Authorization: [approved boundaries; session limits only if explicitly approved]
Check ownership and Git state before starting. Record results in
docs/tasks.md and return the handoff required by AGENTS.md.
```

Direct manual work follows the same protocol without routing every local change through HQ. Escalate only material shared decisions or ownership conflicts.
