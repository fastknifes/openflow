# drift-guardian - Design

**日期**: 2026-05-11  
**Feature**: drift-guardian  
**状态**: Draft  

---

## 1. 问题陈述

OpenFlow 的核心目标是让文档成为 AI 开发的治理约束。但现有治理链路仍以阶段性检查为主：

```text
brainstorm → writing-plan / start-work → implement → harden → verify → archive
```

`bdd` 提案引入 `behavior.md` 作为用户确认的主行为契约，并要求 `design.md` 通过 `Behavior Alignment` 表显式对齐行为场景。`verify-evidence-adapters` 提案会让 `/openflow-verify` 的 security / consistency evidence 真实化。`implementation-mapper-traceability` 提案会在 archive 阶段建立可复核追溯。

这些提案解决了“最终能不能验证”和“最终能不能追溯”的问题，但仍存在一个执行期风险：

> 在实现过程中，代码、设计文档和行为契约可能持续漂移；如果只等 verify 阶段发现，修复成本高，且 AI 可能已经基于错误上下文继续扩散实现。

本功能引入 **Drift Guardian**：Contract Runtime 的执行期消费者，用于在 OpenCode 运行期间持续监测代码与 `OpenFlowContract` 的偏离，自动修复确定性 bug，将模糊项留给人工确认，并把自身结果作为 verify evidence 的输入之一。

从第一性原理看，Guardian 不回答“什么是正确的”，也不取代 verify 裁判。它只回答两个运行期问题：**现在发生了什么偏离？这个偏离是否属于可证明、唯一、低风险的确定性修复集合？**

---

## 2. 设计目标

### 2.1 核心目标

1. **执行期持续对齐维护**
   - 在文件变更发生时尽早发现 `code ↔ design ↔ behavior` 漂移。
   - 不等到 verify 阶段才第一次暴露一致性问题。

2. **Contract Runtime consumer + scoped jobs**
   - OpenFlow 插件加载时启动一个全局 `ContractRuntime`，Guardian 注册为运行期消费者。
   - 每个 feature/session 的检查以 scoped job 隔离。
   - 避免纯多例造成重复监控、并发写冲突和资源浪费。

3. **统一 Contract Runtime**
   - 定义共享 `OpenFlowContract` 中间格式。
   - BDD、Guardian、verify consistency adapter、implementation mapper、archive promotion 共用同一契约口径。
   - `OpenFlowContract` 和 contract extractor 不属于 Guardian；Guardian 只消费 Contract Runtime 输出。

4. **明确 bug 自动修复，模糊项人工确认**
   - 只有可用确定性规则证明“这是 bug 且修复唯一合理”时自动修复。
   - 任何涉及行为语义、设计取舍、current/decisions 冲突或低置信度推断的情况都进入人工确认队列。

5. **verify 保持最终裁判**
   - Guardian 不替代 `/openflow-verify`。
   - verify consistency adapter 必须独立重新检查最终状态。
   - Guardian 结果可以作为 evidence 输入，但不能成为唯一依据。

6. **中断友好与统一运行期状态**
   - 用户中断是正常行为。
   - Guardian 状态写入 `.sisyphus/openflow/guardian/`，Contract Runtime 状态写入 `.sisyphus/openflow/`。
   - verify/archive 完成后清理临时状态，必要 evidence 进入 archive / mapper。

### 2.2 非目标

1. 不取消 `/openflow-verify`，也不让 Guardian 取代 verify evidence adapters。
2. 不在第一版实现完整行为级语义证明；行为级最终裁判仍由 verify evidence 负责。
3. 不让 Guardian 自动修改 `docs/current/*` 或 `docs/decisions/*`。
4. 不自动接受与用户行为契约相关的语义变更。
5. 不把 Guardian 设计为每个 `/start-work` 单独启动的长期后台 agent。
6. 不依赖标准 BDD 框架；`behavior.md` 仍是用户主契约。

---

## 3. 与现有提案的关系

```text
BDD
  → 生成 behavior.md
  → design.md 包含 Behavior Alignment 表

Shared Contract Extractor
  → 解析 behavior.md + Behavior Alignment + current/decisions
  → 产出统一 OpenFlowContract

Drift Guardian
  → 执行期持续监测
  → 明确 bug 自动修复
  → 模糊项入队
  → 产出 guardian evidence

Verify Evidence Adapters
  → 最终独立重新检查
  → 可读取 guardian evidence，但不盲信

Implementation Mapper
  → 使用 verify evidence + contract 建立 Behavior → Evidence → Code 追溯
```

