# Plan: quality-gate-workflow-redesign

## Overview

Redesign the Quality Gate workflow so it has a visible top-level gate session, a contract-alignment Harden judgment model, integration-test-backed Behavior Evidence, clear archive readiness semantics, and cleanup of stale Quality Gate-related branches.

## Design Context

- Design workspace: `docs/changes/2026-05-23-quality-gate-workflow-redesign/`
- Primary design: `docs/changes/2026-05-23-quality-gate-workflow-redesign/design.md`
- Observable behavior: `docs/changes/2026-05-23-quality-gate-workflow-redesign/behavior.md`
- Current Quality Gate implementation: `src/commands/quality-gate.ts`
- Current Harden implementation: `src/commands/harden.ts`, `src/utils/harden-utils.ts`, `src/utils/harden-ledger.ts`
- Current Verify / evidence implementation: `src/commands/verify.ts`, `src/utils/evidence-freshness.ts`
- Current mapper implementation: `src/phases/archive/implementation-mapper.ts`
- Current readiness state: `src/types.ts`, `src/utils/acceptance-state.ts`, `src/utils/implementation-run.ts`, `src/commands/archive.ts`
- Tests to extend: `tests/quality-gate/quality-gate.test.ts`, `tests/commands/verify.test.ts`, `tests/utils/harden-utils.test.ts`, `tests/utils/acceptance-state.test.ts`, `tests/phases/implementation-mapper.test.ts`, `tests/commands/archive.test.ts`, `tests/index.test.ts`, `tests/hooks/chat-message.test.ts`

Key constraints:
- Quality Gate remains a deterministic orchestrator, not a free-form autonomous agent.
- Harden may fix implementation deviations but must not silently rewrite requirements or approve contract divergence.
- Intent inference must include evidence, confidence, alignment, and final decision.
- Archive must not run automatically after Quality Gate readiness.
- `ready_for_archive` remains as a workflow state and must mean “Awaiting Archive Confirmation”.
- Cleanup must converge stale issue-mode / old harden-verify paths without removing compatibility fields unsafely.

## Execution Strategy

### Parallel Execution Waves

Wave 1: Foundation type/model updates and test fixtures. Tasks 1-3 have no dependencies and prepare shared contracts.

Wave 2: Implement core workflow behavior. Tasks 4-7 depend on Wave 1 contracts and can run mostly in parallel across Harden, Quality Gate, Verify, and mapper boundaries.

Wave 3: Cleanup, documentation, and end-to-end quality assertions. Tasks 8-10 depend on Wave 2 behavior being available.

Wave 4: Final verification. Task 11 depends on all implementation tasks.

### Dependency Matrix

| Task | Blocked By | Blocks |
|---|---|---|
| 1. Update shared Quality Gate and Harden types | None | 4, 5, 6, 7, 8 |
| 2. Add test fixtures for Quality Gate sessions and behavior evidence | None | 4, 5, 6, 7, 11 |
| 3. Add baseline failing tests for redesigned behavior | None | 4, 5, 6, 7, 8, 9 |
| 4. Implement Harden contract-alignment taxonomy and intent inference | 1, 2, 3 | 8, 11 |
| 5. Implement Quality Gate visible session container and summary output | 1, 2, 3 | 8, 11 |
| 6. Implement Behavior Evidence verification and scenario freshness | 1, 2, 3 | 7, 11 |
| 7. Implement behavior-to-code mapper evidence integration | 1, 2, 3, 6 | 11 |
| 8. Implement archive readiness semantics and limited-context gating | 1, 4, 5 | 11 |
| 9. Clean up legacy issue-mode and old harden/verify workflow residues | 3 | 11 |
| 10. Update skills and current docs for the redesigned workflow | 4, 5, 6, 8, 9 | 11 |
| 11. Final verification and Quality Gate invocation | 4, 5, 6, 7, 8, 9, 10 | None |

## Tasks

