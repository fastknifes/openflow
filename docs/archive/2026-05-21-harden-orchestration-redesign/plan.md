# Plan: harden-orchestration-redesign

## Overview

Refactor `src/commands/harden.ts` from a single-session reviewer-driven loop into a true three-role adversarial harden flow: the current caller acts as Coordinator, Reviewer (`oracle`) and Executor (`deep`) run in independent per-round sessions, Executor can accept/reject/partial findings, Reviewer can rebut rejected findings once, token budgets become reporting-only, and quality-gate can parse the new final-state report.

## Design Context

- Design workspace: `docs/changes/2026-05-21-harden-orchestration-redesign/`
- Primary design: `docs/changes/2026-05-21-harden-orchestration-redesign/design.md`
- Observable behavior: `docs/changes/2026-05-21-harden-orchestration-redesign/behavior.md`
- Current implementation: `src/commands/harden.ts`
- Quality-gate integration: `src/commands/quality-gate.ts`
- Type and config model: `src/types.ts`, `src/config.ts`
- Hard constraints:
  - Preserve `handleHarden(ctx, feature?, args?, sessionID?)` signature.
  - Coordinator is the main agent/current handler, not a new sub-agent.
  - Reviewer and Executor use independent sessions per round with titles `Harden Round N/M - Reviewer` and `Harden Round N/M - Executor`.
  - Executor must return `accept`, `reject`, or `partial` with rationale for every actionable finding.
  - Reviewer may rebut rejected findings once; Executor gives the final response.
  - Remove token hard-stop behavior; keep token totals only for reporting.
  - Add `harden.maxArgumentRoundsPerFinding` with default `2`.
  - Old `tokenBudgetTotal` and `tokenBudgetPerRound` config fields are silently ignored.
  - Harden output remains markdown and must be parseable by quality-gate.
  - V1 prompt separation uses explicit `## System Role` and `## Task` sections inside the text payload; do not depend on an unverified OpenCode API-level system prompt field.
  - `### Findings Final State` uses pipe-delimited summary lines for parser compatibility: `- F1 | group=resolved_findings | disposition=must_fix | status=fixed | level=spec_violation | verdict=accept | files=src/x.ts | evidence=...`.

## Execution Strategy

### Parallel Execution Waves

Wave 1: Add failing tests and update type/config contracts before implementation.

Wave 2: Implement harden orchestration internals and report model after tests define expected behavior.

Wave 3: Update quality-gate parsing and compatibility after the new harden report shape exists.

Wave 4: Run full verification, harden/quality-gate readiness, and prepare atomic commits.

### Dependency Matrix

| Task | Blocked By | Blocks |
|------|------------|--------|
| 1. Add TDD tests for session orchestration and token behavior | None | 4, 5, 8 |
| 2. Add TDD tests for disposition, rebuttal, and report summary | None | 4, 5, 6, 8 |
| 3. Update type and config contract tests | None | 4, 7 |
| 4. Update harden types and config model | 3 | 5, 6, 7 |
| 5. Refactor harden session orchestration | 1, 2, 4 | 6, 8 |
| 6. Implement disposition, rebuttal, and final-state report formatting | 2, 4, 5 | 7, 8 |
| 7. Update quality-gate parser compatibility | 4, 6 | 8 |
| 8. Final verification, quality gate, and atomic commits | 1, 2, 3, 4, 5, 6, 7 | None |

## Tasks

- [x] 1. Add TDD tests for independent sessions and token reporting (Agent: quick | Blocks: [4, 5, 8] | Blocked By: [])
  - Files: `tests/harden/orchestration.test.ts`, `tests/harden/command.test.ts`.
  - Replace current single-session assertions in `tests/harden/orchestration.test.ts` with failing tests that expect one Coordinator session plus independent Reviewer and Executor child sessions for complex runs.
  - Add assertions that created session titles include `Harden: feature-a`, `Harden Round 1/5 - Reviewer`, and `Harden Round 1/5 - Executor`.
  - Add assertions that prompt payloads for Reviewer and Executor are sent to different `path.id` session IDs.
  - Update `tests/harden/command.test.ts` budget-related tests so large token counts do not produce `Status: budget_exhausted`, do not mention per-round budget, and do appear under `Total tokens consumed`.
  - Acceptance Criteria:
    - Tests fail before implementation because current harden reuses one session and still stops on token budgets.
    - Tests explicitly verify behavior scenarios 4.1 and 4.3 from `behavior.md`.
  - Verification Command: `bun test tests/harden/orchestration.test.ts tests/harden/command.test.ts`
  - Expected Output: Initial red state before implementation; after Tasks 4-6, command exits 0.

