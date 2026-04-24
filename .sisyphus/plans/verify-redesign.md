# Verify Redesign Implementation Plan

## TL;DR
> **Summary**: Rebuild OpenFlow verification/closure around a single `Verify` command that produces Evidence and Readiness, while preserving `Archive` as the only canonicalization authority.
> **Deliverables**:
> - New `openflow/verify` command and registration
> - Persisted readiness contract alongside existing acceptance state
> - Archive admission gate driven by readiness
> - Backward-compatible migration for legacy verification/acceptance states
> - Updated skill/help text and hook behavior to enforce single-entry semantics
> **Effort**: Medium
> **Parallel**: YES - 4 waves
> **Critical Path**: State contract → Verify command → Archive gate → Acceptance hook cleanup

## Context
### Original Request
基于 `docs/changes/verify-redesign` 中的设计与决策，为新的 Verify/Archive 工作流编写执行计划文档。

### Interview Summary
- 用户确认采用 **单一 Verify 入口**。
- `Verify` 内部分两阶段：`Evidence` → `Readiness`。
- `Verify` 不直接写 `current`，也不执行 archive freeze。
- `Archive` 是最终 authority，负责 canonicalization、current promotion、history freeze。
- `Verify` 主对齐 `changes/{feature}`，并检查 `current/*` / `decisions/*` 冲突。
- Readiness 四态锁定为：`ready` / `ready_with_doc_updates` / `not_ready` / `needs_decision`。
- `needs_decision` 只适用于规则级、current 级或业务裁决问题。
- `Archive` 只允许 `ready` 与 `ready_with_doc_updates` 进入。
- `ready_with_doc_updates` 采用 Archive 侧半自动确认流。

### Metis Review (gaps addressed)
- 明确把本次重构视为 **状态模型 + 命令边界** 重构，而不是单纯新增命令。
- 锁定 `phase` 与 `readiness` 为两个不同概念，避免用 readiness 覆盖 coarse lifecycle phase。
- 明确要求 legacy state 兼容：现有 `verification_pending` / `verification_failed` 必须可读取。
- 明确 Verify 只做分类与 readiness 输出，不写 `docs/current`、不写 archive freeze 产物。
- 明确 Archive 不再用启发式猜测 readiness，而是消费 Verify 的持久化结果。

## Work Objectives
### Core Objective
把现有“verify 只是技能文本、archive 承担 terminal authority、acceptance hook 通过触发词推进 verification_pending”的分裂式流程，重构为**单一 Verify 入口 + 持久化 readiness 契约 + Archive 单点 canonicalization** 的闭环。

### Deliverables
- `src/commands/verify.ts` 新命令入口
- `src/commands/index.ts` / `src/index.ts` 完成命令导出与注册
- `src/types.ts` 增加 readiness/result contract，不破坏现有 phase 语义
- `src/utils/acceptance-state.ts` 支持 readiness、reason codes、verify result metadata 持久化与 legacy 兼容
- `src/commands/archive.ts` 只接受 `ready` / `ready_with_doc_updates`
- `src/hooks/acceptance.ts` 从“推进 verification_pending”收敛为“acceptance 提示/phase nudging”，不制造第二 Verify 入口
- `src/skills/verify-skill.ts` 与相关帮助文本改为指向真实 `openflow/verify` 命令
- 自动化测试覆盖 readiness 分类、Archive gate、legacy 兼容、idempotent rerun

### Definition of Done (verifiable conditions with commands)
- `openflow/verify` 命令已注册并可执行，输出结构稳定
- readiness 结果被持久化，并可被 Archive 读取
- Archive 对 `not_ready` / `needs_decision` 明确拒绝
- Archive 对 `ready` / `ready_with_doc_updates` 路径正确处理
- legacy acceptance state 文件可读取，且可映射到新模型
- `bun test` 通过
- `bun run typecheck` 通过

### Must Have
- 单一 Verify 入口
- `Evidence` 与 `Readiness` 两阶段的显式契约
- readiness 四态及严格判定规则
- Archive-only terminal authority
- backward-compatible state handling
- idempotent verify rerun behavior

