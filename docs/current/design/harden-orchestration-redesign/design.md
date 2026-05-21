# harden-orchestration-redesign - Design

**日期**: 2026-05-21
**Feature**: harden-orchestration-redesign
**状态**: Design

---

## 1. 问题陈述

当前 OpenFlow harden 存在三个结构性缺陷：

1. **伪对抗**：Executor 只能被动修复 Reviewer 提出的 findings，没有确认/否决权。Reviewer 的输出是单向的，不存在真正的攻防博弈。
2. **Token 硬限制截断复杂问题**：`tokenBudgetTotal` 和 `tokenBudgetPerRound` 会在 harden 尚未收敛时强制终止，导致高价值审查中途夭折。
3. **角色与提示词混杂**：Reviewer 和 Executor 复用同一个 session，通过 `body.agent` 切换角色，系统提示词没有分离，导致行为边界模糊。

---

## 2. 设计目标

### 2.1 核心目标

1. **真正的三角色对抗**
   - Coordinator（调度者）：统筹轮次、管理独立 session、传递上下文、裁决收敛。
   - Reviewer（审查者）：独立 session + 独立系统提示词，只读，严格按设计文档攻击实现。
   - Executor（执行者）：独立 session + 独立系统提示词，可确认、可否决、可修复。

2. **可反驳的对抗循环**
   Executor 对 finding 给出 `accept / reject / partial` 判定及理由；Reviewer 可对 rejection 发起一轮反驳；仍无法达成一致则标记为 `design_ambiguity` 停止。单 finding 争论上限可配置。

3. **轮次导向的成本控制**
   移除 `tokenBudgetTotal` 和 `tokenBudgetPerRound` 的硬性截断。终止条件只有 `maxRounds` 和人工介入。保留 token 统计用于事后成本报告。

4. **显式的轮次标识**
   每轮 Reviewer / Executor 的独立 session 标题携带 `Round N / Max M`，便于追踪和审计。

### 2.2 非目标

1. 不改变 `handleHarden()` 对外签名
2. 不改变 quality-gate 对 harden 的调用方式
3. 不修改 `trivial / simple / complex` 的自动分级判定逻辑（只改造 `complex` 和 `simple` 的执行流程）
4. 不引入新的外部依赖

---

## 3. 角色架构

### 3.1 Coordinator（调度者）

- **载体**：
  - **omo 存在时**：Coordinator **就是** Sisyphus 主 agent 本身，不额外创建"Coordinator 子 agent"。Sisyphus 直接在自身 session 内履行 Coordinator 职责。
  - **omo 不存在时**：当前运行的本地 agent 直接履行 Coordinator 职责。
- **职责**：
  - 每轮创建 Reviewer 和 Executor 的独立子 session
  - 组装并传递上下文（plan 摘要、diff、上轮 findings、disposition report、反驳记录）
  - 判断收敛条件（pass / pass_with_risks / needs_human / max_rounds_reached）
  - 记录 token 统计（仅统计，不截断）
- **权限**：不审查、不修改代码，只负责编排和裁决。

> **架构原则**：避免"Sisyphus → Coordinator 子 agent → Reviewer/Executor"的多层代理。Coordinator 与主流程 agent 合一，扁平化调度。

### 3.2 Reviewer（审查者）

- **载体**：独立子 session，agent 类型为 `oracle`。
- **系统提示词**：独立的 reviewer system prompt，定义审查基准、finding 分级、输出格式、禁止事项。
- **职责**：基于设计文档和 diff 输出 findings，每个 finding 必须附带证据和文件路径。
- **权限**：只读，不能修改代码。可以对 Executor 的 rejection 发起最多一次反驳。

### 3.3 Executor（执行者）

- **载体**：独立子 session，agent 类型为 `deep`。
- **系统提示词**：独立的 executor system prompt，定义确认/否决/修复规则、最小修改原则、disposition report 格式。
- **职责**：对每个 finding 给出 `accept / reject / partial` 判定，对 accept/partial 做最小修复，输出 disposition report。
- **权限**：可修改代码，但不得超出 plan 范围。可以对 Reviewer 的反驳给出最终回应。

---

## 4. 对抗循环机制

### 4.1 完整流程（complex 模式）

