# Plan: drg-task-scheduler

## Overview
实现 DRG 全局任务调度器第一版：内部任务 API、依赖/资源调度、executor registry、状态持久化、取消/超时/恢复语义和测试覆盖。不实现用户命令、OpenCode conversation、项目编排或 `/openflow-feature` 集成。

## Design Context
Design workspace: `docs/changes/2026-05-21-drg-task-scheduler/`. Core references: `design.md` Implementation-Critical Constraints, `behavior.md` B-1 至 B-22, `requirements.md` 约束 3.1-3.6, `decisions.md` D-1 至 D-17.

## Execution Strategy

### Parallel Execution Waves
Wave 1: Task 1 shared contracts and errors.
Wave 2: Tasks 2, 3, 4 in parallel after shared contracts.
Wave 3: Tasks 5, 6 after core graph/lock/store work.
Wave 4: Task 7 integration/export.
Wave 5: Task 8 final verification and quality gate.

### Dependency Matrix
| Task | Blocked By | Blocks |
|---|---|---|
| 1. Shared contracts and error model | None | 2, 3, 4, 5, 6, 7, 8 |
| 2. DRG engine state machine and dependency validation | 1 | 5, 6, 7, 8 |
| 3. Resource lock manager | 1 | 6, 7, 8 |
| 4. Scheduler state store and history persistence | 1 | 6, 7, 8 |
| 5. Executor registry and task execution contract | 1, 2 | 6, 7, 8 |
| 6. Scheduler loop and public API | 2, 3, 4, 5 | 7, 8 |
| 7. Orchestrator module export and integration tests | 6 | 8 |
| 8. Final verification and quality gate | 7 | None |

## Tasks

- [ ] 1. Shared contracts and error model (Agent: quick | Blocks: [2,3,4,5,6,7,8] | Blocked By: [])
  - Agent Profile: `quick`; Skills: none.
  - Parallelization: Wave 1, must run first.
  - Implement: create `src/orchestrator/types.ts` with scheduler task/status/resource/executor/context/filter/history/result types. Create `src/orchestrator/errors.ts` with `SchedulerError` and constants/factories for `TASK_NOT_FOUND`, `DUPLICATE_EXECUTOR`, `EXECUTOR_NOT_FOUND`, `SELF_DEPENDENCY`, `DEPENDENCY_NOT_FOUND`, `CYCLE_DETECTED`, `INVALID_RESOURCE`, `PAYLOAD_NOT_SERIALIZABLE`, `RESULT_NOT_SERIALIZABLE`, `SENSITIVE_FIELD_REJECTED`, `INVALID_STATE_TRANSITION`, `EXECUTOR_FAILED`, `SCHEDULER_INTERRUPTED`, `SCHEDULER_STOPPED`, `TASK_TIMEOUT`.
  - Acceptance Criteria: types compile; error shape is `{ code, message, taskId? }`; no imports from LLM, OpenCode conversation, command, feature, or quality-gate modules.
  - QA Scenarios: run `npm run typecheck` and `npm test -- tests/orchestrator/errors.test.ts`; expected exit code 0.

- [ ] 2. DRG engine state machine and dependency validation (Agent: unspecified-high | Blocks: [5,6,7,8] | Blocked By: [1])
  - Agent Profile: `unspecified-high`; Skills: none.
  - Parallelization: Wave 2, parallel with Tasks 3 and 4.
  - Implement: create `src/orchestrator/drg-engine.ts` with legal status transitions, self/missing/cycle dependency rejection, dependency failure/cancel propagation to `blocked`, retry of `failed` to `pending` without unblocking downstream, `runAfter` not-due staying `pending`, and deterministic ready selection inputs. Add `tests/orchestrator/drg-engine.test.ts`.
  - Acceptance Criteria: all state machine and dependency rules from `design.md` are encoded and tested; engine has no filesystem/executor dependency.
  - QA Scenarios: run `npm test -- tests/orchestrator/drg-engine.test.ts` and `npm run typecheck`; expected exit code 0.

- [ ] 3. Resource lock manager (Agent: unspecified-high | Blocks: [6,7,8] | Blocked By: [1])
  - Agent Profile: `unspecified-high`; Skills: none.
  - Parallelization: Wave 2, parallel with Tasks 2 and 4.
  - Implement: create `src/orchestrator/resource-lock-manager.ts` with `{ kind, id, mode }` validation, stable file path normalization, read/read compatibility, read/write and write/write conflicts, all-or-nothing acquisition rollback, release by task ID, and orphan cleanup for non-running IDs. Add `tests/orchestrator/resource-lock-manager.test.ts`.
  - Acceptance Criteria: locks are in-memory only; partial acquisition failure rolls back all acquired locks.
  - QA Scenarios: run `npm test -- tests/orchestrator/resource-lock-manager.test.ts` and `npm run typecheck`; expected exit code 0.