- [x] 2. Add TDD tests for Executor verdicts, rebuttal, and findings final state (Agent: quick | Blocks: [4, 5, 6, 8] | Blocked By: [])
  - Files: `tests/harden/command.test.ts`, `tests/harden/findings.test.ts`.
  - Add complex-mode test where Reviewer reports one actionable finding, Executor returns `verdict: reject` with rationale, Reviewer Rebuttal accepts the rejection, and final report includes `rejected_findings`.
  - Add complex-mode test where Reviewer reports one actionable finding, Executor rejects it, Reviewer Rebuttal challenges with evidence, Executor Rebuttal still rejects, and final report marks `unresolved_needs_decision`.
  - Add simple-mode test where Reviewer and Executor both run once, Executor returns a disposition, and no automatic fix loop runs.
  - Add tests that output includes `### Findings Final State`, `resolved_findings`, `rejected_findings`, `unresolved_must_fix`, `unresolved_needs_decision`, and per-round session IDs.
  - Acceptance Criteria:
    - Tests fail before implementation because there is no verdict parser, rebuttal flow, or final-state report.
    - Tests explicitly verify behavior scenarios 4.1, 4.2, and section 5 required report contents.
  - Verification Command: `bun test tests/harden/command.test.ts tests/harden/findings.test.ts`
  - Expected Output: Initial red state before implementation; after Tasks 5-6, command exits 0.

- [x] 3. Update type and config contract tests (Agent: quick | Blocks: [4, 7] | Blocked By: [])
  - Files: `tests/utils/config.test.ts`, `tests/utils/config-loader.test.ts`, `tests/harden/complexity.test.ts`.
  - Add config test asserting `defaultConfig.harden.maxArgumentRoundsPerFinding === 2`.
  - Add config test asserting legacy `tokenBudgetTotal` and `tokenBudgetPerRound` are accepted from `openflow` config input but do not appear as required runtime controls.
  - Keep `tests/harden/complexity.test.ts` unchanged except for import/type fallout if required; design explicitly says complexity grading is not changed.
  - Acceptance Criteria:
    - Config tests fail before implementation because `maxArgumentRoundsPerFinding` does not exist.
    - Complexity tests remain green without behavioral changes.
  - Verification Command: `bun test tests/utils/config.test.ts tests/utils/config-loader.test.ts tests/harden/complexity.test.ts`
  - Expected Output: Config tests red before Task 4; all listed tests green after Task 4.

- [x] 4. Update harden types and config model (Agent: quick | Blocks: [5, 6, 7] | Blocked By: [3])
  - Files: `src/types.ts`, `src/config.ts`.
  - Before editing, run GitNexus impact analysis for `HardenConfig`, `HardenStatus`, `HardenResult`, `defaultConfig`, `openFlowConfigOverrideSchema`, and `loadConfig`; record blast radius in implementation notes.
  - In `src/types.ts`, update `HardenConfig` to keep `enabled`, `maxRounds`, `reviewerModel`, `executorModel`, and add `maxArgumentRoundsPerFinding`.
  - Remove `tokenBudgetPerRound` and `tokenBudgetTotal` from `defaultConfig.harden`.
  - Keep compatibility by allowing legacy token fields in `src/config.ts` Zod schema as optional input keys, then strip/drop them before `deepMerge` so runtime `OpenFlowConfig.harden` does not retain legacy budget controls.
  - Add types for harden disposition reporting: `HardenExecutorVerdict`, `HardenDispositionReport`, `HardenRebuttalRecord`, `HardenRoundSessionIds`, and final-state summary fields if needed by `HardenResult`.
  - Ensure `HardenStatus` no longer requires `budget_exhausted` for newly generated harden results; only quality-gate may continue recognizing old `budget_exhausted` reports for backward parsing compatibility.
  - Acceptance Criteria:
    - Type model exposes `maxArgumentRoundsPerFinding`.
    - Old config files containing `tokenBudgetTotal` and `tokenBudgetPerRound` pass validation and are ignored by runtime logic.
    - No public `handleHarden` signature change.
  - Verification Command: `npm run typecheck && bun test tests/utils/config.test.ts tests/utils/config-loader.test.ts`
  - Expected Output: Typecheck exits 0; config tests exit 0.

