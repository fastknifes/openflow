# openflow/init Command Implementation Plan

## TL;DR
> **Summary**: Add a command-only `openflow/init` implementation that manages the root `AGENTS.md` deterministically, without attempting to invoke OpenCode's built-in `/init` command. The implementation must create a curated first-run base section, append or refresh a fixed OpenFlow docs guide managed block, preserve all non-managed user content, and handle malformed markers via safe append-at-EOF repair.
> **Deliverables**:
> - `openflow/init` command handler and plugin registration
> - Root `AGENTS.md` managed-block helper with atomic write behavior
> - Fixed first-run base template, fixed OpenFlow docs guide block, fixed status messages
> - Command, helper, integration, and documentation updates
> **Effort**: Medium
> **Parallel**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5

## Context
### Original Request
- Implement planning for `openflow/init` based on `docs/changes/openflow-init/design/20260415-design.md`.
- Determine whether the design doc is sufficient for development planning; fill any gaps and generate the plan.

### Interview Summary
- `openflow/init` must be **command-only**; no skill wrapper, no auto-trigger, no host prompt suggestion.
- Scope is limited to the **root** `AGENTS.md`; do not touch nested `AGENTS.md`, `agent.md`, or `agents.md` variants.
- Preserve all user content **outside** the managed block; treat the managed block contents as OpenFlow-owned on refresh.
- Fixed markers are required: `<!-- OPENFLOW DOCS GUIDE:BEGIN -->` and `<!-- OPENFLOW DOCS GUIDE:END -->`.
- When `AGENTS.md` does not exist, create it with a curated static base init section plus one managed docs guide block.
- When `AGENTS.md` exists:
  - one valid managed block → replace only that block
  - no block → append one fresh block at EOF
  - malformed, partial, duplicate, nested, overlapping, or ambiguous markers → do not rewrite the broken area; append one fresh valid block at EOF as safe repair
- Preserve existing newline style (`\r\n` if present, otherwise `\n`) for existing files; default to `\n` for new files; always end with a trailing newline.
- Do not dynamically scan `docs/` to generate guide text; use a fixed Chinese template.

### Metis Review (gaps addressed)
- Replaced the original design's impossible “call built-in `/init` first” assumption with a self-contained command implementation because OpenCode `/init` is a prompt template, not an invokable plugin API.
- Froze ownership boundaries: only the managed block is OpenFlow-owned on rerun; first-run base content becomes user-owned after file creation.
- Froze corruption policy: any ambiguous marker topology is treated as corruption and repaired by appending a fresh valid block at EOF.
- Added missing acceptance criteria for duplicate blocks, malformed markers, newline preservation, and output message variants.
- Added a scope guardrail to avoid building a generic markdown framework; implement only a root-`AGENTS.md`-specific updater.

## Work Objectives
### Core Objective
Ship a deterministic `openflow/init` command that creates or updates the root `AGENTS.md` with OpenFlow's docs navigation guide while preserving user-authored content outside the managed block and remaining idempotent across repeated runs.

### Deliverables
- `src/commands/init.ts` command handler
- `src/commands/init-agents.ts` (or equivalent dedicated helper) for root `AGENTS.md` analysis/render/update
- `src/commands/init-content.ts` (or equivalent) for fixed base template, fixed managed block template, and fixed output messages
- Plugin registration in `src/index.ts` and barrel export in `src/commands/index.ts`
- Tests for helper logic, filesystem behavior, command behavior, and plugin registration
- Documentation updates in `README.md` and `docs/changes/openflow-init/design/20260415-design.md` to match shipped behavior

### Definition of Done (verifiable conditions with commands)
- `bun test tests/utils/init-agents.test.ts` passes.
- `bun test tests/commands/init.test.ts` passes.
- `bun test tests/index.test.ts tests/index-runtime-registration.test.ts` passes.
- `npm run typecheck` passes.
- `npm run build` passes.
- In a temp workspace without `AGENTS.md`, running the command creates `AGENTS.md` containing exactly one valid OpenFlow managed block at EOF.
- In a temp workspace with an existing `AGENTS.md`, rerunning the command preserves non-managed content and applies the correct mode-specific output message.

