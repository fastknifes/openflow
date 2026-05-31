# 把这套工作流 itself 作为 feature 来出设计文档，然后按文档重构， 目的是保证代码整洁，尽量做到代码干净整洁。没必要做兼容 - Design


## Human Consensus Summary

Feature title: 把这套工作流 itself 作为 feature 来出设计文档，然后按文档重构， 目的是保证代码整洁，尽量做到代码干净整洁。没必要做兼容
Internal slug: itself-design
Source intent: 把这套工作流 itself 作为 feature 来出设计文档，然后按文档重构， 目的是保证代码整洁，尽量做到代码干净整洁。没必要做兼容
Problem or improvement target: 重构 OpenFlow feature workflow，消除固定5个问题+硬编码收敛判断导致的约束收集不足问题，提升代码整洁度
Expected result: Solve: 重构 OpenFlow feature workflow，从固定问题+硬编码收敛判断转向动态问题+AI自主收敛; Honor priority: 易维护
## Identity And Assumptions

- Feature slug: itself-design
- Feature title: 把这套工作流 itself 作为 feature 来出设计文档，然后按文档重构， 目的是保证代码整洁，尽量做到代码干净整洁。没必要做兼容
- Source intent: 把这套工作流 itself 作为 feature 来出设计文档，然后按文档重构， 目的是保证代码整洁，尽量做到代码干净整洁。没必要做兼容
- Assumptions:
  - OpenCode AI 具备根据状态摘要自主决定追问策略的能力
  - 动态问题生成的 key 由 AI 在调用 tool 时显式指定（factKey）
  - 约束不再从固定 key 模板映射，而是通过 `DesignSynthesizer` 从所有 `collectedFacts` 推断
- Pending confirmations:
  - 无
## Overview

Feature: itself-design（重构 OpenFlow feature workflow）
In scope: `src/phases/feature/` 目录下所有文件；`src/index.ts` tool schema 定义；`src/hooks/chat-message.ts` hook 逻辑
Out of scope: archive、quality-gate、implement 等其他 workflow 不受影响
## Problem

当前 OpenFlow feature workflow 采用固定5个问题（problem/scope/priority/constraints/target-users）+ 硬编码收敛判断（convergence.ts）的架构。重构后，`constraints` 维度被过早标记为 `inferred`（只要 `sourceIntent` 存在且 `scope` 已回答），导致用户从未被询问约束问题，生成的设计文档约束严重不足（仅0-3条模板化约束）。同时，固定问题列表无法适应不同 feature 的差异化信息需求，硬编码规则持续产生 edge case 补丁。

## Goals

- Solve: 重构 OpenFlow feature workflow，消除固定5个问题+硬编码收敛判断导致的约束收集不足问题
- Honor priority: 易维护（代码整洁优先，消除冗余逻辑和死代码）
## Non-Goals

- Unrelated product areas or workflows
## Behavior Alignment

| Behavior Scenario | Design Response | Risk |
|------------------|-----------------|------|
| AI 动态追问并收集事实 | Tool 返回状态摘要，AI 自主决定追问策略 | Medium |
| AI 判断信息足够后生成设计文档 | Tool 生成 design.md 和 behavior.md，约束从动态 facts 提取 | Medium |
| 代码整洁性验证 | 删除 convergence.ts 和固定 question 逻辑，状态模型极简 | Low |
## Design Constraints

1. **不保留向后兼容**（breaking change）
   - 新 session 格式为 v4，与 v3 不兼容
   - 遇到旧 v3 session 时提示用户"工作流已升级，请重新描述 feature"
   - 无需迁移逻辑，直接丢弃旧状态

2. **代码整洁优先**
   - 删除 `convergence.ts`（硬编码收敛判断逻辑）
   - 删除 `constraint-derivation.ts` 中的固定 key 模板映射
   - 删除 `state-machine.ts` 中的固定 `FeatureQuestionId` 联合类型
   - 删除所有 question 相关字段（`pendingQuestionId`, `askedQuestionIds`, `skippedQuestionIds`, `questionPickerPromptedIds`）
   - 每个文件只保留一个职责，禁止"临时兼容"代码

3. **工具去决策化**
   - Tool 内部不做"够了吗"的判断
   - Tool 只负责三种行为：返回状态摘要、记录事实、生成文档
   - 收敛判断完全由 OpenCode AI 自主决定

4. **事实驱动（key-value）**
   - 所有收集到的信息以 `Record<string, string>` 形式存储（`collectedFacts`）
   - 无固定问题列表，问题完全动态
   - AI 在调用 `collect` action 时显式指定 factKey
   - 相同 key 的 value 覆盖更新（不保留历史版本）

5. **约束推导方式变更**
   - 不再从 `answers.scope`/`answers.priority`/`answers.constraints` 映射模板
   - 约束是 `collectedFacts` 的一部分（AI 在追问时直接收集）
   - `prepareRequirementModel` 时通过 `DesignSynthesizer` 从所有 facts 中提取约束

6. **状态模型极简**
   - `FeatureSession` 只保留：version, feature, sourceIntent, workflowState, collectedFacts, assumptions, pendingConfirmations, generatedDocs, requirementModel, updatedAt
   - 移除所有与 question 管理相关的字段和逻辑

