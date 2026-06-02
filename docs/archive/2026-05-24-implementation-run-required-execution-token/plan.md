# Plan: implementation-run-required-execution-token

## Overview

Make `/openflow-implement` a non-bypassable implementation-stage entrypoint and make `ImplementationRun` the required execution token for backend handoff, quality-gate, and archive.

## Design Context

- Design workspace: `docs/changes/2026-05-24-implementation-run-required-execution-token/`
- Primary design: `docs/changes/2026-05-24-implementation-run-required-execution-token/design.md`
- Observable behavior: `docs/changes/2026-05-24-implementation-run-required-execution-token/behavior.md`
- Related prior design: `docs/changes/2026-05-21-openflow-implement-workflow/design.md`
- Required global decision: add `docs/decisions/ADR-005-implementation-run-required-execution-token.md`
- Hard constraints:
  - Do not reimplement OMO `/start-work` internals.
  - Do not move plan review into `/openflow-implement`.
  - Do not register `openflow-implement` as an AI-callable Skill.
  - Do not allow `/openflow-implement` to fall through to AI free-form interpretation.
  - Do not silently create implementation runs without a valid sessionID.
  - Do not allow quality-gate/archive root mismatch to produce `ready_for_archive` or `archived`.

## Execution Strategy

### Parallel Execution Waves

Wave 1: Parser/dispatch tests and implementation-run status model can start first.
Wave 2: Command dispatch, parser, session context, dirty-main policy, and resume matrix build on Wave 1.
Wave 3: Plan-to-implement guard and backend handoff context build on parser/run semantics.
Wave 4: Observer, quality-gate, and archive mismatch enforcement build on run context semantics.
Wave 5: ADR/docs and final quality gate run after implementation behavior is stable.

### Dependency Matrix

| Task | Blocked By | Blocks |
|------|------------|--------|
| 1. Add parser and dispatch red tests | None | 2 |
| 2. Implement `/openflow-implement` parser and chat dispatch | 1 | 3, 4, 5 |
| 3. Add status model and resume matrix | 2 | 6, 8 |
| 4. Enforce worktree defaults and dirty-main policy | 2 | 6, 8 |
| 5. Add plan-to-implement guard | 2 | 8 |
| 6. Enrich backend handoff context | 3, 4 | 8 |
| 7. Add observer mismatch recording | 3 | 8 |
| 8. Enforce quality-gate/archive run-root matching | 3, 4, 5, 6, 7 | 9 |
| 9. Add ADR/docs and final quality gate | 8 | None |

## Tasks

- [ ] 1. Add parser and dispatch red tests (Agent: quick; Blocks: [2]; Blocked By: [])
  - Files: `tests/hooks/chat-command-dispatch-implement.test.ts`, extend `tests/index.test.ts` only if command registration assertions already live there.
  - Add failing tests for `/openflow-implement foo`, `/openflow-implement foo --no-worktree`, `/openflow-implement --no-worktree foo`, `OpenFlow command: /openflow-implement foo`, and unknown flags.
  - Verify dispatch returns handled/true and does not fall through to AI interpretation.
  - Acceptance Criteria:
    - `bun test tests/hooks/chat-command-dispatch-implement.test.ts` fails before implementation for missing dispatch/parser behavior.
    - Feature parses as `foo`; flags never become part of feature.
    - Unknown flags produce a clear error message.
  - Agent Profile: `quick`; Skills: []; Parallelization: Wave 1.

- [ ] 2. Implement structured parser and chat dispatch (Agent: quick; Blocks: [3, 4, 5]; Blocked By: [1])
  - Files: `src/hooks/chat-command-dispatch.ts`, `src/hooks/chat-message.ts`, `src/index.ts`, `src/commands/manifest.ts`, `src/command-registration.ts`, `tests/hooks/chat-command-dispatch-implement.test.ts`.
  - Add `parseOpenFlowImplementCommand` that separates feature and flags, supports the formats specified in `behavior.md`, and rejects unknown flags.
  - Add `/openflow-implement` dispatch branch that calls `handleImplement` with parsed feature/useWorktree and a minimal tool context containing sessionID/messageID/agent when available.
  - Pass the implementation observer into chat command dispatch so `handleImplement` can set active run.
  - Ensure command registration writes `openflow-implement.md` and does not register it as a Skill.
  - Acceptance Criteria:
    - `bun test tests/hooks/chat-command-dispatch-implement.test.ts` passes.
    - `bun test tests/index.test.ts` passes or documents unrelated pre-existing failures.
    - `/openflow-implement foo --no-worktree` dispatches with feature `foo` and useWorktree `false`.
  - Agent Profile: `quick`; Skills: []; Parallelization: Wave 2.

