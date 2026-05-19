# Plan: feature-4e04eb6b

## Overview

Implement a Quality Gate stage applicability layer so `openflow-quality-gate` can distinguish implementation readiness from design-only, planning-only, metadata-only, rename-only, and limited-context work. The implementation must prevent missing workflow artifacts from being collapsed into generic `NotReady`, while preserving strict archive readiness for real implementation and bugfix completion.

## Design Context

- Design workspace: `docs/changes/2026-05-18-feature-4e04eb6b/`
- Primary design: `docs/changes/2026-05-18-feature-4e04eb6b/design.md`
- Observable behavior: `docs/changes/2026-05-18-feature-4e04eb6b/behavior.md`
- Core files expected to change: `src/types.ts`, `src/commands/quality-gate.ts`, `src/commands/verify.ts`, `src/commands/harden.ts`, `src/skills/quality-gate-skill.ts`
- Test files expected to change: `tests/quality-gate/quality-gate.test.ts`, `tests/quality-gate/evidence.test.ts`, `tests/commands/verify.test.ts`, `tests/commands/archive.test.ts`
- Critical constraint: do not make `NotApplicable` or `LimitedContext` consumable as archive readiness.
- Critical constraint: do not suggest creating minimal `design.md` or `plan.md` merely to satisfy quality-gate readiness.

## Execution Strategy

### Parallel Execution Waves

Wave 1: Define shared types and classifier tests before implementation. Tasks 1 and 2 can run in parallel because one targets type shape and one targets expected behavior coverage.

Wave 2: Implement quality-gate applicability orchestration and harden unavailable mapping. Tasks 3 and 4 share `src/commands/quality-gate.ts`; coordinate through the types from Wave 1 and keep the final edit consistent.

Wave 3: Refine verify evidence-gap semantics and archive/readiness guardrails. Tasks 5 and 6 can run in parallel after Wave 2 because they validate separate downstream consumers.

Wave 4: Update user-facing skill text and run full regression verification. Tasks 7 and 8 depend on the final semantics and report shape.

### Dependency Matrix

| Task | Blocked By | Blocks |
|---|---|---|
| 1. Add applicability and evidence-gap types | None | 3, 4, 5, 6 |
| 2. Add applicability behavior tests | None | 3, 4, 5, 6 |
| 3. Implement quality-gate applicability classifier | 1, 2 | 5, 6, 7, 8 |
| 4. Reclassify harden missing-plan as unavailable | 1, 2 | 6, 7, 8 |
| 5. Classify verify evidence gaps by workflow stage | 1, 3 | 6, 8 |
| 6. Preserve archive strictness for non-ready gate states | 1, 3, 4, 5 | 8 |
| 7. Update quality-gate skill and hook-facing wording | 3, 4, 5 | 8 |
| 8. Run regression verification and quality gate | 3, 4, 5, 6, 7 | None |

### Task Detail Matrix

| Task | Agent Profile | Parallelization | QA Scenarios | Acceptance Criteria | Verification Command |
|---|---|---|---|---|---|
| 1 | quick, skills: [] | Parallel with Task 2 | Type-level compatibility for new quality-gate orchestration states | `src/types.ts` defines `QualityGateApplicabilityStatus`, `QualityGateApplicabilityResult`, `QualityGateTaskKind`, `EvidenceGapKind`, and `ClassifiedEvidenceGap` without changing existing `VerifyReadinessStatus` behavior | `npm run typecheck` |
| 2 | quick, skills: [] | Parallel with Task 1 | Tests describe design-only, planning-only, metadata-only, implementation, missing workflow, limited context, and archive readiness behavior | `tests/quality-gate/quality-gate.test.ts` contains failing-first coverage for all behavior.md scenarios before implementation is completed | `npm test -- tests/quality-gate/quality-gate.test.ts` |
| 3 | unspecified-high, skills: [] | Sequential after Tasks 1-2 | Quality gate returns `not_applicable`, `needs_workflow_stage`, `limited_context`, or `applicable` before harden/verify side effects | `src/commands/quality-gate.ts` runs a classifier before `handleHarden()` / `handleVerify()`, does not save verify readiness for `not_applicable`, and includes an Applicability section in the report | `npm test -- tests/quality-gate/quality-gate.test.ts` |
| 4 | quick, skills: [] | Coordinate with Task 3; same module | Missing `.sisyphus/plans/{feature}.md` no longer becomes generic quality-gate `NotReady` | `src/commands/harden.ts` output remains backward-compatible, and `src/commands/quality-gate.ts` recognizes missing-plan rejected output as `harden_unavailable_missing_plan` | `npm test -- tests/quality-gate/quality-gate.test.ts` |
| 5 | unspecified-high, skills: [] | Parallel with Task 6 after Task 3 | Missing design/change workspace is classified by task applicability rather than always blocking readiness | `src/commands/verify.ts` exposes classified evidence gaps and preserves blocking behavior only for implementation/archive/issue contexts that truly require those artifacts | `npm test -- tests/commands/verify.test.ts` |
| 6 | quick, skills: [] | Parallel with Task 5 after Tasks 3-4 | Archive refuses `not_applicable`, `limited_context`, and `needs_workflow_stage`; existing Ready and ReadyWithDocUpdates paths still work | `src/commands/archive.ts` and `tests/commands/archive.test.ts` confirm only valid verify readiness is archive-eligible | `npm test -- tests/commands/archive.test.ts` |
| 7 | writing, skills: [] | Sequential after Tasks 3-5 | User-facing instructions no longer tell AI to create workflow artifacts to satisfy readiness | `src/skills/quality-gate-skill.ts`, and if needed `src/hooks/tool-before.ts` / `src/hooks/chat-message.ts`, explain NotApplicable, NeedsWorkflowStage, LimitedContext, and no auto-created design/plan rule | `npm test -- tests/skills/registration.test.ts` |
| 8 | unspecified-high, skills: [openflow-quality-gate] | Final sequential QA | Full regression: quality-gate, verify, archive, and typecheck all pass | `npm run typecheck` and `npm test` pass; final implementation invokes quality gate exactly once after code changes | `npm run typecheck` and `npm test` |