- [ ] 1. Update shared Quality Gate and Harden types (Agent: unspecified-high | Blocks: [4,5,6,7,8] | Blocked By: [])

  Agent Profile: `unspecified-high`; Skills: []; Reason: shared type changes affect multiple modules and tests.

  Parallelization: Wave 1; can run in parallel with Tasks 2 and 3.

  Files:
  - Modify `src/types.ts`
  - Modify `src/utils/harden-ledger.ts`
  - Modify `src/utils/acceptance-state.ts`

  Work:
  - Add Harden finding levels for `behavior_violation`, `intent_gap`, `contract_divergence`, and `missing_evidence` while preserving compatibility with existing `blocking_bug`, `spec_violation`, `regression_risk`, `test_gap`, `design_ambiguity`, and `style_or_preference` parsing where needed.
  - Add structured intent inference fields: missing coverage, inferred intent, evidence references, confidence (`high | medium | low`), implementation alignment (`aligned | misaligned | unknown`), and decision (`accept_with_doc_update | fix_implementation | needs_decision`).
  - Do not add a new serialized readiness enum for limited context. Preserve existing readiness values and represent limited-context archive ineligibility through Quality Gate applicability metadata and report wording.
  - Preserve `AcceptanceState.readiness` and `verifyResult.readiness` compatibility; document fallback order in code comments near parsing/writing logic.

  Acceptance Criteria:
  - `src/types.ts` exports the new finding and intent inference contracts.
  - Existing serialized acceptance-state fixtures still parse.
  - Old harden finding levels still normalize safely.
  - Limited-context results remain compatible with existing readiness persistence and are distinguished through applicability/report metadata, not a new persisted enum.

  QA Scenarios:
  - Run `bun test tests/utils/acceptance-state.test.ts`; expected: all tests pass.
  - Run `bun test tests/utils/harden-utils.test.ts`; expected: all tests pass after Task 4 completes.

- [ ] 2. Add test fixtures for Quality Gate sessions and behavior evidence (Agent: quick | Blocks: [4,5,6,7,11] | Blocked By: [])

  Agent Profile: `quick`; Skills: []; Reason: fixture-only work in test support code.

  Parallelization: Wave 1; can run in parallel with Tasks 1 and 3.

  Files:
  - Modify `tests/quality-gate/quality-gate.test.ts`
  - Modify `tests/commands/verify.test.ts`
  - Modify `tests/phases/implementation-mapper.test.ts`

  Work:
  - Add mock session client helpers that record `session.create` and `session.prompt` parent/child relationships.
  - Add helpers for `.sisyphus/evidence/{scenario-id}-{slug}.md` fixture files with timestamp, git HEAD, coverage level, and core code mapping.
  - Add helpers for behavior scenario documents containing `SC-001` style IDs and criticality.

  Acceptance Criteria:
  - New helpers are reusable by Quality Gate, Verify, and mapper tests.
  - Helpers do not change existing test behavior until called by new tests.

  QA Scenarios:
  - Run `bun test tests/quality-gate/quality-gate.test.ts`; expected: existing tests pass or fail only due to not-yet-implemented baseline assertions from Task 3.
  - Run `bun test tests/commands/verify.test.ts`; expected: existing tests pass or fail only due to not-yet-implemented baseline assertions from Task 3.