- [ ] 3. Add status model and resume matrix (Agent: quick; Blocks: [6, 8]; Blocked By: [2])
  - Files: `src/types.ts`, `src/commands/implement.ts`, `src/utils/implementation-run.ts`, `tests/commands/implement.test.ts`, `tests/utils/implementation-run.test.ts`.
  - Ensure `ImplementationRunStatus` includes every lifecycle state used by implementation, observer, quality-gate, and archive: `created`, `starting_backend`, `running`, `quality_gate_pending`, `quality_gate_running`, `ready_for_archive`, `blocked`, `failed`, `cancelled`, `archived`.
  - Replace duplicate active run hard-blocking with the design status matrix: resume for created/starting_backend/running/quality_gate_pending/ready_for_archive; blocked returns recovery guidance; failed/cancelled require explicit new/recover action; archived reports completed/new cycle guidance.
  - Acceptance Criteria:
    - `bun test tests/commands/implement.test.ts` covers duplicate running resume and no second backend handoff.
    - `bun test tests/utils/implementation-run.test.ts` covers active/terminal classification.
    - `npm run typecheck` has no new type errors from status names.
  - Agent Profile: `quick`; Skills: []; Parallelization: Wave 2.

- [ ] 4. Enforce worktree defaults and dirty-main policy (Agent: unspecified-high; Blocks: [6, 8]; Blocked By: [2])
  - Files: `src/commands/implement.ts`, `src/utils/implementation-worktree.ts`, `tests/commands/implement.test.ts`, `tests/utils/implementation-worktree.test.ts`.
  - Keep default `useWorktree=true`.
  - Block `--no-worktree` when main worktree is dirty; return an explicit blocked message and do not create a run.
  - In worktree mode, allow dirty main but record dirty summary in ImplementationRun/observations.
  - Preserve existing behavior: worktree creation failure remains blocked and never silently falls back to main worktree.
  - Acceptance Criteria:
    - `bun test tests/commands/implement.test.ts` covers default worktree mode, `--no-worktree`, dirty `--no-worktree` blocked, and worktree mode dirty summary recorded.
    - `bun test tests/utils/implementation-worktree.test.ts` passes.
  - Agent Profile: `unspecified-high`; Skills: []; Parallelization: Wave 2.

- [ ] 5. Add plan-to-implement guard (Agent: unspecified-high; Blocks: [8]; Blocked By: [2])
  - Files: `src/hooks/tool-before.ts`, create `src/hooks/implementation-guard.ts`, update `src/hooks/task-classification.ts` if implementation-like classification belongs there, `tests/hooks/tool-before.test.ts`, create `tests/hooks/implementation-guard.test.ts`.
  - Block implementation-like actions when `.sisyphus/plans/{feature}.md` exists and no active ImplementationRun exists.
  - Allow read/design/investigation/planning actions and design/plan document edits.
  - Do not guess feature when ambiguous; emit a clear message requiring explicit `/openflow-implement <feature>`.
  - Record `bypassed_implement_detected` in observations/events when blocking.
  - Acceptance Criteria:
    - `bun test tests/hooks/implementation-guard.test.ts` covers blocked task dispatch/source edit/build intent and allowed read/design/investigation intent.
    - `bun test tests/hooks/tool-before.test.ts` passes.
  - Agent Profile: `unspecified-high`; Skills: []; Parallelization: Wave 3.

