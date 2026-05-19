# Quality Gate Stage Applicability 与 Readiness 语义优化 - Design

## 1. 背景与问题

当前 OpenFlow 的质量门已经能被 AI 主动调用，但它的判定语义过粗：`quality-gate` 会把“不适用”“缺阶段前置条件”“harden 缺少 plan 上下文”“verify 缺 design/change workspace 证据”等不同情况统一折叠成 `NotReady`。

这会诱导 AI 产生错误修复路径：当质量门返回 `NotReady`，AI 往往会为了通过门禁反向补最小 `design.md`、`plan.md` 或 change workspace，而不是承认当前任务本来不需要质量门，或当前需要先进入正确 workflow stage。

本设计的核心目标是：**先修正 quality-gate 的适用性与 readiness 语义，再增强程序化触发。** 否则硬性触发只会放大现有误判。

## 2. 设计目标

1. 为 `quality-gate` 增加阶段适用性分类器，在运行 `harden` / `verify` 前判断当前任务是否需要质量门。
2. 引入 `NotApplicable` / `NeedsWorkflowStage` / `LimitedContext` 等 quality-gate orchestration 语义，避免误用 `VerifyReadinessStatus.NotReady`。
3. 区分缺文档的含义：实现类任务缺 design/plan 是 workflow stage 缺失；非实现任务缺 design/plan 是不适用或信息性上下文不足。
4. 让 `harden` 缺 plan 只表示 harden 不可用，不默认阻断整个质量门。
5. 调整 verify evidence gap 的分类，避免把所有 evidence gap 都解释成 archive readiness failure。
6. 在语义修正后，再增强 implementation / bugfix / archive_ready 场景的程序化触发。

## 3. 非目标

- 不改变 `openflow-feature`、`openflow-writing-plan` 的生成职责。
- 不允许 AI 为通过 quality-gate 自动创建缺失的 `design.md`、`behavior.md`、`plan.md` 或 issue clarification。
- 不把 `NotApplicable` 作为 archive readiness。
- 不在本阶段实现完整 Drift Guardian semantic LLM review。
- 不移除现有 `VerifyReadinessStatus`，而是在 quality-gate 层增加更精确的 orchestration 状态。

## 4. 核心设计

### 4.1 新增 Quality Gate Applicability Classifier

在 `src/commands/quality-gate.ts` 的 `handleQualityGate()` 前段加入前置分类器。

建议新增类型：

```ts
export type QualityGateApplicabilityStatus =
  | 'applicable'
  | 'not_applicable'
  | 'needs_workflow_stage'
  | 'limited_context'

export interface QualityGateApplicabilityResult {
  status: QualityGateApplicabilityStatus
  reasonCode: string
  reason: string
  taskKind: QualityGateTaskKind
  shouldRunVerify: boolean
  shouldRunHarden: boolean
  archiveReadinessEligible: boolean
  nextStep: string
}

export type QualityGateTaskKind =
  | 'implementation_done'
  | 'bugfix_done'
  | 'archive_ready'
  | 'design_only'
  | 'planning_only'
  | 'metadata_only'
  | 'rename_only'
  | 'docs_only'
  | 'unknown'
```

分类器输入：

- resolved feature / issue / session id
- acceptance state phase
- context kind: feature / issue / plan / limited / none
- changed files: source, tests, docs, config, metadata
- diff shape: code export changes, production code changes, test-only changes
- user intent / command context: implementation completion, bugfix completion, archive readiness

### 4.2 Applicability 状态语义

| 状态 | 含义 | verify | harden | archive readiness |
|---|---|---:|---:|---:|
| `applicable` | 当前是实现完成、bugfix 完成或 archive readiness，需要质量门 | 是 | 按风险 | 可产生 |
| `not_applicable` | 当前是 design-only / planning-only / metadata-only / rename-only / docs-only | 否，或仅 targeted consistency | 否 | 不可产生 |
| `needs_workflow_stage` | 当前像实现/归档，但缺必要 workflow 前置阶段 | 可选 limited verify | 否或 unavailable | 阻断，但不要求自动造文档 |
| `limited_context` | 有代码变更但语义上下文不足，能跑技术检查但不能确认语义 readiness | 是，technical-only | 不因缺 plan 阻断 | 不能作为完整 readiness |

### 4.3 NotApplicable 不写入 verify readiness

`NotApplicable` 是 quality-gate orchestrator 的结果，不是 verify readiness。

因此：

- 不调用 `saveVerifyResult()`。
- 不更新 acceptance state 的 readiness。
- 不提示“修复后重跑”。
- 不允许 `/openflow-archive` 消费它。

示例输出：

```md
## Quality Gate

### Applicability
- Status: NotApplicable (`not_applicable`)
- Reason Code: `design_only_no_implementation_change`
- Reason: 当前任务只修改设计/计划/元数据，不是实现完成或 archive readiness。

### Next Step
No quality gate is required. Do not create missing workflow artifacts merely to satisfy readiness.
```

### 4.4 缺文档不再统一等于 NotReady

当前 `verify.ts` 会将缺 `context_alignment` / `changes_workspace` 计入 reason codes，并最终返回 `NotReady`。优化后要根据 applicability 解释缺失项。

建议新增 evidence gap 分类：

```ts
export type EvidenceGapKind =
  | 'blocking_evidence_gap'
  | 'workflow_stage_missing'
  | 'limited_context_gap'
  | 'informational_gap'

export interface ClassifiedEvidenceGap {
  code: string
  kind: EvidenceGapKind
  message: string
  nextStep: string
}
```

映射规则：

