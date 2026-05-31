# Plan: ai-reflection

## Overview
Implement `ai-reflection` as an AI self-triggered OpenFlow skill named `openflow-ai-reflection`. The MVP adds skill guidance and documentation only: no `/openflow-reflect` command, plugin tool, event listener, hook, guardian, background task, or automatic promotion.

## Design Context
- Workspace: `docs/changes/2026-05-14-ai-reflection/`
- Design: `docs/changes/2026-05-14-ai-reflection/design.md`
- Behavior: `docs/changes/2026-05-14-ai-reflection/behavior.md`
- Core decision: AI self-assessment triggers the skill; user correction is a signal for AI self-triggering, not a user-operated command requirement.
- Runtime reflection target: `docs/current/workflow/ai-reflection/`
- Canonical categories: `premature-implementation`, `verification-skipped`, `docs-misuse`, `delegation-misuse`, `context-loss`.
- Must NOT build: `/openflow-reflect`, plugin tool registration, command handler, event listener, hook, guardian/background task, or auto-promotion into `AGENTS.md`, skills, tests, or workflow docs.

## Execution Strategy

### Parallel Execution Waves
Wave 1: Tasks 1 and 3 can run in parallel after reading referenced files. Task 1 defines test contract; Task 3 updates user-facing docs.
Wave 2: Task 2 depends on Task 1 and implements the skill plus registry integration.
Wave 3: Task 4 depends on Tasks 1-3 and adds negative scope/compatibility coverage.
Wave 4: Task 5 depends on all prior tasks and runs final verification through quality gate.

### Dependency Matrix
| Task | Blocked By | Blocks |
|---|---|---|
| 1. Add skill contract tests | none | 2, 4, 5 |
| 2. Implement and register AI reflection skill | 1 | 4, 5 |
| 3. Update workflow and README docs | none | 4, 5 |
| 4. Add negative-scope compatibility checks | 1, 2, 3 | 5 |
| 5. Run quality gate and final scope audit | 1, 2, 3, 4 | none |

## Tasks
- [ ] 1. Add skill contract tests (Agent: quick | Blocks: [2, 4, 5] | Blocked By: [])

  **What to do**: Update `tests/skills/registration.test.ts` before implementation. Add assertions that `findSkillByName('openflow-ai-reflection')` is expected to return a skill, and that the skill content must include: AI self-triggering, must-trigger rules, should-trigger rules, must-not-trigger rules, required reflection fields, canonical categories, `docs/current/workflow/ai-reflection/`, markdown templates, and promotion boundaries.

  **Agent Profile**:
  - Category: `quick`
  - Skills: []

  **Parallelization**: Can Parallel: YES | Wave 1

  **Acceptance Criteria**:
  - [ ] `tests/skills/registration.test.ts` contains tests for `openflow-ai-reflection` discovery.
  - [ ] Tests check all five canonical category ids.
  - [ ] Tests check that content says AI self-triggers and does not ask the user to run a reflection command.
  - [ ] Tests check required case fields: category, summary, trigger, context, what went wrong, root cause, correct behavior, recurrence signal, evidence, classification, corrective rule, scope boundary, promotion decision.
  - [ ] Targeted command `bun test tests/skills/registration.test.ts` fails before Task 2 and passes after Task 2.

  **QA Scenarios**:
  ```text
  Scenario: Skill contract is test-defined
    Command: bun test tests/skills/registration.test.ts
    Expected: Before implementation, tests fail because `openflow-ai-reflection` is missing. After Task 2, tests pass.
  ```

- [ ] 2. Implement and register AI reflection skill (Agent: writing | Blocks: [4, 5] | Blocked By: [1])

  **What to do**: Create `src/skills/ai-reflection-skill.ts` with `getAiReflectionSkill()`. Update `src/skills/registry.ts` to include it. Before editing `getSkills` or related exported symbols, run GitNexus impact analysis for the touched existing symbol(s), especially `getSkills`, and report if risk is HIGH/CRITICAL. The skill must be instruction-only and must guide AI to create/update `docs/current/workflow/ai-reflection/` via normal file tools when a must-trigger condition occurs.

  **Agent Profile**:
  - Category: `writing`
  - Skills: [`gitnexus/gitnexus-impact-analysis`] - required before modifying existing registry symbols.

  **Parallelization**: Can Parallel: NO | Wave 2

  **Acceptance Criteria**:
  - [ ] `src/skills/ai-reflection-skill.ts` exports `getAiReflectionSkill()`.
  - [ ] Skill name is exactly `openflow-ai-reflection`.
  - [ ] `src/skills/registry.ts` includes the new skill without removing existing skills.
  - [ ] Skill content explicitly says MVP has no `/openflow-reflect`, command/tool, hook, event listener, guardian, background task, or auto-promotion.
  - [ ] Skill content includes markdown templates for `index.md` and category documents.
  - [ ] Command `bun test tests/skills/registration.test.ts` passes.
  - [ ] Command `npm run typecheck` passes.

  **QA Scenarios**:
  ```text
  Scenario: AI reflection skill is discoverable
    Command: bun test tests/skills/registration.test.ts
    Expected: `findSkillByName('openflow-ai-reflection')` returns the new skill and existing skill tests remain green.
  ```