### Must NOT Have
- 不允许 Verify 写 `docs/current/*`
- 不允许 Verify 写 archive freeze artifacts
- 不允许 Archive 继续通过旧 heuristic 隐式推断 readiness
- 不允许 `needs_decision` 成为“普通不确定”兜底桶
- 不允许保留“skill 文本式 verify”与“真实 verify 命令”两个平行入口

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: tests-after + existing TypeScript/bun test stack
- QA policy: Every task includes command-level or state-fixture validation
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
Wave 1: state contract / type contract / command skeleton
Wave 2: readiness classification + persistence + archive gating
Wave 3: acceptance hook narrowing + skill/help alignment
Wave 4: compatibility hardening + end-to-end command-path verification

### Dependency Matrix (full, all tasks)
| Task | Depends On |
|---|---|
| 1 | - |
| 2 | 1 |
| 3 | 1 |
| 4 | 1,2,3 |
| 5 | 2,3 |
| 6 | 4,5 |
| 7 | 4 |
| 8 | 6,7 |
| 9 | 8 |

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 3 tasks → `quick`, `unspecified-low`
- Wave 2 → 3 tasks → `unspecified-high`, `quick`
- Wave 3 → 2 tasks → `quick`, `writing`
- Wave 4 → 1 task → `unspecified-high`

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Lock the persisted readiness contract

  **What to do**: Extend `src/types.ts` to introduce an explicit persisted readiness model separate from `DevelopmentPhase`. Add stable machine-readable fields for Verify output such as readiness status, reason codes, optional decision type, evidence summary metadata, constraints checked, and verification timestamp. Preserve existing phase semantics (`implementation`, `acceptance`, `verification_pending`, `verification_failed`, `archived`, `promotion_pending`, `promoted`) rather than overloading them. Define exact precedence rules in code-facing types: `needs_decision` overrides `ready_with_doc_updates`; blocking verification failures map to `not_ready`; non-decision failures must never become `needs_decision`.
  **Must NOT do**: Do not remove or rename legacy phase values in this task. Do not let implementer invent ad-hoc string literals later.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: concentrated type/model update in a small set of files
  - Skills: `[]` - No extra skill required
  - Omitted: `['verify']` - Reason: this task defines the model, not the user-facing command behavior yet

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 2,3,4,5 | Blocked By: []

  **References**:
  - Design: `docs/changes/verify-redesign/design/20260421-design.md:128-237` - Verify phases, states, and non-goals
  - Decisions: `docs/changes/verify-redesign/decisions.md:142-223` - Readiness states, strict `needs_decision`, archive admission
  - Type baseline: `src/types.ts:167-214` - Existing `DevelopmentPhase`, `AcceptanceState`, verification/promotion fields
  - State semantics: `src/utils/acceptance-state.ts:13-29` - Existing persisted field prefixes

  **Acceptance Criteria**:
  - [ ] `src/types.ts` can represent `phase` and `readiness` independently
  - [ ] New readiness model includes reason codes and decision classification metadata
  - [ ] Existing code importing `DevelopmentPhase` still typechecks after the change
  - [ ] `needs_decision` is representable only with explicit decision categories, not generic uncertainty

  **QA Scenarios**:
  ```
  Scenario: Type contract compiles with new readiness model
    Tool: Bash
    Steps: Run `bun run typecheck`
    Expected: Exit code 0; no TypeScript errors from `src/types.ts` integration
    Evidence: .sisyphus/evidence/task-1-readiness-contract.txt

  Scenario: Legacy phase names remain usable
    Tool: Bash
    Steps: Run `bun test` after adding type-level tests/fixtures covering old phases plus new readiness fields
    Expected: Tests covering old `DevelopmentPhase` values pass without migration breakage
    Evidence: .sisyphus/evidence/task-1-readiness-contract-tests.txt
  ```

  **Commit**: YES | Message: `refactor(verify): add explicit readiness contract` | Files: `src/types.ts`, related tests