| 提案 | 职责 | 与 Drift Guardian 的关系 |
|---|---|---|
| `bdd` | 定义用户行为契约和 Behavior Alignment 表 | 提供 Guardian 的主要契约来源 |
| `verify-evidence-adapters` | 让 verify 证据真实化 | 独立裁判最终一致性，可读取 Guardian evidence |
| `execution-quality-policy` | 定义 OMO 执行质量策略和 verify 必跑门禁 | Guardian 是执行期维护层，不替代 harden/verify |
| `implementation-mapper-traceability` | archive 后生成可复核追溯 | 使用统一 contract 和 verify evidence 建立追溯 |

---

## 4. 核心架构

### 4.1 Contract Runtime + Guardian scoped jobs

```text
OpenCode 启动
  → OpenFlowPlugin 初始化
      → ContractRuntime.start()
          → 加载 contracts/cache/events
          → 注册 DriftGuardianConsumer
          → 监听 file change / chat message / archive state
          → 根据变更分发到 feature-scoped Guardian job
```

推荐结构：

```text
ContractRuntime（单例）
  ├─ ContractRegistry              // 所有 active feature 的契约索引
  ├─ ContractExtractor             // behavior/design/current/decisions → OpenFlowContract
  ├─ EventQueue                    // 文件变更、session 事件、archive 事件
  ├─ EvidenceSink                  // Guardian / verify / archive 共享 evidence 入口
  └─ Consumers
      └─ DriftGuardianConsumer
          ├─ DeterministicRepairCoordinator
          ├─ AmbiguityQueue
          └─ ScopedDriftJob
```

### 4.2 为什么不是纯单例或纯多例

| 模式 | 问题 |
|---|---|
| 纯 Guardian 单例 | Guardian 会拥有契约解析权，容易变成私有治理引擎 |
| 纯多例 per feature | 重复监控、重复解析契约、跨 feature 文件冲突难处理 |
| ContractRuntime + consumer jobs | 契约解析统一，Guardian 只做执行期消费与确定性修复 |

---

## 5. Contract Runtime 与统一契约格式

### 5.0 归属与复用原则

`OpenFlowContract` 是 BDD、Guardian、verify adapters 和 archive mapper 的共享输入，不属于 Drift Guardian 私有模块。推荐实现位置为 `src/contracts/*`，并通过 `ContractRuntime` 统一加载、缓存、失效和分发。

当前代码已经存在 verify adapter 基础设施与 `DesignDriftAdapter`。Guardian 不应再实现另一套独立文档解析口径，而应：

1. 复用共享 contract extractor。
2. 将执行期事件映射到 contract 的 `alignmentItems`。
3. 将 Guardian 结果写成 evidence，供 verify 独立复核。

verify adapters 也应消费同一 contract；两者的差异在运行时机和处理动作，而不是解析口径。

Contract Runtime 的职责：

1. 提取 `OpenFlowContract`。
2. 维护 source hash 与缓存失效。
3. 将文件变更映射到 affected behavior / alignment items。
4. 接收 Guardian evidence，供 verify 独立复核。
5. 在 archive 后清理或冻结相关运行期状态。

### 5.1 OpenFlowContract

所有相关模块必须消费同一个契约中间格式，避免 BDD、Guardian、verify adapter、mapper 各自解析出不同口径。

```typescript
interface OpenFlowContract {
  feature: string
  sourceFiles: string[]
  behaviorScenarios: BehaviorScenario[]
  alignmentItems: AlignmentItem[]
  currentConstraints: Constraint[]
  decisionConstraints: Constraint[]
  extractedAt: string
  sourceHashes: Record<string, string>
}

interface BehaviorScenario {
  id: string
  name: string
  given: string[]
  when: string[]
  then: string[]
  mustNot?: string[]
  criticality: 'critical' | 'normal' | 'optional'
}

interface AlignmentItem {
  behaviorId: string
  designResponse: string
  files: string[]
  modules: string[]
  expectedSymbols: string[]
  risk: 'low' | 'medium' | 'high'
}

interface Constraint {
  source: 'current' | 'decision'
  file: string
  rule: string
  severity: 'blocking' | 'warning'
}
```

### 5.2 契约来源

| 来源 | 提取内容 |
|---|---|
| `behavior.md` | 行为场景、Must Not、边界场景、验证映射 |
| `design.md` / `Behavior Alignment` | 行为场景到设计响应、文件、模块、风险的映射 |
| `docs/current/*` | 已生效稳定约束 |
| `docs/decisions/*` | 全局 ADR / 决策约束 |

### 5.3 缓存失效

