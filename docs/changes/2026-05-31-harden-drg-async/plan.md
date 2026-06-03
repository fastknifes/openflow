# Plan: harden-drg-async

## Overview

Replace the synchronous in-process harden adversarial loop with a DRG-backed asynchronous reviewer↔executor conversation that runs on the global singleton `SchedulerLoop`, isolates each harden DAG with `harden-<uuid>-` task prefixes, preserves long-lived reviewer/executor sessions, enforces reviewer-owned termination, and returns the existing `HardenResult` output format without changing quality-gate orchestration.

## Design Context

- Design workspace: `docs/changes/2026-05-31-harden-drg-async/`
- Design: `docs/changes/2026-05-31-harden-drg-async/design.md`
- Behavior: `docs/changes/2026-05-31-harden-drg-async/behavior.md`
- Current plan state: `docs/changes/2026-05-31-harden-drg-async/plan.state.json`
- TDD: enabled by `openflow.jsonc`
- Planning mode: pyramid by `openflow.jsonc`
- Constraints carried into execution: DRG remains a global singleton; `DagEngine` semantics are not modified; all harden tasks use `harden-<uuid>-` prefix isolation; one harden DAG runs at a time; reviewer and executor keep long-lived sessions; one round is a complete reviewer↔executor conversation; each executor fix/review report counts as one cycle; each round has max 5 cycles; default maxRounds is 1 and ceiling is 10; executor cannot end the loop; every executor report must be reviewed by reviewer; reviewer executor owns 3-rejection counts; output remains compatible with `HardenResult` / `formatHardenResult`; quality-gate orchestration is not modified.

## Pyramid + TDD Strategy

### Highest-Level Goal

Deliver a harden workflow where reviewer and executor converse asynchronously through DRG tasks until reviewer-owned convergence, while preserving existing user-facing harden and quality-gate contracts.

### Task Pyramid

1. Scheduler foundation
   1.1 Write RED tests for generic prefixed task IDs and prefix query/cancel helpers
   1.2 Implement prefix helpers in `SchedulerLoop` without modifying `DagEngine` semantics
2. Harden DAG lifecycle
   2.1 Write RED lifecycle tests for prefix submit, dependency chaining, await, archive, and single-active guard
   2.2 Implement `HardenDagManager` as a thin wrapper over the global scheduler
3. Harden conversation executors
   3.1 Write RED tests for confidence parsing and executor routing
   3.2 Implement confidence parsing and executor routing helpers
   3.3 Write RED tests for reviewer/executor task contracts, sessions, dispositions, and 3-rejection ownership
   3.4 Implement reviewer and executor DRG executors
4. Harden command orchestration
   4.1 Write RED tests for round/cycle semantics and output compatibility
   4.2 Replace in-process adversarial loop with `runDrgAdversarialLoop`
   4.3 Preserve result formatting, token trace, diff scoping, model selection, and session linkage
5. Plugin wiring and verification
   5.1 Write RED tests for plugin executor registration
   5.2 Register harden executors on the global scheduler at plugin startup
   5.3 Prove round/cycle semantics, output compatibility, and quality-gate boundaries through integration and final verification

### Core Abstractions and Boundaries

- `SchedulerLoop` prefix helpers: generate and query generic prefixed task IDs; must not know about harden or change `DagEngine` scheduling semantics.
- `HardenDagManager`: owns harden DAG prefix, single-active guard, task submission, task polling, and archive/cancel cleanup; must not build prompts, classify findings, own sessions, or decide convergence.
- `HardenReviewerExecutor`: owns reviewer session reuse, finding classification, confidence-aware reporting, reviewer convergence, and 3-rejection counters; must not submit DRG tasks or mutate command state.
- `HardenExecutorExecutor`: owns executor session reuse, fix/report execution, and disposition parsing; must not end the loop or update 3-rejection counters.
- `runDrgAdversarialLoop`: owns round/cycle orchestration, task payload assembly, task result aggregation, and `FormattedHardenResult` conversion; must not modify quality-gate state or acceptance state.
- Plugin bootstrap: owns executor registration on the already-created global scheduler; must not create a second scheduler.

### TDD Driving Order

