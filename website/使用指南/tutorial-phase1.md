---
layout: doc
---

# 阶段一：需求探索与确认

## 这一阶段做什么

阶段一覆盖 Brainstorm 与 Feature 两个节点。头脑风暴是纯对话式探索，用来拆解想法、发现边界和澄清目标；它不生成正式文档，也不要求你一开始就提供完整需求。

当想法足够清晰后，Feature 会成为第一个产生正式文档的阶段，输出 `design.md` 与 `behavior.md`。这一阶段的核心目的，是把模糊意图收敛为可验证的设计契约，让后续计划和实现有明确依据。

## 操作步骤

```mermaid
flowchart TD
  A[自然语言提出 brainstorm] --> B[对话式探索]
  B --> C{想法是否足够清晰}
  C -- 否 --> B
  C -- 是 --> D[/openflow-feature 描述]
  D --> E[AI 每次只问一个问题收集事实]
  E --> F[扫描 docs/current/ 与 docs/decisions/]
  F --> G[生成 design.md]
  F --> H[生成 behavior.md]
  G --> I[用户检查设计契约]
  H --> I

  class A,B,D,E,F,G,H,I main
  class C optional

  classDef main fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#01579b
  classDef optional fill:#f5f5f5,stroke:#9e9e9e,stroke-width:2px,color:#9e9e9e,stroke-dasharray: 5 5
  classDef success fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#2e7d32
```

1. **头脑风暴**：直接用自然语言告诉 AI 你要 brainstorm，或调用 `openflow-brainstorm`。
2. **过渡到 Feature**：当方向确定后运行 `/openflow-feature <描述>`。
3. **收集事实**：AI 会逐步提问，并保持每次只问一个问题。
4. **扫描现有约束**：AI 会检查 `docs/current/` 与 `docs/decisions/` 中的当前事实和全局决策。
5. **生成文档**：确认后生成 `design.md` 与 `behavior.md`。

## ⚠️ 必须检查的文档

- **`behavior.md`**：逐条确认 Given/When/Then 行为描述是否符合你的预期。
- **`design.md`**：重点查看 Goals、Non-Goals、Design Constraints 是否准确表达目标、排除项和约束。
- 如果 `behavior.md` 中出现函数名、变量名、类名、文件路径等实现细节，要求 AI 重写；行为文档只应描述用户可观察的结果。
- 复杂需求建议让 AI review `design.md` 与 `behavior.md` 的约束充分性，确认没有遗漏关键边界。

## 常见场景

- **想法太大**：AI 会帮助拆分范围，把一次变更控制在可验证的边界内。
- **需求不明确**：通过多轮对话继续澄清，不必急着进入正式 Feature。
- **已有约束**：AI 会自动扫描 `docs/current/` 和 `docs/decisions/`，把当前事实与全局决策纳入设计。

下一步：[阶段二：开发计划与实现](./tutorial-phase2)。