Contract extractor 必须基于源文件 hash 判断是否需要重新提取：

```text
源文件 hash 未变 → 复用 contracts.json
源文件 hash 变化 → 重新提取对应 feature contract
```

---

## 6. Drift Guardian 工作流

### 6.1 启动

```text
OpenFlowPlugin 初始化
  → ContractRuntime.start(ctx)
  → 加载 .sisyphus/openflow/contracts.json
  → 注册 DriftGuardianConsumer
  → 恢复未完成 pending queues
  → 进入 idle/listening 状态
```

Contract Runtime 可常驻，但不应持续消耗 LLM：没有 active contract 或事件时保持 idle。Guardian 作为 consumer 只在命中 contract 相关事件时运行。

### 6.2 文件变更处理

```text
tool.execute.after(write/edit)
  → file-tracker 记录变更
  → ContractRuntime.enqueue(FileChangedEvent)
  → ContractRegistry 查找关联 feature/alignment item
  → 创建或复用 ScopedDriftJob
  → 执行文件级 + 符号级 drift check
```

当前代码已经有 `src/hooks/tool-after.ts` 和 `src/utils/file-tracker.ts`：

- `tool-after.ts` 已在 write/edit 后记录文件变更
- `file-tracker.ts` 已提供 `trackFileChange()` / `getBuildChanges()`

Guardian 应通过 Contract Runtime 接入现有 hook 与 tracker，不新增并行 file-tracker。新增逻辑应在现有记录之后派发 `FileChangedEvent`，避免同一写入被记录两次或产生不同 build/session 视角。

### 6.3 分级结果

```typescript
type DriftDisposition =
  | 'auto_repaired'
  | 'ambiguous_needs_confirmation'
  | 'violation_needs_fix'
  | 'no_drift'
```

结果处理：

| 结果 | 处理 |
|---|---|
| `auto_repaired` | 写入 repairs log，并更新相关文档 |
| `ambiguous_needs_confirmation` | 写入 pending queue，任务结束/verify 前提醒用户 |
| `violation_needs_fix` | 写入 pending queue，verify consistency adapter 必须重新判定 |
| `no_drift` | 仅记录轻量 event，可定期压缩 |

---

## 7. 自动修复标准

### 7.1 允许自动修复的前提

只有同时满足以下条件时，Guardian 才能自动修复：

1. **契约明确**
   - 来源是 `behavior.md`、`Behavior Alignment` 表、`docs/current/*` 或 `docs/decisions/*` 的明确声明。

2. **问题明确是 bug**
   - 可由确定性规则证明不是需求变更、不是设计取舍、不是用户意图变化。

3. **修复唯一且低风险**
   - 修复方式唯一合理。
   - 不改变用户可感知行为。
   - 不改变 public API / exported type / command behavior，除非契约明确要求。

4. **修复范围小**
   - 单文件或少量文件。
   - 优先修复文档引用、路径、符号名称、显然过期的映射行。

5. **修复可验证**
   - 修复后可通过符号检查、typecheck、测试或 consistency adapter 复核。

6. **无治理冲突**
   - 不与 `docs/current/*` 或 `docs/decisions/*` 冲突。

一句话标准：

> 能用确定性规则证明“这是 bug 且这个补丁是唯一合理修复”的，自动修。否则人工确认。

### 7.2 必须人工确认的情况

只要满足任一条件，Guardian 不得自动修复：

- 行为语义可能变化。
- design 与 behavior 冲突。
- current/decisions 存在冲突。
- 多 feature 同时涉及同一文件。
- public API / exported type / command behavior 变化。
- Guardian 需要猜测用户意图。
- 自动修复需要重写大段文档。
- 检测结果来自低置信度 LLM 推断。

### 7.3 示例

| 场景 | 处理 |
|---|---|
| `Behavior Alignment` 表里文件路径过期，实际文件发生明确 rename | 自动修复路径引用 |
| design.md 提到旧函数名，代码中存在明确一对一 rename | 自动修复符号引用 |
| 函数签名变化但行为含义不确定 | 人工确认 |
| design 说返回 401，代码返回 403 | 人工确认 |
| behavior 与 docs/current 冲突 | 人工确认 / needs_decision |
| 多 feature 合约同时命中同一文件 | 人工确认 |

---

## 8. 并发写冲突方案

Guardian 自动修复文档时采用 **乐观并发 + edit-only + 重试**。

流程：

```text
1. read 当前文件内容
2. 基于精确片段生成 edit patch
3. 写前再次 read，确认目标片段仍存在且上下文未变
4. 如果一致 → 执行 edit
5. 如果不一致 → 重新 read，重新生成 patch，最多重试 3 次
6. 3 次失败 → 放弃自动修复，加入 ambiguous queue
```