1. RED: add failing scheduler prefix tests in `tests/orchestrator/scheduler-loop.test.ts` for `idPrefix`, `listTasksByPrefix`, and `cancelTasksByPrefix`.
2. GREEN: implement generic prefix helpers in `src/orchestrator/scheduler-loop.ts` with no `DagEngine` semantic changes.
3. REFACTOR: keep prefix helper implementation generic and harden-free while scheduler tests stay green.
4. RED: add failing `HardenDagManager` lifecycle tests in `tests/orchestrator/harden-dag-manager.test.ts` for prefix submit, dependsOn chaining, await terminal task, archive cleanup, and single-active guard.
5. GREEN: implement `src/orchestrator/harden-dag-manager.ts` as a thin lifecycle wrapper.
6. REFACTOR: verify Manager does not contain prompt, session, confidence, or convergence logic.
7. RED: add failing executor tests in `tests/orchestrator/harden-executors.test.ts` for reviewer-owned convergence, reviewer-owned 3-rejection counts, executor disposition parsing, session reuse, and high/medium/low confidence behavior.
8. GREEN: implement `src/orchestrator/harden-executors.ts` and confidence parsing support.
9. REFACTOR: keep executors independent from `SchedulerLoop` and keep orchestrator out of 3-rejection ownership.
10. RED: add failing orchestration tests in `tests/harden/orchestration.test.ts` and `tests/commands/harden-drg-async.test.ts` proving one round can contain up to 5 cycles and every executor report is followed by reviewer verification.
11. GREEN: replace `runAdversarialLoop` with `runDrgAdversarialLoop` in `src/commands/harden.ts` and preserve `formatHardenResult` output.
12. REFACTOR: remove old simple/standard divergent execution paths while keeping complexity skip behavior and output compatibility tests green.

## Execution Strategy

### Parallel Execution Waves

Wave 1: T1 and T3 write independent RED tests for scheduler prefix APIs and confidence contracts.

Wave 2: T2 and T4 implement scheduler prefix APIs and confidence contracts after their RED tests.

Wave 3: T5 and T7 write RED tests for HardenDagManager and harden executors after supporting contracts exist.

Wave 4: T6 and T8 implement HardenDagManager and harden executors after their tests.

Wave 5: T9 and T11 write RED tests for command orchestration and plugin registration after Manager/executor contracts exist.

Wave 6: T10 and T12 implement command orchestration and plugin registration.

Wave 7: T13 adds cross-module round/cycle integration coverage after orchestration and registration are wired.

Wave 8: T14 runs final verification and quality-gate readiness instruction after all implementation and tests are complete.

### Dependency Matrix

| Task | Blocked By | Blocks |
|------|------------|--------|
| T1 Scheduler Prefix RED Tests | — | T2 |
| T2 Scheduler Prefix APIs | T1 | T5, T6, T10 |
| T3 Confidence RED Tests | — | T4 |
| T4 Confidence Contracts | T3 | T7, T8, T10 |
| T5 Manager RED Tests | T2 | T6 |
| T6 Harden DAG Manager | T2, T5 | T9, T10, T13 |
| T7 Executor RED Tests | T4 | T8 |
| T8 Harden Executors | T4, T7 | T9, T10, T11, T12, T13 |
| T9 Orchestration RED Tests | T6, T8 | T10 |
| T10 DRG Harden Orchestrator | T2, T4, T6, T8, T9 | T12, T13, T14 |
| T11 Registration RED Tests | T8 | T12 |
| T12 Plugin Registration | T8, T10, T11 | T13, T14 |
| T13 Round/Cycle Integration | T6, T8, T10, T12 | T14 |
| T14 Final Verification | T10, T12, T13 | — |

### Complexity Budget

- Task count: 14
- Same-wave maximum: 2 tasks
- Estimated execution units: 18
- Budget verdict: acceptable for a medium-large orchestration refactor.

## Tasks

