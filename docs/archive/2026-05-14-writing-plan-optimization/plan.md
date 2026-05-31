# Writing Plan Optimization

## TL;DR
> **Summary**: Optimize `/openflow-writing-plan` so it writes the canonical plan to the OpenFlow change workspace, optionally mirrors the same enhanced plan for OMO/Prometheus execution, and stops generating over-aggressive subagent-oriented planning instructions.
> **Deliverables**:
> - dual-path writing-plan packet contract
> - bounded work-package skill wording
> - non-checkbox TDD/verification enhancer guidance
> - plan budget warning
> - tests and docs aligned with the new contract
> **Effort**: Medium
> **Parallel**: YES - 4 waves
> **Critical Path**: Task 1 → Task 2/3/4 → Task 5 → Task 7 → Final Verification

## Context
### Original Request
Create a development plan from the discussion about optimizing the `openflow-writing-plan` skill. The user wants the plan saved to `docs/changes/YYYY-MM-DD-{feature}/plan.md`; when OMO/Prometheus is present, the same plan should also be available at `.sisyphus/plans/{feature}.md`. The user also wants the writing-plan skill to preserve Prometheus built-in exploration/brainstorming behavior and avoid excessive subagent/task explosion.

### Interview Summary
- Scope selected: path fix + bounded decomposition + enhancer TDD/verification dedup + budget self-check.
- Feature name: `writing-plan-optimization`.
- Target user: internal developers.
- Scope type: enhancement.
- Priority: maintainability.
- Primary constraint: compatibility with existing OpenFlow/OMO behavior.

### Metis Review (gaps addressed)
- **Dual-save identity**: This plan defines identity as **post-enhancement identity**. If both files are written, the final enhanced content must be identical.
- **OMO presence**: This plan treats OMO copy as required when active OMO/Prometheus execution is detected OR a `.sisyphus/` workspace exists. The command packet must state this rule explicitly.
- **Budget self-check**: This plan implements budget checking as a non-blocking post-write warning, not merely prose guidance.
- **Section naming**: New examples use `## Tasks`; parser compatibility for `## TODOs` may remain but is not promoted.
- **Verification authority**: `openflow-quality-gate` remains the final verification authority; enhancer verification becomes non-checkbox guidance only.

## Work Objectives
### Core Objective
Make `openflow-writing-plan` produce maintainable, bounded, parser-compatible implementation plans without triggering subagent explosion, while preserving OpenFlow plan governance and OMO/Prometheus compatibility.

### Deliverables
- Updated `src/commands/writing-plan.ts` plan packet with primary and OMO output paths.
- Updated `src/skills/writing-plan-skill.ts` skill content.
- Updated plan enhancer behavior in `src/plan/enhancer.ts` and supporting utilities as needed.
- Plan budget warning helper and integration.
- Tests for command output, skill registration, plan enhancer, parser compatibility, and budget warning.
- Updated `docs/changes/2026-05-14-writing-plan-optimization/design.md` and `behavior.md` if implementation semantics differ from current docs.

### Definition of Done
- `bun test tests/commands/writing-plan.test.ts` passes.
- `bun test tests/plan/enhancer.test.ts tests/plan/parser.test.ts` passes.
- `bun test tests/skills/registration.test.ts` passes.
- `bun test` passes or unrelated pre-existing failures are documented.
- `npm run typecheck` passes if available.
- `openflow-quality-gate` remains present in writing-plan final-task instructions.
- No new plan instruction says `maximum parallel execution`, `one file per task`, or `dispatch each same-wave task as a subagent`.

### Must Have
- Primary artifact path: `docs/changes/YYYY-MM-DD-{feature}/plan.md`.
- OMO/Prometheus execution copy path: `.sisyphus/plans/{feature}.md` when OMO/Prometheus is active or `.sisyphus/` exists.
- If both paths are written and enhancer runs, final enhanced contents remain identical.
- Bounded work-package guidance with default same-wave concurrency 3–4.
- TDD guidance remains available but no longer creates executable checkbox explosions.
- Verification guidance no longer duplicates `openflow-quality-gate` as checkbox tasks.

