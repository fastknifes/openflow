# bdd - Behavior-first SDD Design

**日期**: 2026-05-11  
**Feature**: bdd  
**状态**: Draft  

---

## 1. 问题陈述

OpenFlow 当前采用 markdown 文档约束 AI 开发，核心流程是：

```text
brainstorm → implement → harden → verify → archive
```

该模式已经能通过 `design.md`、`requirements.md`、`docs/current/*`、`docs/decisions/*` 建立 SDD 风格的文档治理。但当前仍存在一个关键问题：

> 文档主要是写给 AI 和工程治理看的，用户很难只通过阅读一份文档确认“系统最终应该表现成什么样”。

现有 SDD 文档常见问题包括：

1. **用户阅读负担高**：设计、需求、决策、验证、归档文档各自有价值，但用户不应被要求阅读全部文档才能确认行为。
2. **行为契约不集中**：用户真正关心的是可感知行为、边界行为和禁止行为，但这些内容分散在不同文档中。
3. **设计文档偏 AI 内部语境**：`design.md` 适合描述实现方案、模块边界和工程约束，不适合作为唯一的人类确认入口。
4. **verify 缺少行为逐条对齐目标**：当前 verify 可以生成 evidence/readiness，但缺少一份用户确认过的行为场景清单作为逐条验收对象。
5. **archive 追溯链仍偏工程实现**：归档可以映射 requirements/design 到代码，但还不能稳定表达“用户确认的行为 → 验证证据 → 实现”的链路。

本功能的目标不是引入完整 BDD 框架，而是将 BDD 的“行为先行、场景可验证”思想落入 OpenFlow 的 markdown 文档治理体系，并成为 **Contract Runtime** 的主要契约来源之一。

从全局架构看，BDD 不只是新增一个文件，而是回答 OpenFlow 治理链路里的第一性问题：**什么是正确的用户可感知行为？** 这个答案必须被统一解析为 `OpenFlowContract`，再被 Drift Guardian、verify adapters 和 archive mapper 复用。

---

## 2. 设计目标

### 2.1 核心目标

1. **引入 behavior-first 主契约**
   - 在 feature/change 工作区中生成 `behavior.md`。
   - `behavior.md` 是用户主要阅读和确认的行为契约。
   - 其他 AI 面向文档必须与 `behavior.md` 对齐。

2. **保持 OpenFlow 轻量**
   - 不强制引入 Cucumber、Gherkin、step definitions 或其他 BDD 测试框架。
   - 采用 BDD-style markdown 行为场景表达。
   - 未来允许项目自行接入标准 BDD 框架，但 OpenFlow 本体不依赖它。

3. **明确文档分层**
   - `behavior.md`：人类可读行为契约，描述系统外显行为。
   - `design.md`：AI/工程面向设计，解释如何实现行为契约。
   - `requirements.md` / `prd.md`：需求来源与需求整理。
   - `verify evidence`：逐条证明行为是否被验证。
   - `implementation-mapper.md`：归档时建立 behavior → evidence → code 的追溯链。

4. **verify 逐条对齐 behavior**
   - `/openflow-verify` 需要识别 `behavior.md`。
   - 对每个行为场景输出证据状态：verified / missing_evidence / failed / not_applicable。
   - readiness 需要考虑行为场景是否有足够证据。

5. **archive 归档并提升稳定行为**
   - `behavior.md` 必须复制到 archive 快照。
   - 已验证且稳定的行为应 promotion 到 `docs/current/spec/*` 或 `docs/current/requirements/*`。
   - promotion 不能自动覆盖冲突的 current/decisions，冲突时进入 `needs_decision`。

6. **建立 Contract Runtime 契约层**
   - BDD 负责定义用户行为契约和 Behavior Alignment 表。
   - `OpenFlowContract` 负责把 `behavior.md`、`design.md`、`docs/current/*`、`docs/decisions/*` 解析为统一中间格式。
   - Contract Runtime 负责缓存、失效、变更命中、evidence 引用和消费方传递。
   - Drift Guardian、verify evidence adapters、archive mapper 都消费 Contract Runtime，而不是各自重复解释文档。

