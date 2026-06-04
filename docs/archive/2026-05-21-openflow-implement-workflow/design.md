# OpenFlow Implement Workflow - Design

## Human Consensus Summary

Feature title: OpenFlow Implement Workflow
Internal slug: openflow-implement-workflow
Source intent: Introduce `/openflow-implement` as OpenFlow's explicit implementation-stage entrypoint.
Problem or improvement target: The current OpenFlow lifecycle jumps from `openflow-writing-plan` to omo `/start-work`, so the implementation stage has no first-class OpenFlow command or state boundary.
Expected result: OpenFlow can mark a feature as entering implementation, prepare an isolated worktree execution context when appropriate, and directly start implementation through the available execution backend: wrapped omo `/start-work` when omo is installed, or native OpenCode build execution when omo is absent.

## Identity And Assumptions

- Feature slug: openflow-implement-workflow
- Feature title: OpenFlow Implement Workflow
- Scope type: workflow
- Assumptions:
- `openflow-writing-plan` / Prometheus remain responsible for plan quality, plan size, and deep plan review.
- When omo is installed, `/openflow-implement` wraps and starts omo `/start-work`; OpenFlow does not duplicate omo's runner or internal boulder state machine.
- When omo is not installed, `/openflow-implement` uses OpenCode native build execution directly; omo remains optional.
- `openflow-quality-gate` already exists as the post-implementation readiness authority.

## Overview

`/openflow-implement` should represent the OpenFlow implementation phase boundary. Its job is not to re-check the plan or reimplement a runner. Its job is to declare and persist implementation context, prepare an isolated worktree when appropriate, and start the selected execution backend.

The command should make the OpenFlow lifecycle read naturally:

```text
/openflow-feature
→ /openflow-writing-plan
→ /openflow-implement
→ implementation backend (omo /start-work or OpenCode native build)
→ openflow-quality-gate
→ /openflow-archive
```

## Problem

OpenFlow currently has design, planning, quality-gate, and archive phases, but implementation is represented by an external omo command. This creates several workflow gaps:

- implementation state is implicit rather than a first-class OpenFlow state;
- worktree isolation is not owned by OpenFlow, even though it belongs to execution context rather than plan quality;
- future project orchestration cannot use a stable OpenFlow node protocol for "implement this feature";
- quality-gate can be invoked, but it does not yet have a first-class implementation context to resolve worktree/session information from.

## Goals

- Add a clear OpenFlow implementation-stage entrypoint: `/openflow-implement <feature>`.
- Keep plan validation in `openflow-writing-plan` / Prometheus; do not duplicate preflight checks in implement.
- Start actual task execution through the selected execution backend; do not reimplement omo `/start-work` internals.
- Allow `/openflow-implement` to create or select an implementation worktree to isolate coding from other sessions.
- Persist implementation context so later lifecycle steps can resolve feature, engine, worktree, branch, and session without asking the user to pass low-level parameters.
- Prepare a stable node protocol for future Project Orchestrator / feature DAG execution.
- Support both omo-installed and omo-missing environments with explicit execution-backend status.

## Non-Goals

- Do not build a second task runner.
- Do not import or depend on omo internal start-work implementation details.
- Do not perform plan-size, task-quality, or deep plan review checks in `/openflow-implement`.
- Do not require users to manually pass worktree paths to `openflow-quality-gate`.
- Do not promise automatic multi-feature orchestration in the first iteration.
- Do not fail the whole workflow merely because omo is absent; no-omo environments must execute through OpenCode native build.

## Proposed Workflow

```text
User runs:
  /openflow-implement dark-mode

OpenFlow:
  1. resolves the feature;
  2. creates or selects an implementation worktree;
  3. records implementation state;
  4. resolves execution backend:
     - omo installed: wraps and starts omo /start-work with the recorded worktree context;
     - omo missing: starts OpenCode native build execution with the same implementation context;
  5. relies on existing quality-gate flow for readiness after backend execution.
```

The user should not need to understand or pass the worktree path after this point. The worktree path becomes OpenFlow implementation state.

## Implementation State Concept

OpenFlow should persist an implementation context similar to:

```json
{
  "feature": "dark-mode",
  "phase": "implementation_active",
  "engine": "omo-start-work",
  "engineStatus": "available",
  "status": "running",
  "worktree": ".worktrees/dark-mode",
  "worktreeKind": "derived",
  "branch": "openflow/dark-mode",
  "planPath": ".sisyphus/plans/dark-mode.md",
  "startCommand": "/start-work dark-mode --worktree .worktrees/dark-mode",
  "commitPolicy": "archive",
  "commitHash": null,
  "eventsPath": ".sisyphus/openflow/implementation/dark-mode/events.jsonl",
  "observationsPath": ".sisyphus/openflow/implementation/dark-mode/observations.md",
  "startedAt": "..."
}
```

Later commands such as `openflow-quality-gate`, archive, status, and future orchestrator logic should resolve implementation context from this state rather than from user-provided worktree arguments.

## Behavior Alignment

| Behavior Scenario | Design Response | Risk |
|------------------|-----------------|------|
| User wants to enter implementation after planning | `/openflow-implement` marks implementation active and prepares execution context | Medium |
| User has other active sessions or dirty main worktree | implementation can happen in an isolated worktree | Medium |
| omo is installed | command wraps and starts `/start-work` without replacing omo internals | Medium |
| User has not installed omo | command starts OpenCode native build execution instead of failing | Medium |
| quality-gate runs after implementation | quality-gate resolves feature/worktree from implementation state instead of user parameters | Medium |

## Design Constraints

- Implementation setup must not duplicate `writing-plan` / Prometheus plan validation.
- OpenFlow must not depend on omo private APIs for `/start-work`.
- Worktree handling must be an internal execution context detail, not a required user-facing argument for later commands.
- The first version should be compatible with current manual `/start-work` usage.
- The first version must also be compatible with users who do not install omo.

## Hard Constraints And Invariants

These constraints are implementation-blocking. A plan or implementation that violates them is out of scope.

### Responsibility Boundaries

- `/openflow-implement` MUST NOT evaluate whether the plan is too large, sufficiently decomposed, or deeply reviewed. That responsibility belongs to `openflow-writing-plan` and Prometheus.
- `/openflow-implement` MUST NOT parse and execute plan tasks itself. It must start a supported execution backend.
- `/openflow-implement` MUST NOT import omo private start-work internals or depend on omo's internal hook implementation.
- `/openflow-implement` MAY construct the omo `/start-work` invocation, but with omo installed it should execute/wrap that backend rather than merely tell the user to run it.
- `/openflow-implement` MUST treat omo as an optional execution backend, not a hard dependency.

### Execution Backend Policy

- `/openflow-implement` must resolve one implementation backend before marking implementation active.
- Supported backend states:
  - `omo-start-work`: omo is available; OpenFlow wraps and starts `/start-work` with the recorded implementation context.
  - `opencode-build`: omo is absent; OpenFlow starts OpenCode native build execution with the recorded implementation context.
- Backend resolution must be explicit in implementation state. It must not be inferred later from vague chat history.
- If omo is absent, OpenFlow must not output `/start-work` as the required next step and must use `opencode-build` instead.
- If the selected backend cannot be resolved, `/openflow-implement` must stop as `blocked` with a clear reason.

### Worktree Policy

- Implementation worktree selection belongs to `/openflow-implement`, not to `openflow-writing-plan`.
- The default strategy SHOULD be isolated worktree execution for non-trivial implementation work, because it prevents unrelated sessions or dirty main-worktree changes from contaminating the feature implementation.
- A current-worktree mode MAY exist, but it must be explicit and recorded in implementation state.
- If worktree creation fails, `/openflow-implement` must stop with a clear blocked reason. It must not silently fall back to the main worktree.
- Worktree paths must not become required user-facing arguments for later lifecycle commands.

### Commit And Archive Policy

- `/openflow-implement` must not commit at implementation start.
- Backend completion must not commit by itself.
- `openflow-quality-gate` readiness must not commit by itself. Quality-gate readiness means the implementation may proceed toward archive, not that the feature is frozen in git history.
- Commit is an archive-stage responsibility.
- Implementation state must record `commitPolicy: "archive"` when changes are produced in an implementation worktree.
- Implementation state must distinguish at least:
  - `worktreeKind: "main"`: implementation happened in the main worktree/current workspace.
  - `worktreeKind: "derived"`: implementation happened in a feature-specific derived worktree.
