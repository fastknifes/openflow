# OpenFlow Implement Workflow - Observable Behavior

## Human Consensus Summary

Feature title: OpenFlow Implement Workflow
Internal slug: openflow-implement-workflow
Source intent: Add a first-class OpenFlow implementation phase entrypoint that starts the available implementation backend without duplicating `writing-plan`, Prometheus, omo `/start-work`, or `openflow-quality-gate` responsibilities, while still supporting users who do not install omo.
Problem statement: OpenFlow needs an implementation-stage boundary that can prepare and record execution context, especially worktree isolation, while preserving existing execution and verification flows.

## User Context

**Problem statement:** Users need a clear OpenFlow command for entering implementation after planning. The command should own implementation context and worktree isolation, not plan validation or code execution.

## Trigger Rules

These conditions activate or require the feature behavior:

- A planned feature is ready to enter implementation.
- The user wants implementation to run in an isolated worktree to avoid interference from other sessions.
- Future orchestration needs a stable OpenFlow node protocol for implementing a feature.
- The user does or does not have omo installed; both cases should have an explicit implementation path.

## Non-Trigger Rules

These conditions do NOT activate the feature:

- The user is still designing requirements or writing the implementation plan.
- The user wants to review plan quality, split a large plan, or run deep Prometheus review.
- The user wants OpenFlow to replace omo `/start-work` as the task execution engine.

## User-Visible Scenarios

Each scenario describes what a user or external caller observes — not how the system produces it internally.

### Scenario: Enter implementation phase for a planned feature

**Given:**
- A feature has completed design and writing-plan phases.

**When:**
- The user invokes `/openflow-implement <feature>`.

**Then (observable outcome):**
- OpenFlow marks the feature as implementation active.
- OpenFlow records the execution engine and implementation context.
- OpenFlow starts the appropriate implementation backend.

### Scenario: Implementation uses an isolated worktree

**Given:**
- A feature should be implemented without interfering with the main worktree or other sessions.

**When:**
- `/openflow-implement <feature>` prepares implementation context.

**Then (observable outcome):**
- OpenFlow creates or selects a feature-specific worktree.
- The worktree path is recorded as implementation state.
- Later lifecycle steps can resolve the worktree without the user manually passing it.

### Scenario: Implementation records worktree lifecycle

**Given:**
- `/openflow-implement <feature>` creates or reuses an implementation worktree.

**When:**
- The implementation backend is about to start.

**Then (observable outcome):**
- OpenFlow records the worktree path, branch, base ref, owning feature, and cleanup policy.
- OpenFlow records whether the main worktree was dirty before isolated execution began.
- OpenFlow does not silently overwrite, delete, or reuse a conflicting worktree.

### Scenario: Existing responsibilities remain intact

**Given:**
- `openflow-writing-plan`, Prometheus, omo `/start-work`, and `openflow-quality-gate` already cover planning, execution, and verification responsibilities.

**When:**
- `/openflow-implement` is used.

**Then (observable outcome):**
- The command does not perform plan preflight or deep plan review.
- The command does not execute implementation tasks itself.
- The command does not require users to pass worktree arguments to `openflow-quality-gate`.

### Scenario: User has omo installed

**Given:**
- A planned feature is ready to enter implementation.
- omo `/start-work` is available.

**When:**
- The user invokes `/openflow-implement <feature>`.

**Then (observable outcome):**
- OpenFlow records the execution backend as `omo-start-work`.
- OpenFlow wraps and starts `/start-work` with the recorded implementation context.
- OpenFlow does not import or reimplement omo start-work internals.

### Scenario: User has not installed omo

**Given:**
- A planned feature is ready to enter implementation.
- omo `/start-work` is not available.

**When:**
- The user invokes `/openflow-implement <feature>`.

**Then (observable outcome):**
- OpenFlow does not instruct the user to run `/start-work` as the required next step.
- OpenFlow records the backend as `opencode-build`.
- OpenFlow starts OpenCode native build execution while preserving the same implementation state and quality-gate lifecycle.

### Scenario: Worktree setup fails safely

**Given:**
- `/openflow-implement <feature>` attempts to prepare isolated implementation context.

**When:**
- Worktree creation, branch creation, or execution-engine detection fails.

**Then (observable outcome):**
- OpenFlow reports a blocked implementation setup with a clear reason.
- OpenFlow does not silently fall back to the main worktree.
- OpenFlow does not mark the feature as verified, ready, or archiveable.

### Scenario: Quality gate resolves implementation context automatically

**Given:**
- `/openflow-implement <feature>` has recorded an implementation worktree.

**When:**
- The AI invokes `openflow-quality-gate` after implementation.

**Then (observable outcome):**
- The user does not need to pass a worktree path.
- OpenFlow resolves the implementation worktree from state.
- Readiness is associated with the owning feature and implementation context.

### Scenario: Execution events are observable

**Given:**
- `/openflow-implement <feature>` starts an implementation backend.

**When:**
- The backend starts, completes, fails, or triggers quality-gate.

**Then (observable outcome):**
- OpenFlow appends machine-readable implementation events.
- OpenFlow maintains a human-readable observations summary for review and handoff.
- OpenFlow can answer what happened without relying only on chat history.