### 2.2 非目标

1. 不引入强制 BDD 测试框架。
2. 不要求用户阅读 `design.md`、`requirements.md`、`implementation-mapper.md` 才能确认行为。
3. 不把所有内部设计细节写入 `behavior.md`。
4. 不让 `behavior.md` 替代 ADR、架构设计或实现计划。
5. 不把每个低价值分支都写成行为场景。
6. 不在未经用户确认时自动改变已生效的 `docs/current/*` 或 `docs/decisions/*`。

---

## 3. 用户与使用场景

### 3.1 主要使用者

主要使用者是 **内部开发者**，包括：

- 使用 OpenFlow 的研发人员
- AI agent / 子代理
- reviewer / verifier

但该功能间接服务业务/产品参与者：

> 用户只需要阅读和确认 `behavior.md`，不需要理解全部 AI 面向文档。

### 3.2 核心使用场景

1. 用户提出 feature 或行为变更。
2. `/openflow-brainstorm` 澄清需求后生成 `behavior.md`。
3. 用户确认 `behavior.md` 是否准确表达预期行为。
4. AI 基于 `behavior.md` 生成或更新 `design.md`、计划和实现。
5. `/openflow-verify` 逐条检查行为场景是否有证据支持。
6. `/openflow-archive` 归档 `behavior.md`，并将稳定行为 promotion 到 current 文档。

---

## 4. 文档权威与优先级

### 4.1 行为优先原则

`behavior.md` 是用户确认的主行为契约，但它的权威范围限定在当前 change workspace 内。

当 `behavior.md` 与其他文档或实现冲突时，默认规则是：

```text
在当前 change 内：behavior.md 优先
  → design.md / requirements.md / implementation 必须回到 behavior.md 对齐
  → 如果需要改变 behavior.md，必须重新获得用户确认

跨越 current / decisions 边界：current / decisions 不能被 behavior 自动覆盖
  → 进入 needs_decision
  → 必须由用户裁决是否改变长期事实或全局规则
```

### 4.2 推荐优先级

```text
1. docs/changes/{feature}/behavior.md
   用户确认的本次变更行为契约

2. docs/current/spec/* / docs/current/requirements/*
   已归档并生效的当前系统行为事实

3. docs/decisions/*
   跨 feature 的全局规则与架构决策

4. docs/changes/{feature}/design.md
   AI/工程实现方案，应解释如何满足 behavior.md

5. tests / verify evidence / implementation-mapper.md
   行为验证和追溯证据
```

### 4.3 冲突处理

| 冲突类型 | 处理方式 |
|---|---|
| `design.md` 与 `behavior.md` 冲突 | 修改 design，使其对齐 behavior |
| 实现与 `behavior.md` 冲突 | verify 标记 failed 或 missing_evidence，readiness 降级 |
| `behavior.md` 与 `docs/current/*` 冲突 | 输出 `needs_decision`，不能自动覆盖 current |
| `behavior.md` 与 `docs/decisions/*` 冲突 | 输出 `needs_decision`，必须用户裁决 |
| 用户希望改变已确认 behavior | 更新 `behavior.md`，并重新进入确认/verify |

### 4.4 强化建议限制为 OMO 流程

`/openflow-harden` 的建议提示仅在 OMO（oh-my-openagent）执行环境中显示。非 OMO 用户不应看到强化建议，因为当前强化流程依赖 OMO 的多代理执行模型。此约束适用于 chat.message hook 中由验收阶段触发的自动建议。用户仍可随时手动输入 `/openflow-harden <feature>`。

---

## 5. `behavior.md` 设计

### 5.1 文件位置

变更期：

```text
docs/changes/{YYYY-MM-DD-feature}/behavior.md
```

归档期：

```text
docs/archive/{YYYY-MM-DD-feature}/behavior.md
```

