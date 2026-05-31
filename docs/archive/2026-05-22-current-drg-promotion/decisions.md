# current-drg-promotion - Decisions

**日期**: 2026-05-22
**Feature**: current-drg-promotion
**状态**: Draft

---

本文件记录文档治理重构过程中的关键架构决策及其 rationale。

---

## Decision 1：采用限界上下文（Bounded Context）聚合 `docs/current/`

**决策**：用 DDD 的"限界上下文"思想重新划分 `docs/current/`，取代原有的 `design/`/`spec/`/`requirements/` 平面切分 + `feature-xxx` 子目录。

**选项对比**：
- 选项 A（选中）：限界上下文聚合。`docs/current/feature-lifecycle/`、`docs/current/quality-governance/` 等。
- 选项 B：接受现实，允许 `current/` 下继续按 feature 组织。
- 选项 C：主题域聚合（非严格 DDD），如 `workflow-engine/`、`verification-system/`。

**Rationale**：
- OpenFlow 的领域边界本身非常清晰（FeatureLifecycle、QualityGovernance、DriftGuardian 等），天然适合限界上下文。
- 用户的核心痛点正是"同一个概念（如 drift-guardian）被 design/spec 切散"。限界上下文能解决这个问题。
- 比选项 B 语义清晰，比选项 C 有更严格的边界定义，但又不至于像严格 DDD 那样过度工程化。

**影响**：
- `docs/current/` 的目录结构彻底改变。
- `current-promotion.ts` 的匹配和合成逻辑需要重写。
- 所有涉及 `docs/current/` 路径的代码需要更新。

---

## Decision 2：上下文内部按文档类型拆分

**决策**：每个限界上下文内部保持 `design.md` + `spec.md` + `requirements.md` 三文件结构。

**选项对比**：
- 选项 A（选中）：按文档类型拆分。
- 选项 B：单文件内聚（`facts.md`）。
- 选项 C：按主题/子能力拆分（`contract-markers.md`、`checkpoints.md`）。

**Rationale**：
- 与现有 ADR-001 的设计习惯对齐，迁移成本最低。
- AI 和用户都熟悉 `design.md` / `spec.md` / `requirements.md` 的语义，无需重新学习。
- 对于大上下文（如 `feature-lifecycle`），三文件结构能自然控制单个文件规模。

**影响**：
- 小上下文可能出现"三文件各只有几行"的情况，允许单文件例外（见 Decision 4）。
- 同一个变更可能需要同时修改 `design.md` 和 `spec.md`（跨文件同步成本）。

---

## Decision 3：`behavior.md` 合并到 `spec.md`

**决策**：`docs/current/` 下取消独立的 `behavior.md`，其内容合并到各上下文的 `spec.md` 中。

**选项对比**：
- 选项 A（选中）：合并到 `spec.md`，取消独立文件。
- 选项 B：保留独立的 `behavior.md`，但按上下文聚合。
- 选项 C：只在 `changes/` 保留 behavior，`current/` 不保留行为文档。

**Rationale**：
- `behavior.md` 本质就是"行为规格"，与 `spec.md` 语义高度重叠。
- 现有 `current/spec/{feature}/behavior.md` 内容通常很短（如 workflow 的 behavior.md 仅 12 行），不值得独立成文件。
- 减少文件类型意味着减少"改一个地方要同步几个文件"的认知负担。

**影响**：
- `spec.md` 需要增加 `## Behavior Scenarios` 和 `## Constraints` 章节来承接 behavior 内容。
- `docs/changes/` 和 `docs/archive/` 的 `behavior.md` 保持不变（变更过程和归档追溯仍然需要）。

---

## Decision 4：小上下文允许单文件例外

**决策**：内容极少（预计 < 50 行）的上下文允许合并为单文件 `facts.md`，但需显式说明。

**Rationale**：
- 避免过度工程化。`ai-self-governance` 等小规模上下文如果强制拆三文件，每个文件可能只有 3-5 行，反而增加阅读成本。
- 例外规则需要显式标记（如 `.context-meta.json`），防止随意滥用。