### Must NOT Have
- Do not modify `/start-work`, Atlas, or OMO executor code.
- Do not change `SkillInfo` interface shape.
- Do not change `getPlanPath()` or `getChangePlansPath()` signatures.
- Do not remove TDD guidance entirely.
- Do not remove `openflow-quality-gate` final instruction.
- Do not generate per-task commit commands from the enhancer.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: tests-after + targeted regression tests.
- QA policy: Every task includes agent-executed scenarios.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.txt`.

## Execution Strategy
### Parallel Execution Waves
Wave 1: Task 1, Task 2 (contract tests and command/skill contract can proceed together after impact analysis)
Wave 2: Task 3, Task 4, Task 5 (skill text, enhancer output, budget helper)
Wave 3: Task 6, Task 7 (registration/tests and docs alignment)
Wave 4: Task 8 (final integration QA)

### Dependency Matrix
| Task | Blocked By | Blocks |
|---|---|---|
| 1 | none | 3, 4, 5, 6 |
| 2 | none | 3, 6 |
| 3 | 1, 2 | 6, 7 |
| 4 | 1 | 6, 7 |
| 5 | 1 | 6, 7 |
| 6 | 3, 4, 5 | 8 |
| 7 | 3, 4, 5 | 8 |
| 8 | 6, 7 | Final Verification |

### Agent Dispatch Summary
| Wave | Task count | Categories |
|---|---:|---|
| 1 | 2 | unspecified-high, quick |
| 2 | 3 | quick, unspecified-high |
| 3 | 2 | unspecified-high, writing |
| 4 | 1 | unspecified-low |

## TODOs

- [x] 1. Add contract tests for writing-plan optimization behavior

  **What to do**: Add or update tests that encode the final contract before implementation. Cover command packet output, skill text, enhancer output, parser compatibility, and plan budget warning. Tests should assert the absence of aggressive language and executable checkbox expansion where appropriate.
  **Must NOT do**: Do not change implementation code in this task except test fixtures.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: tests span command, skill registration, plan enhancer, and parser behavior
  - Skills: [`gitnexus-impact-analysis`] - required before editing tested symbols
  - Omitted: [`frontend-ui-ux`] - no UI work

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [3, 4, 5, 6] | Blocked By: []

  **References**:
  - Pattern: `tests/commands/writing-plan.test.ts` - command packet tests
  - Pattern: `tests/plan/enhancer.test.ts` - enhancer output tests
  - Pattern: `tests/plan/parser.test.ts` - parser compatibility tests
  - Pattern: `tests/skills/registration.test.ts` - generated skill content tests
  - API: `src/commands/writing-plan.ts:handleWritingPlan` - packet entrypoint
  - API: `src/skills/writing-plan-skill.ts:getWritingPlanSkill` - skill content source

  **Acceptance Criteria**:
  - [ ] Tests assert command packet includes `docs/changes/` primary path and `.sisyphus/plans/` OMO copy path.
  - [ ] Tests assert examples use `## Tasks`, not `## TODOs`.
  - [ ] Tests assert generated wording does not contain `maximum parallel execution`, `one file per task`, or `dispatch each same-wave task as a subagent`.
  - [ ] Tests assert `openflow-quality-gate` final instruction remains.
  - [ ] Tests assert enhancer TDD/verification guidance does not add `- [ ]` checkboxes in generated guidance sections.

  **QA Scenarios**:
  ```
  Scenario: Contract tests fail before implementation
    Tool: Bash
    Steps: bun test tests/commands/writing-plan.test.ts tests/plan/enhancer.test.ts tests/skills/registration.test.ts
    Expected: new tests fail on current implementation for missing path/wording/enhancer changes
    Evidence: .sisyphus/evidence/task-1-contract-tests-red.txt

  Scenario: Parser compatibility remains covered
    Tool: Bash
    Steps: bun test tests/plan/parser.test.ts
    Expected: existing parser tests still pass or new compatibility failures are explicit
    Evidence: .sisyphus/evidence/task-1-parser-baseline.txt
  ```

  **Commit**: NO | Message: `test(writing-plan): cover optimized plan contract` | Files: [`tests/commands/writing-plan.test.ts`, `tests/plan/enhancer.test.ts`, `tests/plan/parser.test.ts`, `tests/skills/registration.test.ts`]

