# Plan: quality-gate-integration-test-executor

## Overview

在现有 `openflow-quality-gate` / `handleVerify` 流程中加入集成测试执行适配器。适配器读取 `behavior.md` 中的 critical scenario，优先执行已映射的集成测试；若 TypeScript/Bun 项目缺少对应测试，则生成持久化测试文件并执行。真实执行结果覆盖静态 Evidence Mapping 的内存判定，并参与 readiness 分类。无 `behavior.md`、无 critical scenario、禁用配置、或不支持语言时保持现有质量门兼容行为。

## Design Context

- Design workspace: `docs/changes/2026-05-21-quality-gate-integration-test-executor/`
- Design: `docs/changes/2026-05-21-quality-gate-integration-test-executor/design.md`
- Behavior: `docs/changes/2026-05-21-quality-gate-integration-test-executor/behavior.md`
- Primary integration point: `src/commands/verify.ts`
- Existing adapter patterns: `src/adapters/types.ts`, `src/adapters/command-runner.ts`, `src/adapters/security/*.ts`, `src/adapters/consistency/*.ts`
- Existing language detection reference: `src/utils/compilation-probe.ts`
- Existing tests to extend: `tests/commands/verify.test.ts`, `tests/quality-gate/quality-gate.test.ts`
- Compatibility constraint: do not change `src/commands/quality-gate.ts` orchestration semantics; wire new behavior through verify evidence collection.

## Execution Strategy

### Parallel Execution Waves

Wave 1: Foundation tasks with no dependencies.
- Task 1: Add contracts and config.
- Task 2: Add behavior scenario/evidence parser module.

Wave 2: Adapter implementation.
- Task 3: Add TypeScript/Bun strategy and safe execution utilities.
- Task 4: Add integration executor orchestration.

Wave 3: Verify integration.
- Task 5: Wire executor into `collectEvidence`.
- Task 6: Extend readiness classification and formatted output.

Wave 4: Tests and documentation.
- Task 7: Add focused adapter/verify/quality-gate tests.
- Task 8: Align skill text and current spec.

Wave 5: Final verification.
- Task 9: Run typecheck, targeted tests, full tests, manual QA, and OpenFlow quality gate.

### Dependency Matrix

| Task | Blocked By | Blocks |
|------|------------|--------|
| 1. Contracts and config | none | 3, 4, 5, 6, 7 |
| 2. Scenario/evidence parser | none | 4, 5, 7 |
| 3. TypeScript/Bun strategy | 1 | 4, 7 |
| 4. Integration executor | 1, 2, 3 | 5, 6, 7 |
| 5. Verify collection wiring | 1, 2, 4 | 6, 7, 9 |
| 6. Readiness and output | 1, 4, 5 | 7, 9 |
| 7. Regression and adapter tests | 1, 2, 3, 4, 5, 6 | 9 |
| 8. Skill/docs alignment | 5, 6 | 9 |
| 9. Final verification and quality gate | 7, 8 | none |

## Tasks

- [ ] 1. Add integration executor contracts and config (Agent: quick | Blocks: [3, 4, 5, 6, 7] | Blocked By: [])

  **Agent Profile**: `quick`; skills: []. Localized type/config work.

  **Parallelization**: Wave 1; can run in parallel with Task 2.

  **Implementation**:
  - Modify `src/types.ts`:
    - Add `IntegrationTestExecutorConfig` with `enabled: boolean`, `strictGeneratedReview: boolean`, `timeoutMs: number`, `testDir: string`, and `supportedLanguages: Array<'typescript'>`.
    - Add optional `integrationTest?: IntegrationTestExecutorConfig` to `VerificationConfig`.
    - Add `IntegrationTestExecutionStatus = 'verified' | 'failed' | 'missing_evidence' | 'not_applicable'`.
    - Add `IntegrationTestExecutionResult` with `scenarioId`, `scenarioName`, `criticality`, `testFilePath`, `generated`, `passed`, `output`, `durationMs`, `coverageLevel`, `status`, and optional `reasonCode`.
    - Add optional `integrationTestResults?: IntegrationTestExecutionResult[]` to `VerifyEvidencePacket`.
  - Modify `src/config.ts`:
    - Add `integrationTest` to the `verification` override schema.
    - Keep schema strictness for unknown fields.
    - Add defaults to `defaultConfig.verification.integrationTest`: `enabled: true`, `strictGeneratedReview: true`, `timeoutMs: 60000`, `testDir: 'tests/integration/openflow-behavior'`, `supportedLanguages: ['typescript']`.

  **Acceptance Criteria**:
  - [ ] `npm run typecheck` exits 0.
  - [ ] Existing configs without `verification.integrationTest` still load with defaults.
  - [ ] Invalid `verification.integrationTest.timeoutMs <= 0` is rejected by the config schema.

  **QA Scenarios**:
  - Scenario: Default config compatibility. Command: `bun test tests/utils/config.test.ts`. Expected: existing config tests pass; if file is absent, executor documents the absence and runs `npm run typecheck` instead.
  - Scenario: Contract compile check. Command: `npm run typecheck`. Expected: exit code 0.

