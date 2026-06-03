---
layout: doc
---

# 阶段二：开发计划与实现

## 这一阶段做什么

阶段二覆盖 Writing Plan 与 Implement 两个节点。开发计划负责把阶段一的设计契约转化为可执行任务树，明确执行波次、依赖关系、验证命令和约束传递。

实现阶段会在隔离环境中把计划落地为代码。核心原则是：计划中的每一行都必须能直接执行；如果任务无法执行、无法验证或约束不清，就应先修正计划，而不是直接写代码。

## 操作步骤

```mermaid
flowchart TD
  A[/openflow-writing-plan feature] --> B[读取 design.md 与 behavior.md]
  B --> C[生成 plan.md]
  C --> D[用户检查执行波次与依赖]
  D --> E{计划是否可执行}
  E -- 否 --> C
  E -- 是 --> F[/openflow-implement feature]
  F --> G[按计划实现代码]
  G --> H[AI 自动调用 quality-gate]

  class A,B,C,D,F,G,H main
  class E optional

  classDef main fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#01579b
  classDef optional fill:#f5f5f5,stroke:#9e9e9e,stroke-width:2px,color:#9e9e9e,stroke-dasharray: 5 5
  classDef success fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#2e7d32
```

1. **生成开发计划**：运行 `/openflow-writing-plan <feature>`。
2. **查看计划文档**：打开生成的 `plan.md`，确认任务结构和验证方式。
3. **执行实现**：确认计划后运行 `/openflow-implement <feature>`。
4. **进入质量门**：实现完成后，AI 会自动调用 `openflow-quality-gate`。

## ⚠️ 必须检查的文档

- **`plan.md`**：查看执行波次和依赖矩阵，确认任务拆分合理，前置任务不会缺失。
- 检查约束传递：`design.md` 中的 must 约束是否已经跟随到对应任务。
- 检查验证命令：每个任务是否有具体、可运行、可复现的验证命令。
- **不要跳过检查直接执行**——计划是代码变更的蓝图，不检查就执行等于放弃约束。

## 常见场景

- **OMO 环境**：Writing Plan 会自动路由到 Prometheus。
- **非 OMO 环境**：会路由到 OpenCode 原生 build 代理。
- **工作树隔离**：可选在独立 Git Worktree 中执行，降低实现过程对主工作区的干扰。

下一步：[阶段三：验证与归档](./tutorial-phase3)。
