# Plan: harden-drg-async

## Overview

Replace the synchronous in-process harden adversarial loop (`src/commands/harden.ts`) with an asynchronous DRG-backed flow. Each harden call creates an isolated DAG using the global singleton `SchedulerLoop`, with reviewer and executor tasks running as DRG executors that communicate via long-lived sessions. The output format (`HardenResult`) remains fully backward-compatible.

## Design Context

- Design: `docs/changes/2026-05-31-harden-drg-async/design.md`
- Behavior: `docs/changes/2026-05-31-harden-drg-async/behavior.md`
- State: `docs/changes/2026-05-31-harden-drg-async/state.md`

Key constraints carried forward:
- `[must]` DRG remains a global singleton; all harden tasks share the same `SchedulerLoop` / `DagEngine`.
- `[must]` Each harden call uses an isolated DAG via task-ID prefix (`harden-<uuid>-*`).
- `[must]` Reviewer and executor hold long-lived sessions; session IDs chain via task payload/result.
- `[must]` Default 1 round (reviewer→executor→reviewer), max 10, serial execution.
- `[must]` Termination判定权在 reviewer; max rounds is a hard ceiling.
- `[must]` Same finding rejected 3 times → reviewer ignores it (tracked per-finding in reviewer session state).
- `[must]` Reviewer reports include confidence (`high` / `medium` / `low`); executor fixes high only.
- `[must]` harden output format compatible with existing `HardenResult` / `formatHardenResult`.
- `[must]` quality-gate orchestration logic is NOT modified.
- `[must]` DRG engine core is NOT modified (existing semantics preserved; only additive extensions).
- `[must]` At most one harden DAG runs at a time.

## Planning Strategy

No specific methodology enforced. Decompose directly into executable tasks by functional boundary:

1. **SchedulerLoop extension** — add prefix-based query/cancel helpers without touching `DagEngine` core.
2. **Harden DAG manager** — lifecycle (create, track, await, archive/destroy) for an isolated harden DAG.
3. **DRG executors** — `harden-reviewer` and `harden-executor` executor functions registered at plugin startup.
4. **Async harden orchestrator** — rewrite `runAdversarialLoop` into an async DRG driver.
5. **Prompt & confidence integration** — inject confidence levels into reviewer/executor prompts; update `classifyFindings` and `filterExecutorFindings`.
6. **Tests & verification** — unit tests for DAG manager and executors; integration test for end-to-end async flow.

## Execution Strategy

### Parallel Execution Waves

Wave 1 (no dependencies):
- T1: Extend SchedulerLoop with prefix helpers
- T2: Create HardenDagManager
- T3: Add confidence support to harden prompts and utils

Wave 2 (depends on Wave 1):
- T4: Implement DRG harden-reviewer / harden-executor executors
- T5: Rewrite runAdversarialLoop → async DRG orchestrator

Wave 3 (depends on Wave 2):
- T6: Register executors in plugin bootstrap
- T7: Integration tests and regression verification

### Dependency Matrix

| Task | Blocked By | Blocks |
|------|------------|--------|
| T1 | — | T2, T4 |
| T2 | T1 | T5 |
| T3 | — | T4, T5 |
| T4 | T1, T3 | T5, T6 |
| T5 | T2, T3, T4 | T6, T7 |
| T6 | T4, T5 | T7 |
| T7 | T5, T6 | — |

## Tasks

- [ ] 1. Extend SchedulerLoop with prefix-based operations (Agent: quick | Parallel: yes)
  - Add `listTasksByPrefix(prefix: string): SchedulerTask[]` to `SchedulerLoop` that filters `this.dagEngine.listTasks()` by `task.id.startsWith(prefix)`.
  - Add `cancelTasksByPrefix(prefix: string): string[]` that iterates matched tasks and calls `this.cancelTask(task.id)`, returning cancelled IDs.
  - Add `areAllTasksTerminal(prefix: string): boolean` that checks whether every task with the prefix is in a terminal status (`succeeded`, `failed`, `cancelled`, `blocked`).
  - **Files**: `src/orchestrator/scheduler-loop.ts`
  - **Verification**: `npm test -- tests/orchestrator/scheduler-loop.test.ts` passes (add new test cases for the three new methods).

