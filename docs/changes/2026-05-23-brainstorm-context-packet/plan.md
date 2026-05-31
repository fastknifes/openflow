# Plan: brainstorm-context-packet

## Overview

实现 Brainstorm Context Packet 工作流，使 `/openflow-brainstorm` 能沉淀结构化上下文包，并让 `/openflow-feature` 在生成设计文档前执行 Context Harvest：展示、确认、编辑或忽略已提取上下文，只将用户确认的内容注入 `RequirementModel`。实现必须保持现有无 packet 的 feature 流程兼容。

## Design Context

设计工作区：`docs/changes/2026-05-23-brainstorm-context-packet/`

关键设计约束：
- Context Packet 是中间 workflow state，不是正式设计权威。
- `/openflow-brainstorm` 保持 conversational-only，不生成正式设计文档。
- `/openflow-feature` 只注入用户确认过的 harvested context。
- 不盲目解析并注入整段 transcript。
- 无 packet、packet 损坏、读取失败、确认取消、非交互无确认时，都必须 fail safe 回退到现有 feature 流程。
- Packet 第一版存储路径固定为 `.sisyphus/brainstorm/context-packets/{id}.json`。
- Packet schema 必须包含 `id`、`version`、`featureHint`、`sourceSessionID`、`createdAt`、`updatedAt`，并给 extracted items 保留 `confidence` 与 `source`。
- `high` confidence 才能默认作为可确认内容；`medium/low` 进入 pending confirmation 或风险/开放问题。
- “好 / 继续 / 同意” 只能确认紧邻的明确设计选择。

参考代码：
- `src/skills/brainstorm-skill.ts` — `/openflow-brainstorm` 当前是纯 skill，无 command handler。
- `src/commands/feature.ts` — `handleFeature()`、`finalizeFeature()`、session history 和文档生成入口。
- `src/phases/feature/state-machine.ts` — `FeatureSession` 和 feature 状态流转。
- `src/phases/feature/constraint-derivation.ts` — `buildRequirementModel()` 当前只从固定 answers 派生模型。
- `src/phases/feature/requirement-model.ts` — `RequirementModelSchema`、`ConstraintSchema`。
- `src/phases/feature/design-renderer.ts` / `behavior-renderer.ts` — 文档渲染。
- `src/types.ts` — `defaultConfig.paths` 与 `.sisyphus` 路径模式。
- `tests/commands/feature.test.ts` — feature command 集成测试模式。
- `tests/phases/feature/*.test.ts` — feature phase 单元测试模式。

验证命令：
- `npm test -- tests/phases/feature/brainstorm-context-packet.test.ts`
- `npm test -- tests/commands/feature.test.ts`
- `npm test -- tests/phases/feature/constraint-derivation.test.ts`
- `npm run typecheck`
- `npm run build`

## Execution Strategy

### Parallel Execution Waves

Wave 1: 新增 Context Packet 数据模型/存储工具、提取规则工具、测试基础。  
Wave 2: 将 packet 写入/更新能力接入 brainstorm skill 指令与可复用工具；将 Context Harvest 接入 `/openflow-feature`。  
Wave 3: RequirementModel 注入、文档渲染覆盖、失败模式与兼容性测试。  
Wave 4: 全量验证、质量门与计划符合性检查。

### Dependency Matrix

| Task | Blocked By | Blocks |
|---|---|---|
| 1. Context Packet schema and storage utilities | None | 3, 4, 5 |
| 2. Extraction rules and confidence classifier | None | 3, 4, 5 |
| 3. Brainstorm packet creation/update integration | 1, 2 | 5, 6 |
| 4. Feature Context Harvest integration | 1, 2 | 5, 6 |
| 5. RequirementModel injection and rendering preservation | 3, 4 | 6, 7 |
| 6. End-to-end tests and failure-mode coverage | 3, 4, 5 | 7 |
| 7. Final verification and quality gate | 6 | None |

## Tasks