```text
初始化：Coordinator 创建主 session

第 N 轮 (N >= 1):
  1. Coordinator 创建 Reviewer 子 session
     标题：Harden Round N/{maxRounds} - Reviewer
     输入：plan 摘要、本轮 diff、上轮 disposition report、反驳记录

  2. Reviewer 输出 findings[]
     格式：Level / Description / Evidence / Files

  3. Coordinator 过滤 findings
     - 丢弃 style_or_preference
     - 若全无 findings → PASS

  4. Coordinator 创建 Executor 子 session
     标题：Harden Round N/{maxRounds} - Executor
     输入：findings + plan 摘要 + 允许修改的文件列表

  5. Executor 输出 Disposition Report
     对每个 finding：
       - verdict: accept | reject | partial
       - rationale: 理由（reject 时必须说明设计文档依据或代码逻辑依据）
       - fix: 若 accept/partial，给出最小修复 diff

  6. Coordinator 分类处置结果
     ├─ 全部 accept/partial 且修复成功 → 记录 fix，进入第 N+1 轮重新审查
     ├─ 存在 reject → 触发反驳子流程
     └─ 出现 design_ambiguity → 立即停止

反驳子流程（每 finding 最多 2 轮：Reviewer 反驳 1 次 + Executor 最终回应 1 次）：
  R1: Coordinator 将 rejection 理由回传 Reviewer
      Reviewer 选择：
        a) 接受反驳 → 撤销 finding
        b) 继续挑战 → 输出反驳理由 + 补充证据
  R2: Coordinator 将 Reviewer 反驳回传 Executor
      Executor 给出最终 verdict（accept/reject）
      若仍 reject → Coordinator 标记为 design_ambiguity，该 finding 停止争论
```

### 4.2 simple 模式改造

当前 simple 模式只运行 reviewer，不启动 executor，有 actionable 时直接 `needs_human`。

改造后 simple 模式仍不进入完整多轮循环，但引入一次性的 Executor 审视：

```text
Reviewer 输出 findings
  ↓
Coordinator 判断：
  ├─ 无 findings → pass
  ├─ 有 actionable → 创建一次 Executor session，仅做确认/否决，不做多轮修复
  │   Executor 给出 disposition report
  │   Coordinator 汇总为报告返回用户，不自动修复
  └─ 有 design_ambiguity → needs_human
```

simple 模式仍不自动修复，但 Executor 的否决理由可帮助用户快速判断 finding 是否有效。

### 4.3 收敛规则

| 条件 | 行为 |
|------|------|
| Reviewer 无 findings | `pass` |
| 连续 2 轮只剩 non-blocking findings | `pass_with_risks` |
| 达到 `maxRounds` | `max_rounds_reached`（阻塞为 NeedsDecision） |
| 出现 `design_ambiguity`（含反驳未决） | `needs_human`（阻塞为 NeedsDecision） |
| trivial | `rejected`（保持现有行为） |

---

## 5. Session 与对话标题模型

### 5.1 Session 层级

```text
第一层：父 Session (主工作流 / quality-gate 会话)
  │
  └── quality-gate 调用 handleHarden()
       │
       第二层：Coordinator Session (harden 主控)
       │
       ├── 载体：omo 存在时 = Sisyphus 主 agent session
       ├── 载体：omo 不存在时 = 本地 agent session
       │
       └── 第三层：Reviewer / Executor / Rebuttal（独立子 session）
            ├── Round 1 - Reviewer Session
            ├── Round 1 - Executor Session
            ├── Round 1 - Reviewer Rebuttal Session（如触发反驳）
            ├── Round 1 - Executor Rebuttal Session（如触发反驳）
            ├── Round 2 - Reviewer Session
            ├── Round 2 - Executor Session
            └── ...
```

**层级说明**：
- **第一层**：用户的实现会话，quality-gate 在此运行并调用 `handleHarden()`
- **第二层**：Coordinator 不创建独立子 agent，由主流程 agent（Sisyphus 或本地 agent）直接扮演，创建独立的 harden 主控 session
- **第三层**：Reviewer、Executor、Rebuttal 均为 Coordinator 创建的独立子 session，拥有各自独立的系统提示词和上下文

### 5.2 对话标题格式

| 角色 | 标题格式 |
|------|---------|
| Coordinator | `Harden: {feature}` |
| Reviewer (主轮) | `Harden Round {round}/{maxRounds} - Reviewer` |
| Executor (主轮) | `Harden Round {round}/{maxRounds} - Executor` |
| Reviewer (反驳) | `Harden Round {round}/{maxRounds} - Reviewer Rebuttal` |
| Executor (反驳) | `Harden Round {round}/{maxRounds} - Executor Rebuttal` |