- [ ] 6. Enrich backend handoff context (Agent: quick; Blocks: [8]; Blocked By: [3, 4])
  - Files: `src/utils/implementation-backend.ts`, `tests/utils/implementation-backend.test.ts`, `tests/commands/implement.test.ts`.
  - Build handoff command text containing `/start-work <feature>` plus OpenFlow Implementation Context: runID, feature, executionRoot, worktree, planPath, containerMode, and `mustUseExistingImplementationRun: true`.
  - Persist the same context in backend events/observations; do not rely only on chat prompt text.
  - Non-OMO branch should also record the execution context in events/observations with backend `opencode`.
  - Acceptance Criteria:
    - `bun test tests/utils/implementation-backend.test.ts` asserts OMO prompt and events include runID/worktree/planPath/executionRoot/containerMode.
    - Existing non-OMO tests still pass and assert context is recorded.
  - Agent Profile: `quick`; Skills: []; Parallelization: Wave 3.

- [ ] 7. Add observer mismatch recording (Agent: quick; Blocks: [8]; Blocked By: [3])
  - Files: `src/hooks/implementation-observer.ts`, `src/types.ts`, `tests/hooks/implementation-observer.test.ts`.
  - Add `implementation_context_mismatch` event shape.
  - Record mismatch when backend/quality-gate events cannot bind to the expected active run or root.
  - Prevent observer from advancing status to `running`, `quality_gate_pending`, or `ready_for_archive` when mismatch is detected.
  - Acceptance Criteria:
    - `bun test tests/hooks/implementation-observer.test.ts` covers no active run mismatch and wrong-session/root mismatch.
    - Existing observer happy-path tests still pass.
  - Agent Profile: `quick`; Skills: []; Parallelization: Wave 4.

- [ ] 8. Enforce quality-gate and archive run-root matching (Agent: unspecified-high; Blocks: [9]; Blocked By: [3, 4, 5, 6, 7])
  - Files: `src/commands/quality-gate.ts`, `src/commands/archive.ts`, `src/utils/implementation-run.ts`, `tests/quality-gate/quality-gate.test.ts`, `tests/commands/archive.test.ts`, `tests/commands/implement.test.ts`.
  - Before quality-gate readiness transitions, compare execution root with active ImplementationRun directory/worktree; mismatch returns invalid/mismatched readiness and must not update run to `ready_for_archive`.
  - Before archive, require matching implementation run and matching root for derived worktree implementations; mismatch blocks archive and does not mark archived.
  - Preserve existing allowed archive statuses and existing post-hoc issue behavior unless a matching active implementation run exists and conflicts.
  - Acceptance Criteria:
    - `bun test tests/quality-gate/quality-gate.test.ts` covers mismatch readiness invalid and no `ready_for_archive` transition.
    - `bun test tests/commands/archive.test.ts` covers wrong-root archive blocked and no archived state.
    - `bun test tests/commands/implement.test.ts` quality-gate/archive integration tests still pass.
  - Agent Profile: `unspecified-high`; Skills: []; Parallelization: Wave 4.

- [ ] 9. Add ADR/docs and final quality gate (Agent: unspecified-high; Blocks: []; Blocked By: [8])
  - Files: create `docs/decisions/ADR-005-implementation-run-required-execution-token.md`, update `docs/current/feature-lifecycle/design.md`, `docs/current/feature-lifecycle/spec.md`, `docs/current/workflow/openflow-usage-tutorial.md`, `docs/current/workflow/openflow-usage-tutorial.en.md`, and update `docs/changes/2026-05-24-implementation-run-required-execution-token/plan.md` only if implementation evidence requires plan notes.
  - Document ImplementationRun as required execution token, command-file + chat-hook dispatch requirement, no Skill registration, default worktree isolation, dirty-main no-worktree block, mismatch invalid/block behavior, and resume semantics.
  - Run final validations and invoke the quality gate.
  - Acceptance Criteria:
    - `npm run typecheck` exits 0.
    - `npm test` exits 0 or pre-existing failures are documented with evidence.
    - Targeted tests from Tasks 1–8 pass.
    - After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.
  - Agent Profile: `unspecified-high`; Skills: [`openflow-quality-gate`]; Parallelization: Wave 5 only.

## Execution Unit Estimate

- Tasks: 9
- Estimated execution units: 18–20
- Same-wave concurrency: max 3 tasks
- Complexity: medium-large; bounded by command entry, run lifecycle, guard, backend context, mismatch enforcement, and docs/ADR.