- [x] 2. Update writing-plan command packet for dual output paths and bounded planning

  **What to do**: Update `src/commands/writing-plan.ts` so `handleWritingPlan()` reports `docs/changes/YYYY-MM-DD-{feature}/plan.md` as the primary plan path and `.sisyphus/plans/{feature}.md` as the OMO/Prometheus execution copy. Import and use `getChangePlansPath()` without changing its signature. Replace subagent-dispatch wording with bounded work-package wording.
  **Must NOT do**: Do not make `handleWritingPlan()` write files directly; it returns the packet only. Do not remove existing design context discovery.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: focused command packet text and path contract change
  - Skills: [`gitnexus-impact-analysis`] - required before editing command symbol
  - Omitted: [`git-master`] - no git history manipulation needed

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [3, 6] | Blocked By: []

  **References**:
  - API: `src/commands/writing-plan.ts:handleWritingPlan` - packet output
  - API: `src/config.ts:getChangePlansPath` - primary change-workspace plan path
  - API: `src/config.ts:getPlanPath` - OMO/Sisyphus execution path
  - Pattern: `src/utils/omo-detection.ts` - existing OMO detection concepts; use wording only unless tests require direct detection

  **Acceptance Criteria**:
  - [ ] Packet contains `### Plan Output Paths` with primary and OMO copy paths.
  - [ ] Packet states both copies are the same plan and must remain identical after enhancement.
  - [ ] Packet states OMO copy applies when active OMO/Prometheus execution is detected or `.sisyphus/` exists.
  - [ ] Packet says same-wave tasks are candidates for parallel execution, not mandatory subagents.
  - [ ] Packet recommends default same-wave concurrency 3–4.

  **QA Scenarios**:
  ```
  Scenario: Packet exposes dual paths
    Tool: Bash
    Steps: bun test tests/commands/writing-plan.test.ts --filter "output paths"
    Expected: test confirms both docs/changes plan path and .sisyphus plan path appear
    Evidence: .sisyphus/evidence/task-2-writing-plan-paths.txt

  Scenario: Packet avoids subagent explosion wording
    Tool: Bash
    Steps: bun test tests/commands/writing-plan.test.ts --filter "bounded"
    Expected: test confirms forbidden aggressive phrases are absent
    Evidence: .sisyphus/evidence/task-2-writing-plan-bounded.txt
  ```

  **Commit**: NO | Message: `fix(writing-plan): report primary and omo plan paths` | Files: [`src/commands/writing-plan.ts`, `tests/commands/writing-plan.test.ts`]

