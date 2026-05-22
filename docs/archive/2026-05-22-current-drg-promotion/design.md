# 文档治理重构：按限界上下文聚合 current 目录与 DRG 异步 promotion

**日期**: 2026-05-22
**Feature**: current-drg-promotion
**状态**: Draft

---

## Human Consensus Summary

Feature title: 文档治理重构：按限界上下文聚合 current 目录与 DRG 异步 promotion
Internal slug: current-drg-promotion
Source intent: 解决 `docs/current/` 下按 feature 子目录组织导致的语义混乱与维护困难，引入 DDD 限界上下文思想重新聚合文档；同时将 archive 时的 current promotion 从同步阻塞执行改为 DRG 任务调度器异步驱动。
Problem or improvement target: `docs/current/design/feature-xxx/` 与 `docs/current/spec/feature-xxx/` 的结构导致同一概念分散多处，查找和更新成本高；current promotion 在 archive 命令中同步执行，阻塞时间长且无法重试。
Expected result: `docs/current/` 按限界上下文组织，语义清晰；current promotion 成为可观测、可重试、受资源锁保护的 DRG 后台任务。

---

## Identity And Assumptions

- Feature slug: current-drg-promotion
- Feature title: 文档治理重构：按限界上下文聚合 current 目录与 DRG 异步 promotion
- Source intent: 解决 current 目录的结构混乱，并引入 DRG 异步任务调度改善 archive 时的 current promotion 体验。
- Assumptions:
  - DRG 核心调度器（`src/orchestrator/`）已实现，但尚未实例化接入主流程。
  - `docs/changes/` 和 `docs/archive/` 的结构保持不变，仅重构 `docs/current/`。
  - 现有 `current-promotion.ts` 的逻辑基于旧结构，需要完全重写。
  - 团队认可 DDD 限界上下文作为文档组织的思考框架。
- Pending confirmations:
  - `ai-self-governance` 是否作为独立上下文，还是合并到 `workflow-conventions`。
  - `spec.md` 内部章节结构是否需要强制模板。

---

## Overview

Feature: current-drg-promotion

In scope:
- `docs/current/` 目录结构的重构（限界上下文聚合）
- `current-promotion.ts` 的重写（新聚合逻辑 + DRG executor）
- DRG 调度器的实例化与启动接入
- `behavior.md` 到 `spec.md` 的合并策略
- 现有 `current/` 散落文档的迁移映射

Out of scope:
- 修改 `docs/changes/` 的 feature 工作区结构
- 修改 `docs/archive/` 的归档结构
- DRG 调度器本身的实现（假设已完成）
- 修改 archive 的 authority 边界（archive 仍然决策是否 promotion）

---

## Problem

### 问题 1：`docs/current/` 结构混乱

当前 `docs/current/` 按文档类型（`design/`、`spec/`、`requirements/`、`workflow/`）平面切分，每个类型下又按 feature 创建子目录：

```text
docs/current/design/feature-4e04eb6b/
docs/current/design/feature-convergence-guardrails/
docs/current/spec/feature-4e04eb6b/
docs/current/spec/feature-convergence-guardrails/
```

这导致：
- 同一 feature 同时出现在 `design/`、`spec/`、`requirements/` 中，查找时需要跨目录跳转。
- `current/` 的语义被侵蚀：它应该回答"系统现在是什么样"，但实际上变成了"各 feature 的快照堆"。
- 和 `docs/changes/` 的边界模糊：两者都是按 feature 组织。

### 问题 2：`behavior.md` 的重复与分散

`behavior.md` 在三个层级独立存在：
- `docs/changes/{feature}/behavior.md` — feature 工作区的行为契约
- `docs/current/spec/{feature}/behavior.md` — 当前系统的稳定行为快照
- `docs/archive/{feature}/behavior.md` — 归档快照

`current/` 下的 `behavior.md` 内容通常很简短（如 workflow 的 behavior.md 仅 12 行），却占据独立文件，增加了维护成本。

### 问题 3：current promotion 同步阻塞

`src/commands/archive.ts` 中：

```typescript
const promotionResult = autoPromoteCurrent
  ? await applyPromotionSuggestions({ projectDir: ctx.directory, suggestions: promotionSuggestions })
  : { applied: [], skipped: promotionSuggestions }
```

`applyPromotionSuggestions` 直接执行文件复制、合成、写入，是同步阻塞调用。当 promotion 涉及大量文件时，archive 命令会长时间卡住，且失败时无法重试。