- [ ] 3. Add baseline failing tests for redesigned behavior (Agent: unspecified-high | Blocks: [4,5,6,7,8,9] | Blocked By: [])

  Agent Profile: `unspecified-high`; Skills: []; Reason: TDD coverage spans Quality Gate, Harden, Verify, Archive, and cleanup.

  Parallelization: Wave 1; can run in parallel with Tasks 1 and 2.

  Files:
  - Modify `tests/quality-gate/quality-gate.test.ts`
  - Modify `tests/utils/harden-utils.test.ts`
  - Modify `tests/commands/verify.test.ts`
  - Modify `tests/phases/implementation-mapper.test.ts`
  - Modify `tests/commands/archive.test.ts`
  - Modify `tests/index.test.ts`
  - Modify `tests/hooks/chat-message.test.ts`

  Work:
  - Add tests for behavior scenarios SC-001 through SC-014 from `behavior.md`.
  - Mark each expected failure clearly through normal assertions, not skipped tests.
  - This is the TDD red phase: the targeted command is expected to exit non-zero before implementation, and every failure must be attributable to the new scenario assertions rather than unrelated pre-existing regressions.
  - Keep tests focused: session visibility tests in Quality Gate suite, finding taxonomy tests in harden-utils suite, evidence tests in Verify suite, mapper tests in implementation-mapper suite, archive readiness tests in archive suite, stale command exposure tests in index/chat-message suites.

  Acceptance Criteria:
  - Each scenario SC-001 through SC-014 has at least one test assertion.
  - Before implementation, targeted tests fail only because the redesigned behavior is not implemented yet.
  - Any unrelated failure discovered during this task is recorded separately and not counted as satisfying the red phase.

  QA Scenarios:
  - Run `bun test tests/quality-gate/quality-gate.test.ts tests/utils/harden-utils.test.ts tests/commands/verify.test.ts tests/phases/implementation-mapper.test.ts tests/commands/archive.test.ts tests/index.test.ts tests/hooks/chat-message.test.ts`; expected before implementation: exit code non-zero with failures only from the new redesigned-behavior assertions; expected after implementation: exit code 0.

- [ ] 4. Implement Harden contract-alignment taxonomy and intent inference (Agent: unspecified-high | Blocks: [8,11] | Blocked By: [1,2,3])

  Agent Profile: `unspecified-high`; Skills: []; Reason: core Harden behavior and prompt/parsing changes require careful contract handling.

  Parallelization: Wave 2; can run in parallel with Tasks 5 and 6 after Wave 1.

  Files:
  - Modify `src/commands/harden.ts`
  - Modify `src/utils/harden-utils.ts`
  - Modify `src/utils/harden-ledger.ts`
  - Modify `tests/utils/harden-utils.test.ts`
  - Modify `tests/quality-gate/quality-gate.test.ts`

  Work:
  - Update Reviewer system prompt to use contract source priority from `design.md`.
  - Extend finding parsing/classification to recognize `behavior_violation`, `intent_gap`, `contract_divergence`, `regression_risk`, and `missing_evidence`.
  - Map old `blocking_bug` to implementation-blocking behavior without losing backward compatibility.
  - Add Coordinator handling for `intent_gap`: high/medium aligned -> accepted known doc update; high/medium misaligned -> executor fix; low/unknown/conflicting -> needs decision.
  - Ensure Executor only receives fixable implementation findings and does not silently modify docs or approve contract divergence.

  Acceptance Criteria:
  - Explicit behavior/spec violations block until fixed.
  - Inferable aligned intent gaps produce non-blocking doc update reporting.
  - Misaligned intent gaps are fixable implementation findings.
  - Low-confidence gaps and contract divergence produce `NeedsDecision`.

  QA Scenarios:
  - Run `bun test tests/utils/harden-utils.test.ts`; expected: all taxonomy and intent inference tests pass.
  - Run `bun test tests/quality-gate/quality-gate.test.ts`; expected: harden output parsing still works with new and legacy finding formats.