稳定行为 promotion 后：

```text
docs/current/spec/{domain-or-feature}.md
或
docs/current/requirements/{domain-or-feature}.md
```

### 5.2 生成时机

`behavior.md` 应在 `/openflow-brainstorm` 阶段生成。

原因：

1. 行为契约必须先于实现。
2. 用户应先确认行为，再让 AI 生成设计和实现。
3. verify 需要以该文档作为逐条验收目标。

### 5.3 粒度原则

`behavior.md` 只描述 **关键场景**，不追求完整路径穷举。

应包含：

- 用户可感知的核心行为
- 业务语义边界
- 重要异常/历史数据/兼容场景
- 明确禁止的行为
- 可验证的验收点

不应包含：

- 内部模块拆分
- 具体代码结构
- 低价值实现细节
- 每个微小分支的穷举
- 尚未确认的架构取舍

### 5.4 固定结构

```md
# Behavior Contract: {feature}

## 1. Scope

- In Scope:
- Out of Scope:

## 2. Behavior Scenarios

### Scenario: {name}

Given:
- ...

When:
- ...

Then:
- ...

## 3. Must Not Behaviors

- The system must not ...

## 4. Boundary Scenarios

### Boundary: {name}

Given:
- ...

When:
- ...

Then:
- ...

## 5. Verification Mapping

| Behavior | Evidence Type | Expected Evidence | Status |
|---|---|---|---|
| Scenario name | test / command / manual / inspection | ... | pending |
```

---

## 6. Brainstorm 集成

### 6.1 新增产物

`/openflow-brainstorm <feature>` 在适用时生成：

```text
docs/changes/{YYYY-MM-DD-feature}/behavior.md
docs/changes/{YYYY-MM-DD-feature}/design.md
```

其中 `behavior.md` 是用户确认入口，`design.md` 是 AI 执行入口。

### 6.2 生成流程

```text
用户提出 feature
  → 问题/目标用户/约束澄清
  → 生成 behavior.md 草案
  → 用户确认或修正 behavior.md
  → 生成 design.md，使其显式对齐 behavior.md
  → 进入 planning / implementation
```

### 6.3 设计文档对齐要求

`design.md` 必须包含行为对齐章节：

```md
## Behavior Alignment

| Behavior Scenario | Design Response | Files / Modules | Risk |
|---|---|---|---|
```

该章节回答：

1. 每个行为场景由哪个设计决策支持？
2. 哪些模块/文件会承担该行为？
3. 哪些行为存在验证或实现风险？

### 6.4 当前代码迁移要求

当前 `src/config.ts` 的 `ChangeArtifactKind` 仅包含 `design`、`proposal`、`decisions`、`prd`、`plan`。实现 BDD 时必须新增 `behavior` artifact，并提供对应的 path helper。

当前 `src/phases/brainstorm/design-renderer.ts` 只渲染 `design.md`。实现 BDD 时必须新增 `behavior.md` renderer，并让 `design.md` 的 Behavior Alignment 表由同一份 requirement / behavior model 生成，避免 behavior 与 design 在生成时就分叉。

旧 change workspace 可能没有 `behavior.md` 或 Behavior Alignment 表。verify 和 archive 必须支持渐进迁移：

- 新 workspace：优先使用 `behavior.md` + Behavior Alignment。
- 旧 workspace：保留现有 design / PRD / traceability fallback，不因为缺少 behavior 文件而直接失败。
- 明确选择 BDD 模式的新 feature：缺少 behavior evidence 时 readiness 不得为 `ready`。

### 6.5 Contract Runtime 产物

Brainstorm 完成后，BDD 应提供 Contract Runtime 可解析的最小输入集合：

```text
behavior.md                 // 用户行为契约
design.md#Behavior Alignment // 行为 → 设计 → 文件/模块/符号映射
```

Contract Runtime 从这些输入生成：

```typescript
OpenFlowContract {
  behaviorScenarios
  alignmentItems
  currentConstraints
  decisionConstraints
  sourceHashes
}
```