- [x] 3. Update writing-plan skill content and registration contract

  **What to do**: Update `src/skills/writing-plan-skill.ts` so the registered skill instructs primary save to `docs/changes/YYYY-MM-DD-{feature}/plan.md`, optional identical OMO copy to `.sisyphus/plans/{feature}.md`, bounded work packages, plan budget self-check, and Prometheus capability preservation. Standardize examples on `## Tasks`. Ensure `registerSkills()` generated content includes the updated wording; do not treat the local installed `C:\Users\Administrator\.config\opencode\skills\openflow-writing-plan\SKILL.md` as the source of truth.
  **Must NOT do**: Do not change `SkillInfo` type. Do not remove the final `openflow-quality-gate` instruction. Do not instruct the agent to invoke OMO, Prometheus, or execution agents from this skill.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: localized skill content update with registration test
  - Skills: [] - no special skill required after impact analysis has identified scope
  - Omitted: [`playwright`] - no browser testing

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [6, 7] | Blocked By: [1, 2]

  **References**:
  - Pattern: `src/skills/writing-plan-skill.ts` - current skill content source
  - Pattern: `src/skills/registration.ts` - generated skill write flow
  - Test: `tests/skills/registration.test.ts` - skill registration expectations
  - Design: `docs/changes/2026-05-14-writing-plan-optimization/design.md` - accepted constraints

  **Acceptance Criteria**:
  - [ ] Skill description mentions `docs/changes/*/plan.md` and OMO copy.
  - [ ] Skill content contains an `OMO / Prometheus Compatibility` section.
  - [ ] Skill content says it does not replace Prometheus exploration, brainstorming, or planning capabilities.
  - [ ] Skill examples use `## Tasks`.
  - [ ] Skill content retains exact quality-gate wording or semantically equivalent instruction.

  **QA Scenarios**:
  ```
  Scenario: Generated skill content is updated
    Tool: Bash
    Steps: bun test tests/skills/registration.test.ts --filter "writing-plan"
    Expected: test confirms registered skill includes dual path and compatibility wording
    Evidence: .sisyphus/evidence/task-3-skill-registration.txt

  Scenario: No forbidden wording remains in source skill
    Tool: Bash
    Steps: grep -n "maximum parallel\|one file per task\|dispatch each same-wave task as a subagent" src/skills/writing-plan-skill.ts
    Expected: command returns no matches
    Evidence: .sisyphus/evidence/task-3-skill-forbidden-grep.txt
  ```

  **Commit**: NO | Message: `fix(skills): bound writing-plan decomposition guidance` | Files: [`src/skills/writing-plan-skill.ts`, `tests/skills/registration.test.ts`]

- [x] 4. Convert enhancer TDD and verification additions to non-checkbox guidance

  **What to do**: Update `src/plan/enhancer.ts` and `src/utils/verification-checks.ts` if needed so auto-injected TDD guidance and verification guidance do not create executable checkbox tasks. Remove generated per-task commit instructions from TDD guidance. Keep guidance visible and useful. `openflow-quality-gate` remains the final verification authority.
  **Must NOT do**: Do not remove TDD guidance entirely. Do not add a second final verification wave. Do not alter parser behavior unless tests prove it is necessary.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: enhancer affects all plan writes and can change execution behavior broadly
  - Skills: [`gitnexus-impact-analysis`] - required before editing enhancer symbols
  - Omitted: [`frontend-ui-ux`] - no UI work

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [6, 7] | Blocked By: [1]

  **References**:
  - Pattern: `src/plan/enhancer.ts` - current `## TDD Expanded Tasks` and `## Verification Phase` injection
  - Pattern: `src/utils/verification-checks.ts` - checkbox formatting for `mode === 'plan'`
  - Test: `tests/plan/enhancer.test.ts` - enhancer regression coverage
  - Guardrail: `src/plan/parser.ts` - parser should not begin treating guidance as tasks

  **Acceptance Criteria**:
  - [ ] TDD guidance section remains but contains no `- [ ]` checkbox items.
  - [ ] TDD guidance contains no generated `git commit` command.
  - [ ] Verification guidance section contains no `- [ ]` checkbox items.
  - [ ] Verification guidance points to `openflow-quality-gate` as final evidence/readiness authority.
  - [ ] Existing plan enhancement remains idempotent.

  **QA Scenarios**:
  ```
  Scenario: TDD guidance no longer creates executable tasks
    Tool: Bash
    Steps: bun test tests/plan/enhancer.test.ts --filter "TDD"
    Expected: enhanced plan contains TDD guidance but no checkbox TDD tasks and no git commit command
    Evidence: .sisyphus/evidence/task-4-tdd-guidance.txt

  Scenario: Verification guidance is non-checkbox and quality-gate-aligned
    Tool: Bash
    Steps: bun test tests/plan/enhancer.test.ts --filter "Verification"
    Expected: enhanced plan contains non-checkbox verification guidance and references openflow-quality-gate
    Evidence: .sisyphus/evidence/task-4-verification-guidance.txt
  ```

  **Commit**: NO | Message: `fix(plan): make enhancer guidance non-executable` | Files: [`src/plan/enhancer.ts`, `src/utils/verification-checks.ts`, `tests/plan/enhancer.test.ts`]

