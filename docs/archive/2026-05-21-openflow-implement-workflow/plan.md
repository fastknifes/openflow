# Plan: openflow-implement-workflow

## Overview

Add `/openflow-implement <feature>` as OpenFlow's explicit implementation-stage entrypoint. The command records implementation context, prepares isolated worktree execution, starts the available backend (`omo-start-work` or `opencode-build`), and lets existing `openflow-quality-gate` and archive flows consume that recorded context.

## Design Context

- Design workspace: `docs/changes/2026-05-21-openflow-implement-workflow/`
- Primary design: `docs/changes/2026-05-21-openflow-implement-workflow/design.md`
- Observable behavior: `docs/changes/2026-05-21-openflow-implement-workflow/behavior.md`
- Hard constraints:
  - Do not move plan preflight or Prometheus review into `/openflow-implement`.
  - Do not reimplement omo `/start-work` internals.
  - Do not require users to pass worktree paths to `openflow-quality-gate`.
  - If implementation uses a derived worktree, archive owns commit creation after archive artifacts are produced.

## Execution Strategy

### Parallel Execution Waves

Wave 1: State model and command surface can start together.
Wave 2: Worktree lifecycle and backend startup depend on the implementation context model.
Wave 3: quality-gate and archive integration depend on implementation context persistence.
Wave 4: tests, docs, and final quality gate depend on all implementation tasks.

### Dependency Matrix

| Task | Blocked By | Blocks |
|------|------------|--------|
| 1. Add implementation context types and config paths | None | 2, 3, 6, 7 |
| 2. Add implementation state store and event log | 1 | 3, 4, 6, 7 |
| 3. Add worktree lifecycle service | 1, 2 | 5, 6, 7 |
| 4. Add `/openflow-implement` command/tool registration | 1, 2 | 5 |
| 5. Implement backend startup orchestration | 3, 4 | 8 |
| 6. Make quality-gate resolve implementation context | 2, 3 | 8 |
| 7. Add archive-time derived worktree commit handling | 2, 3 | 8 |
| 8. Add tests for implement workflow | 5, 6, 7 | 9 |
| 9. Final verification and quality gate | 8 | None |

## Tasks

- [ ] 1. Add implementation context types and config paths (Agent: quick; Skills: []; Parallelization: Wave 1, parallel with Task 4; Blocks: [2, 3, 6, 7]; Blocked By: [])
  - Files: `src/types.ts`, `src/config.ts` if config schema needs path validation.
  - Add typed implementation lifecycle entities: backend (`omo-start-work` | `opencode-build`), backend status, worktree kind (`main` | `derived`), implementation status (`prepared`, `running`, `blocked`, `completed`, `quality_gate_pending`, `verified`, `failed`, `cancelled`), commit policy, commit hash, event shape, observation metadata.
  - Add default path for implementation state under `.sisyphus/openflow/implementation` if the current config path model needs an explicit entry.
  - Acceptance Criteria:
    - Types represent feature, backend, worktree, branch, plan path, start command, status, events path, observations path, commit policy, and commit hash.
    - Type definitions do not make omo a required dependency.
  - QA Scenarios:
    - Run `npm run typecheck`; expected: TypeScript accepts the new exported types.

- [ ] 2. Add implementation state store and event log helpers (Agent: quick; Skills: []; Parallelization: Wave 1 after Task 1; Blocks: [3, 4, 6, 7]; Blocked By: [1])
  - Files: create `src/utils/implementation-state.ts`; update `src/utils/index.ts` only if this repo exports utility barrels for similar modules.
  - Implement safe read/write helpers for `.sisyphus/openflow/implementation/{feature}/state.json`, append-only `.sisyphus/openflow/implementation/{feature}/events.jsonl`, and `.sisyphus/openflow/implementation/{feature}/observations.md`.
  - Include helpers for resolving active implementation by feature and for detecting ambiguous multiple active contexts.
  - Acceptance Criteria:
    - State write happens before backend start.
    - Events append without replacing history.
    - Observations are human-readable but not the only source of truth.
  - QA Scenarios:
    - Add tests in `tests/utils/implementation-state.test.ts`; run `npm test -- tests/utils/implementation-state.test.ts`; expected: read/write/append/ambiguous-context cases pass.

- [ ] 3. Add worktree lifecycle service (Agent: unspecified-high; Skills: []; Parallelization: Wave 2; Blocks: [5, 6, 7]; Blocked By: [1, 2])
  - Files: create `src/utils/implementation-worktree.ts`; update tests under `tests/utils/implementation-worktree.test.ts`.
  - Implement deterministic feature worktree path/branch planning, main worktree dirty summary capture, existing worktree classification (`resumable`, `stale`, `blocked`, `conflicting`), and explicit current-worktree mode handling.
  - Use git commands through existing project shell conventions without committing changes.
  - Acceptance Criteria:
    - Derived worktree state records path, branch, base ref, owner feature, creation timestamp, dirty-main summary, and cleanup policy.
    - Failed worktree creation returns blocked state and never silently falls back to main worktree.
  - QA Scenarios:
    - Run `npm test -- tests/utils/implementation-worktree.test.ts`; expected: derived, current-worktree, existing-conflict, and dirty-main summaries pass.

- [ ] 4. Add `/openflow-implement` command/tool registration (Agent: quick; Skills: []; Parallelization: Wave 1, parallel with Task 1; Blocks: [5]; Blocked By: [1, 2])
  - Files: `src/commands/manifest.ts`, `src/index.ts`, `src/commands/index.ts`, create `src/commands/implement.ts`, and add user-facing command metadata used by `src/command-registration.ts`.
  - Register internal tool `openflow-implement` with feature argument, plus slash command metadata `/openflow-implement`.
  - Handler must resolve feature and call implementation state/worktree/backend orchestration; it must not run plan preflight.
  - Acceptance Criteria:
    - `openflow-implement` appears in tool manifest and command registration list.
    - Handler does not import omo internals.
  - QA Scenarios:
    - Run `npm run typecheck`; expected: new command compiles and exports through `src/commands/index.ts`.

