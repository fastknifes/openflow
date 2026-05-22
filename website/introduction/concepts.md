---
layout: doc
---

# 核心概念

本文档介绍 OpenFlow 的核心概念模型，帮助你理解它如何组织文档、约束 AI 行为、以及管理工作流。

## 行为文档约束

行为文档约束（Behavioral Documentation Constraint）是 OpenFlow 的核心理念：**文档不仅仅是给人看的，它同时约束 AI 的行为**。

具体来说：

- `docs/current/*` 中的事实、设计和规范，AI 在执行时必须遵守
- `docs/changes/*` 中的变更设计，定义了变更的边界——AI 不能超出这个边界去做额外修改
- `docs/decisions/*` 中的架构决策，作为 AI 做技术选择的约束条件

这意味着文档不是"写完就束之高阁"的，而是持续生效的**行为契约**。

## 目录划分

OpenFlow 使用结构化的目录体系来组织项目知识：

| 目录 | 用途 | 生命周期 |
|------|------|----------|
| `docs/current/` | 当前仍有效的事实、设计、规范 | 持续维护 |
| `docs/decisions/` | 跨特性的架构决策及 rationale | 长期稳定 |
| `docs/changes/` | 进行中的特性/变更工作区 | 特性归档后移入 archive |
| `docs/archive/` | 冻结的历史上下文和正式记录 | 只读 |
| `.sisyphus/` | 内部状态（计划、构建、验收） | 工作文件，不纳入版本控制 |

## 工作流模式

### Mode 1: Feature 工作流

适用于**边界清晰**的变更：

```
brainstorm → feature → writing-plan → implement → quality-gate → archive
```

关键节点：
- **feature**：生成设计提案和约束
- **writing-plan**：从设计生成结构化实施计划
- **implement**：边界清晰后才开始执行
- **quality-gate**：AI 自动调用质量门，验证证据和就绪状态
- **archive**：冻结历史，更新 current，生成追溯映射

### Mode 2: Issue 工作流

适用于**边界模糊**的问题：

```
issue → investigate → classify → decide → next step
```

核心原则：
- 不假设问题类型——Issue 报告不自动等于 Bugfix
- 调查阶段只读——Agent 可以检查，但不能修改
- 语义先于修复——先确定系统应该做什么，再决定怎么改
- 分类先于实施——确认问题类别后才开始写代码

## 合约标记与漂移检测

在特性设计阶段，`design.md` 和 `behavior.md` 会生成**合约标记**——关于代码必须满足什么的显式断言。这些标记在实施计划的里程碑节点上被检查，用于检测代码与设计之间的漂移。

漂移检测是**基于检查点**的，不是持续监控——只在自然的里程碑处运行，不会阻塞 AI 执行。

## 下一步

- [工程哲学](./philosophy) —— 了解这些设计决策背后的 rationale
- [快速开始](/getting-started/quickstart) —— 动手实践
