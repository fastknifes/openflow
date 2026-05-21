# Feature Confirmation Interaction - Design

> **Draft with Assumptions / 带假设的草稿**

This document contains assumptions that must not be treated as confirmed implementation constraints.

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

## Behavior Alignment

### 对现有行为的影响

| 现有行为 | 变更后 |
|---------|--------|
| `formatGenerationResultAll` 单向输出文本 | 在文本基础上增加交互选项（交互模式）或文本选项列表（非交互模式） |
| `askDeepVerification` 询问是否深度校验 | 被新的确认式交互取代或整合（详见 Decisions） |
| `FeatureSession` 无 post-design 状态 | 新增 `postDesignDecision` 字段记录选择 |

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
