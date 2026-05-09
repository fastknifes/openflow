# Command-Only Registration for OpenFlow

## TL;DR
> **Summary**: Rework OpenFlow exposure so governance entrypoints remain discoverable in OpenCode slash command UI but are no longer registered as AI-invokable skills. Keep existing `tool()` handlers as the only execution path and route explicit `/openflow-*` user messages through plugin-side dispatch.
> **Deliverables**:
> - Replace skill-first registration with command-file registration
> - Add explicit slash-command dispatch in `chat.message`
> - Normalize `writing-plan` exposure to ADR-002 hyphen naming
> - Update cleanup logic and invert registration/runtime tests
> **Effort**: Medium
> **Parallel**: YES - 2 waves
> **Critical Path**: T1 → T2 → T4 → T6

## Context
### Original Request
Generate a development plan for changing OpenFlow so commands appear in OpenCode slash suggestions but are not exposed as skills that AI auto-invokes.

### Interview Summary
- Keep `tool()` registrations because handlers are the true execution layer.
- Remove default OpenFlow skill registration so commands disappear from `<available_skills>`.
- Preserve slash discoverability in OpenCode.
- Prevent unwanted brainstorm / verify / archive auto-triggering from skill visibility.
- Prefer OpenCode-native command exposure over skill exposure.

### Metis Review (gaps addressed)
- Include `openflow-change` and `openflow-writing-plan` in scope rather than silently dropping them.
- Prevent double execution by having plugin dispatch consume explicit `/openflow-*` messages before agent-side interpretation.
- Add cleanup for all legacy global OpenFlow skill directories, not just `brainstorm.md`.
- Convert tests that currently assert skill presence into tests asserting command presence / skill absence.
- Explicitly handle quoted description parsing for `/openflow-change` and naming migration for `openflow/writing-plan` → `openflow-writing-plan`.

## Work Objectives
### Core Objective
Move OpenFlow from a skill-first exposure model to a command-first exposure model so users retain manual control over governance commands while existing execution handlers remain intact.

### Deliverables
- `src/command-registration.ts` rewritten as real command registration + cleanup module
- `src/index.ts` updated to register commands instead of skills by default
- `src/hooks/chat-message.ts` updated to dispatch explicit `/openflow-*` user messages safely
- Coverage for command registration, legacy cleanup, slash dispatch, and no-skill runtime behavior
- Naming alignment for `openflow-writing-plan`

### Definition of Done (verifiable conditions with commands)
- `bun test tests/skills/registration.test.ts tests/index-runtime-registration.test.ts tests/hooks/chat-message-brainstorm.test.ts tests/commands/change.test.ts tests/commands/writing-plan.test.ts`
- `bun test`
- `bunx tsc --noEmit`
- Global OpenFlow skill directories are absent after plugin init
- Global OpenFlow command files exist with hyphenated names after plugin init

### Must Have
- No `openflow-*` entries in `available_skills`
- Slash menu still shows OpenFlow commands as `source: command`
- `/openflow-brainstorm`, `/openflow-verify`, `/openflow-archive`, `/openflow-init`, `/openflow-status`, `/openflow-config`, `/openflow-migrate-docs`, `/openflow-change`, `/openflow-writing-plan` remain user-invokable
- Explicit `/openflow-*` messages are routed directly to existing handlers
- No background/system reminder text can trigger OpenFlow command execution

### Must NOT Have
- No OpenCode or OMO source edits
- No new config flags for “manual-only mode”
- No silent feature guessing when required slash-command arguments are missing
- No legacy slash-format `/openflow/writing-plan` command exposure after migration
- No path where both hook dispatch and model-driven tool invocation can execute the same OpenFlow command from one user slash message

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: tests-after + Bun test suite / TypeScript no-emit
- QA policy: Every task includes direct command-path and failure-path scenarios
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
Wave 1: registration foundation, naming normalization, dispatch design
- T1 registration architecture rewrite
- T2 slash dispatch parser/router
- T3 writing-plan naming normalization

Wave 2: test conversion and regression hardening
- T4 registration/runtime tests
- T5 slash-dispatch behavior tests
- T6 docs/config/hardening sweep

### Dependency Matrix (full, all tasks)
| Task | Blocks | Blocked By |
|------|--------|------------|
| T1 | T4, T6 | - |
| T2 | T5, T6 | - |
| T3 | T4, T6 | - |
| T4 | F1-F4 | T1, T3 |
| T5 | F1-F4 | T2 |
| T6 | F1-F4 | T1, T2, T3 |