7. **Tool Schema 扩展**
   - 增加 `action: 'status' | 'collect' | 'generate'` 参数，默认 `'status'`
   - `collect` action 接收 `facts: Record<string, string>`
   - `feature` 参数用于标识 feature slug
   - 参数校验：`facts` 仅在 `action='collect'` 时生效，`facts` 中 key 和 value 均不超过 256 字符

8. **Hook 行为变更**
   - `chat-message.ts` 不再自动将用户自然语言消息转发给 feature tool 作为 answer
   - 仅保留 `/openflow-feature` 命令触发和 AI 主动 function calling 两种入口
   - 删除 `isAwaitingFormalAnswer` 相关的 hook 逻辑

9. **状态摘要返回格式**
   - Tool 返回 Markdown 格式的状态摘要，包含：Feature、Status、Collected Facts、Assumptions、Pending Confirmations
   - 不包含"请回答问题X"或"文档已生成"等决策性语句
   - AI 根据摘要内容自主决定下一步

10. **响应内容约束**
    - `action='status'` 或 `'collect'` 时，只返回状态摘要（不生成文档）
    - `action='generate'` 时，返回生成的文档路径列表
    - 不再返回问题提示、选项列表、进度条等旧格式内容

11. **factKey 命名规范（建议性）**
    - 建议 AI 使用英文 snake_case 命名 factKey（如 `rate_limit_strategy`）
    - 不强制校验，允许自由命名
    - `DesignSynthesizer` 应具备处理不同 key 命名的鲁棒性

12. **输入安全约束**
    - `facts` 中 key 和 value 均需经过 XSS/注入过滤
    - `feature` 参数仍需经过 `sanitizeFeatureName` 处理
    - `action` 参数严格校验，只允许 `'status' | 'collect' | 'generate'`
## Success Criteria

- [ ] `convergence.ts` 被完全删除，无残留引用
- [ ] `state-machine.ts` 中移除固定 `FeatureQuestionId` 类型和所有 question 管理字段
- [ ] `FeatureSession` 格式升级为 v4，包含 `collectedFacts: Record<string, string>`
- [ ] tool schema 扩展 `action` 和 `facts` 参数，默认 `action='status'`
- [ ] feature workflow 不再内部判断收敛，只返回状态摘要
- [ ] `constraint-derivation.ts` 不再依赖固定 key 映射模板
- [ ] `chat-message.ts` 不再自动转发用户消息给 feature tool
- [ ] tool 返回的状态摘要包含 Collected Facts / Assumptions / Pending Confirmations
- [ ] tool 不再返回"请回答问题X"或选项列表等旧格式
- [ ] facts 输入经过 XSS/注入过滤
- [ ] 生成的 design.md 中 Design Constraints 不再是 "Not specified"
- [ ] 所有相关测试通过（单元测试 + 集成测试）
- [ ] 代码覆盖率不下降
## Risks And Mitigations

1. **OpenCode AI 行为不一致**
   - 风险：不同对话中 AI 可能问完全不同的问题，同一类 feature 的行为不可预测
   - 缓解：在 system prompt 中明确 feature workflow 的推荐模式（先问核心事实再问约束），但不强制

2. **约束漏收集**
   - 风险：AI 没意识到约束的重要性，直接跳过导致文档约束仍然不足
   - 缓解：在 `DesignSynthesizer` 中增加约束审查步骤，生成文档时自动检查约束充分性

3. **状态兼容性断裂**
   - 风险：v4 不兼容 v3，用户可能丢失进行中的 feature session
   - 缓解：明确提示用户"工作流已升级，请重新描述"，并在文档中说明 breaking change

4. **factKey 命名混乱**
   - 风险：AI 在不同对话中使用不同的 key 命名同一类事实（如 `rate_limit` vs `rateLimit` vs `限流策略`）
   - 缓解：在 system prompt 中建议 AI 使用英文 snake_case 命名 key，但不强制

5. **重构面过大导致引入 regression**
   - 风险：删除 convergence.ts、重构 state-machine.ts 等核心文件可能破坏其他依赖模块
   - 缓解：分阶段重构，先改 schema 和状态机，再改 workflow 逻辑，每阶段运行测试
## Testing Strategy

1. **单元测试**
   - 测试 `FeatureSession` v4 格式序列化/反序列化
   - 测试 `collectedFacts` 的增删改查
   - 测试 tool schema 新参数（action/facts）的解析和校验

2. **集成测试**
   - 端到端测试：模拟 AI 调用 `action='status'` → `action='collect'` → `action='generate'` 完整流程
   - 验证生成文档时 `DesignSynthesizer` 能正确从动态 facts 提取约束

3. **回归测试**
   - 确保其他 OpenFlow 命令（archive、quality-gate、implement）不受 feature workflow 重构影响
   - 确保 session-store.ts 的读写兼容 v4 格式

4. **代码审查**
   - 审查删除的代码是否彻底（无残留 dead code）
   - 审查新代码是否符合单一职责原则

<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:BEGIN -->
## Cross-Validation Summary

- Status: Passed
- Documents checked in order:

- Non-blocking gaps: 0
<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:END -->
