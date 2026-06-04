---
layout: doc
---

# 使用指南

本节帮你按顺序完成一次完整的 OpenFlow 工作流。三个阶段首尾衔接，每个阶段页会说明要做什么、怎么操作、必须检查什么，以及遇到常见情况时如何处理。

```mermaid
flowchart LR
  A[阶段一：需求探索与确认] --> B[阶段二：开发计划与实现]
  B --> C[阶段三：验证与归档]
  C --> D[更新当前事实]

  class A,B,C main
  class D success

  classDef main fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#01579b
  classDef success fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#2e7d32
```

### 阶段一：需求探索与确认

把模糊想法收敛为可验证的设计契约。这一阶段覆盖头脑风暴和正式需求设计，输出 `design.md` 和 `behavior.md`。

### 阶段二：开发计划与实现

把设计拆成可执行的任务序列，然后在约束边界内完成代码变更，进入质量门验证。

### 阶段三：验证与归档

质量门确认完成状态后，把成果归档为冻结历史，并提升必要的长期事实到 `docs/current/`。

---

左侧导航还提供了**亮点机制**（TDD、BDD、漂移检测等）、**进阶功能**（迁移已有文档）和**命令参考**，按需查阅即可。

## 下一步

从 [阶段一：需求探索与确认](./tutorial-phase1) 开始，先让 AI 帮你把想法变成可检查的设计与行为文档。