### Scenario: Chat completion is not enough to mark implementation ready

**Given:**
- The AI or user says the implementation is complete.

**When:**
- No matching quality-gate readiness event exists for the implementation context.

**Then (observable outcome):**
- OpenFlow does not mark the feature as verified or archiveable.
- OpenFlow requires the quality-gate lifecycle to complete for the recorded implementation context.

### Scenario: Archive commits derived worktree implementation

**Given:**
- `/openflow-implement <feature>` recorded `worktreeKind: derived`.
- The feature has passed `openflow-quality-gate` readiness.

**When:**
- The user invokes `/openflow-archive <feature>`.

**Then (observable outcome):**
- OpenFlow detects that the implementation came from a derived worktree.
- OpenFlow creates the feature commit during archive after archive artifacts are produced.
- OpenFlow records the commit hash in implementation state and implementation events.
- OpenFlow does not mark the feature archived if the derived worktree commit cannot be created, unless the user explicitly cancels or defers commit and archive reports that state.

## Required Content

The following content or outcomes must be present in any successful response:

- Must include an explicit implementation phase state.
- Must include worktree-aware implementation context.
- Must preserve omo `/start-work` as the preferred execution engine when omo is installed.
- Must use OpenCode native build execution when omo is not installed.
- Must preserve `openflow-quality-gate` as the readiness authority.
- Must include blocked/cancellable behavior for failed implementation setup.
- Must ensure current-worktree mode, if supported, is explicit and recorded.
- Must support no-omo environments with explicit `opencode-build` backend execution.
- Must include machine-readable implementation event records.
- Must include human-readable implementation observations for review/handoff.
- Must include worktree lifecycle ownership and cleanup policy.
- Must include archive-time commit behavior for derived worktree implementations.
- Must record commit hash when archive creates a commit.

## Success Responses

**Success:** OpenFlow can enter an implementation phase, prepare isolated worktree context, and hand off execution to omo without duplicating plan review or task execution.

**Success:** Later lifecycle commands can resolve implementation context from OpenFlow state rather than requiring users to provide low-level worktree parameters.

## Must Not Behavior

The following outcomes must not occur as user-visible behavior:

- Must not duplicate Prometheus / writing-plan preflight responsibility.
- Must not reimplement omo `/start-work`.
- Must not make worktree paths a mandatory user argument for quality-gate.
- Must not obscure when execution is delegated to omo.
- Must not silently fall back from failed isolated worktree setup to the main worktree.
- Must not mark implementation as ready or archiveable before quality-gate readiness.
- Must not guess between multiple active implementation contexts.
- Must not require omo installation for OpenFlow's implementation phase to exist.
- Must not tell no-omo users that `/start-work` is required.
- Must not merely print a next-step command when a supported execution backend can be started.
- Must not silently overwrite, delete, or reuse a conflicting worktree.
- Must not rely only on chat history to determine implementation status.
- Must not mark implementation verified without a quality-gate readiness event for the recorded context.
- Must not commit implementation changes at `/openflow-implement` start.
- Must not commit implementation changes solely because `/start-work` or `opencode-build` completed.
- Must not commit implementation changes solely because quality-gate returned Ready.
- Must not archive a derived-worktree implementation without creating and recording a commit, unless explicitly deferred/cancelled and reported.

## Acceptance / Verification Mapping

Each acceptance criterion maps to an observable scenario and verification approach:

| Acceptance Criterion | Scenario | Evidence Type | Expected Evidence | Status |
|---------------------|----------|--------------|-------------------|--------|
| `/openflow-implement` enters implementation state | Enter implementation phase for a planned feature | automated/manual | Implementation state is persisted for the feature | pending |
| Worktree context is owned by implementation state | Implementation uses an isolated worktree | automated/manual | Feature worktree and branch are recorded in implementation context | pending |
| Existing responsibilities remain intact | Existing responsibilities remain intact | review | No plan preflight or task execution is introduced inside implement | pending |
| omo backend is explicit | User has omo installed | automated/manual | Implementation state records `omo-start-work` and `/start-work` is wrapped/started | pending |
| no-omo fallback is explicit | User has not installed omo | automated/manual | Implementation state records `opencode-build` and starts native build execution without requiring `/start-work` | pending |
| Failed setup is safe | Worktree setup fails safely | automated/manual | Failed setup records blocked/cancellable state and does not fall back silently | pending |
| Quality-gate uses stored context | Quality gate resolves implementation context automatically | automated/manual | quality-gate resolves worktree from implementation state without user path input | pending |
| Worktree lifecycle is observable | Implementation records worktree lifecycle | automated/manual | Worktree path, branch, base ref, owner, dirty-main summary, and cleanup policy are recorded | pending |
| Execution events are observable | Execution events are observable | automated/manual | JSONL-style events and human-readable observations are created | pending |
| Completion requires readiness evidence | Chat completion is not enough to mark implementation ready | automated/manual | Completion phrases do not mark verified without matching quality-gate readiness event | pending |
| Derived worktree commits at archive | Archive commits derived worktree implementation | automated/manual | Archive creates commit after artifacts and records commit hash for derived worktree implementations | pending |