### 问题 4：`current-promotion.ts` 基于旧结构

`PROMOTION_AREAS` 配置指向 `docs/current/design`、`docs/current/spec` 等旧结构，并按 feature 名在底层创建子目录（`docs/current/design/{feature}/design.md`）。这与新的限界上下文聚合方向矛盾。

---

## Goals

- 让 `docs/current/` 的语义清晰化：按**限界上下文**组织，回答"系统现在是什么样"。
- 消除同一概念在 `current/` 中的重复出现（一个概念只在一个上下文中是权威的）。
- 将 `behavior.md` 合并到 `spec.md`，减少独立文件类型。
- 让 current promotion 成为可观测、可重试、受资源锁保护的 DRG 后台任务。
- 保持 `docs/changes/` 和 `docs/archive/` 的结构不变（向后兼容）。

## Non-Goals

- 不修改 `docs/changes/` 的 feature 工作区文件布局。
- 不修改 `docs/archive/` 的归档产物结构。
- 不引入严格的 DDD 战术模式（聚合根、实体、值对象）。
- 不将 archive 的决策权移交给 DRG（archive 仍然是 authority，只委托执行）。
- 不要求立即迁移历史归档内容。

---

## Design

### 1. 限界上下文列表

基于 OpenFlow 现有的核心能力，划分以下限界上下文：

| 上下文目录 | 职责范围 | 规模评估 |
|---|---|---|
| `docs/current/feature-lifecycle/` | Feature 从 brainstorm → archive 的完整生命周期、状态流转、命令边界 | 大 |
| `docs/current/issue-investigation/` | `/openflow-issue`、问题分类、修复边界、issue resolution | 中 |
| `docs/current/quality-governance/` | Quality Gate、TDD、验证证据、readiness 判定 | 大 |
| `docs/current/drift-guardian/` | 契约标记、检查点、漂移检测、与 plan/quality-gate 的集成 | 中 |
| `docs/current/archive-authority/` | 归档、current promotion、implementation-mapper、冻结策略 | 中 |
| `docs/current/workflow-conventions/` | AI 行为约束、全局命令语义、handoff 规则、reflection 机制 | 大 |
| `docs/current/ai-self-governance/` | AI reflection、约束机制、错误模式沉淀（可合并到 workflow-conventions） | 小 |

### 2. 文件组织规则

每个限界上下文内部按文档类型拆分：

```text
docs/current/{bounded-context}/
├── design.md         # 架构设计、机制说明、上下文边界
├── spec.md           # 行为规格（含原 behavior.md）、接口契约、场景约束
└── requirements.md   # 该上下文的能力需求、对外承诺、验收标准
```

**`spec.md` 内部章节结构（建议）**：
```markdown
# {Context} Specification

## Overview
## Interface / Contract
## Behavior Scenarios
### Scenario: ...
## Constraints
## Integration Boundaries
```

**文件拆分例外规则**：
- 默认每个上下文使用 `design.md` + `spec.md` + `requirements.md` 三文件。
- 如果某个上下文的内容极少（如 `ai-self-governance`，预计 < 50 行），允许合并为单文件 `facts.md`，但需在目录中显式说明。

### 3. DRG 集成设计

#### 3.1 DRG 实例化接入

在 OpenFlow 启动时（如 `src/index.ts` 或 plugin init 阶段）：

```typescript
import { SchedulerLoop } from './orchestrator/index.js'

// 全局单例
export const scheduler = new SchedulerLoop(projectRoot, { maxConcurrency: 2 })

// 注册 executors
scheduler.registerExecutor('current-promotion', currentPromotionExecutor)

// 启动调度循环
scheduler.startScheduler()
```

#### 3.2 `current-promotion` executor

```typescript
const currentPromotionExecutor: ExecutorFunction = async (task, context) => {
  const { feature, promotionPlan, targetContexts } = task.payload as CurrentPromotionPayload
  
  // 1. 解析 promotionPlan（哪些 archive 文件映射到哪些 current 上下文文件）
  // 2. 按 targetContexts 分组执行文件操作
  // 3. 对于合成刷新策略（synthesized_refresh），读取目标文件与源文件，执行节级合并
  // 4. 返回 result：{ applied: [...], skipped: [...] }
  
  return { applied, skipped }
}
```

#### 3.3 Archive 流程的改动

`src/commands/archive.ts` 中：