- [ ] 2. Add behavior scenario and evidence parser module (Agent: quick | Blocks: [4, 5, 7] | Blocked By: [])

  **Agent Profile**: `quick`; skills: []. Parser extraction with bounded scope.

  **Parallelization**: Wave 1; can run in parallel with Task 1.

  **Implementation**:
  - Create `src/adapters/integration/scenario-parser.ts`.
  - Export `parseBehaviorScenariosFromFile(behaviorPath: string): Promise<BehaviorScenario[]>`.
  - Export `parseBehaviorEvidenceMappingsFromFile(behaviorPath: string): Promise<BehaviorScenarioEvidence[]>`.
  - Support existing heading syntax used by `src/contracts/contract-extractor.ts`: `### Scenario:` and `### Boundary:` with Given/When/Then lists.
  - Support current Evidence Mapping table syntax used by `src/commands/verify.ts`: `Scenario ID | Criticality | Evidence Ref | Evidence Type | Coverage Level | Equivalence Rationale | Freshness | Status`.
  - Preserve old 4-column mapping compatibility: `Behavior | Evidence Type | Expected Evidence | Status`.
  - Do not remove existing parser helpers from `src/commands/verify.ts` until Task 5 replaces their use safely.

  **Acceptance Criteria**:
  - [ ] Heading scenarios parse into `BehaviorScenario[]` with critical scenarios defaulting to `critical` and boundary scenarios to `optional`.
  - [ ] New 8-column Evidence Mapping parses into `BehaviorScenarioEvidence[]`.
  - [ ] Old 4-column Evidence Mapping remains supported.

  **QA Scenarios**:
  - Scenario: Heading parser. Command: `bun test tests/adapters/integration/scenario-parser.test.ts`. Expected: Given/When/Then arrays and criticality are correct.
  - Scenario: Mapping parser. Command: `bun test tests/adapters/integration/scenario-parser.test.ts`. Expected: evidence reference, coverage, freshness, and status fields are correct.

- [ ] 3. Add TypeScript/Bun integration strategy and safe runner (Agent: unspecified-high | Blocks: [4, 7] | Blocked By: [1])

  **Agent Profile**: `unspecified-high`; skills: []. Generates test code and executes test files.

  **Parallelization**: Wave 2; can start after Task 1.

  **Implementation**:
  - Create `src/adapters/integration/typescript-bun-strategy.ts`.
  - Export `TypeScriptBunIntegrationStrategy` with:
    - `detect(projectDir: string): Promise<boolean>` returning true when `package.json` and `tsconfig.json` exist.
    - `resolveTestFilePath(projectDir: string, testDir: string, scenarioId: string): string`.
    - `generate(scenario: BehaviorScenario, projectDir: string, testDir: string): Promise<{ testFilePath: string; generated: boolean }>`.
    - `execute(testFilePath: string, projectDir: string, timeoutMs: number): Promise<{ passed: boolean; output: string; durationMs: number }>`.
  - Use `src/adapters/command-runner.ts` `runCommand('bun', ['test', testFilePath], { cwd: projectDir, timeout: timeoutMs })` for execution.
  - Generated tests must be written to `tests/integration/openflow-behavior/{safe-scenario-id}.test.ts`.
  - Generated tests must include an OpenFlow auto-generation marker and a failing scaffold unless a mapped existing test is already present. This ensures newly generated unknown tests require review instead of producing false success.
  - Never write to `src/` or docs from this strategy.
  - Do not overwrite an existing test file unless it contains the OpenFlow auto-generation marker.

  **Acceptance Criteria**:
  - [ ] TypeScript/Bun detection works for fixture projects.
  - [ ] Missing tests are generated under `tests/integration/openflow-behavior/`.
  - [ ] Manually written tests are not overwritten.
  - [ ] Execution captures pass/fail, output, and duration.

  **QA Scenarios**:
  - Scenario: Generate missing test. Command: `bun test tests/adapters/integration/typescript-bun-strategy.test.ts`. Expected: generated file exists and contains the OpenFlow marker.
  - Scenario: Preserve manual test. Command: `bun test tests/adapters/integration/typescript-bun-strategy.test.ts`. Expected: pre-existing manual file content is unchanged.
  - Scenario: Execute passing test. Command: `bun test tests/adapters/integration/typescript-bun-strategy.test.ts`. Expected: result has `passed: true`.