- [ ] 5. Implement Quality Gate visible session container and concise main summary (Agent: unspecified-high | Blocks: [8,11] | Blocked By: [1,2,3])

  Agent Profile: `unspecified-high`; Skills: []; Reason: session orchestration affects user-visible workflow and harden child sessions.

  Parallelization: Wave 2; can run in parallel with Tasks 4 and 6 after Wave 1.

  Files:
  - Modify `src/commands/quality-gate.ts`
  - Modify `src/commands/harden.ts`
  - Modify `tests/quality-gate/quality-gate.test.ts`

  Work:
  - Add Quality Gate session creation or reuse at the beginning of `handleQualityGate()` when `ctx.client.session.create` is available.
  - Record stage progress into the Quality Gate session: context/scope, applicability, risk, harden decision, each harden round summary, verify summary, readiness.
  - Pass Quality Gate session ID into `handleHarden()` so Reviewer/Executor sessions are children or explicitly linked descendants of the Quality Gate session.
  - Remove or bypass the empty `Harden: {feature}` parent session as the primary visible container.
  - Update final report to include Quality Gate session ID/title, Harden status, Verify status, readiness, blocker count, doc update count, and archive confirmation requirement.

  Acceptance Criteria:
  - Quality Gate creates or identifies a visible `Quality Gate: {feature}` session.
  - Reviewer and Executor sessions are linked to the Quality Gate session.
  - Main conversation report remains concise and includes session reference.
  - No empty Harden Coordinator session is presented as primary visible process.

  QA Scenarios:
  - Run `bun test tests/quality-gate/quality-gate.test.ts`; expected: session lifecycle and summary assertions pass.
  - Manual QA: invoke a mocked quality gate test case that prints the generated report; expected output contains `Quality Gate` session reference and “Archive requires explicit user confirmation” wording.

- [ ] 6. Implement Behavior Evidence verification and scenario freshness (Agent: unspecified-high | Blocks: [7,11] | Blocked By: [1,2,3])

  Agent Profile: `unspecified-high`; Skills: []; Reason: Verify readiness logic and evidence parsing are central and cross-cutting.

  Parallelization: Wave 2; can run in parallel with Tasks 4 and 5 after Wave 1.

  Files:
  - Modify `src/commands/verify.ts`
  - Modify `src/utils/evidence-freshness.ts`
  - Modify `tests/commands/verify.test.ts`
  - Modify `tests/quality-gate/evidence.test.ts`

  Work:
  - Read scenario evidence files from `.sisyphus/evidence/` using scenario IDs referenced by behavior evidence mappings.
  - Validate evidence fields: scenario reference, evidence type, test file or method, command/steps, result, timestamp/git HEAD, coverage rationale, and core code mapping.
  - Add scenario-level freshness checks so stale critical evidence blocks readiness.
  - Preserve existing behavior evidence table support for `exact`, `equivalent`, `partial`, `missing`, and `not_applicable`.
  - Require rationale for `equivalent` coverage.

  Acceptance Criteria:
  - Missing, stale, partial, or failed critical scenario evidence blocks readiness.
  - Fresh exact/equivalent critical evidence passes.
  - Optional or boundary missing evidence is advisory unless marked blocking.
  - Equivalent evidence without rationale produces `NeedsDecision` or a blocking evidence gap.

  QA Scenarios:
  - Run `bun test tests/commands/verify.test.ts`; expected: behavior evidence coverage tests pass.
  - Run `bun test tests/quality-gate/evidence.test.ts`; expected: freshness tests pass.

- [ ] 7. Implement behavior-to-code mapper evidence integration (Agent: unspecified-high | Blocks: [11] | Blocked By: [1,2,3,6])

  Agent Profile: `unspecified-high`; Skills: []; Reason: mapper must aggregate evidence and code traceability accurately.

  Parallelization: Wave 2 after Task 6; can run alongside Task 8 if Task 6 is complete.

  Files:
  - Modify `src/phases/archive/implementation-mapper.ts`
  - Modify `src/commands/quality-gate.ts`
  - Modify `tests/phases/implementation-mapper.test.ts`
  - Modify `tests/quality-gate/quality-gate.test.ts`

  Work:
  - Extend mapper generation to include scenario ID, behavior summary, evidence reference, and core code files from Behavior Evidence.
  - Ensure Quality Gate generates or updates `docs/changes/{feature}/implementation-mapper.md` only when readiness allows archive.
  - Preserve existing mapper generation behavior for features without Behavior Evidence while marking missing critical evidence as a Verify concern, not a mapper concern.

  Acceptance Criteria:
  - Mapper table contains `Scenario ID | Behavior | Evidence Ref | Core Code Files`.
  - Mapper uses evidence files when available.
  - Archive can preserve the behavior -> evidence -> code trace.

  QA Scenarios:
  - Run `bun test tests/phases/implementation-mapper.test.ts`; expected: mapper tests pass.
  - Run `bun test tests/quality-gate/quality-gate.test.ts`; expected: mapper generation trigger tests pass.

