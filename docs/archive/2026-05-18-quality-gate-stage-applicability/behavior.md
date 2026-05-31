# Quality Gate Stage Applicability 与 Readiness 语义优化 - Observable Behavior

## 1. 用户可见目标

当 AI 或用户触发 `openflow-quality-gate` 时，系统应先判断当前任务是否真的需要质量门。对于非实现类任务，质量门应明确返回“不适用”，而不是返回 `NotReady` 并诱导 AI 创建缺失文档。

## 2. Trigger Rules

以下情况应触发或要求 quality-gate：

- 实现类代码变更完成，例如 production/source 文件被修改。
- bugfix 完成并准备声称修复完成。
- 用户或流程进入 archive readiness 判断。
- 有测试/源码变更且需要确认 readiness。
- acceptance state 表示实现阶段已结束或准备进入验证/归档。

## 3. Non-Trigger Rules

以下情况不应触发完整 quality-gate readiness：

- 仅生成或修改 `design.md`、`behavior.md`、`prd.md`、`requirements.md`。
- 仅生成或修改 `plan.md`。
- 仅改 docs/current、docs/archive、README、教程或评估报告。
- 仅重命名 feature/workspace，不涉及实现语义变更。
- 仅修改 metadata/config 且不影响运行时代码行为。
- 当前任务明确是设计、规划、分析或文档整理。

## 4. User-Visible Scenarios

### Scenario 1: 实现完成后质量门适用

**Given:**
- 用户或 AI 完成了 production/source 代码变更。
- 当前任务语义是 implementation_done 或 bugfix_done。
- feature / issue / plan 上下文足以进行验证。

**When:**
- AI 触发 `openflow-quality-gate`。

**Then:**
- 系统返回 `Applicable`。
- 系统执行 risk assessment。
- 如风险需要，系统执行 harden。
- 系统执行 evidence-aware verify。
- 输出 Ready / ReadyWithDocUpdates / NotReady / NeedsDecision。
- 输出可以被 archive readiness 消费的结果。

### Scenario 2: design-only 任务不适用质量门

**Given:**
- 当前变更只涉及设计文档、需求文档或行为文档。
- 没有 production/source/test 实现变更。

**When:**
- AI 或流程触发 `openflow-quality-gate`。

**Then:**
- 系统返回 `NotApplicable`。
- 系统不运行 harden。
- 系统不保存 verify readiness。
- 系统不提示创建 plan/design 来通过检查。
- 用户可见 next step 表示“不需要质量门；如需要可运行 targeted consistency check”。

### Scenario 3: planning-only 任务不适用质量门

**Given:**
- 当前变更只涉及 `.sisyphus/plans/{feature}.md` 或 `docs/changes/*/plan.md`。
- 尚未进入实现阶段。

**When:**
- `openflow-quality-gate` 被调用。

**Then:**
- 系统返回 `NotApplicable`。
- 系统不把缺 design/workspace 解释为 `NotReady`。
- 系统不要求补齐实现证据。

### Scenario 4: metadata-only / rename-only 不应被门禁逼出文档

**Given:**
- 当前任务只修改 metadata、配置说明、feature 名称或非运行时文档。

**When:**
- quality-gate 被调用或 completion prompt 判断任务结束。

**Then:**
- 系统返回 `NotApplicable` 或跳过完整质量门。
- 输出说明当前任务不是 post-implementation readiness gate。
- 不保存 archive readiness。

### Scenario 5: 实现类任务缺 workflow 前置阶段

**Given:**
- 当前存在 source/test 代码变更。
- 但缺少实现类任务应有的 design、plan 或 change workspace 上下文。

**When:**
- quality-gate 被调用。

**Then:**
- 系统返回 `NeedsWorkflowStage`。
- 系统说明缺失的是 workflow 前置阶段，而不是普通实现失败。
- 系统不得建议 AI 自动创建最小 design/plan。
- next step 应指向显式用户 workflow，例如运行 `/openflow-feature` 或 `/openflow-writing-plan`，且需用户确认。

### Scenario 6: 有代码变更但语义上下文不足

**Given:**
- 当前存在代码变更。
- 但系统无法确认 feature/issue/plan 上下文。

**When:**
- quality-gate 被调用。