### Agent Dispatch Summary
| Wave | Task Count | Categories |
|------|------------|------------|
| 1 | 3 | unspecified-high, quick |
| 2 | 3 | quick, deep |
| Final | 4 | oracle, unspecified-high, deep |

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Rewrite command registration as the default exposure path

  **What to do**: Replace the current cleanup-only behavior in `src/command-registration.ts` with a real command registration module. Register global OpenCode command files for every supported OpenFlow entrypoint: `openflow-brainstorm`, `openflow-change`, `openflow-init`, `openflow-verify`, `openflow-archive`, `openflow-status`, `openflow-config`, `openflow-migrate-docs`, and `openflow-writing-plan`. Also add cleanup for all legacy OpenFlow skill directories and old command artifacts. Update `src/index.ts` so plugin init calls `registerCommands()` instead of `registerSkills()`.
  **Must NOT do**: Do not remove any existing `tool()` definitions. Do not modify OpenCode/OMO repos. Do not leave cleanup limited to `brainstorm.md` only.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: cross-file registration change with migration cleanup and runtime implications
  - Skills: [`gitnexus-impact-analysis`] - why needed: verify blast radius of init-path registration behavior before edits
  - Omitted: [`openflow-brainstorm`] - why not needed: design is already settled

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [4, 6] | Blocked By: []

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/index.ts:34-45` - current init path runs legacy command cleanup then `registerSkills(openflowCtx)`
  - Pattern: `src/index.ts:52-226` - all OpenFlow `tool()` registrations that must remain executable
  - Pattern: `src/command-registration.ts:1-42` - current file only deletes legacy `brainstorm.md`; this is the rewrite target
  - Pattern: `src/skills/registration.ts:23-102` - existing global skill-dir calculation and cleanup shape to mirror for legacy skill removal
  - API/Type: `src/skills/registry.ts:1-24` - current list of skills reveals all OpenFlow exposure names, including `openflow/writing-plan`
  - Test: `tests/index-runtime-registration.test.ts:17-48` - current runtime registration assertions must be inverted/updated
  - External/Source Fact: `F:\ai-code\opencode\packages\opencode\src\config\command.ts:27-62` - OpenCode discovers `commands/**/*.md` as native command source

  **Acceptance Criteria** (agent-executable only):
  - [ ] Plugin init writes OpenFlow command markdown files under the global OpenCode commands directory.
  - [ ] Plugin init no longer writes any `~/.config/opencode/skills/openflow-*` entries.
  - [ ] Legacy global OpenFlow skill directories and legacy command artifacts are removed idempotently.
  - [ ] `openflow-writing-plan` is the registered command filename; no legacy slash-form command file remains.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Command files are created on init
    Tool: Bash
    Steps: Run targeted runtime test covering plugin init and inspect global command directory assertions.
    Expected: Test confirms `openflow-*.md` files exist and `openflow-*` skill directories do not.
    Evidence: .sisyphus/evidence/task-1-command-registration.txt

  Scenario: Legacy artifacts are removed safely
    Tool: Bash
    Steps: Seed legacy `.opencode/commands/brainstorm.md` and `~/.config/opencode/skills/openflow-*`, run runtime test.
    Expected: Cleanup removes legacy files without throwing and re-init remains idempotent.
    Evidence: .sisyphus/evidence/task-1-command-registration-error.txt
  ```

  **Commit**: NO | Message: `refactor(registration): switch openflow to command-first exposure` | Files: `src/command-registration.ts`, `src/index.ts`, related tests