- [ ] 1. Add Context Packet schema and filesystem utilities (Agent: quick | Blocks: [3, 4, 5] | Blocked By: [])

  **Agent Profile**: `quick`; skills: none.

  **Parallelization**: Wave 1; can run in parallel with Task 2.

  **Files**:
  - Create `src/phases/feature/context-packet.ts`.
  - Add unit tests in `tests/phases/feature/context-packet.test.ts`.

  **Implementation requirements**:
  - Define packet schema/types for `BrainstormContextPacket`, extracted item confidence, constraints, decisions, non-goals, open questions, risks, and examples.
  - Use `zod` validation consistent with `src/phases/feature/requirement-model.ts` style.
  - Implement safe id generation from `{sourceSessionID}-{featureHint}` using existing `sanitizeFeatureName` / `createSafePath` patterns from `src/utils/security.ts`.
  - Implement read/write/list helpers for `.sisyphus/brainstorm/context-packets/{id}.json` under project directory.
  - Implement stale detection: packets older than 7 days are stale.
  - Malformed packet reads return a skipped/error result, not an exception that blocks feature flow.
  - Writes are best-effort and return explicit success/failure result.

  **Acceptance Criteria**:
  - `BrainstormContextPacketSchema.parse()` accepts valid packets and rejects malformed packets.
  - Storage helpers write/read/list packet files under `.sisyphus/brainstorm/context-packets/`.
  - Malformed JSON is skipped safely.
  - Stale packet detection works with ISO timestamps.

  **QA Scenarios**:
  ```text
  Scenario: valid packet round-trip
    Tool: Bash
    Steps: npm test -- tests/phases/feature/context-packet.test.ts
    Expected: tests pass; valid packet writes and reads with same id/version/sourceSessionID

  Scenario: malformed packet fails safe
    Tool: Bash
    Steps: npm test -- tests/phases/feature/context-packet.test.ts
    Expected: malformed JSON is reported as skipped and does not throw into feature flow
  ```

- [ ] 2. Add conservative extraction and confidence rules (Agent: quick | Blocks: [3, 4, 5] | Blocked By: [])

  **Agent Profile**: `quick`; skills: none.

  **Parallelization**: Wave 1; can run in parallel with Task 1.

  **Files**:
  - Extend `src/phases/feature/context-packet.ts` or create `src/phases/feature/context-extraction.ts`.
  - Add tests in `tests/phases/feature/context-extraction.test.ts`.

  **Implementation requirements**:
  - Implement deterministic conservative extraction helpers for text snippets already available to OpenFlow.
  - Extract categories: problem, decision, constraint, non-goal, open question, risk, example.
  - Confidence rules: explicit user statements/direct corrections are high; assistant-only synthesis is at most medium; speculation/rejected options are low.
  - Generic acknowledgements (`好`, `继续`, `同意`) only confirm the immediately preceding explicit design choice.
  - Do not store raw transcript chunks as packet fields.
  - Do not create a packet unless stability threshold is met: concrete problem, high-confidence decision, high-confidence constraint, or design-affecting open question.

  **Acceptance Criteria**:
  - Weak/casual brainstorm text produces no packet candidate.
  - Assistant-only proposal is not high confidence.
  - User correction overrides prior extracted context.
  - Generic acknowledgement requires local preceding context.

  **QA Scenarios**:
  ```text
  Scenario: stable context extraction
    Tool: Bash
    Steps: npm test -- tests/phases/feature/context-extraction.test.ts
    Expected: explicit user constraints produce high-confidence extracted items with source

  Scenario: noise filtering
    Tool: Bash
    Steps: npm test -- tests/phases/feature/context-extraction.test.ts
    Expected: casual acknowledgements and assistant-only speculation are not high-confidence requirements
  ```

- [ ] 3. Integrate packet creation/update guidance with brainstorm skill boundary (Agent: quick | Blocks: [5, 6] | Blocked By: [1, 2])

  **Agent Profile**: `quick`; skills: none.

  **Parallelization**: Wave 2; can run in parallel with Task 4 after Tasks 1-2.

  **Files**:
  - Update `src/skills/brainstorm-skill.ts`.
  - If code needs a callable helper, use `src/phases/feature/context-packet.ts` / `context-extraction.ts`; do not create a formal brainstorm command.
  - Add/extend tests in `tests/hooks/chat-message-feature.test.ts` or `tests/index.test.ts` only if packet behavior is triggered through existing hooks.

  **Implementation requirements**:
  - Keep `/openflow-brainstorm` conversational-only; do not make it generate `design.md`, `behavior.md`, or `plan.md`.
  - Skill instructions should tell the assistant to preserve stable brainstorm context into packet state when available, and disclose packet creation/update without interrupting brainstorming.
  - Packet write failure must not block brainstorm response; it must be reported as no packet saved.
  - Do not require users to manually copy long summaries into `/openflow-feature`.

  **Acceptance Criteria**:
  - Brainstorm skill documentation states packet is intermediate state, not formal docs.
  - Brainstorm skill retains conversational-only boundary.
  - Tests or review confirm no formal document generation is introduced by brainstorm behavior.

  **QA Scenarios**:
  ```text
  Scenario: brainstorm remains conversational
    Tool: Bash
    Steps: npm test -- tests/hooks/chat-message-feature.test.ts
    Expected: brainstorm suggestions/flows do not create formal design docs

  Scenario: packet write failure non-blocking
    Tool: Bash
    Steps: npm test -- tests/phases/feature/context-packet.test.ts
    Expected: write failure returns failure result and caller can continue
  ```