BDD 不直接驱动 Guardian、verify 或 archive；它只负责定义正确性契约。所有运行期判断都通过 Contract Runtime 传递。

### 6.6 辅助文档生成的严格模式

BDD 引入后，brainstorm 对文档生成行为更加严格，防止产生无实质内容的文档：

- **PRD 生成**：`generatePrd()` 不再在缺少实质性设计上下文（问题陈述、概述、目标、成功标准、组件、约束或范围外项）时生成空模板。若无任何实质来源，将抛出错误而非生成占位符。
- **决策文档生成**：`ensureDecisionsDocument()` 仅在从设计目录中提取出具体约束时才生成。若未找到任何约束，将抛出错误而非创建包含占位符 "Decision 1" 的文档。
- **语义捆绑评估**：`evaluateDocumentBundle()` 在语义信号不足以区分时，回退为仅生成设计文档，而非输出完整捆绑包（design + PRD + decisions）。

这些严格约束确保仅当存在有意义的内容可供记录时，才会生成 PRD 和决策文档。

---

## 7. Verify 集成

### 7.1 行为证据检查

`/openflow-verify <feature>` 应读取：

```text
docs/changes/{feature}/behavior.md
```

并生成逐条行为证据结果：

```typescript
type BehaviorEvidenceStatus =
  | 'verified'
  | 'missing_evidence'
  | 'failed'
  | 'not_applicable'
```

每个行为场景至少输出：

- scenario name
- expected behavior
- evidence type
- evidence reference
- status
- reason

### 7.2 Readiness 规则

| 情况 | Readiness |
|---|---|
| 所有关键行为 verified | `ready` |
| 行为 verified，但需要 current/doc promotion | `ready_with_doc_updates` |
| 任一关键行为 failed | `not_ready` |
| 任一关键行为缺少证据 | `not_ready` |
| 行为与 current/decisions 冲突 | `needs_decision` |

### 7.3 Evidence Packet 增强

Verify evidence packet 应新增行为对齐摘要：

```md
## Behavior Alignment Evidence

| Scenario | Status | Evidence | Notes |
|---|---|---|---|
```

该表是 archive 和 implementation-mapper 的输入。

### 7.4 与现有 verify adapters 的关系

当前 verify adapter 基础设施已经存在，security / consistency adapters 不应重新实现。BDD 的 verify 集成应作为现有 `/openflow-verify` 的增强：

1. 在 evidence collection 前从 Contract Runtime 读取 `OpenFlowContract`。
2. 将 contract 传递给 consistency adapters，尤其是 `DesignDriftAdapter`。
3. 在现有 `VerifyEvidencePacket` 旁增加行为对齐摘要，或在兼容字段中附加 Behavior Alignment Evidence。
4. `classifyReadiness()` 聚合行为级结果、adapter 结果、Guardian pending/violation 结果。

如果 feature 没有 `behavior.md`，verify 应根据 feature 是否启用 BDD 模式判断：旧 feature 可 fallback，新 BDD feature 则标记 `missing_evidence`。

---

## 8. 对齐监控：Drift Guardian 协同

### 8.1 动机

`/openflow-verify` 的对齐检查是"期末考"模式——只在验证阶段执行。但 SDD 在实践中，代码变更发生在实现过程的每一刻，设计文档与代码之间的漂移可能在 verify 之前就已经积累了很长时间。

BDD 引入的 `behavior.md` 和 `Behavior Alignment` 表格为漂移检测提供了**结构化的对齐基准**，但需要一个持续运行的后台监测层来利用它们。

### 8.2 协同模型

```
BDD（本功能）
  → 定义 behavior.md + Behavior Alignment
  → Contract Runtime 提取 OpenFlowContract
  → Drift Guardian 执行期监测与确定性修复
  → Verify 独立裁判 evidence/readiness
  → Archive 归档追溯与 current promotion
```