### Must Have
- Command name is exactly `openflow/init`.
- First-run content uses a curated static base section, not a live dependency on OpenCode internal prompts.
- Managed block uses exact fixed markers and exact fixed Chinese docs guide text.
- Existing file newline style is preserved.
- Writes are atomic (temp file + rename in the same directory).
- Output messages are mode-specific and test-asserted.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- Must NOT attempt to invoke built-in OpenCode `/init` programmatically.
- Must NOT add a skill wrapper, auto-trigger, hook-based suggestion, or command alias.
- Must NOT create `docs/` directories or validate docs completeness.
- Must NOT touch nested `AGENTS.md` files or filename variants.
- Must NOT build a generic markdown block framework beyond what root `AGENTS.md` needs.
- Must NOT overwrite or normalize user content outside the managed block except for explicitly allowed trailing newline handling during full-file rewrite.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: tests-after + Bun test suite (`bun test`)
- QA policy: Every task includes executable happy-path and failure/edge-case scenarios.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Task 1 (contract/template freeze), Task 2 (managed-block helper), Task 3 (filesystem persistence + orchestration)
Wave 2: Task 4 (command handler), Task 5 (plugin registration + integration), Task 6 (docs alignment)

### Dependency Matrix (full, all tasks)
| Task | Depends On | Enables |
|---|---|---|
| 1 | None | 2, 3, 4, 6 |
| 2 | 1 | 3, 4 |
| 3 | 1, 2 | 4 |
| 4 | 1, 2, 3 | 5, 6 |
| 5 | 4 | Final verification |
| 6 | 4 | Final verification |

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 3 tasks → `quick`, `unspecified-low`
- Wave 2 → 3 tasks → `quick`, `unspecified-low`, `writing`

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Freeze `openflow/init` content contract and AGENTS ownership rules

  **What to do**: Define the exact static artifacts and decision constants used by the feature before any file-update logic is implemented. Add a dedicated content module that exports: (a) the curated first-run base `AGENTS.md` section text, (b) the exact OpenFlow managed docs guide block text, (c) the exact marker strings, (d) the exact mode/result enums or message constants, and (e) newline/blank-line rendering rules. Convert the current design assumption of “delegate to `/init`” into shipped documentation comments that describe “static base init content composed by OpenFlow”. Add tests that assert exact string output, marker integrity, and final block placement assumptions.
  **Must NOT do**: Must NOT read the real `docs/` tree to generate content. Must NOT pull text dynamically from OpenCode internals. Must NOT bury marker strings or status messages as ad hoc literals across multiple files.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: small bounded logic/constants plus unit tests.
  - Skills: `[]` - no special skill required.
  - Omitted: [`git-master`] - no git operation is needed during implementation.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 2, 3, 4, 6 | Blocked By: none

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/phases/brainstorm/prd-generator.ts:21-71` - static template fallback pattern and clear separation between content template and write flow.
  - Pattern: `src/plan/enhancer.ts:17-20` - centralize header constants instead of scattering literals.
  - Source of current product intent: `docs/changes/openflow-init/design/20260415-design.md:82-182` - docs guide semantics, markers, and acceptance emphasis.
  - Existing root AGENTS ownership convention: `AGENTS.md:1-101` - marker-wrapped managed content already exists in the repo, so marker ownership is a valid precedent.

  **Acceptance Criteria** (agent-executable only):
  - [x] `bun test tests/utils/init-content.test.ts` passes.
  - [x] Tests assert the exact marker strings `<!-- OPENFLOW DOCS GUIDE:BEGIN -->` and `<!-- OPENFLOW DOCS GUIDE:END -->`.
  - [x] Tests assert the managed block text is Chinese-only and references `docs/current/requirements`, `docs/current/design`, `docs/current/spec`, `docs/current/workflow`, `docs/decisions/`, `docs/changes/`, and `docs/archive/`.
  - [x] Tests assert the default new-file rendering ends with exactly one trailing newline.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Static block text matches the frozen contract
    Tool: Bash
    Steps: run `bun test tests/utils/init-content.test.ts`
    Expected: test suite passes and includes assertions for marker text, Chinese guide text, and trailing newline behavior
    Evidence: .sisyphus/evidence/task-1-init-content.txt

  Scenario: Contract rejects accidental dynamic drift
    Tool: Bash
    Steps: run `bun test tests/utils/init-content.test.ts --rerun-each 2`
    Expected: repeated runs produce the same passing result, indicating deterministic content output
    Evidence: .sisyphus/evidence/task-1-init-content-repeat.txt
  ```

  **Commit**: YES | Message: `test(init): add AGENTS managed-block coverage` | Files: `src/commands/init-content.ts`, `tests/utils/init-content.test.ts`