- [ ] 3. Update workflow and README docs (Agent: writing | Blocks: [4, 5] | Blocked By: [])

  **What to do**: Update `docs/current/workflow/openflow-usage-tutorial.md` and `README.md` to describe AI reflection as an internal AI self-triggered skill. The docs must state that users do not normally run a command; the AI invokes `openflow-ai-reflection` when it detects a repeatable workflow/process mistake. Include target directory, canonical categories, and non-goals.

  **Agent Profile**:
  - Category: `writing`
  - Skills: []

  **Parallelization**: Can Parallel: YES | Wave 1

  **Acceptance Criteria**:
  - [ ] `docs/current/workflow/openflow-usage-tutorial.md` mentions `openflow-ai-reflection` and AI self-triggering.
  - [ ] `README.md` positions AI reflection as internal workflow memory, not a user command.
  - [ ] Both docs mention `docs/current/workflow/ai-reflection/`.
  - [ ] Both docs exclude background guardian and automatic promotion.
  - [ ] Docs do not present `/openflow-reflect` as the MVP entry.

  **QA Scenarios**:
  ```text
  Scenario: Documentation describes skill-only MVP
    Command: grep for `openflow-ai-reflection`, `docs/current/workflow/ai-reflection/`, and `/openflow-reflect` in README.md and docs/current/workflow/openflow-usage-tutorial.md
    Expected: Skill and target path are documented; `/openflow-reflect` is not described as the MVP entry.
  ```

- [ ] 4. Add negative-scope compatibility checks (Agent: quick | Blocks: [5] | Blocked By: [1, 2, 3])

  **What to do**: Extend tests or add focused assertions in existing test files to prove the MVP did not add forbidden automation. Use existing test style in `tests/index-runtime-registration.test.ts`, `tests/index.test.ts`, and/or `tests/skills/registration.test.ts` as appropriate. Verify no `openflow-reflect` tool is registered and existing OpenFlow tool registration remains unchanged.

  **Agent Profile**:
  - Category: `quick`
  - Skills: []

  **Parallelization**: Can Parallel: NO | Wave 3

  **Acceptance Criteria**:
  - [ ] Tests verify no `openflow-reflect` tool/command is registered by the plugin.
  - [ ] Tests or static assertions verify the skill content does not promise event listeners, hooks, guardian/background automation, or auto-promotion.
  - [ ] Existing command/tool registration tests still pass.
  - [ ] Command `bun test tests/skills/registration.test.ts tests/index-runtime-registration.test.ts tests/index.test.ts` passes.
  - [ ] Command `npm run typecheck` passes.

  **QA Scenarios**:
  ```text
  Scenario: Forbidden command/tool is absent
    Command: bun test tests/index-runtime-registration.test.ts tests/index.test.ts
    Expected: Existing OpenFlow tools remain registered, and no `openflow-reflect` tool appears.
  ```

- [ ] 5. Run quality gate and final scope audit (Agent: unspecified-high | Blocks: [] | Blocked By: [1, 2, 3, 4])

  **What to do**: Run final verification and produce evidence. Confirm all tests pass, typecheck passes, and the diff stays within the skill-only MVP. Search source changes to ensure no command handler, plugin tool, hook, listener, guardian integration, or auto-promotion path was added. After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.

  **Agent Profile**:
  - Category: `unspecified-high`
  - Skills: [`openflow-quality-gate`]

  **Parallelization**: Can Parallel: NO | Wave 4

  **Acceptance Criteria**:
  - [ ] Command `bun test tests/skills/registration.test.ts tests/index-runtime-registration.test.ts tests/index.test.ts` passes.
  - [ ] Command `bun test` passes.
  - [ ] Command `npm run typecheck` passes.
  - [ ] Scope audit confirms no `/openflow-reflect` command/tool was implemented.
  - [ ] Scope audit confirms no chat/tool hook, event listener, guardian/background task, or auto-promotion was implemented.
  - [ ] `openflow-quality-gate` reports readiness before completion is claimed.

  **QA Scenarios**:
  ```text
  Scenario: Full verification passes
    Command: bun test; npm run typecheck
    Expected: Both commands exit 0.

  Scenario: MVP remains skill-only
    Command: search source for `openflow-reflect`, new hook/listener registration, guardian integration, and auto-promotion writes
    Expected: No forbidden MVP integration exists.
  ```

## Execution Unit Estimate
- Tasks: 5
- Sub-items: approximately 18 acceptance/QA units
- Same-wave max concurrency: 2
- Complexity: small/medium; no merge required.