- [ ] 5. Implement backend startup orchestration (Agent: unspecified-high; Skills: []; Parallelization: Wave 2; Blocks: [8]; Blocked By: [3, 4])
  - Files: `src/commands/implement.ts`, create `src/utils/implementation-backend.ts`, optionally update `src/utils/omo-detection.ts` if current detection is insufficient.
  - For omo-installed environments, wrap/start omo `/start-work` with the recorded worktree context without importing omo private APIs.
  - For no-omo environments, start OpenCode native build execution and record backend as `opencode-build`.
  - Append events: `implementation_prepared`, `backend_started`, `backend_failed` where applicable.
  - Acceptance Criteria:
    - With omo detected, state records `backend: omo-start-work` and start command includes recorded worktree context.
    - Without omo, state records `backend: opencode-build` and does not instruct the user that `/start-work` is required.
    - Supported backend is started rather than merely printed as a next step.
  - QA Scenarios:
    - Add `tests/commands/implement.test.ts`; run `npm test -- tests/commands/implement.test.ts`; expected: omo and no-omo backend branches pass using mocks/stubs.

- [ ] 6. Make quality-gate resolve implementation context (Agent: unspecified-high; Skills: []; Parallelization: Wave 3, parallel with Task 7; Blocks: [8]; Blocked By: [2, 3])
  - Files: `src/commands/quality-gate.ts`, `src/utils/implementation-state.ts`, tests in `tests/commands/quality-gate.test.ts` or existing quality-gate test file if present.
  - Add context resolution before legacy workspace inference: feature → implementation state → execution root/worktree.
  - Append `quality_gate_started` and `quality_gate_completed` events with readiness result and root path.
  - Treat mismatched quality-gate root as invalid unless explicitly overridden.
  - Acceptance Criteria:
    - Users do not pass worktree paths manually.
    - quality-gate readiness is associated with owning feature and implementation state.
    - Chat completion alone never marks implementation verified.
  - QA Scenarios:
    - Run targeted quality-gate tests; expected: implementation-state root resolution takes precedence over legacy inference.

- [ ] 7. Add archive-time derived worktree commit handling (Agent: unspecified-high; Skills: []; Parallelization: Wave 3, parallel with Task 6; Blocks: [8]; Blocked By: [2, 3])
  - Files: `src/commands/archive.ts`, `src/utils/implementation-state.ts`, optionally create `src/utils/implementation-commit.ts`, tests in `tests/commands/archive.test.ts`.
  - During archive, inspect implementation state. If `worktreeKind: derived`, create the feature commit from the derived worktree/branch after archive artifacts are produced.
  - Record commit hash in implementation state and append `archive_commit_created` event.
  - Block archive if derived worktree commit cannot be created or contains out-of-scope changes, unless the user explicitly cancels/defers and archive reports that state.
  - Acceptance Criteria:
    - No commit is created at implement start, backend completion, or quality-gate Ready.
    - Derived worktree commit is archive-stage only and records commit hash.
  - QA Scenarios:
    - Extend archive tests; run `npm test -- tests/commands/archive.test.ts`; expected: derived commit success and commit-blocking failure cases pass.

- [ ] 8. Add end-to-end workflow tests and documentation updates (Agent: unspecified-high; Skills: []; Parallelization: Wave 4; Blocks: [9]; Blocked By: [5, 6, 7])
  - Files: `README.md`, `README_CN.md`, `docs/current/workflow/openflow-usage-tutorial.md`, `docs/current/workflow/openflow-usage-tutorial.en.md`, `tests/commands/implement.test.ts`.
  - Document lifecycle: `/openflow-feature` → `/openflow-writing-plan` → `/openflow-implement` → backend execution → `openflow-quality-gate` → `/openflow-archive`.
  - Cover no-omo behavior, derived worktree behavior, event/observation files, and archive-time commit semantics.
  - Acceptance Criteria:
    - Documentation says implement starts the available backend, not just prints guidance.
    - Documentation says plan review remains writing-plan/Prometheus responsibility.
    - Tests cover omo branch, no-omo branch, worktree failure, and event logging.
  - QA Scenarios:
    - Run `npm test -- tests/commands/implement.test.ts`; expected: end-to-end command behavior passes with mocked backend execution.

- [ ] 9. Final verification and OpenFlow quality gate (Agent: unspecified-high; Skills: [openflow-quality-gate]; Parallelization: final wave only; Blocks: []; Blocked By: [8])
  - Files: all modified source, test, and documentation files from Tasks 1–8.
  - Run repository validation commands: `npm run typecheck`, `npm test`, and any targeted tests added above.
  - After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.
  - Acceptance Criteria:
    - Typecheck exits 0.
    - Test suite exits 0 or pre-existing failures are documented with evidence.
    - `openflow-quality-gate` reports readiness or clearly identifies remaining blockers.
  - QA Scenarios:
    - Manual QA: invoke `openflow-implement` in a controlled test workspace for both backend branches or mocked equivalents; expected: state, events, observations, backend start, quality-gate context, and archive commit behavior are observable.

## Execution Unit Estimate

- Tasks: 9
- Estimated execution units: 18–20
- Same-wave concurrency: max 2 in this plan
- Complexity: medium-large; bounded by separating state, worktree, backend, quality-gate, and archive responsibilities.