- [ ] 8. Implement archive readiness semantics and limited-context gating (Agent: unspecified-high | Blocks: [11] | Blocked By: [1,4,5])

  Agent Profile: `unspecified-high`; Skills: []; Reason: readiness semantics affect Quality Gate, archive, acceptance state, and run lifecycle.

  Parallelization: Wave 3; can run after Tasks 1, 4, and 5.

  Files:
  - Modify `src/commands/quality-gate.ts`
  - Modify `src/commands/archive.ts`
  - Modify `src/utils/acceptance-state.ts`
  - Modify `src/utils/implementation-run.ts`
  - Modify `src/types.ts`
  - Modify `tests/commands/archive.test.ts`
  - Modify `tests/quality-gate/quality-gate.test.ts`
  - Modify `tests/utils/acceptance-state.test.ts`

  Work:
  - Keep `ready_for_archive` as the workflow state for `Ready` and `ReadyWithDocUpdates`.
  - Display `ready_for_archive` as “Awaiting Archive Confirmation” in user-facing reports.
  - Ensure limited-context technical verification does not mark a run archive-eligible by itself.
  - Implement limited-context gating by reading Quality Gate applicability/context metadata, not by adding a new persisted readiness enum.
  - Ensure archive still requires explicit user confirmation and never auto-runs from Quality Gate.
  - Preserve compatibility with existing acceptance-state files and implementation run statuses.

  Acceptance Criteria:
  - `Ready` and `ReadyWithDocUpdates` map to `ready_for_archive`.
  - Limited-context readiness is not archive eligible.
  - Archive transitions to `archived` only after archive command execution.
  - User-facing report distinguishes Ready, Awaiting Archive Confirmation, and Archived.

  QA Scenarios:
  - Run `bun test tests/commands/archive.test.ts`; expected: archive gating tests pass.
  - Run `bun test tests/quality-gate/quality-gate.test.ts`; expected: readiness mapping tests pass.
  - Run `bun test tests/utils/acceptance-state.test.ts`; expected: state compatibility tests pass.

- [ ] 9. Clean up legacy issue-mode and old harden/verify workflow residues (Agent: unspecified-high | Blocks: [11] | Blocked By: [3])

  Agent Profile: `unspecified-high`; Skills: []; Reason: cleanup spans command registration, docs, hooks, and tests and must avoid breaking compatibility state.

  Parallelization: Wave 3; can run after baseline tests in Task 3.

  Files:
  - Modify `src/command-registration.ts`
  - Modify `src/utils/issue-utils.ts`
  - Modify `src/commands/verify.ts`
  - Modify `src/commands/archive.ts`
  - Modify `src/hooks/chat-message.ts`
  - Modify `src/skills/quality-gate-skill.ts`
  - Modify `src/skills/verify-skill.ts`
  - Modify `src/skills/archive-skill.ts`
  - Modify `tests/index.test.ts`
  - Modify `tests/hooks/chat-message.test.ts`
  - Modify `tests/commands/verify.test.ts`
  - Modify `tests/commands/archive.test.ts`

  Work:
  - Remove active user-facing issue-mode workflow exposure from command registration, chat-command dispatch, skills, and current workflow docs where it is presented as a normal path.
  - Preserve compatibility-only parsing/state fields for existing local state: `issueClarificationPath`, `postHocIssue`, and any acceptance-state fields needed by archive or verify fallback tests.
  - Keep `src/utils/issue-utils.ts` only for compatibility helpers still referenced by archive/verify; delete or inline unused exported helpers only when references and tests prove they are unused.
  - Ensure `/openflow-issue`, `/openflow-harden`, and `/openflow-verify` are not presented as normal active workflow entry points.
  - Preserve parsing of legacy acceptance-state fields only where needed for safe migration.
  - Remove stale documentation strings that instruct manual harden/verify as normal workflow.
  - Keep Quality Gate as the AI-callable post-implementation entry point.

  Acceptance Criteria:
  - Removed commands are not registered as active plugin tools.
  - Chat hooks do not dispatch removed issue-mode command paths.
  - `issueClarificationPath` and `postHocIssue` remain readable as compatibility state unless all consumers are removed in the same task with passing tests.
  - Legacy state fields either have compatibility comments or are safely removed with tests.
  - Quality Gate skill documentation matches the redesigned workflow.

  QA Scenarios:
  - Run `bun test tests/index.test.ts tests/hooks/chat-message.test.ts`; expected: removed command exposure tests pass.
  - Run `bun test tests/commands/verify.test.ts tests/commands/archive.test.ts`; expected: legacy compatibility and cleanup tests pass.