- [ ] 4. Add Feature Context Harvest before design generation (Agent: unspecified-high | Blocks: [5, 6] | Blocked By: [1, 2])

  **Agent Profile**: `unspecified-high`; skills: none.

  **Parallelization**: Wave 2; can run in parallel with Task 3 after Tasks 1-2.

  **Files**:
  - Modify `src/commands/feature.ts`.
  - Optionally add helpers in `src/phases/feature/context-harvest.ts`.
  - Extend `tests/commands/feature.test.ts`.

  **Implementation requirements**:
  - Before `finalizeFeature()` builds the final requirement model, discover matching packets by current session, exact `featureHint`/slug, then topic similarity.
  - If multiple high-confidence/conflicting packets match, ask the user to choose or ignore; do not silently merge.
  - Render Context Harvest summary before generation.
  - Interactive mode: use existing `askGuardedQuestion` pattern from `src/utils/question-guard.ts` for use/edit/ignore where practical.
  - Non-interactive mode: print harvest summary and wait for natural-language confirmation; no injection without confirmation.
  - Ignore is session-local and does not delete packet.
  - Edit/refine confirms final edited harvest for current generation; saved packet state changes only when explicitly requested.

  **Acceptance Criteria**:
  - Existing no-packet `/openflow-feature` tests still pass.
  - With a relevant packet, feature command shows Context Harvest before generation.
  - Without explicit confirmation, packet content is not injected.
  - Ignore path produces docs from normal feature answers only.
  - Multiple conflicting packets produce disambiguation instead of merge.

  **QA Scenarios**:
  ```text
  Scenario: packet harvest shown before generation
    Tool: Bash
    Steps: npm test -- tests/commands/feature.test.ts
    Expected: test confirms Context Harvest appears before design document generation when packet exists

  Scenario: no unconfirmed injection
    Tool: Bash
    Steps: npm test -- tests/commands/feature.test.ts
    Expected: packet-derived text is absent from generated docs until user confirms use/edit
  ```

- [ ] 5. Inject confirmed packet context into RequirementModel and generated docs (Agent: unspecified-high | Blocks: [6, 7] | Blocked By: [1, 2, 3, 4])

  **Agent Profile**: `unspecified-high`; skills: none.

  **Parallelization**: Wave 3; starts after Tasks 3-4.

  **Files**:
  - Modify `src/phases/feature/constraint-derivation.ts` or add a packet-aware wrapper in `src/phases/feature/context-harvest.ts`.
  - Modify `src/commands/feature.ts` to pass confirmed harvest into requirement preparation.
  - Modify `src/phases/feature/design-renderer.ts` only if existing fields cannot render decisions clearly.
  - Modify `src/phases/feature/behavior-renderer.ts` only if examples need explicit scenario rendering.
  - Add tests in `tests/phases/feature/context-harvest.test.ts` and extend `tests/commands/feature.test.ts`.

  **Implementation requirements**:
  - Inject only confirmed harvest content.
  - Preserve original text and source reference where possible.
  - Map problem to `problemStatement`; constraints to `constraints`; nonGoals to `nonGoals`; open questions to `pendingConfirmations`; risks to `risks`; examples to behavior scenarios/evidence notes only when observable.
  - Decisions must not disappear. If no dedicated model field is added, preserve decisions as constraints or a generated design-decisions section.
  - Existing manually answered feature questions remain authoritative unless user explicitly chooses packet value.
  - Blocking open questions prevent final design unless user chooses draft-with-assumptions.

  **Acceptance Criteria**:
  - Confirmed constraints appear in `design.md`.
  - Confirmed observable examples appear in `behavior.md`.
  - Medium/low confidence items become pending confirmations or are omitted unless confirmed.
  - Blocking open questions do not silently become requirements.

  **QA Scenarios**:
  ```text
  Scenario: confirmed context appears in generated docs
    Tool: Bash
    Steps: npm test -- tests/commands/feature.test.ts
    Expected: generated design.md and behavior.md contain confirmed packet decisions/constraints/examples

  Scenario: blocking open question handling
    Tool: Bash
    Steps: npm test -- tests/phases/feature/context-harvest.test.ts
    Expected: blocking question remains blocker or draft assumption and is not converted to requirement
  ```