| 缺失项 | 实现/归档场景 | 非实现场景 |
|---|---|---|
| `design.md` / context alignment | `workflow_stage_missing` | `informational_gap` / `not_applicable` |
| change workspace | `workflow_stage_missing` | `informational_gap` |
| issue clarification | issue resolve/archive 时 blocking | 非 issue 场景 not applicable |
| behavior evidence | feature 有 behavior contract 时 blocking/limited | 无 behavior contract 时 informational |

### 4.5 harden 缺 plan 改为 HardenUnavailable

当前链路：

```txt
harden missing plan
→ Status: rejected
→ quality-gate maps rejected to NotReady
→ AI 补 plan
```

目标链路：

```txt
harden missing plan
→ HardenUnavailable(reason: missing_plan_context)
→ quality-gate 根据 applicability 决定：
   - implementation/archive: NeedsWorkflowStage
   - design-only/metadata-only: NotApplicable
   - limited context: technical verify-only, no semantic readiness
```

实现建议：

- 保留 `harden.ts` 的 `Status: rejected` 兼容旧输出。
- 在 `quality-gate.ts` 增加 `parseHardenUnavailableReason()`。
- 对 `missing .sisyphus/plans/{feature}.md` 识别为 `harden_unavailable_missing_plan`。
- `evaluateHardenReadiness()` 不再把该类 rejected 无条件映射为 `NotReady`。

### 4.6 程序化触发在语义修正后增强

语义修正完成后，再增强触发规则：

| 触发 | 行为 |
|---|---|
| implementation_done | quality-gate required |
| bugfix_done | quality-gate required |
| archive_ready | verify/quality-gate readiness required |
| design_only | quality-gate not applicable |
| planning_only | quality-gate not applicable |
| metadata_only / rename_only | quality-gate not applicable |

触发层的文案必须避免“请补 design/plan 让 gate 通过”，改为“如果这是实现类任务，请先进入对应 workflow stage；否则质量门不适用”。

## 5. 模块影响

| 模块 | 改动 |
|---|---|
| `src/commands/quality-gate.ts` | 增加 applicability classifier、结果输出、harden unavailable 映射 |
| `src/commands/verify.ts` | evidence gap 分类，避免无上下文统一 NotReady |
| `src/commands/harden.ts` | 输出更可解析的 unavailable reason，或至少保持可识别 summary |
| `src/types.ts` | 新增 quality-gate applicability / evidence gap 类型 |
| `src/skills/quality-gate-skill.ts` | 更新 skill 文案，强调 NotApplicable / 不得造文档 |
| `src/hooks/chat-message.ts` / `src/hooks/tool-before.ts` | 后续增强完成声明/归档前提醒的程序化触发 |
| `tests/quality-gate/*` | 增加适用性、缺文档、harden unavailable 测试 |
| `tests/commands/verify.test.ts` | 增加 evidence gap 分类测试 |

## 6. 行为对齐

| 行为场景 | 设计响应 | 风险 |
|---|---|---|
| 复杂实现完成后必须运行质量门 | `applicable` 状态运行 risk assessment、harden、verify 并产出 readiness | 高 |
| design-only / planning-only 不应被质量门阻断 | 返回 `not_applicable`，不保存 readiness，不提示补文档 | 高 |
| 实现类任务缺 design/plan | 返回 `needs_workflow_stage`，提示进入正确 workflow，不自动创建文档 | 高 |
| 有代码变更但上下文不足 | 返回 `limited_context`，可做技术检查，但不声明完整语义 readiness | 中 |
| harden 缺 plan | 标记 `harden_unavailable_missing_plan`，不无条件映射为 NotReady | 高 |
| archive readiness | 必须消费有效 Ready / ReadyWithDocUpdates，不接受 NotApplicable | 高 |

## 7. 测试策略

### 7.1 Quality Gate Applicability Tests

- docs/design-only 变更 → `not_applicable`
- planning-only 变更 → `not_applicable`
- metadata-only 变更 → `not_applicable`
- rename-only 变更 → `not_applicable`
- production code 变更 + design/plan 存在 → `applicable`
- production code 变更 + 缺 workflow context → `limited_context` 或 `needs_workflow_stage`
- archive readiness 请求 + 缺 readiness → 阻断，不返回 NotApplicable

### 7.2 Harden Mapping Tests

- harden 缺 `.sisyphus/plans/{feature}.md` → `harden_unavailable_missing_plan`
- design-only 场景 harden unavailable → quality gate `not_applicable`
- implementation 场景 harden unavailable → `needs_workflow_stage`
- harden 真正 error / executor_blocked → 保持 NotReady / NeedsDecision

### 7.3 Verify Evidence Gap Tests

- feature implementation 缺 design.md → `workflow_stage_missing`
- metadata-only 缺 design.md → 不产生 NotReady
- issue archive 缺 issue clarification → blocking
- no active feature → `needs_workflow_stage` 或明确 active feature missing，不提示自动造文档

### 7.4 Regression Tests

- 已有 Ready / ReadyWithDocUpdates archive 路径不破坏。
- `NotApplicable` 不写入 acceptance state readiness。
- `LimitedContext` 不被 archive 误认为 Ready。
- quality-gate report 的 next step 不包含“创建最小 design/plan 以通过检查”。

## 8. 成功标准

- `quality-gate` 能在运行 verify/harden 前判断当前任务是否适用。
- design-only / planning-only / metadata-only / rename-only 返回 `NotApplicable`。
- 实现类任务缺 workflow 前置条件返回 `NeedsWorkflowStage`，而不是诱导补假文档。
- harden 缺 plan 不再无条件导致整个 quality-gate `NotReady`。
- verify evidence gap 被分类，不再所有缺文档都阻断 readiness。
- archive readiness 仍保持严格，不接受 `NotApplicable` / `LimitedContext` 作为完成证据。