- [ ] 5. Add post-write plan budget warning and dual-save enhancement consistency

  **What to do**: Add a lightweight plan budget analyzer integrated with plan enhancement/tool-after flow. The warning must be non-blocking and non-checkbox. Budget defaults: same-wave tasks > 4 or estimated execution units > 20. Extend plan enhancement detection to support primary change-workspace plan files (`docs/changes/YYYY-MM-DD-{feature}/plan.md`) as well as `.sisyphus/plans/{feature}.md`, so primary and OMO copies can remain identical after enhancement. If modifying `tool-after.ts`, preserve existing `.sisyphus/plans` behavior.
  **Must NOT do**: Do not block plan writes. Do not modify `/start-work`, Atlas, or OMO executor code. Do not introduce a dependency on the local `F:\ai-code\oh-my-openagent` path.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: hook/enhancer changes affect all plan writes
  - Skills: [`gitnexus-impact-analysis`] - required before editing hook/enhancer symbols
  - Omitted: [`git-master`] - no git operations required

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [6, 7] | Blocked By: [1]

  **References**:
  - Pattern: `src/hooks/tool-after.ts` - detects plan file writes and calls `enhancePlan()`
  - Pattern: `src/plan/enhancer.ts` - plan enhancement entrypoint
  - Pattern: `src/plan/parser.ts` - task parsing for budget calculation
  - Pattern: `src/config.ts:getChangePlansPath` - primary plan path contract

  **Acceptance Criteria**:
  - [ ] Writes to `docs/changes/YYYY-MM-DD-{feature}/plan.md` are eligible for the same enhancement behavior as `.sisyphus/plans/{feature}.md`.
  - [ ] Budget warning is appended only when estimated units exceed thresholds.
  - [ ] Budget warning uses non-checkbox bullets or prose.
  - [ ] Enhancer remains idempotent; re-enhancing does not duplicate budget warnings.
  - [ ] No local absolute OMO path is hardcoded.

  **QA Scenarios**:
  ```
  Scenario: Change-workspace plans receive enhancement
    Tool: Bash
    Steps: bun test tests/hooks/tool-after.test.ts tests/plan/enhancer.test.ts --filter "docs/changes"
    Expected: docs/changes plan.md is detected/enhanced without breaking .sisyphus plan enhancement
    Evidence: .sisyphus/evidence/task-5-change-plan-enhancement.txt

  Scenario: Budget warning appears only when thresholds are exceeded
    Tool: Bash
    Steps: bun test tests/plan/enhancer.test.ts --filter "budget"
    Expected: large plan receives one non-checkbox warning; small plan receives none
    Evidence: .sisyphus/evidence/task-5-budget-warning.txt
  ```

  **Commit**: NO | Message: `fix(plan): warn on oversized generated plans` | Files: [`src/hooks/tool-after.ts`, `src/plan/enhancer.ts`, `src/plan/parser.ts`, `tests/hooks/tool-after.test.ts`, `tests/plan/enhancer.test.ts`]

