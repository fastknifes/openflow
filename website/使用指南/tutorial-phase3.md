---
layout: doc
---

# 阶段三：验证与归档

## 这一阶段做什么

阶段三覆盖 Quality Gate 与 Archive 两个节点。质量门是 AI 自动调用的内部验证机制，用明确检查替代“看起来没问题”的主观判断，并给出 Ready、ReadyWithDocUpdates、NotReady 或 NeedsDecision 等就绪分类。

归档会把验证通过的工作冻结为历史记录，同时把仍然有效的事实提升到当前文档中。“完成”在这里是明确的工程状态：代码、文档、验证和追溯都达到可检查标准，而不是一句口头声明。

## 操作步骤

```mermaid
flowchart TD
  A[实现完成] --> B[AI 自动调用 openflow-quality-gate]
  B --> C{就绪分类}
  C -- NotReady --> D[处理阻塞项后重新验证]
  C -- NeedsDecision --> E[人工决策]
  C -- ReadyWithDocUpdates --> F[确认文档更新]
  C -- Ready --> G[/openflow-archive feature]
  F --> G
  D --> B
  E --> B
  G --> H[冻结 docs/archive/YYYY-MM-DD-feature/]
  G --> I[更新 docs/current/]
  G --> J[生成或更新 implementation-mapper.md]

  class A,B,F,G,H,I,J main
  class C,D,E optional

  classDef main fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#01579b
  classDef optional fill:#f5f5f5,stroke:#9e9e9e,stroke-width:2px,color:#9e9e9e,stroke-dasharray: 5 5
  classDef success fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#2e7d32
```

1. **自动进入质量门**：AI 实现完成后会调用 `openflow-quality-gate`。
2. **查看就绪分类**：根据 Ready、ReadyWithDocUpdates、NotReady、NeedsDecision 判断下一步。
3. **执行归档**：达到 Ready 后运行 `/openflow-archive <feature>`。
4. **确认归档内容**：检查冻结内容、当前文档提升和需求到代码的映射。

## ⚠️ 必须检查的文档

- **质量报告**：如果返回 NotReady，查看阻塞项并处理，修复后重新运行质量门。
- **归档目录 `docs/archive/YYYY-MM-DD-feature/`**：确认冻结内容正确，能够代表本次变更的最终状态。
- **`implementation-mapper.md`**：检查需求到代码的追溯映射是否完整。
- **`docs/current/` 更新**：确认仍然有效的事实已被正确提升，后续 Feature 能扫描到这些内容。

## 常见场景

- **NotReady**：先处理质量报告中的阻塞项，完成后重新触发 quality-gate。
- **NeedsDecision**：需要人工给出明确决策，不能由 AI 擅自跳过。
- **归档后**：`docs/current/` 中的事实已经更新，下次 Feature 会把它们作为现有约束扫描。

返回：[使用指南概览](./)。