### 5.3 上下文传递

由于子 session 相互独立，Coordinator 必须在每次创建子 session 时显式传递完整上下文：

- **Reviewer 输入**：plan 摘要、本轮 diff、上轮 disposition report、已撤销的 findings 列表、反驳记录
- **Executor 输入**：当前轮 findings、plan 摘要、允许修改的文件列表、相关代码片段

不依赖子 session 之间的隐式上下文继承。

---

## 6. 提示词分离

### 6.1 分离原则

Reviewer 和 Executor 不再通过同一段 user prompt 切换角色，而是各自拥有独立的 system prompt + user prompt。

### 6.2 Reviewer System Prompt 核心内容

- 身份：OpenFlow Harden Reviewer
- 基准：只能基于 design / plan / current / decisions 提出 findings
- 分级：blocking_bug / spec_violation / regression_risk / test_gap / design_ambiguity / style_or_preference
- 输出格式：严格的 finding 块格式
- 禁止：提出设计文档未覆盖的新需求、修改代码
- 反驳规则：收到 Executor 的 rejection 时，可选择接受或继续挑战一次，必须补充新证据

### 6.3 Executor System Prompt 核心内容

- 身份：OpenFlow Harden Executor
- 权限：可修改代码，不得超出 plan 范围
- 判定规则：对每个 finding 必须给出 accept / reject / partial
- reject 条件：设计文档明确允许、实现已满足、finding 证据不足
- 修复规则：最小修复、不得重构、不得加新功能
- 输出格式：Disposition Report（每个 finding 的 verdict + rationale + fix diff）
- 反驳回应规则：收到 Reviewer 反驳时，给出最终 verdict，不得无限争论

### 6.4 Coordinator System Prompt 核心内容

- 身份：OpenFlow Harden Coordinator
- 调度规则：每轮创建独立子 session、传递上下文、记录统计
- 收敛判断：根据 findings 和 disposition 判断何时停止
- 裁决规则：单 finding 争论达到上限时标记为 design_ambiguity

---

## 7. 配置模型变更

### 7.1 移除项

| 配置项 | 处理方式 |
|--------|---------|
| `harden.tokenBudgetTotal` | 移除，不再用于硬性截断 |
| `harden.tokenBudgetPerRound` | 移除，不再用于硬性截断 |

### 7.2 保留项

| 配置项 | 说明 |
|--------|------|
| `harden.enabled` | 保持 |
| `harden.maxRounds` | 保持，作为唯一硬性终止条件 |
| `harden.reviewerModel` | 保持 |
| `harden.executorModel` | 保持 |

### 7.3 新增项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `harden.maxArgumentRoundsPerFinding` | number | 2 | 单 finding 争论上限（Reviewer 反驳 + Executor 回应 = 2 轮） |

### 7.4 向后兼容

旧配置文件中残留的 `tokenBudgetTotal`、`tokenBudgetPerRound` 字段被忽略，不报错、不影响流程。代码读取配置时使用可选链，缺失时按新逻辑处理。

---

## 8. Token 统计与报告

### 8.1 统计维度

每轮记录：
- Reviewer token 消耗
- Executor token 消耗
- Rebuttal Reviewer token 消耗（如有）
- Rebuttal Executor token 消耗（如有）

### 8.2 报告位置

最终 `formatHardenResult` 输出中保留 `Budget consumed` 字段（改为 `Total tokens consumed`），纯透明展示，不做任何阈值判断。

### 8.3 不做截断

代码中删除所有基于 token 预算的提前返回逻辑：
- 删除 `if (budgetConsumed >= args.tokenBudget)`
- 删除 `if (review.tokens > args.tokenBudgetPerRound)`
- 删除 `if (execution.tokens > args.tokenBudgetPerRound)`

---

## 9. 与现有系统的关系

### 9.1 对外接口

`handleHarden(ctx, feature?, args?, sessionID?)` 签名不变。quality-gate 的调用方式不变。

### 9.2 向父 Session（Quality-Gate）的报告契约

harden 运行结束后必须向父 session 返回一份结构化报告。报告内容分为三层：

#### 9.2.1 基础元信息（必须）