- [ ] 6. Make all tests green for command, skill, enhancer, parser, and hook behavior

  **What to do**: Update implementation and tests until targeted suites pass. Ensure tests capture the final behavior rather than brittle exact prose where semantic matching is better. Preserve parser compatibility for both `## Tasks` and existing `## TODOs` plans, but new generated examples should use `## Tasks`.
  **Must NOT do**: Do not loosen tests so much that forbidden wording can return. Do not remove coverage for quality-gate instructions.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: cross-module test stabilization
  - Skills: [] - no extra skill required
  - Omitted: [`playwright`] - no browser behavior

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [8] | Blocked By: [3, 4, 5]

  **References**:
  - Test: `tests/commands/writing-plan.test.ts`
  - Test: `tests/plan/enhancer.test.ts`
  - Test: `tests/plan/parser.test.ts`
  - Test: `tests/skills/registration.test.ts`
  - Test: `tests/hooks/tool-after.test.ts`

  **Acceptance Criteria**:
  - [ ] Targeted tests pass.
  - [ ] No forbidden aggressive planning phrases remain in `src/commands/writing-plan.ts` or `src/skills/writing-plan-skill.ts`.
  - [ ] No enhancer-generated TDD or verification checkbox tasks remain.
  - [ ] Quality-gate final instruction remains tested.

  **QA Scenarios**:
  ```
  Scenario: Targeted writing-plan optimization tests pass
    Tool: Bash
    Steps: bun test tests/commands/writing-plan.test.ts tests/plan/enhancer.test.ts tests/plan/parser.test.ts tests/skills/registration.test.ts tests/hooks/tool-after.test.ts
    Expected: all targeted tests exit 0
    Evidence: .sisyphus/evidence/task-6-targeted-tests.txt

  Scenario: Forbidden wording scan passes
    Tool: Bash
    Steps: grep -R "maximum parallel execution\|one file per task\|dispatch each same-wave task as a subagent" src/commands src/skills src/plan
    Expected: no matches in active writing-plan/enhancer guidance
    Evidence: .sisyphus/evidence/task-6-forbidden-wording.txt
  ```

  **Commit**: NO | Message: `test(writing-plan): stabilize optimized plan behavior` | Files: [`tests/**/*.test.ts`, `src/**/*.ts`]

- [ ] 7. Align change docs with implemented semantics

  **What to do**: Update `docs/changes/2026-05-14-writing-plan-optimization/design.md`, `behavior.md`, and sidecar JSON if implementation decisions differ. Specifically record: post-enhancement identity, OMO copy trigger rule, budget warning as non-blocking code behavior, and no executor changes.
  **Must NOT do**: Do not edit archived docs. Do not claim runtime behavior that is only prose unless Task 5 implements it.

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: documentation consistency and constraints wording
  - Skills: [] - no special skill required
  - Omitted: [`git-master`] - no history search required

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [8] | Blocked By: [3, 4, 5]

  **References**:
  - Design: `docs/changes/2026-05-14-writing-plan-optimization/design.md`
  - Behavior: `docs/changes/2026-05-14-writing-plan-optimization/behavior.md`
  - Sidecars: `docs/changes/2026-05-14-writing-plan-optimization/design.meta.json`, `behavior.meta.json`
  - Source: `src/commands/writing-plan.ts`, `src/skills/writing-plan-skill.ts`, `src/plan/enhancer.ts`

  **Acceptance Criteria**:
  - [ ] Docs state primary path and OMO copy path exactly.
  - [ ] Docs state `openflow-quality-gate` is final verification authority.
  - [ ] Docs state budget warning is non-blocking.
  - [ ] Docs explicitly exclude `/start-work`, Atlas, and OMO executor changes.
  - [ ] Docs and implementation do not contradict each other.

  **QA Scenarios**:
  ```
  Scenario: Docs reflect final path semantics
    Tool: Bash
    Steps: grep -R "docs/changes.*plan.md\|.sisyphus/plans" docs/changes/2026-05-14-writing-plan-optimization
    Expected: both path families are documented with primary/copy semantics
    Evidence: .sisyphus/evidence/task-7-doc-paths.txt

  Scenario: Docs exclude executor changes
    Tool: Bash
    Steps: grep -R "Atlas\|/start-work\|OMO executor" docs/changes/2026-05-14-writing-plan-optimization
    Expected: docs mention these only as out-of-scope/excluded changes
    Evidence: .sisyphus/evidence/task-7-doc-scope.txt
  ```

  **Commit**: NO | Message: `docs(writing-plan): document optimized planning contract` | Files: [`docs/changes/2026-05-14-writing-plan-optimization/*.md`, `docs/changes/2026-05-14-writing-plan-optimization/*.json`]