- [x] 5. Refactor harden session orchestration to true three-role flow (Agent: unspecified-high | Blocks: [6, 8] | Blocked By: [1, 2, 4])
- [x] 6. Implement Executor disposition + Reviewer rebuttal loop + final harden report (Agent: unspecified-high | Blocks: [7, 8] | Blocked By: [5])
  - Files: `src/commands/harden.ts`, `tests/harden/orchestration.test.ts`, `tests/harden/command.test.ts`.
  - Before editing `src/commands/harden.ts`, run GitNexus impact analysis for `handleHarden`, `runAdversarialLoop`, `createHardenSession`, `runAgentTask`, `buildPromptPayload`, and `formatHardenResult`; record blast radius in implementation notes.
  - Replace single shared role session behavior with Coordinator-controlled session creation:
    - Coordinator session title: `Harden: {feature}`.
    - Reviewer session title: `Harden Round {round}/{maxRounds} - Reviewer`.
    - Executor session title: `Harden Round {round}/{maxRounds} - Executor`.
    - Rebuttal session titles: `Harden Round {round}/{maxRounds} - Reviewer Rebuttal` and `Harden Round {round}/{maxRounds} - Executor Rebuttal`.
  - Refactor `createHardenSession` to accept a title and parent session ID while preserving existing parent-child session behavior.
  - Refactor `runAgentTask` and `buildPromptPayload` so Reviewer and Executor payload text always contains explicit `## System Role` and `## Task` sections. Do not add an API-level `system` field in this iteration unless existing OpenCode API support is already proven by repository code.
  - Remove all token hard-stop checks from `runAdversarialLoop`; accumulate tokens only in trace/report data.
  - Keep `maxRounds` as the only hard loop limit for complex mode.
  - Acceptance Criteria:
    - Complex mode creates separate Reviewer and Executor sessions per round.
    - Simple mode creates exactly one Reviewer session and one Executor session.
    - High token responses never return `budget_exhausted`.
    - Existing diff scoping through `readScopedReviewerDiff` remains intact.
  - Verification Command: `bun test tests/harden/orchestration.test.ts tests/harden/command.test.ts`
  - Expected Output: Harden orchestration and command tests exit 0.

- [ ] 6. Implement Executor disposition, rebuttal flow, and final harden report (Agent: unspecified-high | Blocks: [7, 8] | Blocked By: [2, 4, 5])
  - Files: `src/commands/harden.ts`, `src/utils/harden-utils.ts`, `tests/harden/command.test.ts`, `tests/harden/findings.test.ts`.
  - Add parsing helpers in `src/commands/harden.ts` for Executor disposition blocks containing `finding_id`, `verdict`, `rationale`, and `fix_summary`.
  - Update `buildExecutorPrompt` so every actionable finding requires a `verdict: accept | reject | partial` and a rationale.
  - Add Reviewer Rebuttal prompt builder that receives rejected findings and Executor rationale, allowing Reviewer to accept the rejection or challenge once with new evidence.
  - Add Executor Rebuttal prompt builder that receives Reviewer challenge and requires a final `accept` or `reject`.
  - Enforce `ctx.config.harden.maxArgumentRoundsPerFinding` for per-finding argument flow; when exhausted and unresolved, classify as `unresolved_needs_decision` with design ambiguity.
  - Preserve `classifyFindings` behavior unless parsing tests require accepting the new final-state markdown shape.
  - Update `formatHardenResult` to include:
    - `Status`
    - `Stop reason`
    - `Rounds`
    - `Total tokens consumed`
    - `Coordinator session ID`
    - `### Findings Final State`
    - `resolved_findings`
    - `rejected_findings`
    - `unresolved_must_fix`
    - `unresolved_needs_decision`
    - `accepted_known_issues`
    - Per-round Reviewer/Executor session IDs
    - Rebuttal session IDs when present
    - `<details>` block for verbose round disposition and rebuttal trace
  - Emit each finding final-state row in this exact parser-compatible format:
    - `- F1 | group=resolved_findings | disposition=must_fix | status=fixed | level=spec_violation | verdict=accept | files=src/x.ts | evidence=...`
  - Acceptance Criteria:
    - Executor can accept, reject, or partially accept every finding with rationale.
    - Reviewer can rebut rejected findings once.
    - Final report contains all required fields from `behavior.md` section 5.
    - Report remains markdown and keeps `Status:` and `Rounds:` lines for compatibility.
  - Verification Command: `bun test tests/harden/command.test.ts tests/harden/findings.test.ts`
  - Expected Output: Command and findings tests exit 0.