BDD 与 Drift Guardian 是**契约来源与契约运行时消费者**的关系。BDD 定义“什么是对的”；Contract Runtime 统一表达“什么是对的”；Drift Guardian 只在 Contract Runtime 给出的确定性边界内监测和修复。

### 8.3 断层分工

| | BDD / Verify | Drift Guardian |
|---|---|---|
| **运行时机** | `/openflow-verify` 调用时 | `/start-work` 启动后持续后台运行 |
| **检查对象** | behavior.md 中的行为场景 | 所有与 Behavior Alignment 表关联的代码文件 |
| **检测粒度** | 行为级（逐场景验收） | 文件级 + 符号级（契约匹配） |
| **响应方式** | 证据报告 → readiness 状态 | 实时预警（hook 注入）→ 自动修复 → 模糊情况入队 |
| **修复能力** | 不自动修复 | 高置信度漂移自动修复文档 |
| **依赖** | behavior.md + test evidence + OpenFlowContract | OpenFlowContract + file-tracker |

### 8.4 Behavior Alignment 表作为 Contract Runtime 输入

`design.md` 中的 Behavior Alignment 表不是 Drift Guardian 私有输入，而是 Contract Runtime 的核心输入：

```md
| Behavior Scenario | Design Response | Files / Modules | Risk |
|---|---|---|---|
| 用户登录 | JWT + refresh token | src/auth/login.ts | 低 |
| 权限校验 | RBAC 中间件 | src/middleware/rbac.ts | 中 |
```

Contract Runtime 运行时：
1. 解析此表 → 提取 `{ scenario, designResponse, files, modules, expectedSymbols, risk }`
2. 将结果写入 `OpenFlowContract.alignmentItems`
3. 供 Guardian / verify adapters / archive mapper 共同消费

Drift Guardian 不直接重新解析表格，只消费 `OpenFlowContract`。

### 8.5 与现有 verify 的关系

Drift Guardian 不会取代 verify 的对齐检查，而是让它更轻松：

- **无 Guardian**：verify 时可能需要修复积累的大量漂移
- **有 Guardian**：大多数漂移已在实施过程中被实时修复，verify 只需对残余模糊项做最终确认

### 8.6 实现说明

Drift Guardian 已作为本功能的一部分实现（非延迟项）。集成点包括：

- `src/index.ts`：插件启动时自动启动 ContractRuntime 并注册 GuardianConsumer
- `src/hooks/chat-message.ts`：会话结束时将事件分派给 Guardian
- `src/hooks/tool-after.ts`：文件变更时通知 ContractRuntime
- `src/commands/verify.ts`：加载守卫证据（自动修复次数、待处理模糊项、待解决违规项）并将其注入一致性适配器上下文
- `src/phases/archive/implementation-mapper.ts`：在 implementation-mapper 中渲染 Drift Guardian Evidence 章节

---

## 9. Archive 集成

### 9.1 归档规则

`/openflow-archive <feature>` 必须：

1. 将 `behavior.md` 复制到 archive 快照。
2. 读取 verify 的 behavior evidence。
3. 在 `implementation-mapper.md` 中建立行为追溯链。
4. 将稳定行为 promotion 到 `docs/current/spec/*` 或 `docs/current/requirements/*`。
5. 如 promotion 与 current/decisions 冲突，则停止并输出 `needs_decision`。

### 9.2 implementation-mapper 增强

`implementation-mapper.md` 应支持以下追溯链：

```text
Behavior Scenario → Verification Evidence → Code Files / Symbols
```

推荐表格：

```md
| Behavior Scenario | Evidence | Code Files | Key Symbols | Notes |
|---|---|---|---|---|
```

当前 `src/phases/archive/implementation-mapper.ts` 已经生成需求/决策到代码的追溯表。BDD 不应替换该表，而应新增行为追溯 section 或在现有表中追加 behavior source 行。推荐策略：