- [x] 2. Implement a root-`AGENTS.md` managed-block analyzer/updater helper

  **What to do**: Add a dedicated helper module for parsing existing `AGENTS.md` content and deciding one of the supported actions: `create_new_file`, `replace_valid_block`, `append_missing_block`, or `append_safe_repair_block`. The helper must detect: no file content, no markers, one valid marker pair, partial begin/end markers, duplicate valid blocks, nested blocks, overlapping markers, or any ambiguous layout. Preserve all text outside the managed block exactly as-is except for the plan-approved blank-line and trailing-newline policy applied to the final render. Treat multiple valid blocks or mixed valid+malformed topology as corruption and choose safe append-at-EOF repair.
  **Must NOT do**: Must NOT attempt to rewrite malformed regions in place. Must NOT build a generic parser for arbitrary markdown sections. Must NOT inspect nested files or alternate filenames.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` - Reason: focused parsing logic with edge-case handling and file-content invariants.
  - Skills: `[]` - no special skill required.
  - Omitted: [`git-master`] - no git operation is needed during implementation.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 3, 4 | Blocked By: 1

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/utils/acceptance-state.ts:37-171` - line-oriented parsing for fixed markdown structures.
  - Pattern: `src/plan/enhancer.ts:181-209` - idempotent insertion mindset; copy the discipline, not the exact algorithm.
  - Pattern: `src/phases/brainstorm/prd-generator.ts:222-235` - narrowly scoped replacement helper rather than general markdown tooling.
  - Product contract: `docs/changes/openflow-init/design/20260415-design.md:71-80` and `:163-171` - fixed marker approach and block-at-EOF goal.

  **Acceptance Criteria** (agent-executable only):
  - [x] `bun test tests/utils/init-agents.test.ts` passes.
  - [x] Tests cover: missing block, single valid block, partial begin only, partial end only, duplicate valid blocks, mixed valid+partial, nested markers, and no trailing newline.
  - [x] For a single valid block, helper output preserves pre-block and post-block content byte-for-byte except for allowed final trailing newline normalization.
  - [x] For malformed or ambiguous topology, helper returns an append-safe-repair decision rather than an in-place rewrite decision.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Replace only one valid managed block
    Tool: Bash
    Steps: run `bun test tests/utils/init-agents.test.ts`
    Expected: test case for single valid block passes and confirms unchanged surrounding text
    Evidence: .sisyphus/evidence/task-2-init-agents.txt

  Scenario: Corruption policy appends instead of rewriting
    Tool: Bash
    Steps: run `bun test tests/utils/init-agents.test.ts --test-name-pattern "malformed|duplicate|nested|ambiguous"`
    Expected: targeted edge-case tests pass and all corruption cases choose append-safe-repair behavior
    Evidence: .sisyphus/evidence/task-2-init-agents-corruption.txt
  ```

  **Commit**: YES | Message: `feat(init): add AGENTS update helper and persistence` | Files: `src/commands/init-agents.ts`, `tests/utils/init-agents.test.ts`

- [x] 3. Implement root `AGENTS.md` persistence with atomic writes and newline preservation

  **What to do**: Add the persistence/orchestration layer that reads the root `AGENTS.md` if present, detects newline style (`\r\n` vs `\n`), computes the next content using the helper from Task 2, and writes the final file atomically using a temp file in the same directory plus rename. For a missing file, create the file with the static base init section followed by one blank line and the managed docs guide block. For an existing file, preserve newline style and apply the helper decision from Task 2. Return a structured internal result object describing the operation mode for command-message formatting.
  **Must NOT do**: Must NOT call built-in `/init`. Must NOT rewrite the file using direct non-atomic overwrite. Must NOT alter permissions or create backups. Must NOT create `docs/` directories.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` - Reason: filesystem logic, atomic writes, and cross-platform newline handling.
  - Skills: `[]` - no special skill required.
  - Omitted: [`git-master`] - no git operation is needed during implementation.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 4 | Blocked By: 1, 2

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/commands/archive.ts:44-67` - directory/file orchestration flow using `fs` and safe path resolution.
  - Helper: `src/hooks/file-utils.ts:1-10` - file existence check.
  - Safety: `src/utils/security.ts:92-105` - create safe root-scoped paths.
  - Error model: `src/utils/errors.ts:1-41` - wrap file failures into `OpenFlowError` with appropriate user-facing categories.

  **Acceptance Criteria** (agent-executable only):
  - [x] `bun test tests/utils/init-persistence.test.ts` passes.
  - [x] Missing-file test verifies `AGENTS.md` is created with base content first and exactly one managed block at EOF.
  - [x] Existing-file tests verify `\r\n` is preserved when present and `\n` is preserved otherwise.
  - [x] Atomic-write tests simulate write failure or rename failure through mocking and verify no partial truncated file remains.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Create AGENTS.md from scratch with deterministic layout
    Tool: Bash
    Steps: run `bun test tests/utils/init-persistence.test.ts --test-name-pattern "create|missing file"`
    Expected: target tests pass and assert one managed block at EOF with trailing newline
    Evidence: .sisyphus/evidence/task-3-init-persistence-create.txt

  Scenario: Preserve newline style and avoid partial writes on failure
    Tool: Bash
    Steps: run `bun test tests/utils/init-persistence.test.ts --test-name-pattern "newline|atomic|rename|write failure"`
    Expected: targeted tests pass and confirm preserved newline style plus safe behavior under simulated write failures
    Evidence: .sisyphus/evidence/task-3-init-persistence-failure.txt
  ```

  **Commit**: YES | Message: `feat(init): add AGENTS update helper and persistence` | Files: `src/commands/init-persistence.ts`, `tests/utils/init-persistence.test.ts`