- [ ] 4. Implement integration test executor adapter (Agent: unspecified-high | Blocks: [5, 6, 7] | Blocked By: [1, 2, 3])

  **Agent Profile**: `unspecified-high`; skills: []. Core orchestration work.

  **Parallelization**: Wave 2; depends on parser and TypeScript/Bun strategy.

  **Implementation**:
  - Create `src/adapters/integration/integration-test-executor.ts`.
  - Export `runIntegrationTestExecutor(input)` with input fields: `projectDir`, `feature`, `behaviorPath`, `contract`, `config`, and optional `existingEvidence`.
  - Execution rules:
    - If `config.enabled === false`, return an empty result array.
    - If `behaviorPath` is absent or has no critical scenarios, return an empty result array.
    - If TypeScript/Bun is detected, process each critical scenario.
    - If Evidence Mapping points to an existing test file, execute that file.
    - If no existing test file is mapped, generate a test file and execute it.
    - If language is unsupported, return a non-blocking `not_applicable` result with reason code `integration_test_unsupported_language`.
  - Map command results:
    - exit 0 -> `status: 'verified'`, `passed: true`, coverage `exact`.
    - non-zero -> `status: 'failed'`, `passed: false`, reason `integration_test_failed`.
    - timeout -> `status: 'failed'`, reason `integration_test_execution_timeout`.
    - tool missing -> `status: 'missing_evidence'`, reason `integration_test_execution_error`.

  **Acceptance Criteria**:
  - [ ] Executor returns empty results for no behavior file.
  - [ ] Executor runs existing mapped tests.
  - [ ] Executor generates and runs missing TypeScript/Bun tests.
  - [ ] Unsupported language is advisory and non-blocking.

  **QA Scenarios**:
  - Scenario: No behavior file. Command: `bun test tests/adapters/integration/integration-test-executor.test.ts`. Expected: no results and no throw.
  - Scenario: Existing mapped test fails. Command: `bun test tests/adapters/integration/integration-test-executor.test.ts`. Expected: result reasonCode `integration_test_failed`.
  - Scenario: Unsupported language. Command: `bun test tests/adapters/integration/integration-test-executor.test.ts`. Expected: `not_applicable` advisory result.

