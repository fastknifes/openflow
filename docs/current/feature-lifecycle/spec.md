# Feature Lifecycle Specification

## Overview

本文档描述 feature lifecycle 各阶段对用户可见的行为规范。

## Lifecycle Flow

```
brainstorm → feature → writing-plan → implement → quality-gate → archive
```

## 1. Brainstorm 行为

Brainstorm 是 AI 触发的对话式 Skill，不是用户命令。

**触发**：用户消息包含 "brainstorm"、"explore requirements"、"compare approaches" 等关键词，或 AI 判断需要协作探索。

**行为**：
- 一次一个问题，不过度追问
- 提出 2-3 种方案及权衡
- YAGNI 原则，从设计中移除不必要功能
- 探索足够后建议运行 `/openflow-feature`

**边界**：
- 不生成文件，不维护状态
- 不强加硬性门槛或检查清单
- 不替代 `/openflow-feature` 的结构化设计

## 2. Feature 行为

### 入口

`/openflow-feature` 接受三种入口方式：

1. `/openflow-feature`（无参数，从上下文推断）
2. `/openflow-feature <slug>`（显式标识）
3. `/openflow-feature <自然语言描述>`（意图推断）

### 收敛判断

系统不使用固定问卷。文档生成前检查：
- 问题/改进目标是否清晰
- 变更边界是否可理解
- 预期结果是否可理解
- 剩余未知是否可作为假设安全记录

任何一点未满足时，系统问一个关键问题而非生成文档。

### 用户控制行为

| 用户指令 | 系统响应 |
|---------|---------|
| "跳过" / "先按你的判断" | 停止追问该维度，记录为假设 |
| "不看代码层面" | 降低到产品/流程/体验语言层级，作为会话偏好保留 |
| "先生成草稿" | 生成 Draft with Assumptions，分离事实与假设 |
| "我不懂这个" | 简化语言，降低技术抽象 |

### 文档生成

**design.md**：方向清晰时生成完整版；未收敛但用户要求时生成 Draft with Assumptions。

**behavior.md**：存在可观察行为变更时生成。按场景选择结构：
- 命令行为：输入、预期响应、生成结果
- Hook 行为：触发事件、非触发条件、可见副作用
- 工作流行为：用户可见的端到端步骤
- 文档治理行为：创建/更新/跳过/保护哪些文档
- 错误行为：失败信号、用户消息、恢复路径

无外部可观察变更时，`behavior.md` 可省略或简短声明"无外部可观察行为变更"。

### 确认式交互

文档生成完成后：

**交互模式**（`hasAskQuestion=true`）：弹出 Question 工具，三个选项：
- 进入开发计划（默认/推荐）
- 检查约束充分性（Oracle 审查 design.md 和 behavior.md）
- 仅查看文档

**非交互模式**：文本输出列出三个选项，等待用户自然语言回复。

选择记录到 `FeatureSession.postDesignDecision`，不自动执行任何命令。

**不触发条件**：文档生成失败、用户继续已完成 session、仍在问题收集阶段。

### Feature Identity 行为

| 输入场景 | 系统行为 |
|---------|---------|
| 无参数 + 活跃 session | 继续该 session，不报错 |
| 自然语言描述 | 作为意图处理，推导 slug 和 title，不因 sanitize 失败 |
| 无参数 + 多个候选 session | 问一个自然语言消歧问题，不要求输入 slug |
| 过于模糊的输入 | 返回 `lowConfidenceReason`，解释原因并给出具体改进示例 |

## 3. Writing-Plan 行为

`/openflow-writing-plan <feature>` 从设计上下文生成实现计划。

**用户可见行为**：
- 输出双路径保存确认
- OMO 环境下指导两份内容一致的 plan.md
- Enhancer 注入 TDD guidance（bold heading + prose，非 checkbox）
- Enhancer 注入 verification 参考（plain bullet）
- 计划超过预算阈值时输出 Plan Budget Notice
- Task 段落 parser 兼容性不变

**边界**：只保存计划，不自动开始实现。

## 4. Implement 行为

`/openflow-implement <feature>` 创建 ImplementationRun 并委托执行。

- OMO 环境：检测并路由到 `/start-work`
- 无 OMO：OpenCode 原生构建流程
- 可选 git worktree 隔离
- 生命周期状态可追踪：`created → starting_backend → running → quality_gate_pending → ready_for_archive → archived`

## 5. Quality-Gate 行为（接口边界）

`openflow-quality-gate` 是 AI 自动调用的 Skill。详细行为见 `quality-governance/spec.md`。

Feature lifecycle 的接口约定：
- 实现完成后 AI 调用 quality-gate
- Quality-gate 输出 readiness 分类
- 非实现类变更（design-only、planning-only、docs-only）不应触发实现级质量门
- Quality-gate 不为通过检查自动创建缺失的 design/plan 文档

## 6. Archive 行为

`/openflow-archive <feature>` 关闭 feature：
- 冻结工作文档到 `docs/archive/`
- 提升 `docs/current/`
- 生成 `implementation-mapper.md`
- 要求有效的 Ready 或 ReadyWithDocUpdates readiness

## Must Not Behavior

1. 不要求用户手动提供 feature slug 作为正常使用方式
2. 不因自然语言输入 sanitize 失败而拒绝（如 "Feature name is too short after sanitization"）
3. 不因固定问题序列已回答就认为设计收敛
4. 不把假设当作确认事实
5. 不对所有 feature 使用相同 behavior.md 模板
6. 不把 behavior.md 写成实现设计文档
7. 不在确认交互中自动执行后续命令
8. 不在非交互模式调用 Question 工具
9. 不对非实现类变更强制走实现级质量门
10. 不自动创建缺失文档来满足 quality-gate readiness
11. 不修改历史文档（docs/archive/、已完成的 docs/changes/）