- [ ] 4. Scheduler state store and history persistence (Agent: unspecified-high | Blocks: [6,7,8] | Blocked By: [1])
  - Agent Profile: `unspecified-high`; Skills: none.
  - Parallelization: Wave 2, parallel with Tasks 2 and 3.
  - Implement: create `src/orchestrator/state-store.ts` for `.sisyphus/openflow/scheduler/`, `tasks.json`, `tasks.json.bak`, `history.jsonl`, versioned state, tmp + rename writes, bak fallback, corrupted-state exposure, JSON serialization validation, and sensitive key rejection/redaction for `secret`, `token`, `password`. Add `tests/orchestrator/state-store.test.ts` using temporary directories.
  - Acceptance Criteria: state writes are human-readable JSON; corrupt primary falls back to bak; both corrupt starts empty with corrupted flag; no raw sensitive values persist.
  - QA Scenarios: run `npm test -- tests/orchestrator/state-store.test.ts`; expected exit code 0 and no repo state files created.

- [ ] 5. Executor registry and task execution contract (Agent: unspecified-high | Blocks: [6,7,8] | Blocked By: [1,2])
  - Agent Profile: `unspecified-high`; Skills: none.
  - Parallelization: Wave 3, after Tasks 1 and 2.
  - Implement: create `src/orchestrator/executor-registry.ts` and `src/orchestrator/task-runner.ts`. Enforce duplicate executor rejection, missing executor stays `ready` with warning, `execute(task, context): Promise<unknown>`, `AbortController` cancel/timeout, cancel-over-timeout precedence, `RESULT_NOT_SERIALIZABLE`, `EXECUTOR_FAILED`, and `TASK_TIMEOUT`. Add `tests/orchestrator/executor-registry.test.ts` and `tests/orchestrator/task-runner.test.ts`.
  - Acceptance Criteria: executor exceptions become task failures and do not escape as unhandled scheduler errors; return values are validated before persistence.
  - QA Scenarios: run `npm test -- tests/orchestrator/executor-registry.test.ts tests/orchestrator/task-runner.test.ts` and `npm run typecheck`; expected exit code 0.

- [ ] 6. Scheduler loop and public API (Agent: unspecified-high | Blocks: [7,8] | Blocked By: [2,3,4,5])
  - Agent Profile: `unspecified-high`; Skills: none.
  - Parallelization: Wave 3 after Tasks 2-5.
  - Implement: create `src/orchestrator/scheduler-loop.ts` exposing `submitTask`, `getTask`, `listTasks`, `cancelTask`, `retryTask`, `registerExecutor`, `startScheduler`, `stopScheduler`. Enforce max concurrency default 1, deterministic ready order, `runAfter` pending semantics, start idempotency, stop drain, `stopScheduler({ abortRunning: true })`, old running recovery to `failed` with `SCHEDULER_INTERRUPTED`, lock acquisition/release, history events, and corrupted metadata through list/status result. Add `tests/orchestrator/scheduler-loop.test.ts` covering behavior scenarios B-1 through B-22 not already covered below.
  - Acceptance Criteria: scheduler core does not import `/openflow-feature`, quality-gate, Project Orchestrator, OpenCode conversation APIs, or LLM utilities.
  - QA Scenarios: run `npm test -- tests/orchestrator/scheduler-loop.test.ts` and `npm run typecheck`; expected exit code 0.

- [ ] 7. Orchestrator module export and integration tests (Agent: quick | Blocks: [8] | Blocked By: [6])
  - Agent Profile: `quick`; Skills: none.
  - Parallelization: Wave 4.
  - Implement: create `src/orchestrator/index.ts` exporting only scheduler internal API, types, and errors. Add `tests/orchestrator/integration.test.ts` for an in-process scenario: register executor, submit dependency A→B, submit two file-write tasks, cancel a running task, stop/restart with persisted running task, and verify list/status output. Do not modify `src/index.ts`, `src/contracts/runtime.ts`, or `src/config.ts` unless internal export is otherwise impossible.
  - Acceptance Criteria: modules can import from `src/orchestrator/index.ts`; no CLI, user command, conversation creation, feature orchestration, or quality-gate integration is added.
  - QA Scenarios: run `npm test -- tests/orchestrator/integration.test.ts` and `npm run typecheck`; expected exit code 0.

- [ ] 8. Final verification and quality gate (Agent: unspecified-high | Blocks: [] | Blocked By: [7])
  - Agent Profile: `unspecified-high`; Skills: `openflow-quality-gate`.
  - Parallelization: Wave 5, final task only.
  - Implement: run `npm run typecheck`, `npm test -- tests/orchestrator`, and `npm test`. Confirm no accidental implementation of CLI, conversation creation, project orchestration, `/openflow-feature`, or quality-gate integration. After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.
  - Acceptance Criteria: all orchestrator tests pass; full test suite passes or unrelated pre-existing failures are documented; quality gate reports readiness.
  - QA Scenarios: run `npm run typecheck`, `npm test -- tests/orchestrator`, and `npm test`; expected exit code 0 unless unrelated pre-existing failures are documented with evidence.