- [ ] 2. Create HardenDagManager for isolated DAG lifecycle (Agent: quick | Parallel: yes)
  - Create `src/orchestrator/harden-dag-manager.ts` exporting `HardenDagManager`.
  - Constructor accepts `scheduler: SchedulerLoop`.
  - `createHardenDag(feature: string): { dagId: string; prefix: string }`:
    - Generates `dagId = randomUUID()`, prefix = `harden-${dagId}-`.
    - Enforce at-most-one-active rule: if any existing task ID starts with `harden-` and is non-terminal, throw `Error('A harden DAG is already running')`.
    - Store `activeDagId` internally.
  - `submitReviewerTask(round: number, payload: ReviewerTaskPayload): string`:
    - Calls `scheduler.submitTask({ type: 'harden-reviewer', payload, dependsOn: previousTaskId ? [previousTaskId] : undefined })`.
    - Returns task ID.
  - `submitExecutorTask(round: number, payload: ExecutorTaskPayload, dependsOn: string[]): string`.
  - `awaitCompletion(prefix: string, pollIntervalMs = 500): Promise<void>`:
    - Polls `scheduler.areAllTasksTerminal(prefix)` until true or timeout (configurable, default 30 min).
  - `archiveAndDestroy(prefix: string): void`:
    - Calls `scheduler.cancelTasksByPrefix(prefix)` for any non-terminal tasks.
    - Clears internal `activeDagId`.
  - **Files**: `src/orchestrator/harden-dag-manager.ts`
  - **Verification**: `npm test -- tests/orchestrator/harden-dag-manager.test.ts` passes.

- [ ] 3. Add confidence-level support to harden prompts and utilities (Agent: quick | Parallel: yes)
  - Update `buildReviewerPrompt` in `src/commands/harden.ts`:
    - Instruct reviewer to output `Confidence: high | medium | low` for every finding.
    - Include confidence semantics: high = clear contract violation with direct evidence; medium = likely issue but some inference required; low = potential concern, weak evidence.
  - Update `classifyFindings` in `src/utils/harden-utils.ts` to parse the `Confidence:` line and populate `finding.confidence`.
  - Update `filterExecutorFindings` in `src/commands/harden.ts`:
    - Always include `high` confidence findings.
    - Include `medium`/`low` only if `finding.disposition === 'must_fix'` AND no explicit `executorAllowed: false`.
    - Preserve existing taxonomy exclusions (`contract_divergence`, `missing_evidence`).
  - **Files**: `src/commands/harden.ts`, `src/utils/harden-utils.ts`
  - **Verification**: `npm test -- tests/utils/harden-utils.test.ts` and `npm test -- tests/commands/harden.test.ts` pass.

- [ ] 4. Implement DRG harden-reviewer and harden-executor executors (Agent: quick | Parallel: no)
  - Create `src/orchestrator/harden-executors.ts` exporting two `ExecutorFunction`s.
  - `hardenReviewerExecutor`:
    - Receives `task.payload` containing: `sessionID` (reviewer session ID or undefined), `planSummary`, `diffStr`, `priorFindings`, `fixReport`, `round`, `maxRounds`, `rejectedCounts` (Record<findingKey, number>).
    - If `sessionID` is undefined, lazily creates a new reviewer session via `createHardenSession` (reuse existing utility from `src/commands/harden.ts`, or extract to shared helper).
    - Builds reviewer prompt, runs agent task via `runAgentTask`, classifies findings.
    - Applies 3-rejection rule: for each finding whose key exists in `rejectedCounts` with count ≥ 3, drop it from the report.
    - Decides convergence:
      - If `round >= maxRounds` → converged = true, reason = `max_rounds_reached`.
      - If no actionable findings and no ambiguous findings → converged = true, reason = `no_findings`.
      - Else → converged = false.
    - Stores result: `{ sessionID, findings, converged, reason, rejectedCounts }`.
  - `hardenExecutorExecutor`:
    - Receives `task.payload` containing: `sessionID` (executor session ID or undefined), `findings`, `planSummary`, `filePaths`.
    - Lazily creates executor session if needed.
    - Builds executor prompt, runs agent task, parses dispositions.
    - Returns result: `{ sessionID, dispositions, fixReport, codeChanges }`.
  - **Files**: `src/orchestrator/harden-executors.ts`
  - **Verification**: `npm test -- tests/orchestrator/harden-executors.test.ts` passes.

