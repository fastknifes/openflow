# Feature Confirmation Interaction - Observable Behavior

> **Draft with Assumptions / 带假设的草稿**

Assumptions in this behavior document are not confirmed facts.

## Human Consensus Summary

Feature title: Feature 命令确认式交互
Internal slug: feature-confirmation-interaction
Source intent: 将 /openflow-feature 命令生成设计文档后的单向通知改为确认式交互，让用户选择下一步行动
Problem statement: 当前 /openflow-feature 生成 design.md 和 behavior.md 后只是单向输出文本建议，用户无法明确选择下一步行动

## Feature Command Behavior

- `/openflow-feature` 生成 `design.md` 和 `behavior.md` 后，行为取决于运行环境：
  - **交互模式**（`hasAskQuestion` 为 true）：弹出确认对话框，提供三个选项
  - **非交互模式**（`hasAskQuestion` 为 false）：在文本输出中列出三个选项，等待用户自然语言回复
- 用户选择被记录到 `FeatureSession.postDesignDecision` 字段
- 选择结果不触发自动执行，仅影响返回文本和后续建议

## User Context

### Primary User
使用 `/openflow-feature` 进行功能设计的开发者或产品经理

### Secondary User
在聊天会话中继续 feature 对话的 AI Agent（需要读取 `postDesignDecision` 来决定后续建议）

### Preconditions
1. 用户已运行 `/openflow-feature <feature-name>`
2. Feature 设计已收敛（所有问题已回答或跳过）
3. `design.md` 和 `behavior.md` 已成功生成

## Trigger Rules

确认式交互在以下条件下触发：

1. `workflowState === 'completed'`
2. `generatedDocs.length > 0`（至少包含 `design.md`）
3. `finalizeFeature` 函数执行到文档生成后的输出阶段
4. 不依赖于 `toolContext` 的特定模式，但交互形式取决于 `hasAskQuestion(toolContext)`

## Non-Trigger Rules

确认式交互**不**在以下情况触发：

1. 文档生成失败（`workflowState === 'failed'`）
2. 用户继续已完成的 feature session（直接返回已有结果）
3. Feature 仍在问题收集阶段（`workflowState === 'collecting'`）
4. 用户发送的是自然语言补充说明而非明确的选择指令

## User Visible Scenarios

### Scenario 1: 交互模式 - 用户选择"进入开发计划"

```
User: /openflow-feature demo-feature
[AI 收集问题...生成文档...]

AI: ## Feature Design Complete
...

[弹出 Question 工具]
标题: 下一步行动
问题: 设计文档已生成。您希望如何继续？
选项:
- 进入开发计划: 生成实现计划并准备执行
- 检查约束充分性: 让 AI 审查 design.md 和 behavior.md 的约束完整性
- 查看文档: 仅浏览生成的设计文档，不立即行动

User: [选择"进入开发计划"]

AI: ✓ 已记录您的选择：进入开发计划
建议下一步运行：
/openflow-writing-plan demo-feature
```

### Scenario 2: 交互模式 - 用户选择"检查约束充分性"

```
[同上，直到 Question 工具]

User: [选择"检查约束充分性"]

AI: ✓ 已记录您的选择：检查约束充分性
正在调用 Oracle 审查设计文档...

## Design Document Review

Document set: design.md, behavior.md
Boundary cases: [Oracle 发现的边界情况]
Constraint gaps: [缺失或模糊的约束]
Assumption clarity: [假设清晰度评估]

建议：补充以下约束后再进入开发计划...
```

### Scenario 3: 非交互模式

```
User: /openflow-feature demo-feature
[AI 收集问题...生成文档...]

AI: ## Feature Design Complete
...

## Next Step Options

设计文档已生成。请选择下一步行动：

1. **进入开发计划** - 运行 `/openflow-writing-plan demo-feature` 生成实现计划
2. **检查约束充分性** - 让 AI 审查设计文档的约束完整性
3. **查看文档** - 浏览 design.md 和 behavior.md，不立即行动

请回复选项编号或描述您的选择。

User: 我想先检查约束

AI: ✓ 正在审查设计文档的约束充分性...
[Oracle review 结果]
```