| 字段 | 说明 | 示例 |
|------|------|------|
| `status` | 终止状态 | `pass`, `pass_with_risks`, `max_rounds_reached`, `needs_human`, `rejected` |
| `stop_reason` | 终止原因 | `no_findings`, `actionable_resolved`, `non_blocking_only`, `max_rounds_reached`, `design_ambiguity`, `rejected` |
| `rounds_executed` | 实际执行的主轮次数 | `3` |
| `total_tokens_consumed` | 所有子 session 的 token 消耗总和（纯统计） | `15420` |
| `coordinator_session_id` | Coordinator 主 session ID | `ses_xxx` |

#### 9.2.2 每轮对抗详情（必须，按轮次排列）

每轮必须包含：

```yaml
round: 1
reviewer_session_id: ses_rev_xxx
findings:
  - id: F1
    level: spec_violation
    description: ...
    evidence: ...
    files: [a.php, b.php]
executor_session_id: ses_exec_xxx
disposition_report:
  - finding_id: F1
    verdict: accept          # accept | reject | partial
    rationale: "实现确实遗漏了设计文档要求的幂等键"
    fix_summary: "在 TqServerClient 中增加 billId 参数"
rebuttal: null               # 或 rebuttal 对象
```

**反驳子流程（如触发）**：

```yaml
rebuttal:
  reviewer_rebuttal_session_id: ses_reb_rev_xxx
  challenge: "补充证据：设计文档第 3.2 节明确要求幂等"
  executor_final_session_id: ses_reb_exec_xxx
  final_verdict: accept      # accept | reject
```

#### 9.2.3 Findings 最终状态汇总（必须）

父 session（quality-gate）依赖此汇总做 readiness 裁决：

| 分类 | 说明 | 对 readiness 的影响 |
|------|------|-------------------|
| `resolved_findings` | 已确认并修复 | 不阻塞 |
| `rejected_findings` | 被 executor 有效否决，reviewer 接受反驳或争论上限后接受 | 不阻塞 |
| `unresolved_must_fix` | 未修复的 actionable finding | **阻塞 NotReady** |
| `unresolved_needs_decision` | 争论未决，标记为 design_ambiguity | **阻塞 NeedsDecision** |
| `accepted_known_issues` | 用户或 executor 明确接受的已知问题 | 降级为 ReadyWithDocUpdates |

#### 9.2.4 格式兼容约束

- harden 的返回格式**必须**保持为 markdown 字符串（`handleHarden` 返回 `Promise<string>` 不变）
- quality-gate 的 `parseFindingsSummary`、`extractHardenStatus`、`extractBudgetConsumed` 等解析器需要同步更新以识别新的报告结构
- 旧版 quality-gate 解析器无法识别的新字段（如 `disposition_report`、`rebuttal`）应以 `<details>` 块包裹，确保旧解析器至少能提取到 `status` 和 `findings summary`

### 9.3 内部改造范围

主要改造 `src/commands/harden.ts` 中的：
- `runAdversarialLoop` → 重构为三角色调度
- `buildReviewerPrompt` / `buildExecutorPrompt` → 拆分为 system prompt + user prompt
- `createHardenSession` → 支持按轮次和角色创建独立子 session
- `formatHardenResult` → 移除 budget 相关状态，保留 token 统计

### 9.4 测试影响

`tests/harden/orchestration.test.ts` 等测试需要更新：
- 验证独立 session 创建（每个角色每轮各一个）
- 验证对话标题包含轮次
- 验证 token 不触发截断
- 验证 Executor 可输出 reject verdict

---

## 10. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 独立 session 导致上下文丢失 | Coordinator 显式组装完整上下文，不依赖 session 继承 |
| Rebuttal 循环意外膨胀 | `maxArgumentRoundsPerFinding` 硬性上限 + Coordinator 强制裁决 |
| 旧配置残留字段导致解析错误 | 可选链读取，缺失字段静默忽略 |
| 独立 session 增加创建开销 | simple 模式仍保持轻量，complex 模式的额外开销可接受 |
| Executor reject 过多导致无法收敛 | 争论上限确保不会无限拉扯，未决问题交给用户 |

---

## 11. 一句话总结

将 harden 从"Reviewer 单向输出 + Executor 被动修复"改造为"Coordinator 调度下的三角色真正对抗"：Reviewer 与 Executor 在独立 session 中各自拥有独立提示词，Executor 可否决 finding，Reviewer 可反驳一次，由 Coordinator 按轮次限制和争论上限裁决收敛，移除 token 硬性截断，对话标题显式标识轮次。