- [x] 2. Add explicit slash-command dispatch in chat.message hook

  **What to do**: Extend `src/hooks/chat-message.ts` so explicit user messages starting with `/openflow-` are parsed and dispatched directly to the corresponding existing handlers before any continuation bridge or suggestion logic can reprocess them. Support no-arg commands, single-arg feature commands, and quoted description parsing for `/openflow-change <feature> "<description>"`. Ensure system/background reminders or assistant-originated content cannot trigger dispatch.
  **Must NOT do**: Do not let dispatch depend on the model interpreting command markdown. Do not cause a second execution path after dispatch. Do not hijack non-OpenFlow slash commands.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: parser/router logic in an already stateful hook with multiple branches
  - Skills: [`gitnexus-debugging`] - why needed: trace current `chat.message` branching and ensure new dispatch short-circuits correctly
  - Omitted: [`frontend-ui-ux`] - why not needed: no UI work

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [5, 6] | Blocked By: []

  **References**:
  - Pattern: `src/hooks/chat-message.ts:28-131` - current message-processing order, acceptance hook, auto-trigger and brainstorm continuation
  - Pattern: `src/hooks/chat-message.ts:136-168` - current direct-command detection helper and active-session loader
  - API/Type: `src/index.ts:47-49,171-179` - plugin wires `createChatMessageHook(openflowCtx)` into `chat.message`
  - API/Type: `src/commands/change.ts:9-73` - quoted description semantics and required input error contract
  - Test: `tests/hooks/chat-message-brainstorm.test.ts:47-278` - existing hook tests to extend with explicit slash dispatch and non-hijack cases
  - Test: `tests/commands/change.test.ts` - reuse expected change-command semantics when routing from slash text

  **Acceptance Criteria**:
  - [ ] Explicit `/openflow-*` user messages dispatch to the correct existing handler exactly once.
  - [ ] `/openflow-change feature "description"` preserves the quoted description text correctly.
  - [ ] Assistant/system/background reminder text cannot trigger slash dispatch.
  - [ ] Non-OpenFlow slash commands continue through untouched.

  **QA Scenarios**:
  ```
  Scenario: Explicit brainstorm slash message dispatches once
    Tool: Bash
    Steps: Run targeted hook tests that submit `/openflow-brainstorm user-login` as a user message.
    Expected: Output reflects handler result / dispatch path exactly once; no duplicate guard message is appended.
    Evidence: .sisyphus/evidence/task-2-slash-dispatch.txt

  Scenario: Slash dispatch ignores non-user or reminder text
    Tool: Bash
    Steps: Run targeted tests with assistant-role output or reminder-like `/openflow-*` text embedded in system/background content.
    Expected: Hook does not dispatch and leaves unrelated processing unchanged.
    Evidence: .sisyphus/evidence/task-2-slash-dispatch-error.txt
  ```

  **Commit**: NO | Message: `feat(hooks): route explicit openflow slash commands` | Files: `src/hooks/chat-message.ts`, helper/parser additions, tests

- [x] 3. Normalize writing-plan exposure to ADR-002 hyphen naming

  **What to do**: Replace the legacy skill/entrypoint name `openflow/writing-plan` with `openflow-writing-plan` everywhere touched by this change: registration metadata, user-facing command references, tests, and any compatibility cleanup. Decide and implement one migration path: treat the slash-form as legacy-only cleanup and expose only the hyphen form going forward.
  **Must NOT do**: Do not keep both slash-form and hyphen-form active as first-class command exposures. Do not leave docs/tests split between forms.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: bounded normalization with known files and strong ADR guidance
  - Skills: [`gitnexus-refactoring`] - why needed: consistent rename/reference cleanup across limited scope
  - Omitted: [`gitnexus-impact-analysis`] - why not needed: scope is localized and already constrained by references

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [4, 6] | Blocked By: []

  **References**:
  - Pattern: `src/skills/writing-plan-skill.ts:3-107` - current slash-form skill name and `/openflow/writing-plan` instructions
  - Pattern: `src/index.ts:8` and later tool map - `handleWritingPlan` already exists in plugin registration surface
  - Pattern: `docs/decisions/ADR-002-command-naming-convention.md:18-46` - hyphen naming is accepted; slash form is explicitly forbidden for commands
  - Test: `tests/commands/writing-plan.test.ts:21-113` - current assertions reference slash-form name/content

  **Acceptance Criteria**:
  - [ ] No user-facing OpenFlow command reference uses `/openflow/writing-plan` after the change.
  - [ ] Writing-plan command registration uses `openflow-writing-plan` only.
  - [ ] Legacy slash-form artifacts are cleaned if present.

  **QA Scenarios**:
  ```
  Scenario: Writing-plan references are normalized
    Tool: Bash
    Steps: Run targeted writing-plan tests after updating command naming expectations.
    Expected: Tests assert hyphenated command name/content and pass.
    Evidence: .sisyphus/evidence/task-3-writing-plan.txt

  Scenario: Legacy slash-form is not reintroduced
    Tool: Bash
    Steps: Search targeted source/tests for `/openflow/writing-plan` after edits.
    Expected: Only intentional legacy-cleanup references remain, with no active user-facing command text.
    Evidence: .sisyphus/evidence/task-3-writing-plan-error.txt
  ```

  **Commit**: NO | Message: `refactor(commands): normalize openflow writing-plan naming` | Files: `src/skills/writing-plan-skill.ts`, tests, registration metadata, docs touched by feature

