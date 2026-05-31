# Plan: openflow-implement-quality-gate

## Overview
Refactor the quality gate from a monolithic "god function" into a state machine to eliminate dead loops, while preserving Harden/Verify sub-session visibility in the TUI.

## Design Context
Design workspace: `docs/changes/2026-05-28-openflow-implement-quality-gate/`. Relevant contracts are `design.md` and `behavior.md`. This plan addresses the state-machine architecture decision and dead-loop fix documented in the updated design document.

## Pyramid Strategy

### Highest-Level Goal
The quality gate performs Readiness Assessment only. It does not modify code, and it does not command retry.

### Task Pyramid
1. De-loop the quality gate output and skill instruction.
   1.1 Remove unconditional "re-invoke" from skill text.
   1.2 Remove `nextCommand: openflow-quality-gate` from NotReady/NeedsDecision output.
2. State-machine refactor of `handleQualityGate`.
   2.1 Extract Detect phase (applicability + risk assessment).
   2.2 Extract Harden phase (sub-session execution via nodeExecutor).
   2.3 Extract Verify phase (sub-session execution via nodeExecutor).
   2.4 Extract Assess phase (readiness classification).
   2.5 Add retry counter with max-2 guard.
3. Adapt regression tests to new output text.

### Core Abstractions and Boundaries
- `DetectPhase`: Applicability classification + risk assessment. Read-only, produces a go/no-go decision.
- `HardenPhase`: Adversarial review. Delegates to `nodeExecutor.executeHarden()`, runs in an independent sub-session visible in the TUI. Must not modify the phase interface.
- `VerifyPhase`: Evidence checks. Delegates to `nodeExecutor.executeVerify()`, runs in an independent sub-session visible in the TUI. Must not modify the phase interface.
- `AssessPhase`: Final readiness classification based on Harden + Verify results. Produces the quality gate report.
- `QualityGateContext`: Shared data object passed between phases. Carries retry count, session info, and phase outputs.

### TDD Driving Order
1. RED: Add/update test expectations that fail because the current quality gate output contains `nextCommand: openflow-quality-gate` for NotReady/NeedsDecision, and because the skill text instructs unconditional re-invocation.
2. GREEN: Update skill text and quality gate report builder to satisfy the new expectations.
3. REFACTOR: Extract Detect/Harden/Verify/Assess as independent phase functions inside `quality-gate.ts`, keeping the public `handleQualityGate` signature unchanged.

## Execution Strategy

### Parallel Execution Waves
Wave 1: Task 1 and Task 2 can run in parallel after each task runs its own impact analysis. Task 1 changes prompt/contract surfaces; Task 2 changes internal structure. They do not overlap.
Wave 2: Task 3 updates tests after Wave 1 establishes the new output text.
Wave 3: Final verification and quality gate.

### Dependency Matrix
| Task | Blocked By | Blocks |
|---|---|---|
| 1. De-loop skill and output | None | 3 |
| 2. State-machine refactor | None | 3 |
| 3. Test adaptation | 1, 2 | 4 |
| 4. Final verification and quality gate | 3 | None |

## Tasks

- [ ] 1. De-loop skill and output (Agent Profile: quick implementation with OpenFlow prompt-contract awareness; Parallelization: Wave 1, can run alongside Task 2; Files: modify `src/skills/quality-gate-skill.ts` and `src/commands/quality-gate.ts`; Required pre-edit impact analysis: run `gitnexus_impact({ target: "getQualityGateSkill", direction: "upstream", repo: "openflow" })` and `gitnexus_impact({ target: "buildQualityGateReport", direction: "upstream", repo: "openflow" })`; RED: add failing expectations in `tests/quality-gate/quality-gate.test.ts` that NotReady output does not contain `nextCommand: openflow-quality-gate` and that skill text does not instruct unconditional re-invocation; GREEN: change skill text to conditional retry with 2-round limit, and change report builder to set `nextCommand = ''` for NotReady/NeedsDecision; REFACTOR: keep text cohesive; Verification command: `npm test -- tests/quality-gate/quality-gate.test.ts` must pass; Acceptance Criteria: quality gate NotReady output contains no automatic re-invoke command, skill text limits retry to 2 rounds.)

- [ ] 2. State-machine refactor (Agent Profile: quick implementation with structural refactoring focus; Parallelization: Wave 1, can run alongside Task 1; Files: modify `src/commands/quality-gate.ts`; Required pre-edit impact analysis: run `gitnexus_impact({ target: "handleQualityGate", direction: "upstream", repo: "openflow" })`; RED: no new tests needed for structure — behavior is preserved; GREEN: extract `runDetectPhase`, `runHardenPhase`, `runVerifyPhase`, `runAssessPhase` as internal functions, introduce `QualityGateContext`, wire retry counter into context; REFACTOR: each phase must handle only its own abstraction layer; Verification command: `npm run typecheck` must pass; Acceptance Criteria: `handleQualityGate` entry point unchanged, internal logic follows Detect → Harden → Verify → Assess, retry counter limits to 2 rounds.)

- [ ] 3. Test adaptation (Agent Profile: quick test implementation; Parallelization: Wave 2, blocked by Tasks 1-2; Files: update `tests/quality-gate/quality-gate.test.ts`; Required pre-edit impact analysis: for any production symbol touched while fixing tests, run the matching `gitnexus_impact` command before editing that symbol; RED: ensure tests fail if old text "Resolve the blocking decision" or automatic re-invoke command remains; GREEN: replace "Resolve the blocking decision" with "Blocking decision required", assert `nextCommand` is absent; REFACTOR: keep assertions focused on public strings/outputs; Verification command: `npm test -- tests/quality-gate/quality-gate.test.ts` must pass; Acceptance Criteria: all quality-gate tests green.)

- [ ] 4. Final verification and quality gate (Agent Profile: orchestrator QA; Parallelization: Wave 3, blocked by Task 3; Files: no planned source edits except fixes required by failed checks; Required change analysis: run `gitnexus_detect_changes({ scope: "all", repo: "openflow" })` and confirm changed symbols/processes match Tasks 1-3; Verification commands: `npm run typecheck` must pass, `npm test -- tests/quality-gate/quality-gate.test.ts tests/commands/quality-gate-constraints.test.ts` must pass; Review: inspect `git status --short` and ensure no unrelated files were introduced by this feature; Quality Gate: After implementation is complete, invoke the openflow-quality-gate skill. Do not claim completion until the quality gate reports readiness; Acceptance Criteria: readiness is reported, no HIGH/CRITICAL impact warning was ignored, external interface of `handleQualityGate` is unchanged, Harden/Verify sub-session visibility is preserved.)


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
