---
layout: doc
---

# 使用指南

这里是 OpenFlow 的实践入口，帮助你按「需求探索 → 计划实现 → 验证归档」完成一次可追溯的工程变更。每个阶段页都说明要做什么、怎么操作、必须检查哪些文档，以及遇到常见情况时如何处理。

```mermaid
flowchart LR
  A[阶段一：需求探索与确认] --> B[阶段二：开发计划与实现]
  B --> C[阶段三：验证与归档]
  C --> D[更新当前事实]

  class A,B,C main
  class D success

  classDef main fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#01579b
  classDef optional fill:#f5f5f5,stroke:#9e9e9e,stroke-width:2px,color:#9e9e9e,stroke-dasharray: 5 5
  classDef success fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#2e7d32
```

## 教学流程 3 阶段

- [阶段一：需求探索与确认](./tutorial-phase1)：把模糊想法收敛为可验证的设计契约。
- [阶段二：开发计划与实现](./tutorial-phase2)：把设计拆成可执行任务，并在实现后进入质量门。
- [阶段三：验证与归档](./tutorial-phase3)：用质量门确认完成状态，再把成果归档并提升为当前事实。

## 其他内容

### 亮点机制

OpenFlow 的差异化能力包括：对话式头脑风暴、正式设计契约、行为驱动描述、约束扫描、任务树计划、实现环境路由、质量门判定、归档追溯映射。

### 参考

- [命令速查](/使用指南/reference/commands)
- [配置项](/使用指南/reference/config-options)
- [核心概念](/介绍/concepts)

### 迁移已有文档

已有需求、设计或实现记录可以迁移到 `docs/current/`、`docs/decisions/` 或对应 `docs/changes/` 工作区中。迁移后，后续 Feature 阶段会把这些内容作为既有约束扫描。

## 下一步

从 [阶段一：需求探索与确认](./tutorial-phase1) 开始，先让 AI 帮你把想法变成可检查的 `design.md` 与 `behavior.md`。