- [x] 4. Convert registration and runtime tests from skill-presence to command-presence

  **What to do**: Rewrite `tests/skills/registration.test.ts` into command-registration coverage (or replace it with a new command-registration test file if cleaner), and update `tests/index-runtime-registration.test.ts` so runtime assertions verify command-file presence and skill-file absence. Cover `openflow-change` and `openflow-writing-plan` explicitly.
  **Must NOT do**: Do not leave any test asserting `~/.config/opencode/skills/openflow-*` creation after plugin init. Do not narrow coverage to only brainstorm.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: focused assertion rewrites with clear expected outcomes
  - Skills: [`gitnexus-impact-analysis`] - why needed: ensure test changes fully cover the runtime registration behavior being replaced
  - Omitted: [`gitnexus-debugging`] - why not needed: failures should be deterministic after T1/T3

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [] | Blocked By: [1, 3]

  **References**:
  - Test: `tests/skills/registration.test.ts:19-63` - current direct `registerSkills()` assertions for brainstorm/init/change
  - Test: `tests/index-runtime-registration.test.ts:17-48` - current runtime assertion that brainstorm SKILL.md exists after init
  - Pattern: `src/command-registration.ts` - new test target for command markdown creation / cleanup
  - Pattern: `src/index.ts:34-45` - runtime init path expectations

  **Acceptance Criteria**:
  - [ ] Registration tests assert command-file creation and skill-file absence.
  - [ ] Runtime registration test passes with updated command-first expectations.
  - [ ] Coverage includes brainstorm, change, and writing-plan command registration behavior.

  **QA Scenarios**:
  ```
  Scenario: Registration tests reflect command-first behavior
    Tool: Bash
    Steps: Run targeted registration/runtime test files.
    Expected: All assertions pass with command-file creation and no OpenFlow skill creation.
    Evidence: .sisyphus/evidence/task-4-registration-tests.txt

  Scenario: Re-init remains idempotent
    Tool: Bash
    Steps: Execute runtime registration test path twice in one test case or equivalent targeted assertion.
    Expected: Second init overwrites safely without duplicate artifacts or failures.
    Evidence: .sisyphus/evidence/task-4-registration-tests-error.txt
  ```

  **Commit**: NO | Message: `test(registration): assert command-first openflow exposure` | Files: `tests/skills/registration.test.ts` or replacement, `tests/index-runtime-registration.test.ts`

- [x] 5. Add slash-dispatch regression tests for manual-only behavior

  **What to do**: Extend hook tests to cover explicit slash dispatch, missing-argument help, quoted `/openflow-change` parsing, no dispatch on reminders/system content, and no unwanted continuation hijack after brainstorm completion. Ensure tests prove manual-only behavior without relying on skill auto-load.
  **Must NOT do**: Do not only test the happy path. Do not reintroduce assumptions that a skill entrypoint exists.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: localized hook-level regression coverage
  - Skills: [`gitnexus-debugging`] - why needed: preserve existing continuation-bridge semantics while adding direct slash path
  - Omitted: [`playwright`] - why not needed: non-UI behavior fully testable in Bun

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [] | Blocked By: [2]

  **References**:
  - Test: `tests/hooks/chat-message-brainstorm.test.ts:47-278` - existing brainstorm suggestion/continuation/non-hijack coverage
  - Pattern: `src/hooks/chat-message.ts:43-131` - current order of continuation, auto-trigger, and suggestion logic to preserve
  - Pattern: `src/commands/change.ts:10-18` - missing-input and default description behavior to mirror in slash tests

  **Acceptance Criteria**:
  - [ ] Explicit slash-command messages are covered for brainstorm, verify/change, and at least one no-arg command.
  - [ ] Missing-argument path returns deterministic help text instead of guessing.
  - [ ] Reminder/system/assistant-originated slash-like text does not dispatch.
  - [ ] Existing brainstorm continuation tests still pass unchanged or with intentional updated expectations.

  **QA Scenarios**:
  ```
  Scenario: Manual-only slash dispatch remains deterministic
    Tool: Bash
    Steps: Run targeted hook test suite covering explicit slash command messages.
    Expected: Hook dispatches only on user-entered `/openflow-*` and preserves previous continuation logic.
    Evidence: .sisyphus/evidence/task-5-slash-tests.txt

  Scenario: Missing args do not silently infer feature names
    Tool: Bash
    Steps: Run targeted tests for `/openflow-change` and `/openflow-verify` without required feature arguments.
    Expected: Tests receive explicit help/error guidance, not guessed feature dispatch.
    Evidence: .sisyphus/evidence/task-5-slash-tests-error.txt
  ```

  **Commit**: NO | Message: `test(hooks): cover explicit openflow slash dispatch` | Files: `tests/hooks/chat-message-brainstorm.test.ts`, adjacent hook tests if needed