- [ ] 1. T1 Scheduler Prefix RED Tests (Agent: quick TDD; Wave: 1; Files: `tests/orchestrator/scheduler-loop.test.ts`; Acceptance: failing tests cover `idPrefix`, prefix list, prefix cancel, and unrelated task preservation; Verify: `npm test -- tests/orchestrator/scheduler-loop.test.ts`.)
- [ ] 2. T2 Scheduler Prefix APIs (Agent: quick implementation; Wave: 2; Files: `src/orchestrator/scheduler-loop.ts`; Acceptance: `idPrefix`, `listTasksByPrefix`, and `cancelTasksByPrefix` pass T1 without changing `DagEngine` semantics; Verify: `npm test -- tests/orchestrator/scheduler-loop.test.ts`.)
- [ ] 3. T3 Confidence RED Tests (Agent: quick TDD; Wave: 1; Files: `tests/utils/harden-utils.test.ts`, `tests/harden/findings.test.ts`; Acceptance: failing tests cover `Confidence: high|medium|low`, high routing, medium/low disposition, and executor-forbidden taxonomy; Verify: `npm test -- tests/utils/harden-utils.test.ts tests/harden/findings.test.ts`.)
- [ ] 4. T4 Confidence Contracts (Agent: quick implementation; Wave: 2; Files: `src/utils/harden-utils.ts`, `src/commands/harden.ts`; Acceptance: confidence parsing and executor routing pass T3 while quality-gate logic remains unchanged; Verify: `npm test -- tests/utils/harden-utils.test.ts tests/harden/findings.test.ts`.)
- [ ] 5. T5 Manager RED Tests (Agent: quick TDD; Wave: 3; Files: `tests/orchestrator/harden-dag-manager.test.ts`; Acceptance: failing tests cover prefix submit, `dependsOn` chaining, `awaitTask`, archive cleanup, and one-active-DAG guard; Verify: `npm test -- tests/orchestrator/harden-dag-manager.test.ts`.)
- [ ] 6. T6 Harden DAG Manager (Agent: quick implementation; Wave: 4; Files: `src/orchestrator/harden-dag-manager.ts`; Acceptance: Manager is a thin scheduler wrapper, all harden tasks use `idPrefix: prefix`, and Manager owns no prompt/session/convergence logic; Verify: `npm test -- tests/orchestrator/harden-dag-manager.test.ts`.)
- [ ] 7. T7 Executor RED Tests (Agent: implementation TDD; Wave: 3; Files: `tests/orchestrator/harden-executors.test.ts`; Acceptance: failing tests cover session reuse, result schemas, disposition parsing, reviewer-owned convergence, and reviewer-owned 3-rejection counts; Verify: `npm test -- tests/orchestrator/harden-executors.test.ts`.)
- [ ] 8. T8 Harden Executors (Agent: implementation; Wave: 4; Files: `src/orchestrator/harden-executors.ts`; Acceptance: reviewer executor owns 3-rejection state, executor cannot end loop, both executors return session ID/report/tokens/results schemas; Verify: `npm test -- tests/orchestrator/harden-executors.test.ts`.)
- [ ] 9. T9 Orchestration RED Tests (Agent: deep TDD; Wave: 5; Files: `tests/harden/orchestration.test.ts`, `tests/commands/harden-drg-async.test.ts`; Acceptance: failing tests prove one round has up to 5 cycles and every executor report is followed by reviewer verification; Verify: `npm test -- tests/harden/orchestration.test.ts tests/commands/harden-drg-async.test.ts`.)
- [ ] 10. T10 DRG Harden Orchestrator (Agent: deep implementation; Wave: 6; Files: `src/commands/harden.ts`; Acceptance: `runDrgAdversarialLoop` uses global scheduler, outer rounds, inner cycles, reviewer-only termination, cleanup in `finally`, and compatible `FormattedHardenResult`; Verify: `npm test -- tests/harden/orchestration.test.ts tests/commands/harden-drg-async.test.ts`.)
- [ ] 11. T11 Registration RED Tests (Agent: quick TDD; Wave: 5; Files: `tests/index.test.ts`, `tests/index-runtime-registration.test.ts`; Acceptance: failing tests expect global scheduler registration of `harden-reviewer` and `harden-executor` without duplicate scheduler creation; Verify: `npm test -- tests/index.test.ts tests/index-runtime-registration.test.ts`.)
- [ ] 12. T12 Plugin Registration (Agent: quick implementation; Wave: 6; Files: `src/index.ts`; Acceptance: plugin registers harden executors after `current-promotion`, reuses existing scheduler, and leaves quality-gate command wiring unchanged; Verify: `npm test -- tests/index.test.ts tests/index-runtime-registration.test.ts`.)
- [ ] 13. T13 Round/Cycle Integration (Agent: test implementation; Wave: 7; Files: `tests/harden/orchestration.test.ts`, `tests/commands/harden-drg-async.test.ts`, `tests/orchestrator/harden-dag-manager.test.ts`, `tests/orchestrator/harden-executors.test.ts`; Acceptance: tests prove max 5 cycles, reviewer termination authority, no orchestrator rejected-count updates, harden prefix IDs, and archive cleanup; Verify: `npm test -- tests/harden/orchestration.test.ts tests/commands/harden-drg-async.test.ts tests/orchestrator/harden-dag-manager.test.ts tests/orchestrator/harden-executors.test.ts`.)
- [ ] 14. T14 Final Verification and Quality Gate (Agent: QA; Wave: 8; Files: `package.json`, `package-lock.json`, touched source/test files; Acceptance: typecheck, full tests, audit, output compatibility, and scope review pass; Verify: `npx tsc --noEmit && npm test && npm audit --audit-level=high`; Quality Gate: invoke openflow-quality-gate after formal implementation and do not claim completion until readiness.)
