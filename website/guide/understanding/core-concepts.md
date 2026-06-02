---
layout: doc
---

# 核心概念

## 文档不是备忘录，而是 AI 的行为边界

OpenFlow 的核心理念是：**文档编程就是约束编程**。

在普通项目里，文档经常只是给人看的说明；在 OpenFlow 里，文档会影响 AI 应该如何工作：

- `docs/current/`：当前仍然有效的事实、设计和工作流约定。
- `docs/changes/`：正在进行的 feature/change 工作区，定义本轮变更边界。
- `docs/decisions/`：跨 feature 的正式架构决策。
- `docs/archive/`：已经完成并冻结的历史证据。
- `.sisyphus/`：OpenFlow/OMO 的运行时状态与计划文件。

## 主工作流

```text
brainstorm → feature → writing-plan → implement → quality-gate → archive
```

| 阶段 | 作用 |
|---|---|
| `brainstorm` | 可选，对话式探索，不生成正式文件。 |
| `/openflow-feature` | 形成设计边界和行为约束。 |
| `/openflow-writing-plan` | 从设计生成实施计划，保存后停止。 |
| `/openflow-implement` | 创建 ImplementationRun，并委托给 OMO 或 OpenCode 原生执行。 |
| `openflow-quality-gate` | AI 完成代码后调用，统一 harden 与 verify。 |
| `/openflow-archive` | 归档完成的 feature/issue，生成追溯映射并提升 current 事实。 |

## Issue 的当前位置

历史上 OpenFlow 有独立的 `/openflow-issue` 入口，用于“不确定问题”的调查与分诊。当前用户文档不再把 Issue 作为独立主工作流推广；Issue 产生的澄清、修复和证据会被 `openflow-quality-gate` 与 `/openflow-archive` 消费，归入统一闭环。

换句话说：**Issue 是上下文能力，不是另一条与归档并列的完成链路。**

## 完成的定义

OpenFlow 中的“完成”不是聊天里的口头声明，而是：

1. 实现符合设计和当前事实；
2. 质量门给出允许归档的 readiness；
3. 归档冻结历史并生成 `implementation-mapper.md`；
4. 必要的长期事实被提升到 `docs/current/`。