- [x] 2. Upgrade acceptance-state persistence for readiness and legacy compatibility

  **What to do**: Update `src/utils/acceptance-state.ts` to persist and read the new readiness/result contract while remaining backward-compatible with existing state files. Add read/write support for readiness status, reason codes, decision type, evidence summary metadata, last verify run time, and bounded verify result information. Define lazy compatibility mapping for legacy states: `verification_pending` remains readable and implies unresolved readiness until Verify runs; `verification_failed` maps to `phase=verification` + `readiness=not_ready` with retained failure category. Ensure rerunning Verify overwrites the latest readiness snapshot without corrupting historical fields like promotion decisions.
  **Must NOT do**: Do not require a one-shot migration script. Do not break old state file parsing. Do not collapse phase and readiness into one field.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: state persistence, compatibility, and invariants are easy to get subtly wrong
  - Skills: `[]` - No extra skill required
  - Omitted: `['git-master']` - Reason: no git operation needed

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 4,5,6 | Blocked By: [1]

  **References**:
  - Persistence baseline: `src/utils/acceptance-state.ts:13-220`
  - Existing persisted fields: `src/types.ts:198-214`
  - Metis guardrail: readiness must be a separate concept from phase
  - Design: `docs/changes/verify-redesign/design/20260421-design.md:176-228`

  **Acceptance Criteria**:
  - [ ] New state files serialize and deserialize readiness/result metadata deterministically
  - [ ] Legacy state files lacking readiness fields still parse successfully
  - [ ] Legacy `verification_failed` states deterministically surface as `not_ready`
  - [ ] Re-running Verify can replace readiness output without wiping promotion history

  **QA Scenarios**:
  ```
  Scenario: New state fixture round-trips cleanly
    Tool: Bash
    Steps: Run targeted tests for acceptance-state serialization/deserialization with new readiness fields
    Expected: Round-trip fixture equality passes; no fields silently dropped
    Evidence: .sisyphus/evidence/task-2-acceptance-state-roundtrip.txt

  Scenario: Legacy state fixture remains readable
    Tool: Bash
    Steps: Run targeted tests using old-format acceptance state fixtures containing `verification_pending` and `verification_failed`
    Expected: Parser returns valid state objects with compatibility mapping applied
    Evidence: .sisyphus/evidence/task-2-acceptance-state-legacy.txt
  ```

  **Commit**: YES | Message: `refactor(state): persist verify readiness metadata` | Files: `src/utils/acceptance-state.ts`, tests/fixtures