- [ ] 6. Add end-to-end compatibility and failure-mode coverage (Agent: quick | Blocks: [7] | Blocked By: [3, 4, 5])

  **Agent Profile**: `quick`; skills: none.

  **Parallelization**: Wave 3; can run after Task 5 begins if APIs are stable.

  **Files**:
  - Extend `tests/commands/feature.test.ts`.
  - Add `tests/phases/feature/context-packet.test.ts`, `tests/phases/feature/context-extraction.test.ts`, and `tests/phases/feature/context-harvest.test.ts` as needed.

  **Implementation requirements**:
  - Cover no-packet legacy flow unchanged.
  - Cover stale/malformed/unreadable packet fail-safe behavior.
  - Cover partial acceptance.
  - Cover ignored context omission.
  - Cover non-interactive harvest requires confirmation.
  - Cover packet write failure does not block brainstorm helper behavior.

  **Acceptance Criteria**:
  - `npm test -- tests/commands/feature.test.ts` passes.
  - New context packet/extraction/harvest tests pass.
  - Existing no-packet feature tests remain unchanged or are updated only for intentional output additions.

  **QA Scenarios**:
  ```text
  Scenario: legacy compatibility
    Tool: Bash
    Steps: npm test -- tests/commands/feature.test.ts
    Expected: existing feature design flows pass without context packets

  Scenario: malformed/stale packet safe fallback
    Tool: Bash
    Steps: npm test -- tests/phases/feature/context-harvest.test.ts
    Expected: stale or invalid packet is skipped and normal feature flow continues
  ```

- [ ] 7. Final verification and OpenFlow quality gate (Agent: unspecified-high | Blocks: [] | Blocked By: [6])

  **Agent Profile**: `unspecified-high`; skills: `openflow-quality-gate`.

  **Parallelization**: Wave 4; final task after implementation and tests.

  **Files**:
  - No feature code changes unless verification reveals defects.
  - Evidence should be saved under `.sisyphus/evidence/` if implementation agent records evidence.

  **Implementation requirements**:
  - Run targeted tests and full type/build verification.
  - Manually exercise the feature command flow in a temporary test directory if practical: create a packet, run feature harvest, confirm use, verify generated docs contain packet context.
  - After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.

  **Acceptance Criteria**:
  - `npm test -- tests/phases/feature/context-packet.test.ts` exits 0.
  - `npm test -- tests/phases/feature/context-extraction.test.ts` exits 0.
  - `npm test -- tests/phases/feature/context-harvest.test.ts` exits 0.
  - `npm test -- tests/commands/feature.test.ts` exits 0.
  - `npm run typecheck` exits 0.
  - `npm run build` exits 0.
  - Quality gate reports readiness or clearly lists blockers.

  **QA Scenarios**:
  ```text
  Scenario: full verification commands
    Tool: Bash
    Steps: npm test -- tests/commands/feature.test.ts; npm run typecheck; npm run build
    Expected: all commands exit 0

  Scenario: final quality gate
    Tool: openflow-quality-gate skill
    Steps: invoke quality gate after implementation
    Expected: readiness reported; no completion claim before readiness
  ```

## Quality Gate Instruction

After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.

## Self-Review

- No placeholders: all tasks specify exact files and verification commands.
- Task count: 7 cohesive tasks, suitable for a medium workflow feature.
- Parallelism: Wave 1 has 2 parallel foundation tasks; Wave 2 has 2 parallel integration tasks; Wave 3 validates and completes injection/testing; Wave 4 verifies.
- Execution units: 7 tasks with bounded sub-items, below the 20-unit warning threshold when grouped by cohesive module work.
- Parser compatibility: every task is a checkbox item under `## Tasks`.