- [x] 4. Implement the `openflow/init` command handler and mode-specific output contract

  **What to do**: Add `handleInit(ctx)` in `src/commands/init.ts` (or the repo's chosen equivalent) that orchestrates the persistence layer from Task 3 and returns one of the frozen output messages based on the internal operation mode: `initialized AGENTS.md and added OpenFlow docs guide`, `refreshed OpenFlow docs guide`, `appended OpenFlow docs guide`, or `appended fresh OpenFlow docs guide as safe repair`. Map filesystem and validation failures into `OpenFlowError` values consistent with the repo's existing command behavior. Keep the command argument surface empty unless the host runtime requires a dummy schema object.
  **Must NOT do**: Must NOT introduce optional flags. Must NOT ask interactive questions. Must NOT special-case `docs/` presence or perform docs validation. Must NOT return vague generic success strings.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: thin orchestration layer once helper/persistence modules exist.
  - Skills: `[]` - no special skill required.
  - Omitted: [`git-master`] - no git operation is needed during implementation.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 5, 6 | Blocked By: 1, 2, 3

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/commands/archive.ts:27-129` - command handler structure, disabled/invalid input handling, and formatted result flow.
  - Pattern: `src/index.ts:52-116` - tool execute wrapper catches `OpenFlowError` and converts unexpected errors to user strings.
  - Error model: `src/utils/errors.ts:1-68` - reuse `OpenFlowError` and existing message categories.
  - Product output requirement: `docs/changes/openflow-init/design/20260415-design.md:150-157` - distinguish first-run vs refresh.

  **Acceptance Criteria** (agent-executable only):
  - [x] `bun test tests/commands/init.test.ts` passes.
  - [x] Command tests verify all four output modes with exact expected strings.
  - [x] Command tests verify missing `docs/` does not produce failure or warning-specific behavior.
  - [x] Command tests verify filesystem errors are converted to stable user-facing error messages via `OpenFlowError`.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Each command mode returns the exact intended message
    Tool: Bash
    Steps: run `bun test tests/commands/init.test.ts`
    Expected: tests pass and include assertions for first-run, refresh, append-missing, and safe-repair output strings
    Evidence: .sisyphus/evidence/task-4-init-command.txt

  Scenario: Filesystem failures surface as stable command errors
    Tool: Bash
    Steps: run `bun test tests/commands/init.test.ts --test-name-pattern "error|permission|operation failed"`
    Expected: targeted tests pass and error cases map to the expected `OpenFlowError`-derived user messages
    Evidence: .sisyphus/evidence/task-4-init-command-errors.txt
  ```

  **Commit**: YES | Message: `feat(init): add openflow init command and registration` | Files: `src/commands/init.ts`, `tests/commands/init.test.ts`

- [x] 5. Register `openflow/init` in the plugin and verify integration behavior

  **What to do**: Wire the new command into `src/commands/index.ts` and `src/index.ts` using the same tool registration pattern as the existing commands. Expose `openflow/init` with an empty args schema, execute `handleInit`, and preserve the same top-level error handling pattern used by the other commands. Extend plugin integration tests so plugin initialization asserts `openflow/init` exists and command execution works inside a temp workspace. If registration impacts existing command cleanup logic or runtime registration assumptions, keep the changes minimal and local.
  **Must NOT do**: Must NOT add workspace `.opencode/commands` artifacts, global skill registration, or any runtime command-install side effects. Must NOT change existing brainstorm/archive behavior.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: small registration change plus integration assertions.
  - Skills: `[]` - no special skill required.
  - Omitted: [`git-master`] - no git operation is needed during implementation.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 6 | Blocked By: 4

  **References** (executor has NO interview context - be exhaustive):
  - Registration point: `src/index.ts:51-117` - existing command registration pattern.
  - Barrel export: `src/commands/index.ts:1-4` - add the new command export consistently.
  - Integration tests: `tests/index.test.ts:29-159` - plugin init and tool dispatch coverage.
  - Runtime registration tests: `tests/index-runtime-registration.test.ts:17-46` - confirm no accidental command-artifact behavior is introduced.

  **Acceptance Criteria** (agent-executable only):
  - [x] `bun test tests/index.test.ts tests/index-runtime-registration.test.ts` passes.
  - [x] `tests/index.test.ts` asserts `plugin.tool['openflow/init']` is defined.
  - [x] Integration execution test verifies `openflow/init` creates or updates root `AGENTS.md` inside a temp workspace.
  - [x] Runtime registration tests still pass unchanged in intent, proving no new legacy/global command artifacts are added.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Plugin exposes the new command at runtime
    Tool: Bash
    Steps: run `bun test tests/index.test.ts --test-name-pattern "registers hooks|dispatches tool actions|openflow/init"`
    Expected: targeted integration tests pass and confirm `openflow/init` is present and executable
    Evidence: .sisyphus/evidence/task-5-init-registration.txt

  Scenario: Runtime registration side effects stay unchanged
    Tool: Bash
    Steps: run `bun test tests/index-runtime-registration.test.ts`
    Expected: runtime registration tests pass with no new command-install or skill-install side effects introduced by `openflow/init`
    Evidence: .sisyphus/evidence/task-5-init-runtime.txt
  ```

  **Commit**: YES | Message: `feat(init): add openflow init command and registration` | Files: `src/index.ts`, `src/commands/index.ts`, `tests/index.test.ts`, `tests/index-runtime-registration.test.ts`

- [x] 6. Align user-facing docs and design docs with the implemented command behavior

  **What to do**: Update `README.md` and `docs/changes/openflow-init/design/20260415-design.md` so they no longer claim `openflow/init` literally calls built-in `/init`. Replace that with the approved implementation description: first-run uses curated static base init content composed by OpenFlow; reruns only manage the OpenFlow docs guide block. Document the ownership boundary, exact marker strings, corruption append-repair policy, and the fact that the command is command-only. Keep wording concise and consistent with shipped messages and tests.
  **Must NOT do**: Must NOT invent extra future features. Must NOT describe dynamic docs scanning. Must NOT leave contradictory wording that says both “wrapper around /init” and “self-contained command.”

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: concise technical documentation updates with exact behavior alignment.
  - Skills: `[]` - no special skill required.
  - Omitted: [`git-master`] - no git operation is needed during implementation.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: none | Blocked By: 1, 4

  **References** (executor has NO interview context - be exhaustive):
  - User-facing command list: `README.md` sections “OpenFlow Tool” and “User-Facing Entry”.
  - Source design doc: `docs/changes/openflow-init/design/20260415-design.md:15-21`, `:37-59`, `:150-180` - these sections currently imply `/init` delegation and need correction.
  - Shipped behavior source: the output/message constants and helper policy introduced in Tasks 1-4.

  **Acceptance Criteria** (agent-executable only):
  - [x] `grep` over `README.md` and `docs/changes/openflow-init/design/20260415-design.md` finds no statement claiming plugin code directly invokes built-in `/init`.
  - [x] Updated docs mention command-only behavior, fixed marker strings, and rerun ownership policy.
  - [x] `npm run build` still passes after doc-related changes if any exported string/constants references are touched.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Documentation no longer claims impossible /init delegation
    Tool: Bash
    Steps: run `npm run build`; then run a repository search for `先调用底层 /init|执行基础 /init|strict wrapper` in the updated docs
    Expected: build passes and the outdated delegation wording is absent from the updated README/design-doc locations
    Evidence: .sisyphus/evidence/task-6-init-docs.txt

  Scenario: Documentation includes the fixed ownership and marker policy
    Tool: Bash
    Steps: inspect updated README/design doc sections via targeted content search for `OPENFLOW DOCS GUIDE:BEGIN`, `command-only`, and the ownership statement about managed block vs user content
    Expected: search results show the final docs include those exact policy points
    Evidence: .sisyphus/evidence/task-6-init-docs-policy.txt
  ```

  **Commit**: YES | Message: `docs(init): align README and design doc` | Files: `README.md`, `docs/changes/openflow-init/design/20260415-design.md`

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy
- Commit 1: `test(init): add AGENTS managed-block coverage`
- Commit 2: `feat(init): add AGENTS update helper and persistence`
- Commit 3: `feat(init): add openflow init command and registration`
- Commit 4: `docs(init): align README and design doc`

## Success Criteria
- The repo exposes `openflow/init` alongside the existing command set.
- `openflow/init` is idempotent across first run, refresh, append, and corruption-repair scenarios.
- All tests and build/typecheck commands pass without manual inspection.
- Documentation and implementation no longer claim that the plugin calls built-in `/init`.