```typescript
// 旧：同步执行
// const promotionResult = await applyPromotionSuggestions({...})

// 新：提交 DRG 任务
const promotionTaskId = scheduler.submitTask({
  type: 'current-promotion',
  payload: {
    feature: sanitizedFeature,
    promotionPlan: buildNewStylePromotionSuggestions({...}), // 新聚合逻辑
    targetContexts: ['quality-governance', 'drift-guardian'], // 该 feature 影响哪些上下文
  },
  resources: targetFiles.map(file => ({
    kind: 'file',
    id: path.relative(projectDir, file),
    mode: 'write',
  })),
})

// archive 命令立即返回，包含 taskId 供用户查询
```

#### 3.4 资源锁设计

每个 promotion 任务声明其要写入的 `docs/current/` 文件路径：

```typescript
resources: [
  { kind: 'file', id: 'docs/current/quality-governance/spec.md', mode: 'write' },
  { kind: 'file', id: 'docs/current/drift-guardian/design.md', mode: 'write' },
]
```

DRG 的 `ResourceLockManager` 保证：
- 两个同时提交的 promotion 任务如果都要写 `quality-governance/spec.md`，后者排队等待前者完成。
- read/write 冲突矩阵防止并发破坏。

### 4. `current-promotion.ts` 重写要点

#### 4.1 旧逻辑（待废弃）

```typescript
// 旧：按 area（design / requirements / behavior）匹配
const PROMOTION_AREAS = [
  { area: 'design', currentBaseDir: 'docs/current/design', ... },
  { area: 'behavior', currentBaseDir: 'docs/current/spec', ... },
]
// 按 feature 名在 currentBaseDir 下创建子目录
```

#### 4.2 新逻辑

```typescript
interface BoundedContextConfig {
  name: string
  currentDir: string        // e.g. docs/current/quality-governance
  sourceMapping: {
    design?: string         // archive 中的 design.md 映射到当前上下文的 design.md
    spec?: string           // archive 中的 behavior.md + prd.md 映射到当前上下文的 spec.md
    requirements?: string   // archive 中的 prd.md 映射到当前上下文的 requirements.md
  }
}

// 1. 根据 feature 内容分析其影响的限界上下文
// 2. 为每个受影响的上下文生成 promotion suggestion
// 3. 不再按 feature 创建子目录，而是直接更新上下文的 design.md / spec.md / requirements.md
```

**关键算法变更**：
- `findHistoricalMatch` 不再在 `docs/current/design/{feature}/` 中查找，而是在 `docs/current/{context}/` 的三个文件中按内容相似度匹配。
- `synthesizeCurrentDocument` 仍然适用，但目标文件变为 `docs/current/{context}/spec.md` 等。

### 5. behavior.md 合并策略

#### 5.1 `docs/current/` 层

- **取消所有 `behavior.md` 文件**。
- 原 `behavior.md` 内容按以下规则迁移：
  - **触发规则、场景、Given/When/Then** → 合并到对应上下文的 `spec.md` 的 `## Behavior Scenarios` 章节。
  - **约束规则（Must / Must Not）** → 合并到 `spec.md` 的 `## Constraints` 章节。
  - **验收映射表** → 如果是当前系统的稳定验收标准，放入 `spec.md`；如果是 feature 级别的，留在 `changes/` 的 `behavior.md` 中。

#### 5.2 `docs/changes/` 层

- **保持不变**。feature 工作区仍可包含 `behavior.md`，作为变更过程的行为契约。

#### 5.3 `docs/archive/` 层

- **保持不变**。归档快照保留 `behavior.md`，用于历史追溯。

### 6. 迁移步骤

#### 阶段 1：结构迁移（不依赖 DRG）

1. 创建 `docs/current/{bounded-context}/` 目录。
2. 遍历现有 `docs/current/design/`、`docs/current/spec/`、`docs/current/requirements/` 下的所有 `feature-xxx/` 子目录。
3. 对每个 feature 目录中的内容，按主题域判断其应归属的限界上下文。
4. 将内容提取并合并到目标上下文的 `design.md` / `spec.md` / `requirements.md` 中。
5. 删除旧的 `docs/current/design/`、`docs/current/spec/`（保留 `workflow/` 直到内容迁移完成）。

**迁移映射示例**：

| 旧路径 | 新路径 | 处理方式 |
|---|---|---|
| `docs/current/design/drift-guardian/design.md` | `docs/current/drift-guardian/design.md` | 直接移动 |
| `docs/current/spec/feature-4e04eb6b/behavior.md` | `docs/current/feature-lifecycle/spec.md` | 内容分析后合并 |
| `docs/current/spec/quality-gate-evidence-judge/behavior.md` | `docs/current/quality-governance/spec.md` | 内容分析后合并 |

