# rename-brainstorm-to-feature - Design

## Overview

修改 `/openflow-feature` 命令的 `finalizeFeature` 函数，在成功生成 `design.md` 和 `behavior.md` 后，将当前的单向文本输出（`formatGenerationResultAll`）升级为**确认式交互**。

核心变更：
1. 交互模式下：通过 `Question` 工具提供三个选项供用户选择
2. 非交互模式下：在文本输出中清晰列出可选行动，等待用户自然语言回复
3. 新增 Oracle/Momus review 路径：当用户选择"检查约束充分性"时，调用 Oracle 或 Momus 审查设计文档和行为文档的完整性
4. Session 状态记录：在 `FeatureSession` 中新增 `postDesignDecision` 字段记录用户选择，供后续步骤参考

## Problem

当前 `/openflow-feature` 生成文档后的输出是单向的：

```markdown

## Goals

1. 生成文档后提供确认式交互（交互模式用 `Question` 工具，非交互模式用文本选项）
2. 支持三种用户选择：
   - **进入开发计划**：建议 `/openflow-writing-plan`
   - **检查约束充分性**：触发 Oracle/Momus review `design.md` 和 `behavior.md`
   - **查看文档**：仅返回文档路径，不附加下一步建议
3. 保持 backward compatibility：不改变现有核心生成逻辑，只修改输出/交互层
4. 非交互模式下 graceful degradation：文本形式列出选项

## Non-Goals

1. 不自动执行 `/openflow-writing-plan` 或任何其他命令
2. 不改变 feature 收敛逻辑（问题收集、需求模型生成）
3. 不修改 `design.md` 或 `behavior.md` 的内容生成逻辑
4. 不在 review 阶段修改文档文件本身（review 是只读的）
5. 不将 `postDesignDecision` 作为硬门槛（soft advisory only）

## Architecture

### Part A: Renaming (COMPLETED)

The structured workflow has been renamed throughout `src/`:

| Before | After | Status |
|--------|-------|--------|
| `src/phases/brainstorm/` | `src/phases/feature/` | Done |
| `src/commands/brainstorm.ts` | `src/commands/feature.ts` | Done |
| `src/hooks/brainstorm-workflow.ts` | `src/hooks/feature-workflow.ts` | Done |
| `src/skills/brainstorm-skill.ts` | `src/skills/feature-skill.ts` | Done |
| `BrainstormingConfig` type | `FeatureConfig` | Done |
| `brainstorming` config key | `feature` config key | Done |
| `.sisyphus/brainstorm/` state paths | `.sisyphus/feature/` state paths | Done |
| `tests/phases/brainstorm/` | `tests/phases/feature/` | Done |
| Tool name `openflow-brainstorm` | `openflow-feature` | Done |

### Part B: New Conversational Brainstorm Skill (TODO)

A new `openflow-brainstorm` Skill registered in the skill registry. This is NOT a command — it has no tool, no hook, no state machine. It is pure Skill content written to `~/.config/opencode/skills/openflow-brainstorm/SKILL.md`.

**Skill Design** (referencing superpowers' brainstorming skill, dialogue/exploration portions only):

The brainstorm skill enables natural collaborative dialogue. Its content covers:

1. **Understanding the idea**: Check project context first. Assess scope — if too large for a single feature, help decompose. Ask one question at a time to refine understanding.
2. **Exploring approaches**: Propose 2-3 different approaches with trade-offs. Lead with recommendation and reasoning. Present options conversationally.
3. **Presenting the design**: Once understanding is sufficient, present the design in sections scaled to complexity. Ask after each section whether it looks right.
4. **Design for isolation and clarity**: Break the system into smaller units with clear purpose, well-defined interfaces, independent testability.
5. **Working in existing codebases**: Explore current structure before proposing changes. Follow existing patterns. Include targeted improvements, not unrelated refactoring.

**Key principles** (adapted from superpowers):
- One question at a time — don't overwhelm
- Multiple choice preferred when possible
- YAGNI ruthlessly — remove unnecessary features from designs
- Explore alternatives — always propose 2-3 approaches before settling
- Incremental validation — present design, get approval before moving on
- Be flexible — go back and clarify when something doesn't make sense

**What NOT copied from superpowers**:
- Hard gate (`<HARD-GATE>` block) — OpenFlow has its own governance model
- Visual Companion — out of scope for this skill
- Spec self-review checklist — OpenFlow's verify phase handles this
- Writing-plans transition — OpenFlow has its own `/openflow-writing-plan` command
- Process flow diagram — unnecessary for a conversational skill

**Trigger mechanism**:
- **Keyword trigger**: Skill `description` field contains trigger words: "brainstorm, explore requirements, compare approaches, design discussion, ideation, requirements exploration"
- **AI judgment**: The description also states "Use when the user wants to explore a problem space before committing to a structured feature workflow" so agents can autonomously decide to invoke it

**Skill registration**:

```
File: src/skills/brainstorm-skill.ts (NEW)
Export: getBrainstormSkill(): SkillInfo
  name: 'openflow-brainstorm'
  description: 'Conversational skill for collaborative requirement exploration, approach comparison, and design discussion. Triggered by keywords: brainstorm, explore requirements, compare approaches, design discussion. Use when the user wants to explore a problem space before committing to a structured feature workflow. After exploration, suggest running /openflow-feature to formalize the design.'
  content: <see SKILL.md content above>