- [ ] 5. Wire executor into verify evidence collection (Agent: unspecified-high | Blocks: [6, 7, 9] | Blocked By: [1, 2, 4])

  **Agent Profile**: `unspecified-high`; skills: [`gitnexus-impact-analysis`]. `verify.ts` is central workflow code.

  **Parallelization**: Wave 3; depends on executor.

  **Implementation**:
  - Before editing `handleVerify`, `collectEvidence`, or `classifyReadiness`, run GitNexus impact analysis for the target symbols and record direct callers in implementation notes.
  - Modify `src/commands/verify.ts`:
    - Import `runIntegrationTestExecutor`.
    - In `collectEvidence`, call the executor after `runCompilationProbe(ctx.directory)` and before `evaluateBehaviorScenarios` is finalized.
    - Pass `ctx.directory`, `feature`, resolved `changeBehaviorPath`, active `contract`, and `ctx.config.verification.integrationTest`.
    - Attach results to `VerifyEvidencePacket.integrationTestResults`.
    - Merge integration execution results into `behaviorScenarios` by scenario id/name so real execution overrides static Evidence Mapping status in memory.
    - Extend `observedBehaviorSummary` to include integration executed/generated/passed/failed/skipped counts.
    - Extend `knownRisksOrMissingEvidence` with failed integration scenario summaries.
  - Keep generic `runQualityChecks` behavior unchanged; do not reintroduce lint/typecheck/test shell execution there.

  **Acceptance Criteria**:
  - [ ] Existing no-`behavior.md` verify behavior remains unchanged.
  - [ ] Real integration failure overrides static `verified` Evidence Mapping.
  - [ ] Verify evidence includes integration execution summary when results exist.

  **QA Scenarios**:
  - Scenario: Static verified but actual test fails. Command: `bun test tests/commands/verify.test.ts --filter "integration"`. Expected: readiness is not_ready.
  - Scenario: No behavior.md regression. Command: `bun test tests/commands/verify.test.ts --filter "active feature"`. Expected: existing active-feature verify test remains ready.

- [ ] 6. Extend readiness classification and verify output (Agent: quick | Blocks: [7, 9] | Blocked By: [1, 4, 5])

  **Agent Profile**: `quick`; skills: []. Maps new evidence into existing readiness semantics.

  **Parallelization**: Wave 3; can run after Task 5.

  **Implementation**:
  - Modify `src/commands/verify.ts`:
    - In `classifyReadiness`, map critical integration execution results:
      - failed critical result -> `integration_test_failed` and `NotReady`.
      - execution timeout -> `integration_test_execution_timeout` and `NotReady`.
      - execution error -> `integration_test_execution_error` and `NotReady`.
      - generated unchecked with `strictGeneratedReview === true` -> `integration_test_generated_unchecked` and `NeedsDecision`.
      - unsupported language -> no blocking reason code.
    - In `formatVerifyResult`, add `integration_test_results` under Evidence when `VerifyEvidencePacket.integrationTestResults` exists.
    - Include scenario id, test path, generated flag, status, reason code, duration, and a compact output excerpt.
  - Preserve `quality-gate.ts` readiness extraction compatibility by keeping the `- status: ...` line unchanged.

  **Acceptance Criteria**:
  - [ ] Failed critical integration test maps to `not_ready`.
  - [ ] Generated unchecked strict-mode result maps to `needs_decision`.
  - [ ] Unsupported language is visible but non-blocking.
  - [ ] Quality gate can still parse verify readiness status.

  **QA Scenarios**:
  - Scenario: Failed critical integration test. Command: `bun test tests/commands/verify.test.ts --filter "integration test failed"`. Expected: `- status: not_ready` and reason `integration_test_failed`.
  - Scenario: Generated unchecked strict mode. Command: `bun test tests/commands/verify.test.ts --filter "generated unchecked"`. Expected: `- status: needs_decision`.
  - Scenario: Unsupported language advisory. Command: `bun test tests/commands/verify.test.ts --filter "unsupported integration language"`. Expected: unsupported language alone does not block readiness.

- [ ] 7. Add focused adapter, verify, and quality-gate tests (Agent: unspecified-high | Blocks: [9] | Blocked By: [1, 2, 3, 4, 5, 6])

  **Agent Profile**: `unspecified-high`; skills: []. Test coverage spanning new adapter and existing verify/quality-gate flows.

  **Parallelization**: Wave 4; depends on implementation tasks.

  **Implementation**:
  - Add `tests/adapters/integration/scenario-parser.test.ts`.
  - Add `tests/adapters/integration/typescript-bun-strategy.test.ts`.
  - Add `tests/adapters/integration/integration-test-executor.test.ts`.
  - Update `tests/commands/verify.test.ts` with:
    - actual failed integration test overrides static `verified` mapping.
    - generated unchecked strict mode produces `needs_decision`.
    - no `behavior.md` regression remains unchanged.
    - unsupported language advisory is non-blocking.
  - Update `tests/quality-gate/quality-gate.test.ts` with a report-output assertion for integration test results when verify includes them.

  **Acceptance Criteria**:
  - [ ] `bun test tests/adapters/integration tests/commands/verify.test.ts tests/quality-gate/quality-gate.test.ts` passes.
  - [ ] One test proves static `verified` is not trusted when real integration execution fails.
  - [ ] One test proves no-`behavior.md` compatibility.

  **QA Scenarios**:
  - Scenario: Adapter suite. Command: `bun test tests/adapters/integration`. Expected: exit code 0.
  - Scenario: Verify suite. Command: `bun test tests/commands/verify.test.ts`. Expected: exit code 0.
  - Scenario: Quality-gate suite. Command: `bun test tests/quality-gate/quality-gate.test.ts`. Expected: exit code 0.