规则：

- Guardian 不使用整文件 `write` 覆盖文档。
- Guardian 只做精确 `edit`。
- 无法稳定定位替换片段时，不自动修复。
- 与主 agent 密集并发修改同一文件时，默认降级为人工确认。

---

## 9. 状态与缓存

### 9.1 文件布局

```text
.sisyphus/openflow/
  contracts.json          // 所有 active feature 的 OpenFlowContract 缓存
  events.jsonl            // Contract Runtime 事件日志
  guardian/
    repairs.jsonl         // 自动修复记录，可作为 verify evidence 输入
    pending/
      {sessionId}.json    // 当前 session 的模糊项与待确认项
    feature/
      {feature}.json      // feature scoped job 状态
```

### 9.2 中断恢复

用户中断属于正常流程：

```text
中断发生
  → Guardian 将 scoped job 状态写入 .sisyphus/openflow/guardian pending/session cache
  → OpenCode 重启或 session 恢复
  → Guardian 读取缓存
  → 重新计算源文件 hash
  → 继续监测或提醒用户存在未处理漂移
```

### 9.3 清理规则

| 时机 | 清理 |
|---|---|
| verify ready / archive 完成 | 删除 session pending cache |
| feature archive 完成 | 删除 feature scoped state 与 active contract |
| repair evidence 被写入 mapper/archive | 压缩或归档 repairs log |
| 源文档 hash 变化 | 重新提取 contract，旧 contract 标记 stale |

---

## 10. 与 verify evidence adapters 的边界

### 10.1 独立检查原则

Guardian 与 verify consistency adapter 必须独立检查：

```text
Guardian = 执行期维护器
Verify Adapter = 最终裁判
```

Guardian 可以产出 evidence，但 verify adapter 不能只信 Guardian：

- Guardian 修复记录可作为 `guardian:repair` evidence。
- Guardian 模糊队列可作为 `guardian:pending` evidence。
- Verify consistency adapter 仍必须重新读取最终代码和文档进行独立判断。

### 10.2 Evidence 输入

Verify 报告可新增摘要：

```md
### Drift Guardian Evidence

- auto_repairs: 3
- pending_ambiguities: 1
- unresolved_violations: 0
- contract_source: docs/changes/2026-05-11-bdd/design.md#Behavior-Alignment
```

Readiness 规则：

| Guardian 状态 | Verify 影响 |
|---|---|
| 有 unresolved violation | `not_ready` |
| 有 pending ambiguity | `not_ready` 或 `needs_decision`，取决于是否涉及 current/decisions |
| 只有 auto repairs 且独立 consistency check 通过 | 可 `ready` |

---

## 11. 与 BDD 的契约关系

BDD 提案定义：

```text
behavior.md = 用户确认的主行为契约
design.md / Behavior Alignment = AI 实现对齐表
```

Guardian 使用顺序：

```text
1. behavior.md 提供行为场景和 Must Not
2. Behavior Alignment 表提供场景 → 设计 → 文件/模块映射
3. docs/current/* 提供已生效稳定约束
4. docs/decisions/* 提供全局决策约束
```

当冲突发生时，Guardian 不裁决行为变更，只负责标记：

| 冲突 | Guardian 行为 |
|---|---|
| design 与 behavior 冲突 | pending ambiguity，要求人工确认 |
| code 与 behavior 冲突 | violation，等待 verify 独立判断 |
| behavior 与 current 冲突 | needs_decision candidate |
| behavior 与 decisions 冲突 | needs_decision candidate |

---

## 12. 模块影响