- [x] 6. Sweep docs, config references, and runtime hardening for command-first behavior

  **What to do**: Update any directly affected OpenFlow docs, user-facing help text, and registration metadata so they consistently describe command-first/manual-only behavior. Ensure plugin init and command registration remain idempotent, and audit for stale references that still promise OpenFlow skills are available. Limit changes to files directly impacted by this feature.
  **Must NOT do**: Do not rewrite unrelated docs. Do not expand into a global OpenFlow docs migration.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: requires careful consistency sweep across runtime text, naming conventions, and edge-case hardening
  - Skills: [`gitnexus-exploring`] - why needed: identify all directly impacted references without widening scope unnecessarily
  - Omitted: [`writing`] - why not needed: changes are surgical consistency updates, not prose redesign

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [] | Blocked By: [1, 2, 3]

  **References**:
  - Pattern: `docs/changes/2026-05-08-command-only-registration/design/20260508-design.md` - source of truth for accepted behavior
  - Pattern: `docs/decisions/ADR-002-command-naming-convention.md:18-46` - naming rules that must be reflected in any user-facing text
  - Pattern: `src/hooks/chat-message.ts:78-130` - current suggestion text should stay suggestion-only and reference the correct command names
  - Pattern: `src/skills/*.ts` - any still-user-facing instructions touched by this feature must not claim active skill registration if kept for legacy cleanup only

  **Acceptance Criteria**:
  - [ ] No directly impacted doc/help text claims OpenFlow commands are registered as active skills.
  - [ ] Suggestion prompts still recommend slash commands but do not auto-execute.
  - [ ] Naming references are consistent with ADR-002 for all active commands.
  - [ ] Full test suite and typecheck pass after consistency sweep.

  **QA Scenarios**:
  ```
  Scenario: Full regression after command-first sweep
    Tool: Bash
    Steps: Run `bun test` and `bunx tsc --noEmit` after all edits.
    Expected: Suite passes with no type errors and no stale skill-registration assumptions.
    Evidence: .sisyphus/evidence/task-6-regression.txt

  Scenario: Directly impacted references no longer advertise active skills
    Tool: Bash
    Steps: Search changed OpenFlow source/docs for active-user-facing claims that OpenFlow is available as a skill.
    Expected: Only legacy-cleanup / compatibility references remain; active behavior is command-first/manual-only.
    Evidence: .sisyphus/evidence/task-6-regression-error.txt
  ```

  **Commit**: NO | Message: `docs(openflow): align manual-only command exposure` | Files: directly impacted docs/help text/config-facing strings

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- Prefer one commit per completed implementation wave if repository state is clean enough.
- Suggested commit sequence:
  1. `refactor(openflow): switch to command-first registration`
  2. `test(openflow): cover manual-only slash dispatch`
  3. `docs(openflow): align command-only exposure`
- Run `gitnexus_detect_changes({scope: "all"})` before any commit to confirm only expected registration/hook/test files were affected.

## Success Criteria
- OpenFlow commands remain discoverable in OpenCode slash UI.
- OpenFlow commands are no longer exposed as active skills.
- Explicit `/openflow-*` user messages dispatch deterministically to existing handlers.
- Writing-plan exposure is normalized to hyphenated command naming.
- Registration/runtime/hook regressions are fully covered and passing.


---
## Verification Phase

### Security Checks
- [ ] **Secret Scan**: Check for accidentally committed secrets
- [ ] **Vulnerability Scan**: Run dependency vulnerability check

### Quality Checks
- [ ] **Lint Check**: Run linter
- [ ] **Type Check**: Run type checker
- [ ] **Test Suite**: Run all tests

### Failure Handling
- Quality failure: fix implementation and rerun verification.
- Security failure: block archive until fixed.
- Consistency failure: sync docs and implementation, then rerun verification.

> Auto-generated by OpenFlow. Complete all verification tasks before archiving.