- [ ] 8. Align quality-gate skill and current spec docs (Agent: writing | Blocks: [9] | Blocked By: [5, 6])

  **Agent Profile**: `writing`; skills: []. User-facing guidance updates only.

  **Parallelization**: Wave 4; can run after verify behavior is final.

  **Implementation**:
  - Modify `src/skills/quality-gate-skill.ts`:
    - Add that quality gate may run behavior-derived integration tests for `behavior.md` critical scenarios.
    - Preserve boundary that generic lint/typecheck/unit/build/format remain implementation-agent responsibility.
  - Modify `docs/current/spec/quality-gate-evidence-judge/behavior.md`:
    - Replace absolute statements that Quality Gate never executes integration tests with the new distinction: no generic fixed test commands, but behavior-derived integration execution is allowed through the adapter.
    - Keep the rule that unsupported tools/languages degrade gracefully and do not hardcode one toolchain for all projects.

  **Acceptance Criteria**:
  - [ ] Skill text mentions the integration test executor adapter.
  - [ ] Current spec no longer contradicts the new adapter behavior.
  - [ ] Generic quality command boundary remains documented.

  **QA Scenarios**:
  - Scenario: Skill registration still passes. Command: `bun test tests/skills/registration.test.ts`. Expected: exit code 0.
  - Scenario: Spec wording review. Command: search `docs/current/spec/quality-gate-evidence-judge/behavior.md` for `集成测试`. Expected: text distinguishes generic quality commands from behavior-derived integration execution.

- [ ] 9. Final verification and OpenFlow quality gate (Agent: unspecified-high | Blocks: [] | Blocked By: [7, 8])

  **Agent Profile**: `unspecified-high`; skills: [`openflow-quality-gate`]. Final validation and readiness.

  **Parallelization**: Wave 5; must run last.

  **Implementation**:
  - Run `npm run typecheck`.
  - Run `bun test tests/adapters/integration tests/commands/verify.test.ts tests/quality-gate/quality-gate.test.ts`.
  - Run `npm test`.
  - Manually QA the actual feature with a fixture feature containing `behavior.md` critical scenario and verify output containing `integration_test_results`.
  - After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.

  **Acceptance Criteria**:
  - [ ] Typecheck exits 0.
  - [ ] Targeted integration/verify/quality-gate tests pass.
  - [ ] Full test suite passes or pre-existing unrelated failures are documented with exact files and errors.
  - [ ] Manual QA output proves integration executor ran or correctly skipped.
  - [ ] `openflow-quality-gate` returns `Ready` or `ReadyWithDocUpdates`, or blockers are fixed and rerun.

  **QA Scenarios**:
  - Scenario: Typecheck. Command: `npm run typecheck`. Expected: exit code 0.
  - Scenario: Targeted tests. Command: `bun test tests/adapters/integration tests/commands/verify.test.ts tests/quality-gate/quality-gate.test.ts`. Expected: exit code 0.
  - Scenario: Full suite. Command: `npm test`. Expected: exit code 0 or documented pre-existing failures.
  - Scenario: Quality gate readiness. Tool: `openflow-quality-gate`. Expected: readiness reported before completion claim.

## Execution Unit Estimate

- Tasks: 9
- Estimated execution units: 18
- Maximum same-wave concurrency: 2
- Complexity: Large

## Quality Gate Instruction

After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.