- During archive, OpenFlow must inspect implementation state. If `worktreeKind` is `derived`, archive must create the feature commit from that derived worktree/branch after archive artifacts are produced.
- Archive must record the resulting commit hash in implementation state and append an implementation event such as `archive_commit_created`.
- Archive must not treat a derived-worktree implementation as complete if no commit was created or recorded, unless the user explicitly cancels/defers commit and archive reports that state.
- If a derived worktree contains out-of-scope changes at archive time, archive must stop rather than commit unrelated work.
- Main-worktree implementations may follow the existing archive behavior, but commit status must still be observable if archive creates a commit.

### Worktree Lifecycle Policy

- Worktree creation must be deterministic and traceable: feature slug, branch name, worktree path, base ref, and creation timestamp must be recorded.
- The implementation worktree must have a single owning feature. A worktree must not be reused for a different feature unless the prior implementation state is completed, cancelled, or explicitly reset.
- If a worktree already exists for the feature, `/openflow-implement` must resolve whether it is resumable, stale, blocked, or conflicting. It must not overwrite or delete it silently.
- Main worktree cleanliness must be observed and recorded before creating an implementation worktree. Dirty main worktree does not necessarily block isolated implementation, but it must be visible in implementation observations.
- Worktree cleanup is not automatic at implementation start or quality-gate completion. Cleanup policy must be explicit: retain for review, cleanup after archive, or cleanup by user command.
- Worktree merge/reconcile is out of scope for the first implementation command unless explicitly designed later; readiness in a feature worktree must not be confused with merged-main readiness.

### Implementation State Ownership

- `/openflow-implement` MUST persist implementation state before starting the selected backend.
- Implementation state is the source of truth for feature, execution engine, worktree, branch, plan path, start command, and session binding.
- Later lifecycle commands must resolve feature/worktree context from implementation state first, then fall back to legacy context detection only when no implementation state exists.
- If multiple active implementation states match the current context, OpenFlow must ask the user to choose; it must not guess.
- Implementation state must include a machine-readable status. Allowed initial lifecycle states are: `prepared`, `running`, `blocked`, `completed`, `quality_gate_pending`, `verified`, `failed`, `cancelled`.
- State transitions must be append-only recorded as events. The latest state can be overwritten in the state file, but the event history must preserve how it got there.

### Observation And Audit Policy

- `/openflow-implement` must create an implementation observation record before starting the backend.
- The observation record must capture at least: feature, backend, worktree, branch, plan path, start command, session ID when available, base ref, main worktree dirty summary, and selected fallback/engine reason.
- Execution-related transitions must append structured events to an implementation event log, such as:
  - `implementation_prepared`
  - `backend_started`
  - `backend_completed`
  - `backend_failed`
  - `completion_detected`
  - `quality_gate_started`
  - `quality_gate_completed`
  - `implementation_blocked`
  - `implementation_cancelled`
- The event log must be machine-readable, preferably JSONL, so future status/orchestrator logic can consume it without parsing chat history.
- A human-readable observations summary should exist for review and handoff. It must not be the only source of truth.
- OpenFlow must not infer implementation completion solely from natural-language chat. Completion phrases may trigger checks, but final state must be backed by recorded backend/quality-gate events.

### Quality-Gate Context Resolution

- `openflow-quality-gate` user/API surface should remain simple. Users should not be required to pass worktree paths manually.
- When implementation state exists, quality-gate must resolve the execution root from that state.
- Quality-gate readiness produced from an implementation worktree must be associated with the owning feature and implementation state.
- Archive readiness must not rely on an unrelated worktree or stale implementation state.
- Quality-gate invocation and result must be appended to the implementation event log.
- If quality-gate runs against a different root than the recorded implementation worktree, the result must be treated as mismatched unless an explicit override is recorded.

### Failure And Recovery