| 文件 / 模块 | 变更类型 | 说明 |
|---|---|---|
| `src/index.ts` | 扩展 | OpenFlowPlugin 初始化时启动 ContractRuntime 并注册 Guardian consumer |
| `src/hooks/tool-after.ts` | 扩展 | 复用现有 write/edit change tracking，额外通知 ContractRuntime |
| `src/hooks/chat-message.ts` | 扩展 | 用户中断、完成信号、pending reminder 通知 |
| `src/contracts/runtime.ts` | 新增 | Contract Runtime 单例，管理 contract、事件、consumer、evidence sink |
| `src/drift/guardian-consumer.ts` | 新增 | Guardian 作为 Contract Runtime consumer |
| `src/drift/scoped-job.ts` | 新增 | feature/session scoped 检查任务 |
| `src/contracts/openflow-contract.ts` | 新增 | 共享 OpenFlowContract 类型，不作为 Guardian 私有类型 |
| `src/contracts/contract-extractor.ts` | 新增 | 从 behavior/design/current/decisions 提取统一 contract，供 BDD/Guardian/verify/mapper 共用 |
| `src/drift/diff-engine.ts` | 新增 | 基于 OpenFlowContract 的执行期文件级 + 符号级 drift 检查；不重复实现 verify adapter 解析逻辑 |
| `src/drift/repair-coordinator.ts` | 新增 | 确定性自动修复与乐观并发控制 |
| `src/drift/state-store.ts` | 新增 | `.sisyphus/openflow/guardian/` 状态读写 |
| `src/adapters/consistency/design-drift.ts` | 复用/扩展 | 读取 OpenFlowContract 并独立检查最终状态 |
| `src/phases/archive/implementation-mapper.ts` | 复用/扩展 | 使用 contract + verify evidence 建立追溯 |
| `src/types.ts` | 扩展 | 新增 Drift Guardian 状态、evidence 类型、GuardianConfig，必要时导出 contract 类型 |
| `src/config.ts` | 扩展 | 新增 Guardian 配置校验和默认配置合并 |

---

## 13. 配置模型

建议新增：

```json
{
  "openflow": {
    "guardian": {
      "enabled": true,
      "auto_start": true,
      "auto_fix": true,
      "max_retries": 3,
        "state_dir": ".sisyphus/openflow/guardian",
      "contract_cache": true
    }
  }
}
```

默认行为：

- `enabled: true`
- `auto_start: true`
- `auto_fix: true`，但仅对明确 bug 生效
- 没有 active contract 时 idle，不做 LLM 调用

---

## 14. 风险与缓解

| 风险 | 缓解 |
|---|---|
| Guardian 自动修错 | 仅在确定性、低风险、唯一修复场景自动修；verify 独立复核 |
| 与主 agent 并发写冲突 | 乐观并发 + edit-only + 3 次重试，失败降级人工确认 |
| 多 feature 命中同一文件 | Contract Runtime 统一调度，Guardian consumer 将冲突降级为 pending ambiguity |
| Guardian 状态污染 archive | 临时缓存与 archive evidence 分离，只将必要 evidence 写入 mapper |
| 与 verify 职责重叠 | 明确 Guardian 是维护器，verify adapter 是最终裁判 |
| 契约解析口径漂移 | 所有模块共用 OpenFlowContract |
| 空闲常驻浪费资源 | 无 active contract / event 时 idle，源 hash 未变复用缓存 |

---

## 15. 验收标准

实现完成后应满足：

1. OpenFlow 插件加载时能启动单例 `ContractRuntime` 并注册 Guardian consumer。
2. Guardian 在无 active contract 时保持 idle，不触发 LLM 检查。
3. Contract Runtime 能从 `behavior.md` 和 `Behavior Alignment` 表提取 `OpenFlowContract`。
4. `OpenFlowContract` 被 Guardian、verify consistency adapter、implementation mapper 共用。
5. 文件 `write` / `edit` 后，Guardian 能识别是否命中 active alignment item。
6. 明确 bug 能被 Guardian 自动修复并记录到 `repairs.jsonl`。
7. 模糊项不会自动修复，会写入 `pending/{sessionId}.json`。
8. 自动修复采用 edit-only，且并发冲突时最多重试 3 次。
9. 中断后 Guardian 能从 `.sisyphus/openflow/guardian/` 恢复状态。
10. verify 报告能读取 Guardian evidence，但 consistency adapter 会独立重新检查最终状态。
11. 有 unresolved violation 或 pending ambiguity 时，verify readiness 不得为 `ready`。
12. archive 后会清理对应 feature/session 的临时 Guardian 缓存。
13. implementation-mapper 能引用 Guardian repair / pending evidence，但最终追溯仍以 verify evidence 为准。
14. Guardian 不会自动修改 `docs/current/*` 或 `docs/decisions/*`。
15. 多 feature 同时命中同一文件时，Guardian 不自动修复，进入人工确认。

---

## 16. 结论

Drift Guardian 是 OpenFlow 的执行期对齐维护层：它不替代 BDD、verify 或 implementation mapper，而是把它们连接起来。

最终协作模型：

```text
BDD 定义契约
  → Contract Runtime 提取 OpenFlowContract
  → Guardian 执行期确定性维护
  → Verify 独立裁判
  → Mapper 归档追溯
```

这保证 OpenFlow 不只是“最后能验证”，而是在 AI 实施过程中持续防止文档与代码漂移。