```

```
File: src/skills/registry.ts (MODIFY)
Add: import { getBrainstormSkill } from './brainstorm-skill.js'
Change: getSkills() returns [...existing, getBrainstormSkill()]
```

### Part C: Test Fixes (TODO)

~19 test files may contain stale `brainstorm`/`Brainstorm` references that need updating to `feature`/`Feature`. The 4 most critical files were already fixed:
- `tests/commands/feature.test.ts`
- `tests/commands/change.test.ts`
- `tests/enhancer/enhancer.test.ts`
- `tests/index.test.ts`

Remaining test files need verification via `bun test` to identify real compilation errors.

### Part D: Documentation Updates (TODO)

Active docs to update:

| File | Change |
|------|--------|
| `README.md` | Replace all `/openflow-brainstorm` → `/openflow-feature` in examples, User Manual sections, "See it in action". Update config key `brainstorming` → `feature`. |
| `README_CN.md` | Same changes as README.md, Chinese version. |
| `docs/current/workflow/openflow-usage-tutorial.md` | Update command references and examples. |
| `docs/current/workflow/openflow-usage-tutorial.en.md` | Same, English version. |
| `docs/decisions/ADR-001-docs-governance-and-workflow.md` | Update command names if referenced. |

**NOT modified**: `docs/archive/`, existing `docs/changes/` historical records.

## Design Constraints

1. **Backward Compatibility**: 现有非交互使用场景必须继续工作，不依赖用户选择
2. **Soft Advisory**: `postDesignDecision` 只是记录，不阻塞、不强制后续流程
3. **Tool Availability**: 必须处理 `hasAskQuestion(toolContext)` 为 false 的情况（非交互模式）
4. **Error Handling**: 如果 Oracle/Momus review 失败，应返回基础结果 + 错误提示，不阻断用户
5. **No Circular Dependency**: 不能引入对 `/openflow-writing-plan` 或 `quality-gate` 的硬依赖

## Success Criteria

- [ ] 交互模式下：生成文档后弹出 `Question` 工具，包含三个选项
- [ ] 非交互模式下：输出文本包含三个清晰选项，用户可用自然语言选择
- [ ] 选择"检查约束充分性"时：调用 Oracle 或 Momus 审查 `design.md` 和 `behavior.md`
- [ ] 选择被记录到 `FeatureSession.postDesignDecision`
- [ ] 不选择或跳过选择时：行为与当前一致（输出建议文本）
- [ ] 所有变更不影响现有 feature 收敛和文档生成逻辑

## Risks And Mitigations

| Risk | Mitigation |
|------|-----------|
| 交互模式不可用时代码路径出错 | 始终保留非交互降级路径，单元测试覆盖两种模式 |
| Oracle/Momus review 耗时过长 | review 在后台运行，不阻塞主流程；失败时返回基础结果 |
| 用户困惑于多个选项 | 选项描述要清晰，默认选项为"进入开发计划" |
| 破坏现有自动化流程 | `postDesignDecision` 为 optional，不选择时行为不变 |

## Testing Strategy

1. **单元测试**（`tests/commands/feature.test.ts`）：
   - 测试交互模式下 `Question` 工具被正确调用
   - 测试非交互模式下输出包含选项文本
   - 测试三种选择分别触发正确行为
   - 测试 `postDesignDecision` 被正确保存到 session

2. **集成测试**：
   - 完整 feature 流程：从问题收集到确认交互到选择记录
   - Oracle/Momus review 路径：模拟 review 成功和失败场景

3. **Regression 测试**：
   - 不选择任何选项时，行为与变更前一致
   - 非交互模式下无工具调用时代码不崩溃

# writing-plan-optimization - Design

### Component: Writing-Plan Skill Content

- Location: `src/skills/writing-plan-skill.ts`
- `getWritingPlanSkill()` (function) — Skill content 文案，包含 Step 4 的路径和拆分规则
- 改动：路径从单一 `.sisyphus/plans/` 改为双路径 + OMO 检测；拆分从 "maximum parallel" 改为 "bounded work packages"

### Component: Writing-Plan Command Handler

- Location: `src/commands/writing-plan.ts`
- `handleWritingPlan()` (function) — 生成 plan-writing packet，输出路径和格式规则
- 改动：Packet 增加 `### Plan Output Paths` 双路径 + OMO 说明；去掉 "Dispatch each same-wave task as a subagent"