- [x] 7. Update quality-gate parsing for new harden report format (Agent: quick | Blocks: [8] | Blocked By: [4, 6])
  - Files: `src/commands/quality-gate.ts`, `tests/quality-gate/quality-gate.test.ts`.
  - Before editing, run GitNexus impact analysis for `parseFindingsSummary`, `extractBudgetConsumed`, `evaluateHardenReadiness`, `applyHardenReadinessGate`, and `buildHardenSummaryForAcceptanceState`; record blast radius in implementation notes.
  - Update `parseFindingsSummary` to parse both old `### Findings Summary` pipe-delimited lines and new `### Findings Final State` grouped lines.
  - Map final-state groups to readiness:
    - `resolved_findings` does not block.
    - `rejected_findings` does not block.
    - `unresolved_must_fix` blocks `not_ready`.
    - `unresolved_needs_decision` blocks `needs_decision`.
    - `accepted_known_issues` maps to `ready_with_doc_updates` when verify is otherwise ready.
  - Update `extractBudgetConsumed` to parse `Total tokens consumed: N` and fall back to old `Budget consumed: N`.
  - Keep backward compatibility for old harden reports with `budget_exhausted`, but stop expecting new harden output to produce that status.
  - Replace quality-gate tests that assert new budget exhaustion behavior with tests for max-rounds and unresolved final-state behavior.
  - Acceptance Criteria:
    - quality-gate reads new harden report final states correctly.
    - old `### Findings Summary` fixtures in existing tests still parse.
    - `extractBudgetConsumed` supports both old and new token labels.
  - Verification Command: `bun test tests/quality-gate/quality-gate.test.ts`
  - Expected Output: Quality-gate tests exit 0.

- [x] 8. Final verification, quality gate, and atomic commits (Agent: unspecified-high | Blocks: [] | Blocked By: [1, 2, 3, 4, 5, 6, 7])
  - Files: all modified source and test files from Tasks 1-7.
  - Run focused test commands:
    - `bun test tests/harden/orchestration.test.ts`
    - `bun test tests/harden/command.test.ts`
    - `bun test tests/harden/findings.test.ts`
    - `bun test tests/utils/config.test.ts tests/utils/config-loader.test.ts`
    - `bun test tests/quality-gate/quality-gate.test.ts`
  - Run full repository validation:
    - `npm run typecheck`
    - `npm test`
  - Run GitNexus changed-scope check before any commit:
    - `npx gitnexus analyze`
    - GitNexus detect changes for all modified symbols and execution flows.
  - Atomic Commit Strategy:
    - Commit 1: `test: define harden orchestration redesign behavior` with only failing/updated tests from Tasks 1-3.
    - Commit 2: `refactor: add harden config and report contracts` with `src/types.ts`, `src/config.ts`, and compatible parser scaffolding.
    - Commit 3: `refactor: split harden reviewer and executor sessions` with orchestration/session changes in `src/commands/harden.ts`.
    - Commit 4: `feat: add harden disposition and rebuttal flow` with disposition parsing, rebuttal flow, and report formatting.
    - Commit 5: `fix: update quality gate harden report parsing` with `src/commands/quality-gate.ts` and quality-gate tests.
  - Do not commit unless the user explicitly requests commits.
  - After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.
  - Acceptance Criteria:
    - Focused harden and quality-gate tests exit 0.
    - `npm run typecheck` exits 0.
    - `npm test` exits 0 or pre-existing failures are documented with evidence.
    - Quality gate reports readiness or clearly identifies remaining blockers.
  - Verification Command: `npm run typecheck && npm test`
  - Expected Output: Typecheck exits 0; test suite exits 0 or any pre-existing failures are explicitly documented.

## Execution Unit Estimate

- Tasks: 8
- Estimated execution units: 18
- Same-wave concurrency: max 3
- Complexity: large refactor, bounded by TDD-first waves and parser/report compatibility isolation.

## Quality Gate Instruction

After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.


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

- **Same-wave tasks**: 8 (recommended max: 4)
- **Estimated execution units**: 14 (recommended max: 20)

**Suggestion**: Split large waves across multiple `/start-work` invocations
or reduce per-wave task count to keep execution feedback loops short.