### Execution Unit Estimate

- Tasks: 8
- Estimated sub-items: 18
- Maximum same-wave concurrency: 2
- Complexity: medium; below the 20-unit threshold and within the recommended concurrency limit.

## Tasks

- [ ] 1. Add shared applicability and evidence-gap types in `src/types.ts` (Agent: quick; Skills: []; Parallelization: Wave 1 with Task 2; Acceptance: new types exist without changing `VerifyReadinessStatus`; Verification: `npm run typecheck`; Blocks: [3, 4, 5, 6]; Blocked By: [])
- [ ] 2. Add failing-first quality-gate applicability tests in `tests/quality-gate/quality-gate.test.ts` (Agent: quick; Skills: []; Parallelization: Wave 1 with Task 1; Acceptance: tests cover NotApplicable, NeedsWorkflowStage, LimitedContext, Applicable, harden missing-plan, and archive readiness expectations; Verification: `npm test -- tests/quality-gate/quality-gate.test.ts`; Blocks: [3, 4, 5, 6]; Blocked By: [])
- [ ] 3. Implement the pre-harden/pre-verify applicability classifier and report section in `src/commands/quality-gate.ts` (Agent: unspecified-high; Skills: []; Parallelization: Wave 2 sequential after Tasks 1-2; Acceptance: design-only/planning-only/metadata-only return `not_applicable` without saving verify readiness, implementation contexts continue to run verify, and report includes `### Applicability`; Verification: `npm test -- tests/quality-gate/quality-gate.test.ts`; Blocks: [5, 6, 7, 8]; Blocked By: [1, 2])
- [ ] 4. Reclassify harden missing-plan output in `src/commands/quality-gate.ts` and keep `src/commands/harden.ts` output parseable (Agent: quick; Skills: []; Parallelization: Wave 2 coordinated with Task 3; Acceptance: missing `.sisyphus/plans/{feature}.md` maps to `harden_unavailable_missing_plan` and no longer unconditionally forces `NotReady`; Verification: `npm test -- tests/quality-gate/quality-gate.test.ts`; Blocks: [6, 7, 8]; Blocked By: [1, 2])
- [ ] 5. Classify verify evidence gaps by workflow stage in `src/commands/verify.ts` and update `tests/commands/verify.test.ts` (Agent: unspecified-high; Skills: []; Parallelization: Wave 3 with Task 6; Acceptance: missing context alignment/change workspace becomes `workflow_stage_missing`, `limited_context_gap`, `informational_gap`, or blocking only when the scenario requires it; Verification: `npm test -- tests/commands/verify.test.ts`; Blocks: [6, 8]; Blocked By: [1, 3])
- [ ] 6. Preserve archive strictness for non-ready quality-gate states in `src/commands/archive.ts` and `tests/commands/archive.test.ts` (Agent: quick; Skills: []; Parallelization: Wave 3 with Task 5; Acceptance: archive accepts valid Ready/ReadyWithDocUpdates only and rejects NotApplicable, LimitedContext, and NeedsWorkflowStage if present in state or gate metadata; Verification: `npm test -- tests/commands/archive.test.ts`; Blocks: [8]; Blocked By: [1, 3, 4, 5])
- [ ] 7. Update quality-gate skill and hook-facing wording in `src/skills/quality-gate-skill.ts`, `src/hooks/tool-before.ts`, and `src/hooks/chat-message.ts` if needed (Agent: writing; Skills: []; Parallelization: Wave 4 after semantic code changes; Acceptance: user-facing text says NotApplicable does not require docs, NeedsWorkflowStage requires explicit workflow entry, and AI must not create plan/design merely to satisfy readiness; Verification: `npm test -- tests/skills/registration.test.ts`; Blocks: [8]; Blocked By: [3, 4, 5])
- [ ] 8. Run final regression and invoke the quality gate after implementation (Agent: unspecified-high; Skills: [openflow-quality-gate]; Parallelization: final sequential QA; Acceptance: `npm run typecheck` and `npm test` pass, and final report confirms readiness semantics match behavior.md; Verification: `npm run typecheck` and `npm test`; Blocks: []; Blocked By: [3, 4, 5, 6, 7])

## Final Quality Gate Instruction

After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.
