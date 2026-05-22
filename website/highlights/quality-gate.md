---
layout: doc
---

# 质量门与硬化

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

> 本文档正在建设中，更多详细流程和示例将持续补充。