### Component: Plan Enhancer

- Location: `src/plan/enhancer.ts`
- `enhancePlan()` (function) — 对 `.sisyphus/plans/*.md` 和 `docs/changes/*/plan.md` 写入后自动注入 TDD expansion、Verification Phase 和 Plan Budget Notice
- 改动：TDD expansion 输出改为 guidance 格式（bold heading + prose），不再生成 checkbox；Verification Phase 改为 plain bullet 参考；增加 idempotent `## Plan Budget Notice` section

### Component: Enhancer Trigger Hook

- Location: `src/hooks/tool-after.ts`
- tool-after hook — 检测 `.sisyphus/plans/*.md` 和 `docs/changes/*/plan.md` 写入，调用 `enhancePlan()`
- 改动：`isPlanFile()` 扩展支持 `docs/changes/*/plan.md` 路径检测

### Component: Plan Parser

- Location: `src/plan/parser.ts`
- `extractPlanName()` (function) — 从 plan 文件路径提取 plan 名称
- 改动：扩展支持 `docs/changes/YYYY-MM-DD-{feature}/plan.md` 格式，自动剥离日期前缀

### Component: Verification Checks

- Location: `src/utils/verification-checks.ts`
- `formatPrefix()` (function) — 格式化 verification check 前缀
- 改动：`formatPrefix('plan')` 从 `- [ ]` 改为 `-`（plain bullet），统一 plan mode 下 verification 不使用 checkbox

### Component: User-Facing SKILL.md

- Location: `C:\Users\Administrator\.config\opencode\skills\openflow-writing-plan\SKILL.md`
- 用户侧 skill 文案
- 改动：路径、拆分策略、budget 自检说明同步更新

## Behavior Alignment

## Proposed Design

Address the problem statement: `openflow-writing-plan` 存在三层放大和路径缺失问题。Primary scope: 修正路径和双存; 拆分策略改为 bounded; TDD expansion 降级; Verification Phase 废弃; 增加 budget 自检

# quality-gate-harden-workflow-redesign - Design

## Scope Decision

主范围：`workflow`。

次级属性：`enhancement + refactor`。

理由：这不是全新用户功能，也不只是内部重构；核心是优化现有 quality-gate/harden/archive 工作流，同时需要增强 harden 状态模型和重构当前 session/finding 编排。

### 1. Quality Gate Orchestration

```text
AI completes implementation
  -> openflow-quality-gate
     -> context resolution
     -> risk triage
     -> machine evidence collection
     -> optional harden child session
     -> evidence-aware verify
     -> readiness classification
```

Quality gate 仍然是最终入口。Harden 是 quality gate 内部的风险型子流程，不是用户手动执行的独立治理命令。

### 2. Harden Child Session

每次 harden run 只创建一个可观察 child session：

```text
Quality Gate session
└── Harden: <feature>
    ├── Round 1 reviewer message
    ├── Round 1 executor message
    ├── Round 2 reviewer message
    └── Final harden summary
```

要求：

- child session 使用 `parentID = toolContext.sessionID`。
- reviewer/executor 在同一个 harden session 内连续追加 prompt。
- 不在 prompt 中嵌入 `task(...)`。
- agent 选择由 request body 控制：`body.agent = 'oracle' | 'deep'`。
- Quality Gate 报告输出 Harden Trace：`sessionID`、round、agent、tokens、stop reason、finding summary。

### 3. Evidence Ledger

Harden run 维护结构化账本：