- [ ] 5. Rewrite `runAdversarialLoop` into async DRG orchestrator (Agent: deep | Parallel: no)
  - In `src/commands/harden.ts`, replace `runAdversarialLoop` with `runDrgAdversarialLoop`.
  - New flow:
    1. Instantiate `HardenDagManager` with global `getSchedulerLoop()`.
    2. `manager.createHardenDag(sanitizedFeature)`.
    3. Submit initial reviewer task (round 1, no prior findings).
    4. Loop (max `maxRounds` iterations):
       a. Wait for the latest reviewer task to succeed via polling `scheduler.getTask(reviewerTaskId)`.
       b. Read result: `findings`, `converged`, `reason`, `rejectedCounts`, `sessionID`.
       c. If `converged` → break loop, build final `HardenResult`.
       d. Filter executor findings by confidence/disposition.
       e. Submit executor task depending on the reviewer task.
       f. Wait for executor task to succeed.
       g. Read executor result: `dispositions`, `fixReport`, `sessionID`.
       h. Update `rejectedCounts`: for each finding with verdict `reject`, increment count; for `accept`/`partial`, reset count.
       i. Submit next reviewer task with updated payload (chain `dependsOn` to executor task).
    5. After loop, call `manager.archiveAndDestroy(prefix)`.
    6. Return `FormattedHardenResult` compatible with existing `formatHardenResult`.
  - Preserve existing token counting, trace entries, diff scoping, and complexity grading.
  - **Files**: `src/commands/harden.ts`
  - **Verification**: `npm test -- tests/commands/harden.test.ts` passes.

- [ ] 6. Register harden executors in plugin bootstrap (Agent: quick | Parallel: no)
  - In `src/index.ts`, after `current-promotion` executor registration:
    - Conditionally import `src/orchestrator/harden-executors.ts`.
    - Register `harden-reviewer` and `harden-executor` executors on `schedulerLoop` if not already present.
  - **Files**: `src/index.ts`
  - **Verification**: `npm test -- tests/index.test.ts` or existing plugin init tests pass.

- [ ] 7. Integration tests and regression verification (Agent: quick | Parallel: no)
  - Add `tests/orchestrator/harden-dag-integration.test.ts`:
    - Mock `SchedulerLoop` and `DagEngine`.
    - Verify a full 1-round reviewer→executor→reviewer flow reaches convergence.
    - Verify 3-rejection rule causes finding to be dropped.
    - Verify max-rounds termination.
    - Verify only-one-harden-DAG-at-a-time enforcement.
  - Run full test suite: `npm test`.
  - Run TypeScript type check: `npx tsc --noEmit`.
  - **Files**: `tests/orchestrator/harden-dag-integration.test.ts`
  - **Verification**: `npm test` passes with no failures; `npx tsc --noEmit` has zero errors.

After formal implementation is complete and Full Quality Gate admission criteria are met, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness. For casual coding or low-risk edits, use lightweight verification instead.


---
## Verification Phase

### Security Checks
- **Secret Scan**: Check for accidentally committed secrets
- **Vulnerability Scan**: Run dependency vulnerability check

### Quality Checks
- **Lint Check**: Run linter
- **Type Check**: Run type checker
- **Test Suite**: Run all tests

### Final Verification Authority

**After all implementation tasks are complete, invoke `openflow-quality-gate` as the final readiness authority.**

The quality gate performs:
- Adversarial hardening assessment (risk-based)
- Evidence collection and verification
- Readiness classification (`Ready`, `ReadyWithDocUpdates`, `NotReady`, `NeedsDecision`)

Do not claim completion until `openflow-quality-gate` returns `Ready` or `ReadyWithDocUpdates`.

### Failure Handling
- Quality failure: fix implementation and rerun verification.
- Security failure: block archive until fixed.
- Consistency failure: sync docs and implementation, then rerun verification.

> Auto-generated by OpenFlow. `openflow-quality-gate` is the final verification authority.

---
## Plan Budget Warning

> This plan exceeds recommended task density. The warning is non-blocking —
> implementation may proceed, but consider splitting into smaller waves.

- **Same-wave tasks**: 7 (recommended max: 4)
- **Estimated execution units**: 13 (recommended max: 20)

**Suggestion**: Split large waves across multiple `/openflow-implement` invocations
or reduce per-wave task count to keep execution feedback loops short.