#### 阶段 2：`current-promotion.ts` 重写（不依赖 DRG）

1. 重写 `buildPromotionSuggestions`，基于新结构生成 suggestion。
2. 重写 `applyPromotionSuggestions`，直接操作 `docs/current/{context}/` 下的文件。
3. archive 流程中的调用点保持不变（仍然同步执行）。
4. 验证 archive → current promotion 在新结构下正常工作。

#### 阶段 3：DRG 集成

1. 在 OpenFlow 启动时实例化 `SchedulerLoop`。
2. 实现并注册 `current-promotion` executor。
3. 修改 `src/commands/archive.ts`，将同步 `applyPromotionSuggestions` 替换为 `scheduler.submitTask()`。
4. 在 archive 结果输出中增加 DRG taskId 和查询指引。
5. 增加 `listTasks` 查询命令或状态展示，让用户可以查看 promotion 任务状态。

---

## Design Constraints

- [must] `docs/changes/` 和 `docs/archive/` 的结构不得改变。
- [must] `docs/current/` 下不得再出现 `feature-xxx` 子目录。
- [must] archive 仍然是 current promotion 的决策 authority，DRG 只承担执行。
- [must] `spec.md` 必须能承载原 `behavior.md` 的全部内容（触发规则、场景、约束）。
- [must] DRG 集成不得影响 archive 的现有校验逻辑（readiness、drift、governance 等）。
- [should] 迁移过程应保留旧文件作为备份，直到新结构验证通过。
- [should] `current-promotion` executor 应返回详细的 applied/skipped 结果，与现有 archive 输出格式兼容。
- [may] 如果 DRG 尚未启动，archive 应优雅回退到同步执行（向后兼容开关）。

---

## Risks And Mitigations

- **Risk**: 限界上下文边界划分不当，导致未来仍需大规模迁移。
  - *Mitigation*: 第一版采用"宽上下文"策略（如 `feature-lifecycle` 而非 `feature-creation`、`feature-planning` 等细粒度拆分），减少边界调整概率。
- **Risk**: `spec.md` 合并 behavior 后文件过大，难以维护。
  - *Mitigation*: 监控 `spec.md` 行数，超过 200 行时触发拆分讨论（拆为 `spec.md` + `behavior.md` 或按子主题拆分）。
- **Risk**: DRG 任务失败或挂起，导致 current 长期不更新。
  - *Mitigation*: archive 输出中显式提供 taskId 和查询方式；DRG 支持 retry；设置超时机制。
- **Risk**: 两个 feature 同时 archive，promotion 任务因资源锁排队，用户体验下降。
  - *Mitigation*: archive 命令立即返回并告知"promotion 已排队"；资源锁保证一致性优先于速度。
- **Risk**: 现有 `current-promotion.ts` 的 `synthesizeCurrentDocument` 节级合并算法在新结构下行为异常。
  - *Mitigation*: 重写后增加单元测试，覆盖"源文件节与目标文件节匹配"、"源文件独有节追加"、"目标文件独有节保留"三种场景。

---

## Success Criteria

- [ ] `docs/current/` 下存在 6-7 个限界上下文目录，无 `feature-xxx` 子目录。
- [ ] 每个上下文目录包含 `design.md`、`spec.md`、`requirements.md`（或单文件例外）。
- [ ] `docs/current/` 下无独立的 `behavior.md` 文件。
- [ ] archive 流程能成功生成新结构的 promotion suggestions。
- [ ] `current-promotion` executor 能在 DRG 中成功执行文件 promotion。
- [ ] 两个并发 promotion 任务对同一 `docs/current/` 文件不会并发写（资源锁验证）。
- [ ] DRG 任务失败后可 retry，retry 后成功更新 current。
- [ ] 所有现有 archive 测试通过（或明确更新为符合新结构的预期）。

---

## Testing Strategy

- **单元测试**：`current-promotion.ts` 的新 `buildPromotionSuggestions` 和 `applyPromotionSuggestions`。
- **集成测试**：完整 archive 流程（从 changes → archive → DRG promotion → current 更新）。
- **资源锁测试**：两个并行 promotion 任务争用同一文件时的排队行为。
- **恢复测试**：DRG 重启后，pending/running 的 promotion 任务正确恢复。
- **回退测试**：DRG 未启动时，archive 回退到同步执行的开关行为。
