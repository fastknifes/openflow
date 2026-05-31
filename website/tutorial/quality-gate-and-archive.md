---
layout: doc
---

# 质量门与归档

OpenFlow 当前的完成链路是：

![质量门执行原理](/diagrams/quality-gate.svg)

```text
AI 完成代码或 bug fix
  → openflow-quality-gate
  → readiness 允许
  → /openflow-archive <feature>
```

## 质量门做什么？

`openflow-quality-gate` 是 AI-callable Skill。它统一替代旧的 `/openflow-harden` 和 `/openflow-verify` 手动流程。

它会：

1. 构建上下文：feature design、behavior、issue clarification、plan 或 git diff；
2. 判断变更风险；
3. 必要时运行对抗性 harden；
4. 检查验证证据的新鲜度和覆盖范围；
5. 输出 readiness。

## Readiness

| 状态 | 含义 |
|---|---|
| `Ready` | 可以归档。 |
| `ReadyWithDocUpdates` | 可归档，但需要处理文档更新提示。 |
| `NotReady` | 证据或实现仍有 blocker。 |
| `NeedsDecision` | 需要人工决策，不能自动继续。 |

## 归档做什么？

![归档工作原理](/diagrams/archive.svg)

`/openflow-archive <feature>` 会：

- 检查是否有允许归档的 readiness；
- 复制/冻结工作文档到 `docs/archive/`；
- 按需提升 `docs/current/`；
- 生成 `implementation-mapper.md`。

## Issue 如何进入归档？

Issue 不再作为官网主教程的一条独立完成链路。复杂问题调查产生的 `issue-clarification.md`、`issue-resolution.md`、`promotion-candidate.md` 等上下文，会被质量门和归档消费。归档命令的职责已经覆盖 completed feature/issue。

## 不要做的事

- 不要手动推广 `/openflow-harden` 或 `/openflow-verify`。
- 不要为了通过质量门而伪造最小 design/plan 文档。
- 不要在 `NeedsDecision` 时自动归档。
