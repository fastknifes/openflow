# Verify Redesign - Decisions

**Date**: 2026-04-21
**Feature**: verify-redesign
**Status**: Confirmed for this feature

---

## 1. 背景

在本轮 verify 重设计讨论中，核心分歧不在于“是否增加更多命令”，而在于：

- `verify`、`acceptance`、`archive` 的边界如何切分；
- `Verify` 是否应该拥有最终 acceptance / current promotion 的语义；
- `Archive` 是否应被保留为最终 authority。

本文件只记录已经拍板的设计取舍，不重复完整设计说明。完整背景与状态模型见：

- `docs/changes/verify-redesign/design/20260421-design.md`

---

## 2. 已确认决策

### 决策 1：对用户只保留一个 `Verify` 入口

**结论**：确认采用单一 `Verify` 入口，不再保留多个并列“校验命令”来分担相似职责。

**理由**：

- 多个并列校验入口会继续制造语义重叠；
- 用户需要的是一个统一 closure 检查入口，而不是命令间自行推断边界；
- 单入口更符合“完成前主闸门”的产品心智。

**结果**：

- `Verify` 成为统一检查入口；
- 但其内部仍保留不同阶段的语义区分。

---

### 决策 2：`Verify` 内部采用两阶段模型

**结论**：`Verify` 内部分为两个阶段：

1. `Evidence`
2. `Readiness`

**理由**：

- “事实生产”与“准备度判断”不是同一类动作；
- 如果不显式拆分，scope 对比、文档对齐、风险判断等职责会再次混在一个模糊的“校验”语义里；
- 两阶段模型能保留单入口体验，同时避免内部概念混乱。

**结果**：

- `Evidence` 负责产生事实与 delta；
- `Readiness` 负责判断是否具备进入 closure 的条件。

---

### 决策 3：放弃在 `Verify` 中使用 `Acceptance` 命名

**结论**：`Verify` 第二阶段不再使用 `Acceptance`，改名为 `Readiness`。

**理由**：

- 如果 `Archive` 才是最终 authority，那么 `Verify` 内部使用 `Acceptance` 会造成语义冲突；
- “Acceptance” 容易被理解为 final acceptance，而本设计中 `Verify` 只负责 readiness assessment；
- `Readiness` 能更准确表达“已准备好进入 closure，但尚未 canonicalized”。

**结果**：

- `Verify` 输出的是 readiness，而不是 acceptance truth；
- final acceptance 的权威语义保留给 `Archive`。

---

### 决策 4：`Verify` 不拥有 canonicalization authority

**结论**：`Verify` 不负责：

- `current` promotion
- archive freeze
- canonical status 授予

**理由**：

- 本轮确认采用 governance-first 模型，而不是最短状态机模型；
- `Verify` 若拥有 current promotion 语义，将失去“纯验证 / readiness assessment”边界；
- closure 的最终 authority 应集中在 `Archive`，避免真相发布权分散。

**结果**：

- `Verify` 负责 readiness；
- `Archive` 负责 canonicalization。

---

### 决策 5：`Archive` 是最终 authority

**结论**：确认 `Archive` 是 closure 流程中的最终 authority。

**`Archive` 负责：**

- 读取 `Verify` 结果
- 作为最终 canonicalization 节点拍板
- 执行 `current` promotion
- 冻结 `archive/{feature}`
- 生成 implementation mapper / provenance

**理由**：

- 本轮设计有意保留一个明确的“最终发布”节点；
- readiness 与 canonicalization 必须区分；
- 若没有独立 authority 节点，`Verify` 会被迫承担过重语义。

**结果**：

- closure 的最终法律效力集中在 `Archive`；
- `Verify` 与 `Archive` 形成清晰分工。

---

### 决策 6：`Verify` 的对齐基准以 `changes/{feature}` 为主

**结论**：归档前，`Verify` 的主对齐源为 `changes/{feature}`；`current/*` 与 `decisions/*` 只作为稳定约束检查源。

**理由**：

- 本轮 change 的 working truth 应存在于 `changes/{feature}`；
- `current/*` 代表已接受事实，不应与本轮 change 的 intent 争夺主语义；
- `decisions/*` 是跨 feature 规则，应作为冲突检查依据，而不是本轮需求主入口。

**结果**：

- `Verify` 主要判断实现是否符合本轮 intent；
- 同时判断是否违反稳定规则。

---

### 决策 7：`Readiness` 输出四态

**结论**：确认使用以下四个 readiness 状态：

- `ready`
- `ready_with_doc_updates`
- `not_ready`
- `needs_decision`

**理由**：

- 需要区分“可直接 closure”与“可 closure 但要先补文档”；
- 需要将“普通未就绪”与“必须升级为显式裁决”的情况分开；
- readiness 语义要求状态命名避免使用 `accepted/rejected` 一类 final authority 词汇。

**结果**：

- `Verify` 的所有结果都保持 readiness 语义；
- `Archive` 才承担 final authority 语义。

---

### 决策 8：`needs_decision` 采用严格定义

**结论**：`needs_decision` 只用于以下情况：

- 涉及 rule 级变化；
- 涉及 `current` 级冲突；
- 涉及需要显式业务裁决的事项。

**理由**：

- 如果定义过宽，会把普通工程问题错误升级成治理问题；
- readiness 模型要求决策升级保持稀缺与明确；
- 普通 bug、普通证据缺失、普通不确定性应继续留在 `not_ready`。

**结果**：

- `needs_decision` 成为严格保留状态；
- 工作流不会因为轻微模糊而频繁触发治理对话。

---

### 决策 9：Archive 的准入条件

**结论**：只有以下两类状态可进入 `Archive`：

- `ready`
- `ready_with_doc_updates`

以下状态不得进入 `Archive`：

- `not_ready`
- `needs_decision`

**理由**：

- `Archive` 是 canonicalization 节点，不应承接明显尚未 closure 的状态；
- `needs_decision` 必须先解决显式裁决问题，否则 authority 语义会被污染；
- `ready_with_doc_updates` 可被允许进入 Archive，是因为该状态已经具备核心 closure 条件，只差明确文档处理。

**结果**：

- `Archive` 入口保持清晰；
- closure authority 不会被迫处理普通未完成状态。

---

### 决策 10：`ready_with_doc_updates` 采用半自动确认流

**结论**：当 `Verify` 结果为 `ready_with_doc_updates` 时，`Archive` 先展示拟更新文档与内容范围，经用户确认后再执行文档更新、promotion 与 freeze。

**理由**：

- `Archive` 作为最终 authority，可以承担 closure 前的文档收束；
- 但文档更新不应黑箱执行；
- 半自动确认流在 authority 与可见性之间取得平衡。

**结果**：

- `Archive` 保持拍板地位；
- 用户仍能看见并确认 closure 前的正式更新动作。

---

## 3. 本轮总纲

本轮 verify 重设计最终采用以下总纲：

> **Verify establishes readiness; Archive makes the change canonical.**

展开后即：

- `Verify` 生产 evidence，并给出 readiness assessment；
- `Archive` 执行 canonicalization、current promotion 与历史冻结。

---

## 4. 后续含义

本文件中的决策仅对 `verify-redesign` feature 当前设计成立。

如果后续这些规则被确认提升为跨 feature 的长期 workflow 规则，则应进一步进入：

- `docs/decisions/ADR-*.md`
- 或 `docs/current/workflow/`

在此之前，它们仍属于当前 feature 的已确认设计取舍，而非全局正式决策。