- 保留现有 `需求到实现映射`，维持旧 archive 可读性。
- 新增 `行为到实现映射` section，使用 Behavior Scenario → Evidence → Code Files / Symbols。
- 如果没有 `behavior.md`，继续使用现有 requirements/design fallback。
- 如果有 `behavior.md` 但某个关键行为缺证据，archive 应阻止或进入 `not_ready` / `needs_decision`，不得生成看似完整的行为追溯。

### 9.3 Current Promotion

promotion 原则：

- 已验证且长期有效的行为进入 `docs/current/spec/*`。
- 需求边界或业务约束进入 `docs/current/requirements/*`。
- 跨 feature 的规则候选进入 `docs/decisions/*`，但必须用户确认后才生效。
- 未验证行为不得 promotion。

---

## 10. 可选 BDD 框架集成

### 10.1 当前阶段

当前阶段不强制引入标准 BDD 框架。

OpenFlow 只定义 markdown 行为契约：

```text
behavior.md
```

### 10.2 未来扩展

未来可选支持：

```text
features/{feature}/*.feature
```

如果项目自行接入 Cucumber/Gherkin，OpenFlow 可在 verify 阶段读取其执行结果，并将 `.feature` 场景映射回 `behavior.md`。

规则：

- `.feature` 文件不能替代 `behavior.md`。
- `behavior.md` 仍是用户主契约。
- BDD 框架执行结果只是 behavior evidence 的一种来源。

---

## 11. 风险与缓解

| 风险 | 缓解 |
|---|---|
| `behavior.md` 膨胀成第二份 design | 只写用户可感知行为、边界和禁止行为，不写实现细节 |
| 行为文档与设计文档漂移 | verify 检查 design/implementation 是否对齐 behavior；另外由 Drift Guardian 后台 Agent 持续监测三重对齐（code ↔ design ↔ behavior），在代码变更时实时预警，对可自动修复的漂移直接修正，对模糊情况留到任务结束后提醒用户决策 |
| 用户仍需要读太多文档 | 明确 `behavior.md` 是唯一用户确认入口 |
| verify 无法证明某些行为 | 标记 `missing_evidence`，readiness 降级为 `not_ready` |
| promotion 覆盖已有 current/decision | 冲突时输出 `needs_decision`，不自动覆盖 |
| 可选 BDD 框架导致复杂度上升 | 框架只作为 evidence provider，不进入 OpenFlow 必选路径 |

---

## 12. 验收标准

实现完成后应满足：

1. `/openflow-brainstorm <feature>` 能生成 `behavior.md` 草案。
2. `behavior.md` 包含行为场景、禁止行为、边界场景和验证映射。
3. 用户可以只阅读 `behavior.md` 来确认本次功能的外显行为。
4. `design.md` 包含 Behavior Alignment 章节，并显式对齐 `behavior.md`。
5. `/openflow-verify` 能读取 `behavior.md` 并输出逐条行为证据状态。
6. 任一关键行为 failed 或 missing_evidence 时，readiness 不得为 `ready`。
7. behavior 与 current/decisions 冲突时，readiness 应为 `needs_decision`。
8. `/openflow-archive` 会复制 `behavior.md` 到 archive 快照。
9. archive 会将稳定且已验证的行为 promotion 到 `docs/current/spec/*` 或 `docs/current/requirements/*`。
10. `implementation-mapper.md` 能体现 Behavior Scenario → Evidence → Code 的追溯链。
11. 不强制引入 Cucumber/Gherkin/step definitions。
12. 项目如自行接入标准 BDD 框架，其结果只能作为 behavior evidence 来源，不替代 `behavior.md`。

---

## 13. 一句话总结

`bdd` 功能不是把 OpenFlow 改造成标准 BDD 测试框架，而是引入 **Behavior-first SDD**：以 `behavior.md` 作为用户可读、用户确认的主行为契约，其他 AI 面向文档、verify evidence、archive promotion 和 implementation mapping 都必须围绕它对齐。**Drift Guardian** 作为独立协同功能，负责在实施过程中持续保障这份对齐不被破坏。