### Scenario 4: 用户不做选择（非交互模式跳过）

```
User: /openflow-feature demo-feature
[生成文档...]

AI: ## Feature Design Complete
...
### Next Step (Advisory)
[与当前行为一致的标准输出]
```

## Required Content

无论交互模式还是非交互模式，输出必须包含：

1. **生成结果摘要**：文档路径、假设、约束（与当前一致）
2. **明确的选项列表**：三个选项，标签和描述清晰
3. **默认选项**："进入开发计划"作为推荐/默认选项
4. **Session 状态**：用户选择（如有）被保存到 `FeatureSession.postDesignDecision`

## Success Responses

### 交互模式成功响应结构

```typescript
// Question 工具调用
{
  questions: [{
    question: "设计文档已生成。您希望如何继续？",
    header: "下一步行动",
    options: [
      { label: "进入开发计划", description: "生成实现计划并准备执行" },
      { label: "检查约束充分性", description: "让 AI 审查 design.md 和 behavior.md 的约束完整性" },
      { label: "查看文档", description: "仅浏览生成的设计文档，不立即行动" }
    ],
    multiple: false,
    custom: false
  }]
}
```

### 非交互模式成功响应结构

```markdown
## Feature Design Complete
...

## Next Step Options

设计文档已生成。请选择下一步行动：

1. **进入开发计划** - 运行 `/openflow-writing-plan {feature}` 生成实现计划
2. **检查约束充分性** - 让 AI 审查设计文档的约束完整性
3. **查看文档** - 浏览生成的设计文档，不立即行动

请回复选项编号或描述您的选择。
```

### Oracle Review 成功响应结构

```markdown
## Design Document Review

Document set: design.md, behavior.md
Reviewed by: Oracle

### Constraints Completeness
- [OK/MISSING] 每个需求都有对应的约束
- [OK/MISSING] 边界情况已定义
...

### Recommendations
- [如果有缺失] 建议在实现前补充...
- [如果完整] 约束充分，可以进入开发计划

### Next Step
[根据 review 结果定制建议]
```

## Must Not Behavior

1. **Must Not** 在文档生成失败后弹出确认交互
2. **Must Not** 自动执行 `/openflow-writing-plan` 或任何其他命令
3. **Must Not** 将确认交互作为硬门槛阻塞用户（用户可忽略选项继续自然语言对话）
4. **Must Not** 在非交互模式下尝试调用 `Question` 工具
5. **Must Not** 修改 `design.md` 或 `behavior.md` 文件内容作为 review 的一部分
6. **Must Not** 在 review 失败时阻塞用户进入开发计划（review 是 advisory）
7. **Must Not** 改变 feature 收敛逻辑或问题收集流程
8. **Must Not** 向现有未包含 `postDesignDecision` 的 session 中注入默认值

## Acceptance Verification Mapping

| 验收点 | 验证方式 | 通过标准 |
|--------|---------|---------|
| 交互模式弹出 Question 工具 | 单元测试：模拟 `hasAskQuestion=true` | `Question` 工具被调用，包含三个选项 |
| 非交互模式输出文本选项 | 单元测试：模拟 `hasAskQuestion=false` | 输出文本包含三个选项的清晰描述 |
| 选择"进入开发计划" | 集成测试 | 返回文本建议 `/openflow-writing-plan`，`postDesignDecision='proceed_to_plan'` |
| 选择"检查约束充分性" | 集成测试 + mock Oracle | `task(subagent_type="oracle")` 被调用，返回 review 结果 |
| 选择"查看文档" | 集成测试 | 返回文档路径，无下一步建议，`postDesignDecision='inspect'` |
| 不做选择时行为不变 | 回归测试 | 输出与变更前一致 |
| Session 记录选择 | 单元测试 | `FeatureSession.postDesignDecision` 正确保存 |
| 不自动执行命令 | 代码审查 | `finalizeFeature` 中无 `/openflow-writing-plan` 或其他命令的自动调用 |
