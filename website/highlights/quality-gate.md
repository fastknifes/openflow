---
layout: doc
---

# 页面已迁移

<<<<<<< Updated upstream
本文档介绍 OpenFlow 的质量治理机制，包括质量门（Quality Gate）和对抗性硬化（Harden）。

## 概述

OpenFlow 的质量治理不是最后一步的检查，而是贯穿实施全过程的约束：

1. **前置约束**：TDD 计划增强默认启用，将测试和验证要求注入实施计划
2. **AI 驱动的质量门**：实施完成后，AI 自动调用 `openflow-quality-gate`，根据变更复杂度决定是否需要对抗性硬化
3. **最终门禁**：就绪分类（`Ready`、`ReadyWithDocUpdates`、`NotReady`、`NeedsDecision`）决定变更是否可以进入归档

## 质量门流程

```
实施完成 → openflow-quality-gate 自动触发
         → 评估变更复杂度
         → 高风险？→ 执行对抗性硬化（Harden）
         → 收集证据（verify）
         → 输出就绪分类
```

## 对抗性硬化（Harden）

当质量门判定变更具有较高风险时，会触发对抗性硬化流程：

- 从攻击者视角审查代码变更
- 检查边界条件、错误处理、安全风险
- 生成硬化建议和修复项

## 就绪分类

| 分类 | 含义 |
|------|------|
| `Ready` | 变更已完成，可以归档 |
| `ReadyWithDocUpdates` | 需要补充文档后可归档 |
| `NotReady` | 存在未解决的问题 |
| `NeedsDecision` | 需要人工决策 |

## 硬化分类体系

硬化发现使用新的分类体系，区分可自动修复的缺陷和需要人工判断的模糊发现：

| 分类级别 | 类别 | 处理方式 | 就绪影响 |
|----------|------|----------|----------|
| `behavior_violation` | 可操作 | 自动修复 | 阻塞至解决 |
| `intent_gap` | 模糊 | 根据置信度和对齐情况决定 | 需人工决策 / 文档更新 / 阻塞 |
| `contract_divergence` | 模糊 | 需人工决策 | 需人工决策 |
| `regression_risk` | 可操作 / 非阻塞 | 有证据时自动修复 | 阻塞或降级 |
| `missing_evidence` | 模糊 | 需人工决策 | 需人工决策 |

旧版分类级别（`blocking_bug`、`spec_violation`、`test_gap`、`design_ambiguity`、`style_or_preference`）仍然接受作为审阅者输入，在分类时自动映射到新体系。无证据的发现会降级为 `missing_evidence`。

## 归档就绪确认

质量门输出 `ready_for_archive` 状态后，归档不会自动执行。验收状态跟踪 `archiveRunConfirmationStatus`：

| 状态 | 含义 |
|------|------|
| `awaiting` | 质量门已声明就绪，但尚未获得用户确认 |
| `confirmed` | 用户已明确确认归档 |

归档需要单独的归档命令和用户确认。质量门只输出就绪状态，不触发归档操作。

## 行为证据验证

验证阶段检查每个行为场景的证据新鲜度。每个场景维护一个证据新鲜度记录，包含 `timestamp`（记录时间）、`gitHead`（关联提交）和 `scenarioId`（场景标识）。

| 新鲜度 | 条件 |
|--------|------|
| `fresh` | `gitHead` 匹配当前 HEAD，且工作区在记录后无更新 |
| `stale` | `gitHead` 不匹配，或工作区在记录后被修改，或 diff 哈希不一致 |
| `unknown` | 缺少 `timestamp` 和 `gitHead`，或当前 HEAD 不可用 |

关键场景的新鲜度为 `stale` 或 `unknown` 时，阻塞就绪判定。

> 本文档正在建设中，更多详细流程和示例将持续补充。