```text
HardenSession
- id
- featureOrIssue
- parentSessionID
- hardenSessionID
- riskLevel
- triggerReasons
- diffHash
- stage
- stopReason
- tokenBudget
- trace[]
- evidenceRefs[]
- findings[]
- finalRecommendation
```

```text
EvidenceRef
- id
- type: diff | test | lint | typecheck | design | issue | impact | review | executor
- sourcePath or command
- scope: files/symbols
- summary
- hash
- freshForDiffHash
- status: fresh | stale | superseded | invalid
```

```text
Finding
- id
- normalizedKey
- level: blocking_bug | spec_violation | regression_risk | test_gap | design_ambiguity | style_or_preference
- claim
- affectedFiles
- evidenceRefs
- confidence
- status: suspected | confirmed | fixed | verified | dismissed | needs_decision
- disposition: must_fix | accepted_known_issue | design_divergence | false_positive | needs_decision | superseded
- repeatCount
```

### 4. Reviewer Rules

Reviewer 只能创建或更新 finding claim，不能直接裁决 readiness。

Reviewer 必须：

- 引用 evidence refs。
- 区分 explicit design violation 与 design ambiguity。
- 对缺少明确设计依据的问题输出 `design_ambiguity` 或 `needs_evidence`，而不是 `spec_violation`。
- 将文档结构偏好、指令层添加、测试覆盖范围争议降级为 `design_divergence` / `accepted_known_issue` / `false_positive` 候选。
- 限制 active findings 数量，避免 finding inflation。

### 5. Executor Rules

Executor 只处理 `confirmed + must_fix` finding。

Executor 可以输出三类结果：

- `fixed`：实际修改文件并说明验证计划。
- `rejected_with_counter_evidence`：提供反证，要求 finding 转为 dismissed 或 needs_decision。
- `blocked`：说明无法自动修复原因。

Executor 后 harden 必须执行 material-change 检测：

```text
beforeDiffHash = hash(scoped git diff before executor)
afterDiffHash = hash(scoped git diff after executor)

if beforeDiffHash == afterDiffHash:
  mark executor result as no_material_fix
  increment finding repeat/no-fix counter
```

如果无实质修改，不能继续让 reviewer 审旧 diff 到预算耗尽。

### 6. Diff Refresh Rule

每轮 reviewer 前必须重新读取 scoped diff：

```text
reviewerInput = latest scoped diff + active ledger summary + fresh evidence refs
```

禁止使用旧 `rollingDiff + Latest fix report` 作为下一轮主要事实源。

### 7. Convergence Guardrails

Harden 应在以下情况提前停止：

- reviewer 单轮 token 超预算。
- 相同 normalized finding 重复达到阈值。
- executor 连续无法产生 material fix。
- finding 本质是设计-实现分歧而非可自动修复缺陷。
- active findings 全部已有 disposition。

新增 stop reasons：

```text
reviewer_no_findings
all_findings_verified
known_issues_accepted
needs_decision
review_inconclusive
token_budget_exhausted
max_rounds_reached
repeated_finding_no_material_fix
executor_blocked
evidence_stale
```

### 8. Known Issue Acceptance

不允许手动改 acceptance state。需要正规处置记录：

```text
KnownIssueAcceptance
- findingId
- disposition
- rationale
- evidenceRefs
- verifyStatus
- acceptedBy: ai | user | decision-doc
- archiveEffect: non_blocking | doc_update_required | decision_required
```

接受 known issue 的前提：

- verify 技术检查通过，或失败项已被明确记录为非阻塞。
- finding 不是未解决的 `must_fix` blocking defect。
- 有 issue/design/decision 上下文说明为什么可以接受。
- Quality Gate 报告中可见。

### 9. Readiness Mapping

Quality gate 根据 verify + harden ledger 统一裁决：

| Condition | Readiness |
|---|---|
| verify fail + unresolved must_fix | NotReady |
| unresolved confirmed blocking/spec violation | NotReady |
| design ambiguity requiring product/architecture choice | NeedsDecision |
| review inconclusive + no accepted disposition | NeedsDecision |
| budget exhausted but findings all disposed and verify pass | ReadyWithDocUpdates or ReadyWithKnownIssues-style report |
| only non-blocking/test-gap/doc divergence remains | ReadyWithDocUpdates |
| all findings verified and verify pass | Ready |

OpenFlow 现有 readiness 枚举若没有 `ReadyWithKnownIssues`，MVP 可先映射到 `ReadyWithDocUpdates`，并在报告中明确 `Known Issues Accepted`。