- [ ] 8. Run final integration verification and quality gate handoff

  **What to do**: Run targeted tests, full suite, typecheck if available, and invoke `openflow-quality-gate` after all code changes. Collect evidence files. Summarize failures as unrelated only with exact failing files and error snippets.
  **Must NOT do**: Do not commit unless the user explicitly asks. Do not mark complete until quality gate reports readiness.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` - Reason: command execution and evidence consolidation
  - Skills: [`openflow-quality-gate`] - required final readiness gate
  - Omitted: [`git-master`] - no commit requested by default

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: [Final Verification] | Blocked By: [6, 7]

  **References**:
  - Commands: `bun test tests/commands/writing-plan.test.ts tests/plan/enhancer.test.ts tests/plan/parser.test.ts tests/skills/registration.test.ts tests/hooks/tool-after.test.ts`
  - Commands: `bun test`
  - Commands: `npm run typecheck` if script exists in `package.json`
  - Skill: `openflow-quality-gate`

  **Acceptance Criteria**:
  - [ ] Targeted tests pass.
  - [ ] Full test suite passes or unrelated failures are documented.
  - [ ] Typecheck passes if available.
  - [ ] `openflow-quality-gate` is invoked and reports readiness or concrete next fixes.
  - [ ] Evidence files are saved under `.sisyphus/evidence/`.

  **QA Scenarios**:
  ```
  Scenario: Full verification completes
    Tool: Bash
    Steps: bun test; npm run typecheck
    Expected: commands exit 0, or unrelated pre-existing failures are documented precisely
    Evidence: .sisyphus/evidence/task-8-full-verification.txt

  Scenario: Quality gate reports readiness
    Tool: openflow-quality-gate
    Steps: Invoke openflow-quality-gate after code changes
    Expected: readiness is Ready or ReadyWithDocUpdates; otherwise fixes are listed
    Evidence: .sisyphus/evidence/task-8-quality-gate.txt
  ```

  **Commit**: NO | Message: `fix(writing-plan): optimize plan output and guidance` | Files: [`src/commands/writing-plan.ts`, `src/skills/writing-plan-skill.ts`, `src/plan/enhancer.ts`, `src/utils/verification-checks.ts`, `src/hooks/tool-after.ts`, `tests/**`, `docs/changes/2026-05-14-writing-plan-optimization/**`]

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- Do not commit unless the user explicitly requests it.
- Recommended single commit after approval: `fix(writing-plan): optimize plan output and guidance`.
- Keep tests, source, and change docs together because they define one behavioral contract.

## Success Criteria
- Primary writing-plan artifact is documented and tested as `docs/changes/YYYY-MM-DD-{feature}/plan.md`.
- OMO/Prometheus copy behavior is documented and tested as `.sisyphus/plans/{feature}.md` when active OMO/Prometheus or `.sisyphus/` exists.
- Final dual-saved content remains identical after enhancement.
- No aggressive subagent-dispatch wording remains in writing-plan command or skill source.
- Enhancer TDD and verification output no longer creates executable checkbox explosions.
- Plan budget warning is non-blocking and idempotent.
- Parser compatibility remains intact.
- `openflow-quality-gate` remains the final readiness authority.