- [x] 3. Add the real openflow/verify command shell and single-entry registration

  **What to do**: Introduce a real `src/commands/verify.ts` command and register `openflow/verify` in `src/index.ts` and command exports. The command must be the single workflow entry for verification and return a stable result shape summarizing Evidence and Readiness. Initially wire the command around the persisted contract from Tasks 1–2, but keep readiness classification pure: Evidence may collect/run checks and compare against `changes/{feature}` plus stable constraints; Readiness only classifies outputs, it does not mutate archive/current. Update help/error messaging so the absence of a feature or missing active context produces deterministic user-facing responses.
  **Must NOT do**: Do not hide this behind skill text only. Do not let the command write `current/*` or any archive artifacts.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` - Reason: new command wiring plus stable output formatting
  - Skills: `[]` - No extra skill required
  - Omitted: `['writing']` - Reason: this is executable command behavior, not prose-heavy output only

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 4,7 | Blocked By: [1]

  **References**:
  - Existing command registration: `src/index.ts:51-131`
  - Existing command style: `src/commands/archive.ts:28-148`
  - Current verify skill: `src/skills/verify-skill.ts:3-97`
  - Design: `docs/changes/verify-redesign/design/20260421-design.md:128-237`

  **Acceptance Criteria**:
  - [ ] `openflow/verify` exists as a real command registration
  - [ ] Command output includes Evidence summary and Readiness result in stable structure/text
  - [ ] Missing context/feature handling is deterministic and user-readable
  - [ ] Command does not mutate `current` or archive outputs

  **QA Scenarios**:
  ```
  Scenario: Verify command is discoverable and executable
    Tool: Bash
    Steps: Run the project test suite or command-level tests covering `openflow/verify` registration and execution path
    Expected: `openflow/verify` command path is invoked successfully; no missing export/registration failures
    Evidence: .sisyphus/evidence/task-3-verify-command.txt

  Scenario: Verify remains read-only with respect to canonical docs
    Tool: Bash
    Steps: Run targeted tests asserting verify execution does not call archive/current promotion logic and does not modify archive/current files in fixture repo
    Expected: No current/archive mutation occurs during verify
    Evidence: .sisyphus/evidence/task-3-verify-readonly.txt
  ```

  **Commit**: YES | Message: `feat(verify): add single verify command entry` | Files: `src/commands/verify.ts`, `src/index.ts`, command exports, tests

- [x] 4. Implement Evidence-to-Readiness classification and strict reason mapping

  **What to do**: Implement the concrete classification engine used by `Verify`. It must produce the four readiness states with explicit machine-readable reason codes. Encode exact precedence: `needs_decision` only for rule/current/business-decision cases; `not_ready` covers failed quality/security/consistency/evidence/doc-alignment issues; `ready_with_doc_updates` only when the change is otherwise closure-ready and pending doc updates are the only remaining blocker; `ready` only when no blocking issues remain. Ensure stable-constraint checks against `current/*` / `decisions/*` are represented as constraint conflicts, not confused with primary `changes/{feature}` alignment.
  **Must NOT do**: Do not let implementer improvise outcome precedence. Do not map ordinary failures to `needs_decision`.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: this is the semantic heart of the redesign and easiest place to leak judgment calls
  - Skills: `[]` - No extra skill required
  - Omitted: `['verify']` - Reason: building classification semantics, not using them as user workflow yet

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 6,8 | Blocked By: [1,2,3]

  **References**:
  - Design states: `docs/changes/verify-redesign/design/20260421-design.md:176-207`
  - Decisions: `docs/changes/verify-redesign/decisions.md:142-223`
  - Existing verification failure category: `src/types.ts:177`
  - Existing pending doc updates support: `src/utils/acceptance-state.ts:198-217`, `src/commands/archive.ts:54-67`

  **Acceptance Criteria**:
  - [ ] Four readiness states are produced deterministically from the same inputs
  - [ ] `needs_decision` cannot be emitted for simple quality/security/evidence failures
  - [ ] `ready_with_doc_updates` occurs only when doc updates are the sole remaining blocker
  - [ ] Classification is idempotent when inputs do not change

  **QA Scenarios**:
  ```
  Scenario: Readiness classifier returns each state for the right fixture
    Tool: Bash
    Steps: Run targeted classifier tests with fixtures for ready / ready_with_doc_updates / not_ready / needs_decision
    Expected: Each fixture maps to exactly the expected readiness state and reason code set
    Evidence: .sisyphus/evidence/task-4-readiness-classifier.txt

  Scenario: needs_decision is not used as generic uncertainty bucket
    Tool: Bash
    Steps: Run targeted tests where quality failure, missing evidence, and doc mismatch are injected separately
    Expected: All such cases map to `not_ready`, not `needs_decision`
    Evidence: .sisyphus/evidence/task-4-readiness-guardrails.txt
  ```

  **Commit**: YES | Message: `feat(verify): add readiness classification rules` | Files: verify command internals, state helpers, tests

- [x] 5. Gate Archive strictly on persisted readiness

  **What to do**: Refactor `src/commands/archive.ts` so archive admission is driven by the persisted Verify result, not by old heuristic combinations like `verification_pending`, `verificationFailureCategory`, or ad-hoc drift/security handling alone. Preserve Archive as final authority, but require readiness to be `ready` or `ready_with_doc_updates` before canonicalization begins. Keep Archive-side security/drift behavior aligned with the new contract rather than duplicating readiness classification logic. Archive must reject `not_ready` and `needs_decision` deterministically and emit user-facing guidance that points back to Verify or the required decision path.
  **Must NOT do**: Do not make Archive re-classify readiness from scratch. Do not bypass readiness for convenience.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: archive already owns terminal authority and current promotion, so admission mistakes are high-risk
  - Skills: `[]` - No extra skill required
  - Omitted: `['writing']` - Reason: logic and gating take priority

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 8 | Blocked By: [1,2]

  **References**:
  - Archive gate baseline: `src/commands/archive.ts:54-71`, `234-241`, `307-323`
  - Promotion flow: `src/commands/archive.ts:117-147`, `212-231`, `358-403`
  - Decisions: `docs/changes/verify-redesign/decisions.md:185-223`

  **Acceptance Criteria**:
  - [ ] Archive refuses `not_ready` states with explicit explanation
  - [ ] Archive refuses `needs_decision` states with explicit explanation
  - [ ] Archive accepts `ready` and `ready_with_doc_updates`
  - [ ] Archive remains the only place that performs current promotion/freeze

  **QA Scenarios**:
  ```
  Scenario: Archive rejects non-closable readiness states
    Tool: Bash
    Steps: Run command/integration tests invoking archive against fixtures marked `not_ready` and `needs_decision`
    Expected: Archive returns refusal message and does not mutate archive/current state
    Evidence: .sisyphus/evidence/task-5-archive-gate-reject.txt

  Scenario: Archive accepts closable readiness states
    Tool: Bash
    Steps: Run command/integration tests invoking archive against fixtures marked `ready` and `ready_with_doc_updates`
    Expected: Archive proceeds to the proper path without reclassifying readiness
    Evidence: .sisyphus/evidence/task-5-archive-gate-accept.txt
  ```

  **Commit**: YES | Message: `refactor(archive): gate closure on verify readiness` | Files: `src/commands/archive.ts`, tests

- [ ] 6. Implement Archive-side semi-automatic doc-update confirmation for `ready_with_doc_updates`

  **What to do**: Evolve existing `pendingDocUpdates`, `waitingForDocUpdateConfirm`, and promotion suggestion flow so `ready_with_doc_updates` has a bounded confirmation path inside Archive. Archive must present the doc updates it plans to apply, wait for explicit confirmation through the existing workflow-compatible state path, then execute doc updates/promotion/freeze. Record whether this path was used so reruns and future audits can distinguish normal `ready` closure from closure that required doc reconciliation.
  **Must NOT do**: Do not mutate docs during Verify. Do not create a black-box auto-fix path in Archive without confirmation.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: combines state persistence, user-facing flow, and final authority behavior
  - Skills: `[]` - No extra skill required
  - Omitted: `['review-work']` - Reason: implementation task first; review happens in final wave

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 8 | Blocked By: [2,4,5]

  **References**:
  - Existing waiting flag: `src/utils/acceptance-state.ts:72-78`, `152-157`, `313-337`
  - Existing archive promotion flow: `src/commands/archive.ts:119-147`, `358-403`
  - Design: `docs/changes/verify-redesign/design/20260421-design.md:267-279`
  - Decisions: `docs/changes/verify-redesign/decisions.md:210-223`

  **Acceptance Criteria**:
  - [ ] `ready_with_doc_updates` triggers confirmation flow inside Archive
  - [ ] Confirmation path records whether it was used
  - [ ] Without confirmation, Archive does not apply doc updates or promotion
  - [ ] Verify remains read-only with respect to current/archive docs

  **QA Scenarios**:
  ```
  Scenario: ready_with_doc_updates requires confirmation before closure
    Tool: Bash
    Steps: Run archive against a fixture marked `ready_with_doc_updates` without providing confirmation
    Expected: Archive pauses or refuses closure pending confirmation; no doc/current/archive mutation occurs
    Evidence: .sisyphus/evidence/task-6-doc-update-confirm-block.txt

  Scenario: confirmed ready_with_doc_updates completes closure path
    Tool: Bash
    Steps: Run archive against the same fixture with explicit confirmation path triggered
    Expected: Archive applies the confirmed doc update flow, promotion, and freeze successfully
    Evidence: .sisyphus/evidence/task-6-doc-update-confirm-success.txt
  ```

  **Commit**: YES | Message: `feat(archive): add confirmed doc-update closure path` | Files: `src/commands/archive.ts`, `src/utils/acceptance-state.ts`, tests

- [ ] 7. Narrow acceptance hook behavior to avoid duplicate Verify entrypoints

  **What to do**: Refactor `src/hooks/acceptance.ts` so it no longer advances the workflow into an implicit `verification_pending` branch that competes with the new `openflow/verify` command. Keep acceptance-phase detection if still useful, but reduce it to phase nudging, doc-sync prompting, and optional reminders to run Verify. Explicitly remove or remap the old completion-trigger behavior (`完成了` / `done` → `verification_pending`) so Verify becomes the sole semantic verification entrypoint.
  **Must NOT do**: Do not keep old auto-transitions unchanged. Do not silently create a second verify path through hooks.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: small surface area but high semantic impact
  - Skills: `[]` - No extra skill required
  - Omitted: `['playwright']` - Reason: no browser work involved

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 8 | Blocked By: [3,4]

  **References**:
  - Acceptance hook baseline: `src/hooks/acceptance.ts:47-119`
  - Existing state transitions: `src/types.ts:167-214`
  - Metis guardrail: acceptance hook must not remain a second entry point

  **Acceptance Criteria**:
  - [ ] Acceptance hook no longer marks verification pending as a closure surrogate
  - [ ] Hook can still enter/maintain acceptance phase if needed
  - [ ] Hook behavior encourages `openflow/verify` rather than replacing it

  **QA Scenarios**:
  ```
  Scenario: Completion language no longer creates hidden verify path
    Tool: Bash
    Steps: Run acceptance-hook tests with messages like `完成了`, `done`, `ready to archive`
    Expected: State does not transition into a parallel verification path; reminder/nudge behavior points to Verify
    Evidence: .sisyphus/evidence/task-7-acceptance-hook-single-entry.txt

  Scenario: Acceptance phase still starts for acceptance trigger language
    Tool: Bash
    Steps: Run acceptance-hook tests with configured acceptance trigger words
    Expected: Acceptance state is created or maintained without bypassing Verify semantics
    Evidence: .sisyphus/evidence/task-7-acceptance-hook-phase.txt
  ```

  **Commit**: YES | Message: `refactor(acceptance): route verification through verify command` | Files: `src/hooks/acceptance.ts`, tests

- [ ] 8. Update verify/archive skill text and command-discovery surfaces

  **What to do**: Update `src/skills/verify-skill.ts` so it points to the real command-oriented Verify flow instead of acting like the sole verification mechanism. Adjust any related user-facing help text, summaries, or status outputs so they reflect the new semantics: Verify establishes readiness, Archive makes canonical. Ensure command discovery does not present skill text as a parallel verification workflow. Update any archive outputs that still imply verification is merely “pending (non-blocking)” if that language becomes semantically inaccurate under the new model.
  **Must NOT do**: Do not leave stale copy implying verify is only a skill or only a generic checklist.

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: mostly user-facing wording, help text, and command semantics alignment
  - Skills: `[]` - No extra skill required
  - Omitted: `['brainstorm']` - Reason: design is already fixed

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: 9 | Blocked By: [3,5,6,7]

  **References**:
  - Verify skill text: `src/skills/verify-skill.ts:3-97`
  - Archive result wording: `src/commands/archive.ts:373-403`
  - Design summary: `docs/changes/verify-redesign/design/20260421-design.md:344-406`
  - Decisions summary: `docs/changes/verify-redesign/decisions.md:227-249`

  **Acceptance Criteria**:
  - [ ] Verify help text references the real Verify command path and semantics
  - [ ] Archive/help text no longer implies conflicting authority ownership
  - [ ] There is no user-facing documentation path that suggests two separate verification workflows

  **QA Scenarios**:
  ```
  Scenario: Verify help text matches command semantics
    Tool: Bash
    Steps: Run tests or assertions that inspect generated verify skill/help output
    Expected: Output describes Evidence + Readiness and points to command-driven Verify flow
    Evidence: .sisyphus/evidence/task-8-verify-help.txt

  Scenario: Archive help text preserves final-authority semantics
    Tool: Bash
    Steps: Run tests or snapshot assertions on archive output/help text after readiness-gate integration
    Expected: Output reflects Archive as canonicalization authority and does not imply Verify mutates current/archive
    Evidence: .sisyphus/evidence/task-8-archive-help.txt
  ```

  **Commit**: YES | Message: `docs(workflow): align verify and archive command semantics` | Files: skill/help/status output files, snapshots/tests

- [ ] 9. Run full compatibility and end-to-end closure-path verification

  **What to do**: Execute the full test matrix for the redesign across command-level, state persistence, legacy fixture compatibility, and archive closure flow. Include concrete fixtures for each readiness state plus legacy state shapes. Validate idempotent Verify reruns, deterministic Archive acceptance/refusal, and the rule that Archive-only authority is preserved. Confirm no in-flight feature becomes un-archivable solely due to legacy state shape.
  **Must NOT do**: Do not rely on “tests pass in theory.” Do not leave compatibility coverage implicit.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: broad verification sweep across workflow-critical surfaces
  - Skills: `[]` - No extra skill required
  - Omitted: `['verify']` - Reason: this task validates the redesign itself, not just command wording

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: [] | Blocked By: [8]

  **References**:
  - Metis required matrix: readiness states, archive admission, legacy compatibility, rerun idempotency
  - Existing plan style: `.sisyphus/plans/openflow-process-integration.md:96-490`
  - Core implementation surfaces from Tasks 1–8

  **Acceptance Criteria**:
  - [ ] All readiness-state fixtures pass expected command/state assertions
  - [ ] Legacy state fixtures remain readable and archivable when appropriate
  - [ ] Re-running Verify on unchanged inputs is idempotent
  - [ ] Archive refusal does not partially mutate current/archive state
  - [ ] `bun test` passes
  - [ ] `bun run typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: Full regression suite passes
    Tool: Bash
    Steps: Run `bun test`
    Expected: Exit code 0; redesigned verify/archive/acceptance tests all pass
    Evidence: .sisyphus/evidence/task-9-bun-test.txt

  Scenario: Type system remains consistent after workflow refactor
    Tool: Bash
    Steps: Run `bun run typecheck`
    Expected: Exit code 0; no type regressions from readiness/state/command changes
    Evidence: .sisyphus/evidence/task-9-typecheck.txt
  ```

  **Commit**: YES | Message: `test(workflow): verify readiness and archive authority flow` | Files: tests/fixtures only if needed for final adjustments

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- Commit in 7 small, reviewable slices mirroring the task ordering:
  1. readiness contract + failing tests
  2. acceptance-state persistence + legacy compatibility
  3. verify command registration
  4. readiness classifier
  5. archive gating
  6. archive doc-update confirmation + acceptance hook narrowing
  7. skill/help text alignment + final regression hardening
- Use commit messages already specified in task blocks where possible.
- Do not squash state-contract and archive-gating work into one commit; keep bisectability around workflow-state changes.

## Success Criteria
- The repository has a real `openflow/verify` command instead of only verify skill text.
- Verify is the single semantic verification entry and produces a persisted readiness result.
- Readiness is stored separately from coarse workflow `phase`.
- Archive remains the sole final authority and only proceeds for `ready` / `ready_with_doc_updates`.
- `ready_with_doc_updates` uses confirmed doc-reconciliation flow inside Archive.
- Legacy acceptance-state files remain readable and do not strand in-flight work.
- Help text and command outputs reflect the new governance-first workflow semantics.