- If `/start-work` is not available but OpenCode native build is available, `/openflow-implement` must proceed with `opencode-build` and must record that backend.
- If no execution backend is available, `/openflow-implement` must report an explicit unsupported-engine condition instead of pretending implementation started.
- If implementation setup is interrupted after state creation but before backend execution starts, the state must be recoverable or clearly cancellable.
- Failed implementation setup must not mark the feature as verified, ready, or archiveable.
- Backend failure must update implementation state to `blocked` or `failed` with a reason code. It must not remain indefinitely `running` without an observation.
- Resume behavior must be explicit: resuming should use the recorded worktree/backend/context, not re-resolve from scratch unless the recorded context is invalid.
- Cancellation must preserve observations and event history; it may stop future lifecycle progression but must not delete audit records silently.
- Archive-time commit failure must leave implementation state in a recoverable blocked state. It must not mark the feature archived without a recorded commit when the implementation came from a derived worktree.

## Success Criteria

- [ ] A meaningful `/openflow-implement <feature>` workflow is defined as the implementation phase boundary.
- [ ] Implementation state records feature, engine, worktree, branch, and start command.
- [ ] Users are not required to manually pass worktree paths to quality-gate.
- [ ] The design preserves existing responsibilities: writing-plan validates plans, omo executes, quality-gate verifies.
- [ ] The workflow can serve as a future Project Orchestrator node protocol.
- [ ] Implement setup failure is represented as blocked/cancellable state, not as a partial success.
- [ ] Current-worktree execution, if supported, is explicit and recorded rather than implicit fallback.
- [ ] quality-gate resolves implementation worktree from state before using legacy workspace inference.
- [ ] Users without omo execute through OpenCode native build rather than receiving a broken `/start-work` instruction.
- [ ] Implementation state records the selected backend and whether omo was available.
- [ ] Worktree lifecycle records path, branch, base ref, ownership, and cleanup policy.
- [ ] Implementation events are appended to a machine-readable event log.
- [ ] A human-readable observations summary is generated for review/handoff.
- [ ] Completion is not inferred solely from chat phrases; it is backed by backend and quality-gate events.
- [ ] Derived worktree implementations are committed during archive, after archive artifacts are produced.
- [ ] Archive records the commit hash in implementation state and implementation events.
- [ ] Archive blocks rather than silently succeeding when a derived worktree cannot be committed.

## Risks And Mitigations

- Risk: `/openflow-implement` becomes a duplicate runner.
  - Mitigation: start supported backends but do not reimplement their internal task execution logic.
- Risk: worktree state diverges from main OpenFlow state.
  - Mitigation: persist implementation context in a shared OpenFlow state location.
- Risk: users are exposed to too many worktree details.
  - Mitigation: keep worktree paths internal after implement setup.
- Risk: `/openflow-implement` becomes unusable without omo.
  - Mitigation: model omo as an optional backend and use OpenCode native build as fallback.
- Risk: worktree execution becomes invisible after handoff to backend.
  - Mitigation: require implementation state, JSONL events, and human-readable observations before backend start.
- Risk: quality-gate verifies the wrong directory.
  - Mitigation: resolve execution root from implementation state and treat mismatched roots as invalid unless explicitly overridden.
- Risk: derived worktree code and archive artifacts become separated across untracked or uncommitted states.
  - Mitigation: archive owns commit creation for derived worktree implementations and records the commit hash.

## Testing Strategy

- Unit-test implementation context resolution and state persistence.
- Test that `/openflow-implement` does not run plan preflight logic.
- Test that quality-gate can resolve implementation context without a user-supplied worktree argument.
- Test no-omo behavior: implementation state is recorded with `opencode-build` backend and execution is started without requiring `/start-work`.
- Test worktree lifecycle recording: path, branch, base ref, and ownership are persisted before backend start.
- Test event logging: backend start/failure/completion and quality-gate result append structured events.
- Test completion guard: chat completion phrases do not mark implementation verified without quality-gate readiness event.
- Test archive commit policy: derived worktree implementations are committed only during archive and the commit hash is recorded.
- Test archive blocking: derived worktree archive fails safely when commit cannot be created or includes out-of-scope changes.