# quality-gate-stage-applicability - Design

## Human Consensus Summary

Feature title: Feature 命令确认式交互
Internal slug: feature-confirmation-interaction
Source intent: 将 /openflow-feature 命令生成设计文档后的单向通知改为确认式交互，让用户选择下一步行动
Problem or improvement target: 当前 /openflow-feature 生成 design.md 和 behavior.md 后只是单向输出文本建议，用户无法明确选择下一步行动（进入开发计划或检查约束充分性）
Expected result: 生成文档后提供确认式交互，支持选择进入开发计划、AI 检查约束、或仅查看文档

## Identity And Assumptions

- Feature slug: feature-confirmation-interaction
- Feature title: Feature 命令确认式交互
- Source intent: 将 /openflow-feature 命令生成设计文档后的单向通知改为确认式交互，让用户选择下一步行动

# stateful-quality-guardrails - Design

## Proposed Workflow

```text
feature / issue context
  → implementation write/edit detected
    → implementation_state = dirty
    → previous readiness = stale
  → AI attempts completion claim
    → if dirty/stale: Completion Blocked Until Quality Gate
    → run openflow-quality-gate
      → fresh readiness saved
      → implementation_state = verified | blocked
  → archive
    → requires matching fresh verified state
```

## Components

### Implementation State Tracker

**Purpose**: 在 `tool-after` 中识别实现类写入，并把 acceptance/session 状态从记录型升级为约束型。

**Responsibilities**:
- 分类变更文件：runtime code、test、public API、workflow docs、metadata、docs-only。
- 对实现类变更设置 `implementationDirty = true` 或等价状态。
- 记录 dirty timestamp、changed files、sessionID、feature/issue slug。
- 如果已有 readiness，则标记 evidence freshness 为 stale。

### Completion Claim Guard

**Purpose**: 在 `chat.message` 中识别 AI 完成声明，并在状态未验证时阻断或注入强约束提示。

**Responsibilities**:
- 检测 “完成了 / done / finished / ready to archive / 可以收尾” 等完成语义。
- 如果当前状态 dirty/stale 且没有 fresh readiness，输出 `Completion Blocked Until Quality Gate`。
- 明确要求 AI 调用 `openflow-quality-gate`，不得声称完成。
- 对 docs-only/design-only/planning-only 任务按 quality-gate applicability 允许非实现收口。

### Freshness Gate

**Purpose**: 统一判定 readiness 是否仍然能代表当前工作区。

**Responsibilities**:
- 比较 readiness 生成时的 workspace state 与当前 changed files。
- 如果 verified 后又发生实现类修改，自动失效。
- 为 `archive`、`quality-gate`、completion guard 提供同一判定结果。

### Workflow Context Guard

**Purpose**: 防止没有设计/计划/issue 语义上下文的实现变更被误认为完整就绪。

**Responsibilities**:
- 发现实现类变更但缺少 design/behavior/issue context 时，标记为 limited-context。
- limited-context 可以运行技术检查，但不得产生 archive-ready 语义结论。
- 提示用户显式进入 `/openflow-feature`、`/openflow-issue` 或接受 limited-context 风险。

# BDD-Guided Integration Evidence in Quality Gate - Design

## Evidence Coverage Levels

Quality Gate 使用以下覆盖等级判断 behavior scenario 与 integration evidence 的关系：

| Coverage Level | Meaning | Readiness Effect |
|----------------|---------|------------------|
| `exact` | Evidence 明确覆盖 scenario 的 Given / When / Then，且结果匹配。 | critical 通过 |
| `equivalent` | Evidence 的步骤不同，但语义等价覆盖关键业务行为和可观察结果。 | critical 通过 |
| `partial` | Evidence 只覆盖部分前置条件、触发动作或结果。 | critical 不通过；optional 可 advisory |
| `missing` | 找不到对应 evidence。 | critical 不通过 |
| `not_applicable` | scenario 明确不适用于本次实现或被业务确认排除。 | 不阻塞，但必须记录原因 |

## Scenario-to-Evidence Mapping Rules

1. **Critical scenario: one row required**
   - 每个 critical scenario 必须在 evidence mapping 中有一行。

2. **One test may cover many scenarios**
   - 一个集成测试可以覆盖多个 scenario，但不能只写“覆盖所有场景”；必须逐一列出：`scenario_id → evidence_ref → coverage_level`。