- [ ] 10. Update skills and current documentation for the redesigned workflow (Agent: writing | Blocks: [11] | Blocked By: [4,5,6,8,9])

  Agent Profile: `writing`; Skills: []; Reason: documentation and skill content must reflect implemented workflow without extra product surface.

  Parallelization: Wave 3 after core behavior tasks.

  Files:
  - Modify `src/skills/quality-gate-skill.ts`
  - Modify `docs/current/quality-governance/design.md`
  - Modify `docs/current/quality-governance/spec.md`
  - Modify `website/highlights/quality-gate.md`
  - Modify `website/reference/commands.md`

  Work:
  - Update Quality Gate docs to describe visible session, Harden taxonomy, Behavior Evidence, readiness semantics, and cleanup boundaries.
  - Remove normal-workflow guidance that tells users to manually run harden or verify.
  - Clarify that Quality Gate readiness does not equal archive completion.
  - Keep docs scoped to Quality Gate Workflow Redesign; do not add unrelated product surface.

  Acceptance Criteria:
  - Current docs and website agree with the new workflow.
  - Skill content tells AI to invoke `openflow-quality-gate` after implementation and not claim completion until readiness.
  - User-facing docs explain “Awaiting Archive Confirmation”.

  QA Scenarios:
  - Run `bun test tests/skills/registration.test.ts`; expected: skill registration tests pass.
  - Run `npm run build`; expected: exit code 0.

- [ ] 11. Final verification and Quality Gate invocation (Agent: unspecified-high | Blocks: [] | Blocked By: [4,5,6,7,8,9,10])

  Agent Profile: `unspecified-high`; Skills: [`openflow-quality-gate`]; Reason: final cross-module verification and readiness reporting.

  Parallelization: Wave 4; must run after all implementation tasks.

  Files:
  - Validate all modified files from Tasks 1-10.
  - Do not add new feature scope beyond this plan.

  Work:
  - Run targeted tests from all previous tasks.
  - Run TypeScript diagnostics/build checks for modified source files.
  - Run documentation build if docs/website files changed.
  - After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.

  Acceptance Criteria:
  - All targeted tests pass.
  - LSP diagnostics show zero new errors on modified TypeScript files.
  - Documentation build passes if docs or website changed.
  - OpenFlow Quality Gate returns `Ready` or `ReadyWithDocUpdates`, or all blockers are explicitly reported and resolved before completion.

  QA Scenarios:
  - Run `bun test tests/quality-gate/ tests/commands/verify.test.ts tests/utils/harden-utils.test.ts tests/utils/acceptance-state.test.ts tests/phases/implementation-mapper.test.ts tests/commands/archive.test.ts tests/index.test.ts tests/hooks/chat-message.test.ts`; expected: all tests pass.
  - Run `npm run typecheck`; expected: exit code 0.
  - Invoke `openflow-quality-gate`; expected: readiness is reported before claiming completion.

## Execution Unit Estimate

11 tasks, 11 execution units. Maximum same-wave concurrency is 3 tasks. This is within the requested planning bounds.

## Self-Review

- No placeholders remain in task bodies.
- Every task names concrete files.
- Every task includes runnable verification commands and expected outcomes.
- Tasks are grouped into four dependency waves.
- Final Quality Gate invocation is included and does not instruct manual `/openflow-harden` or `/openflow-verify`.