**Then:**
- 系统返回 `LimitedContext`。
- 系统可以运行技术检查，例如 typecheck、lint、test、security scan。
- 系统不得声明完整 semantic readiness。
- archive 不得把 LimitedContext 当作 Ready。

### Scenario 7: harden 缺 plan 不直接导致 NotReady

**Given:**
- risk assessment 建议 harden。
- `harden` 因缺 `.sisyphus/plans/{feature}.md` 无法运行。

**When:**
- quality-gate 汇总 harden 结果。

**Then:**
- 系统把 harden 状态解释为 `harden_unavailable_missing_plan`。
- 如果当前任务是 design-only/planning-only，最终结果为 `NotApplicable`。
- 如果当前任务是 implementation/archive，最终结果为 `NeedsWorkflowStage`。
- 系统不得把该情况无条件映射成 `NotReady`。

### Scenario 8: archive readiness 仍然严格

**Given:**
- 用户准备运行 `/openflow-archive <feature>`。

**When:**
- 系统检查 readiness。

**Then:**
- 只有有效的 `Ready` 或允许的 `ReadyWithDocUpdates` 可以进入 archive。
- `NotApplicable` 不可用于 archive。
- `LimitedContext` 不可用于 archive。
- `NeedsWorkflowStage` 阻止 archive，并提示先完成明确 workflow 阶段。

## 5. Required Content

成功实现必须包含以下用户可见能力：

- quality-gate report 中出现 Applicability 区块。
- `NotApplicable` 输出明确说明当前任务为何不需要质量门。
- `NeedsWorkflowStage` 输出明确说明缺少的是 workflow 前置阶段。
- `LimitedContext` 输出明确说明只完成技术检查，不代表语义 readiness。
- harden 缺 plan 的输出不再诱导 AI 自动补 plan。
- verify 缺文档的输出根据场景分类，而不是统一 NotReady。

## 6. Must Not Behavior

以下行为不得出现：

- design-only / planning-only / metadata-only 被标记为 `NotReady`。
- quality-gate 为了通过检查建议创建最小 `design.md` / `plan.md`。
- `NotApplicable` 被保存为 acceptance state readiness。
- `NotApplicable` 或 `LimitedContext` 被 archive 当作 Ready。
- harden 缺 plan 被无条件解释为整个质量门失败。
- 所有 evidence gap 被统一当作 blocking readiness failure。

## 7. Acceptance / Verification Mapping

| Acceptance Criterion | Scenario | Evidence Type | Expected Evidence | Status |
|---|---|---|---|---|
| 实现完成后质量门仍强制适用 | Scenario 1 | automated test | source code change with valid context returns Applicable and runs verify | pending |
| design-only 不触发 readiness failure | Scenario 2 | automated test | docs/design-only change returns NotApplicable | pending |
| planning-only 不触发 readiness failure | Scenario 3 | automated test | plan-only change returns NotApplicable | pending |
| metadata/rename 不诱导补文档 | Scenario 4 | automated test | metadata-only or rename-only returns NotApplicable and no doc creation suggestion | pending |
| 实现缺前置阶段返回 NeedsWorkflowStage | Scenario 5 | automated test | code change without workflow context returns NeedsWorkflowStage | pending |
| limited context 不等于 Ready | Scenario 6 | automated test | technical checks may run but archive readiness is not produced | pending |
| harden 缺 plan 不直接 NotReady | Scenario 7 | automated test | missing plan maps to harden_unavailable_missing_plan | pending |
| archive 不接受 NotApplicable | Scenario 8 | automated test | archive blocks NotApplicable / LimitedContext states | pending |

## 8. Success Responses

成功时，用户应看到类似：

```md
## Quality Gate

### Applicability
- Status: NotApplicable (`not_applicable`)
- Reason Code: `design_only_no_implementation_change`
- Reason: 当前任务只涉及设计文档，不是实现完成或归档 readiness。

### Next Step
No quality gate is required. Do not create workflow artifacts merely to satisfy readiness.
```

或：

```md
## Quality Gate

### Applicability
- Status: NeedsWorkflowStage (`needs_workflow_stage`)
- Reason Code: `implementation_missing_plan_context`
- Reason: 当前存在实现变更，但缺少应由 workflow 显式产生的 plan/design 上下文。

### Next Step
Ask the user whether to enter the planning workflow. Do not create a minimal plan automatically.
```