3. **Given / When / Then comparison is semantic**
   - 不要求逐字一致。
   - 必须证明：关键前置条件成立、关键动作被触发、用户/系统可观察结果符合预期。

4. **Implementation-only assertions are insufficient**
   - 只断言内部函数、数据库字段或 mock 调用，不足以覆盖用户可观察行为，除非该 scenario 本身就是内部协议/数据一致性场景。

5. **Ambiguous evidence requires clarification**
   - 如果 evidence 与 scenario 关系不清，Quality Gate 应标记 `partial` 或 `needs_decision`，而不是自动当作通过。

## Evidence Mapping Format

`behavior.md` 必须使用固定 evidence mapping 表格，供 Quality Gate 解析或人工审查：

```md
| Scenario ID | Criticality | Evidence Ref | Evidence Type | Coverage Level | Equivalence Rationale | Freshness | Status |
|-------------|-------------|--------------|---------------|----------------|-----------------------|-----------|--------|
| SC-001 | critical | .sisyphus/evidence/SC-001-api-smoke.md | api_smoke | exact | N/A | fresh | verified |
```

字段约束：

| Field | Required | Meaning |
|-------|----------|---------|
| `Scenario ID` | yes | behavior scenario 的稳定 ID；如果旧文档没有 ID，Quality Gate 应使用标题 slug 作为临时 ID。 |
| `Criticality` | yes | `critical`、`boundary`、`optional`。 |
| `Evidence Ref` | critical 必填 | 证据文件路径、测试报告路径、QA 记录路径或可复现验证记录。 |
| `Evidence Type` | yes | `integration_test`、`api_smoke`、`e2e`、`qa_record`、`manual_repro`、`not_applicable`。 |
| `Coverage Level` | yes | `exact`、`equivalent`、`partial`、`missing`、`not_applicable`。 |
| `Equivalence Rationale` | equivalent 必填 | 解释为什么 evidence 与 scenario 语义等价。 |
| `Freshness` | yes | `fresh`、`stale`、`unknown`。 |
| `Status` | yes | `verified`、`failed`、`missing_evidence`、`needs_decision`、`not_applicable`。 |

## Criticality Defaults

- `behavior.md` 中未显式标记的 scenario 默认 `critical`。
- `Boundary:` 标题或明确标记 `boundary` 的场景为 `boundary`。
- 只有明确标记为 `optional` 或 `not_applicable` 的场景才不默认阻塞 readiness。
- issue 模式下，`issue-clarification.md` 的 confirmed root cause、known requirements、expected behavior、regression signature 默认视为 critical evidence targets。

## Evidence Storage

- `behavior.md` 保存 scenario-to-evidence mapping 摘要。
- `.sisyphus/evidence/{scenario-id}-{short-description}.md` 保存详细证据。
- 若证据来自外部测试报告或日志，`Evidence Ref` 应指向稳定路径或记录摘要，不能只写"见控制台输出"。
- Verify output 可生成临时 evidence summary，但 archive 前必须能追溯到持久化 evidence ref。

### Evidence Ref 可追溯性要求

Evidence Ref 必须指向可持久追溯的证据源。以下引用方式**明确禁止**：

| 禁止的引用方式 | 原因 |
|----------------|------|
| "见控制台输出" | 控制台输出是一次性的，无法在后续会话或 review 中追溯 |
| "测试已跑过" | 没有具体指向任何文件或记录，无法验证 |
| "本地已验证" | 缺乏执行上下文和可复现性 |
| 无 git hash / 无时间戳的引用 | 无法判定 freshness，会被判定为 `unknown` |

合规的 Evidence Ref 示例：

- `.sisyphus/evidence/SC-001-api-smoke.md`（项目内持久化证据文件）
- `test-results/integration-2026-05-20.html`（稳定路径的测试报告）
- `docs/changes/2026-05-20-feature/qa-checklist.md`（项目文档中的 QA 记录）

### Evidence 文件模板字段与 Parser 映射

证据文件 `.sisyphus/evidence/{scenario-id}-{slug}.md` 的字段对应 `BehaviorScenarioEvidence` 类型定义：