---

## Decision 5：`docs/changes/` 保持现状

**决策**：feature 工作区的文件结构（`design.md`、`behavior.md`、`plan.md` 等）完全不变。

**Rationale**：
- `changes/` 的职责是"变更过程"，与 `current/` 的"当前事实"本来就是不同语义层。
- 修改 `changes/` 会波及 feature skill、writing-plan、implement 等多个流程，风险远大于收益。
- 保持 `changes/` 不变能让团队更快聚焦于 `current/` 的重构。

**影响**：
- `changes/` 和 `current/` 的文档类型命名不完全一致（`changes/` 有 `behavior.md`，`current/` 没有）。
- archive 流程从 `changes/` 提取内容到 `current/` 时，需要做"behavior → spec 章节"的转换。

---

## Decision 6：Archive 决策 + DRG 异步执行（方案 A）

**决策**：archive 仍然决策"是否 promotion"及"promotion 什么内容"，但把文件操作委托给 DRG 异步任务执行。

**选项对比**：
- 选项 A（选中）：archive 决策 + DRG 异步执行。
- 选项 B：多时机触发（design 完成、quality-gate 通过时也可提交 current-update 任务）。
- 选项 C：保持现状（同步执行）。

**Rationale**：
- 不改 archive 的 authority 边界，风险最小。
- DRG 的资源锁恰好能解决"两个 feature 同时 archive 并发写 current"的问题。
- DRG 的重试机制能解决 promotion 失败后的恢复问题。
- 选项 B 会让 current 的更新时机变得复杂，可能引入"部分更新"的一致性问题。

**影响**：
- archive 命令不再阻塞等待 promotion 完成，用户体验改善。
- 用户需要通过 DRG taskId 查询 promotion 状态，增加了新的交互路径。
- 如果 DRG 任务失败，current 可能处于"待更新"状态，需要监控和告警。

---

## Decision 7：DRG 未启动时支持同步回退

**决策**：如果 DRG 调度器未启动，archive 可配置回退到同步执行。

**Rationale**：
- DRG 是新增基础设施，可能存在启动失败或配置遗漏的情况。
- 回退开关保证 archive 流程的可用性不因 DRG 故障而中断。
- 回退行为需要显式注明在输出中，避免用户误以为 promotion 已异步完成。

---

## Decision 8：分三阶段实施

**决策**：实施分为三个阶段：结构迁移 → promotion 逻辑重写 → DRG 集成。

**阶段划分**：
1. **阶段 1（结构迁移）**：只动 `docs/current/` 目录，不涉及代码改动。
2. **阶段 2（promotion 重写）**：重写 `current-promotion.ts`，archive 仍同步执行。
3. **阶段 3（DRG 集成）**：接入 DRG 实例化、注册 executor、archive 改异步。

**Rationale**：
- 每个阶段独立可验证，降低风险。
- 阶段 1 和阶段 2 不依赖 DRG，可以立即开始。
- 阶段 3 依赖 DRG 的实例化接入，可作为独立任务并行或延后。

---

## 决策影响矩阵

| 决策 | 影响文件/模块 | 风险等级 |
|---|---|---|
| Decision 1（限界上下文） | `docs/current/` 全部、所有读取 current 的代码 | 中 |
| Decision 2（文档类型拆分） | 每个上下文的内部文件 | 低 |
| Decision 3（behavior 合并） | `spec.md` 模板、archive promotion 逻辑 | 低 |
| Decision 4（单文件例外） | 小上下文的文件布局 | 低 |
| Decision 5（changes 不变） | 无（明确不改动） | 无 |
| Decision 6（DRG 异步） | `src/commands/archive.ts`、`src/phases/archive/current-promotion.ts`、DRG 接入点 | 高 |
| Decision 7（同步回退） | `src/commands/archive.ts` | 低 |
| Decision 8（三阶段） | 项目计划、验收节奏 | 低 |