| 证据文件字段 | 对应 Parser 字段 | 对应 Mapping 表列 | 必填 |
|-------------|-----------------|------------------|------|
| Scenario Reference → Scenario ID | `scenarioId` | Scenario ID | 是 |
| Scenario Reference → Scenario Name | `scenarioName` | （用于 readability） | 是 |
| Evidence Type | `evidenceType` | Evidence Type | 是 |
| Execution Context | （辅助 freshness 判定） | （辅助字段） | 是 |
| Observed Results → Result | `status` | Status | 是 |
| Coverage Rationale | `equivalenceRationale` | Equivalence Rationale | equivalent 时必填 |
| Freshness Metadata → Timestamp / Git HEAD | `freshness` | Freshness | 是 |
| （从 mapping 表读入） | `criticality` | Criticality | 是 |
| （从 mapping 表读入） | `coverageLevel` | Coverage Level | 是 |
| （从 mapping 表读入） | `evidenceReference` | Evidence Ref | critical 必填 |

## Freshness Rules

Evidence freshness 判定规则：

1. `fresh`: evidence 生成时间晚于最后一次相关实现文件变更，或 evidence 明确绑定当前 git HEAD/diff hash/change set。
2. `stale`: evidence 早于相关实现文件变更，或绑定的是旧 git HEAD/diff hash。
3. `unknown`: evidence 没有时间、git hash、命令输出时间、QA 日期或其他 freshness metadata。

Quality Gate 不应把 `unknown` 当作通过。critical scenario 的 `unknown` freshness 应进入 `needs_decision` 或 `NotReady`。

## Readiness Decision Matrix

| Condition | Readiness |
|-----------|-----------|
| 所有 critical scenario 均为 `exact`/`equivalent` + `fresh` + `verified` | `Ready` |
| critical scenario 存在 `partial`、`missing`、`failed` 或 `stale` | `NotReady` |
| critical scenario evidence 语义不清或 freshness 为 `unknown` | `NeedsDecision` 或 `NotReady` |
| 仅 optional/boundary 缺 evidence | `Ready` 或 `ReadyWithDocUpdates`，并记录 advisory gap |
| scenario 标记 `not_applicable` 但无理由 | `NeedsDecision` |
| evidence ref 缺失或无法读取 | `NotReady` |

## Quality Gate Flow

```text
behavior.md / issue-clarification.md
  → derive integration evidence requirements
  → AI/OMO runs or records project-appropriate integration validation
  → evidence is persisted under .sisyphus/evidence and mapped in behavior.md
  → Quality Gate performs compilation health probe (adaptive, non-blocking)
  → Quality Gate checks coverage and freshness
  → readiness classification
  → archive maps behavior → evidence → implementation
```

## Compilation Health Probe

Quality Gate 在执行集成证据判定之前，应执行一次轻量的编译健康探测：

### 探测规则

| 项目标识 | 语言/框架 | 探测命令 | 说明 |
|----------|-----------|----------|------|
| `tsconfig.json` | TypeScript | `npx tsc --noEmit` 或 `tsc --noEmit` | 类型检查 |
| `go.mod` | Go | `go build ./...` | 编译检查 |
| `Cargo.toml` | Rust | `cargo check` | 编译检查 |
| `package.json` | JavaScript/Node | 检查 `scripts` 中是否有 `typecheck`，如有则运行 | 仅在有明确脚本时运行 |
| `composer.json` | PHP | 检查 `scripts` 或 `vendor/bin/phpstan`、`vendor/bin/psalm` | 仅在有明确工具时运行 |
| `*.py` | Python | `python -m py_compile`（仅语法） | 轻量语法检查 |
| `*.rb` | Ruby | `ruby -c`（仅语法） | 轻量语法检查 |

### 探测原则

1. **不硬编码**：命令由项目文件推断，不是 OpenFlow 写死的。
2. **不阻塞**：探测失败或工具链缺失时，不阻塞 readiness，只记录 advisory gap。
3. **不作为证据**：探测结果不替代集成测试证据，仅作为"项目可编译"的辅助信号。
4. ** freshness 关联**：探测通过时，记录 timestamp 和 git HEAD，作为 evidence freshness 的辅助元数据。

# Feature Confirmation Interaction - Design

> **Draft with Assumptions / 带假设的草稿**

This document contains assumptions that must not be treated as confirmed implementation constraints.

## Feature Design Complete
...

### Next Step (Advisory)
Design documents are complete. You may proceed to implementation planning when ready.
Suggested user action:
/openflow-writing-plan {feature}
```

问题：
- 用户没有被明确询问下一步意愿
- "建议"容易被忽略，用户可能直接进入自然语言对话而跳过结构化流程
- 没有机制让用户在实现前请求 AI 审查设计文档的约束充分性
- 与 Prometheus 的计划生成后的确认式交互不一致，降低用户体验一致性

### 对现有行为的影响

| 现有行为 | 变更后 |
|---------|--------|
| `formatGenerationResultAll` 单向输出文本 | 在文本基础上增加交互选项（交互模式）或文本选项列表（非交互模式） |
| `askDeepVerification` 询问是否深度校验 | 被新的确认式交互取代或整合（详见 Decisions） |
| `FeatureSession` 无 post-design 状态 | 新增 `postDesignDecision` 字段记录选择 |

## Decisions

### Decision 1: 取代还是整合 `askDeepVerification`

**选择**：整合。将 `askDeepVerification` 替换为新的 `askPostDesignConfirmation`，其中包含"检查约束充分性"选项。

**理由**：
- 原 `askDeepVerification` 询问的是"是否深度校验"，与新的确认式交互功能重叠
- 新交互更完整，包含了原深度校验的功能（"检查约束充分性"会触发类似检查）
- 减少用户的认知负担：一个对话框 > 两个连续对话框

**替代方案**：保留 `askDeepVerification` 作为独立步骤，在确认交互之后额外询问。放弃原因：增加交互轮次，不符合"高效确认"的目标。

### Decision 2: Oracle vs Momus 选择

**选择**：优先 Oracle，复杂场景可选 Momus。

**理由**：
- Oracle 是 read-only consultant，适合审查设计文档的完整性和约束充分性
- Momus 是 plan critic，更适合审查实现计划而非设计文档
- 如果用户明确要求"严格审查"，可以提供 Momus 选项

**默认行为**：调用 Oracle 审查 `design.md` 和 `behavior.md` 的约束完整性、假设清晰度、边界覆盖度。

### Decision 3: `postDesignDecision` 类型定义

```typescript
type PostDesignDecision = 'proceed_to_plan' | 'review_docs' | 'inspect' | undefined
```

- `proceed_to_plan`：用户希望进入开发计划阶段
- `review_docs`：用户希望 AI 审查设计文档
- `inspect`：用户只想查看文档，不立即行动
- `undefined`：用户未做选择（默认）

## Implementation Sketch

### 变更文件

1. `src/phases/feature/state-machine.ts`
   - 在 `FeatureSession` 接口中新增 `postDesignDecision?: PostDesignDecision`
   - 新增 `PostDesignDecision` 类型

2. `src/commands/feature.ts`
   - 修改 `finalizeFeature`：在生成文档后调用新的确认交互逻辑
   - 新增 `askPostDesignConfirmation`：交互模式下调用 `Question` 工具
   - 新增 `formatPostDesignOptions`：非交互模式下输出文本选项
   - 新增 `executeDocReview`：调用 Oracle 审查文档
   - 删除或重构 `askDeepVerification`（整合进新流程）
   - 修改 `formatGenerationResultAll`：支持根据 `postDesignDecision` 定制输出

3. `tests/commands/feature.test.ts`
   - 新增测试用例覆盖确认交互的三种路径

### 关键代码结构

```typescript
// src/commands/feature.ts

async function finalizeFeature(...) {
  // ... 现有文档生成逻辑不变 ...
  
  const baseResult = formatGenerationResultAll(...)
  
  if (hasAskQuestion(toolContext)) {
    // 交互模式：弹出确认对话框
    const decision = await askPostDesignConfirmation(toolContext, validatedModel)
    if (decision) {
      // 保存选择到 session
      const updatedSession = { ...completedSession, postDesignDecision: decision }
      await saveFeatureSession(...)
      
      // 根据选择执行相应行为
      if (decision === 'review_docs') {
        const reviewResult = await executeDocReview(ctx, completedSession)
        return `${baseResult}\n\n${reviewResult}`
      }
      
      // 返回定制化的下一步建议
      return formatDecisionResult(baseResult, decision)
    }
  } else {
    // 非交互模式：输出文本选项
    return `${baseResult}\n\n${formatPostDesignOptions()}`
  }
  
  return baseResult
}
```

## References

- `src/commands/feature.ts`：核心修改文件
- `src/phases/feature/state-machine.ts`：Session 类型定义
- `src/skills/feature-skill.ts`：Skill 行为约束
- Prometheus plan generation 流程（`oh-my-openagent/src/agents/prometheus/gemini.ts` Phase 3）：确认式交互参考实现
