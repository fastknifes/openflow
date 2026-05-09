# openflow-issue - Design

**日期**: 2026-05-09  
**Feature**: openflow-issue  
**状态**: Design  

---

## 1. 问题陈述

OpenFlow 当前主流程更适合 feature/change：

```text
brainstorm → implement → harden → verify → archive
```

该流程的核心价值是通过文档约束 AI，让实现符合设计、需求、当前事实和全局决策。但用户在实际开发中经常输入的是“不确定性质的问题”，例如：

- 某个接口结果不对
- 某条线上数据展示异常
- 某个状态没有流转
- 某个用户看不到预期信息
- 某段历史数据和当前规则冲突

这些输入不能直接假设为 bug。它们可能是：

- 实现缺陷
- 数据问题
- 配置问题
- 环境问题
- 文档语义不清
- 用户期望变化
- 当前业务规则需要重新裁决

如果 AI 在未澄清需求、约束和当前项目语义前直接修代码，容易出现“修掉现象，但破坏语义”的问题。典型风险包括：

1. 将数据异常误判为代码缺陷
2. 将需求变更伪装成 bugfix
3. 在没有业务裁决的情况下改变用户可见行为
4. 修复单一路径但遗漏同语义下的其他入口
5. 修复后无法说明它是否符合 `docs/current/*` 和 `docs/decisions/*`

因此需要一个面向“不确定问题”的单命令入口，用于需求澄清、约束澄清、证据调查、语义对齐和问题分诊。

---

## 2. 设计目标

新增命令：

```text
/openflow-issue <issue-name-or-description>
```

该命令不直接等同于 bug 修复命令，也不替代 `/openflow-brainstorm`。它的目标是：

> 接收一个不确定性质的问题，先明确用户期望、修复边界、当前项目语义和证据，再判断下一步是直接修复、处理数据、修配置、继续调查、询问用户，还是升级到 brainstorm。

### 2.1 核心目标

1. **不预设问题类型**
   - 用户输入 issue 时，系统不能默认它是 bug。

2. **需求澄清前置**
   - 先明确用户认为哪里不对、期望行为是什么、该期望是否属于已有系统语义。

3. **约束澄清前置**
   - 明确哪些数据、接口、历史行为、用户可见行为和业务规则不能被改变。

4. **证据调查只读化**
   - 调查阶段只能读取代码、文档、日志、配置、测试和数据；不能修改代码或数据。

5. **语义对齐**
   - 修复前必须判断当前项目语义是什么，以及现象是否违反该语义。

6. **分类分诊**
   - 将问题分类为 bugfix、data_issue、config_issue、environment_issue、doc_ambiguity、behavior_change 或 cannot_determine。

7. **明确下一步 gate**
   - 输出允许动作、禁止动作、是否需要用户澄清、是否需要 brainstorm、是否建议 harden/verify/archive。

8. **语义治理提升**
   - 当 issue 暴露出需求未澄清、约束不足或当前语义空白时，澄清结果不能只服务本次修复，必须形成可提升到 `docs/current/*` 或 `docs/decisions/*` 的治理候选。

9. **保持用户入口简单**
   - 对用户只暴露一个命令，内部多阶段执行。

---

## 3. 非目标

`/openflow-issue` 不做以下事情：

1. 不替代 `/openflow-brainstorm`
2. 不直接实现修复
3. 不默认生成完整 feature design
4. 不默认 archive
5. 不作为第二套 OpenFlow orchestrator
6. 不在调查阶段修改代码、数据或配置
7. 不把所有 issue 都强制升级为 feature/change
8. 不对业务语义自行拍板
9. 不把未经用户确认的业务规则直接写入 `docs/decisions/*`

---

## 4. 命令形态

### 4.1 基本入口

```text
/openflow-issue <issue-name-or-description>
```

示例：

```text
/openflow-issue ant-chain-give-display
/openflow-issue api/ticket/user/ant/chain/give/out/2761095?category=give 展示不出蚂蚁链信息
```

### 4.2 可选参数

```text
--name <name>          指定 issue 工作区名称
--env <env>            local | staging | production
--readonly             强制只读调查模式
--write-doc            将 issue clarification 写入 docs/changes
--no-doc               只输出结果，不写文档
--continue             基于已有 issue clarification 继续调查
```

默认行为：

- 简单 issue：只输出命令结果，不落长期文档
- 复杂或线上 issue：建议写入 `docs/changes/{YYYY-MM-DD-issue}/issue-clarification.md`
- 生产环境：默认只读，禁止破坏性操作

---

## 5. 阶段设计

`/openflow-issue` 内部分为八个阶段：

```text
Issue Intake
  → Requirement Clarification
  → Constraint Clarification
  → Evidence Investigation
  → Semantic Alignment
  → Classification
  → Next Action Gate
  → Governance Promotion
```

---

## 6. Phase 1：Issue Intake

### 6.1 职责

将用户的自然语言问题标准化为可调查对象。

### 6.2 输入

可接收：

- 问题现象
- 接口、页面、命令、session 或日志片段
- 样本 ID
- 报错信息
- 环境信息
- 影响范围
- 用户期望行为

### 6.3 输出结构

```md

## Issue Intake
- Symptom:
- Entry Point:
- Sample Data:
- Environment:
- User Expected Behavior:
- Known Impact:
- Initial Unknowns:
```

### 6.4 约束

- 不能假设问题是 bug
- 不能假设必须改代码
- 不能在 intake 阶段给出修复结论

---

## 7. Phase 2：Requirement Clarification

### 7.1 职责

明确用户到底期望系统做什么。

### 7.2 必答问题

1. 用户认为哪里不对？
2. 用户期望的行为是什么？
3. 该期望是否能从当前文档、现有行为、测试或用户明确说明中得到支持？
4. 该期望是在恢复已有语义，还是提出新行为？

### 7.3 输出结构

```md

## Requirement Clarification
- User Expectation:
- Expected Business Meaning:
- Existing Support:
- Missing Information:
- Requirement Risk:
```

### 7.4 约束

如果用户期望无法从当前项目语义推导出来，不能直接归类为 bugfix。

---

## 8. Phase 3：Constraint Clarification

### 8.1 职责

明确后续修复不能越过的边界。

### 8.2 约束维度

必须尽量澄清：

- 数据是否允许修改
- 历史数据是否需要兼容
- 是否允许改变用户可见行为
- 是否允许改变接口返回结构
- 是否允许新增过滤条件
- 是否允许补数据、补链、补状态、补记录
- 是否影响权限、金额、订单、库存、状态机等高风险领域
- 是否需要兼容旧客户端或旧数据
- 是否允许只修某个入口，还是必须覆盖所有同语义入口

### 8.3 输出结构

```md

## Constraints
- Must Preserve:
- May Change:
- Must Not Change:
- Data Handling Policy:
- Backward Compatibility:
- User-visible Behavior:
- High-risk Domains:
- Open Questions:
```

### 8.4 必须询问用户的情况

遇到以下情况不能由 AI 自行决定：

1. 涉及业务规则取舍
2. 涉及历史数据处理策略
3. 涉及用户可见行为变化
4. 涉及金额、权限、订单、状态流转等高风险域
5. 文档与代码冲突
6. 多种修复方案都合理，但业务含义不同
7. 修复可能从 bugfix 变为 behavior change

询问必须具体，例如：

```text
force_sell_destroy 是否应该出现在用户赠送券列表？
历史 force_sell_destroy 记录是否需要补链？
uid=0 的记录是否视为无效用户券？
```

禁止泛泛询问：

```text
你要不要我修？
```

---

## 9. Phase 4：Evidence Investigation

### 9.1 职责

通过只读方式收集事实证据。

### 9.2 可执行动作

- 读取代码调用链
- 查询 GitNexus impact/context
- 查阅 `docs/current/*`
- 查阅 `docs/decisions/*`
- 查阅相关 archive / implementation mapper
- 读取日志
- 执行只读 SQL
- 检查配置
- 本地复现
- 运行只读测试或诊断命令

### 9.3 禁止动作

- 禁止修改代码
- 禁止修改数据
- 禁止执行 destructive 命令
- 禁止直接提交修复
- 禁止将未经验证的猜测写成根因

### 9.4 输出结构

```md

## Evidence
- Code Path:
- Data Evidence:
- Logs:
- Config:
- Reproduction:
- Excluded Hypotheses:
- Remaining Unknowns:
```

---

## 10. Phase 5：Semantic Alignment

### 10.1 职责

将证据与当前项目语义对齐，判断现象是否违反既有语义。

### 10.2 语义来源优先级

```text
1. docs/current/*
2. docs/decisions/*
3. docs/archive/*/implementation-mapper.md
4. 现有稳定代码行为
5. 测试用例
6. 用户明确确认
```

### 10.3 必答问题

1. 当前功能本来是什么意思？
2. 当前现象违反了哪条语义？
3. 还是这块语义未定义？
4. 修复是否会改变已有业务含义？
5. 是否存在代码与文档冲突？

### 10.4 输出结构

```md

## Semantic Alignment
- Current Semantics:
- Violated Semantics:
- Undefined Semantics:
- Relevant Docs:
- Relevant Code Behavior:
- Semantic Risk:
```

### 10.5 约束

如果语义未定义或存在冲突，不能直接进入实现。必须输出 `doc_ambiguity`、`behavior_change` 或 `needs_user_clarification`。

---

## 11. Phase 6：Classification

### 11.1 职责

将 issue 分类，决定问题本质。

### 11.2 分类类型

| 类型 | 定义 | 下一步 |
|---|---|---|
| `bugfix` | 当前语义明确，当前行为违反语义，修复是恢复原有行为 | 允许实现 |
| `data_issue` | 代码基本符合语义，异常来自脏数据、历史数据或异常状态 | 数据处置 / 保护性修复 |
| `config_issue` | 异常由配置导致 | 配置修正 |
| `environment_issue` | 异常由环境、依赖、部署或运行时状态导致 | 环境修复 |
| `doc_ambiguity` | 文档/代码不足以判断正确语义 | 用户澄清 / 决策 / brainstorm |
| `behavior_change` | 用户期望与当前语义不一致，需要改变规则 | brainstorm |
| `cannot_determine` | 证据不足，无法分类 | 继续调查 |

### 11.3 输出结构

```md

## Classification
- Type:
- Confidence:
- Reason:
- Evidence:
- Risks:
```

### 11.4 分类规则

`bugfix` 必须同时满足：

- 当前语义明确
- 当前行为违反语义
- 修复是恢复原有行为
- 不改变业务规则
- 不需要用户裁决

`behavior_change` 任一满足即可：

- 用户期望与当前语义不一致
- 需要引入新业务规则
- 会改变用户可见行为
- 会改变接口契约
- 会影响长期文档事实

`doc_ambiguity` 任一满足即可：

- 文档未定义相关语义
- 代码存在多种相互矛盾行为
- 历史数据无法判断正确处理方式
- 多种修复方案都合理但业务含义不同

---

## 12. Phase 7：Next Action Gate

### 12.1 职责

根据分类输出下一步行动边界。

### 12.2 分流规则

```text
bugfix
  → allow implement

data_issue
  → recommend data remediation / protective code / user decision

config_issue
  → recommend config fix

environment_issue
  → recommend environment fix

doc_ambiguity
  → ask user / create decision / brainstorm

behavior_change
  → /openflow-brainstorm <feature>

cannot_determine
  → continue investigation
```

### 12.3 输出结构

```md

## Next Action Gate
- Decision:
- Allowed Actions:
- Blocked Actions:
- Needs User Clarification:
- Needs Brainstorm:
- Needs Harden:
- Needs Verify:
- Needs Archive:
- Needs Governance Promotion:
```

---

## 13. Phase 8：Governance Promotion

### 13.1 职责

将 issue 过程中澄清出的长期语义、需求边界和约束候选整理为治理输出，避免同类问题在未来重复依赖临时判断。

该阶段回答：

> 这次 issue 暴露出的语义澄清，是否应该成为项目的长期事实或全局决策？

### 13.2 触发条件

任一条件满足时必须进入 Governance Promotion：

1. issue 被分类为 `doc_ambiguity`
2. issue 被分类为 `behavior_change`
3. 用户澄清了新的业务边界
4. 修复依赖历史数据处理策略
5. 修复依赖用户可见行为定义
6. 修复依赖跨 feature 的通用规则
7. 同类问题未来可能再次出现
8. verify 发现实现与 current/docs/decisions 存在语义空白

### 13.3 提升目标

澄清结果按性质进入不同位置：

| 澄清结果 | 提升目标 | 说明 |
|---|---|---|
| 当前系统事实 | `docs/current/requirements/*` / `docs/current/spec/*` | 描述系统现在应如何工作 |
| 当前设计约束 | `docs/current/design/*` | 描述稳定结构、边界或技术语义 |
| 跨 feature 全局规则 | `docs/decisions/ADR-*.md` | 必须经过用户确认后生效 |
| 单次 issue 处理记录 | `issue-resolution.md` | 只作为历史证据，不提升为全局规则 |
| 不成熟讨论 | `issue-clarification.md` | 保留在 changes，不进入 current/decisions |

### 13.4 输出结构

```md

## Governance Promotion
- Promotion Needed:
- Promotion Type:
- Target Location:
- Proposed Wording:
- Requires User Approval:
- Reason:
- Not Promoted Because:
```

### 13.5 强制约束

- AI 可以提出 `docs/decisions/*` 候选，但不能在未获用户确认时让决策生效。
- `docs/current/*` 只能记录已经通过 issue 澄清、verify 或 archive 证据支撑的当前事实。
- 如果澄清结果只影响本次修复，不具备长期复用价值，则不得强行提升为全局规则。
- 如果澄清结果会改变已有 current/decisions，必须输出 `needs_decision`，不能自动覆盖。

---

## 14. 产物设计

### 14.1 主产物：issue-clarification.md

复杂 issue 或用户显式要求写文档时，产出：

```text
docs/changes/{YYYY-MM-DD-issue-name}/issue-clarification.md
```

结构：

```md

# Issue Clarification

## 1. Issue Intake

## 2. Requirement Clarification

## 3. Constraint Clarification

## 4. Evidence

## 5. Semantic Alignment

## 6. Classification

## 7. Next Action Gate

## 8. Governance Promotion
```

### 14.2 治理候选产物：promotion-candidate.md

当 issue 暴露出可复用的语义约束，但尚未进入 archive 或尚未获得用户确认时，可生成：

```text
docs/changes/{YYYY-MM-DD-issue-name}/promotion-candidate.md
```

结构：

```md

# Promotion Candidate

## Source Issue

## Clarified Requirement

## Clarified Constraints

## Proposed Current Update

## Proposed Decision

## Approval Needed

## Rationale
```

该产物是候选，不代表已经成为全局规则。

### 14.3 后续产物：issue-resolution.md

当 issue 进入修复并完成验证后，归档阶段可生成：

```text
docs/archive/{YYYY-MM-DD-issue-name}/issue-resolution.md
```

结构：

```md

# Issue Resolution

## Symptom

## Evidence

## Semantic Contract

## Root Cause

## Fix Decision

## Implementation Summary

## Verification Evidence

## Governance Promotion

## Residual Risk
```

### 14.4 与 implementation-mapper 的关系

如果 issue 修复修改了代码，archive 阶段应将修复映射到：

```text
implementation-mapper.md
```

映射重点：

- issue → root cause
- root cause → changed symbols/files
- changed symbols/files → tests/verification
- semantic contract → preserved behavior
- clarified constraints → promoted current/decision entries

---

## 15. 与现有 OpenFlow 命令的关系

### 15.1 `/openflow-brainstorm`

仅在以下情况下从 issue 升级：

- `behavior_change`
- `doc_ambiguity`
- `new_policy_needed`
- `multiple_valid_semantics`
- 用户明确希望设计新行为

### 15.2 `/openflow-harden`

复杂 issue 修复后建议运行。触发条件：

- 多文件改动
- 涉及状态机、权限、金额、订单、库存、数据流
- 涉及历史数据兼容
- 涉及线上事故级问题
- 涉及公共接口或用户可见行为

`harden` 审查重点应扩展为：

- 修复是否恢复语义，而不是改变语义
- 是否遗漏同语义入口
- 是否把数据问题误修成代码问题
- 是否引入新的用户可见行为变化

### 15.3 `/openflow-verify`

需要支持 issue-aware 模式。

识别规则：

```text
docs/changes/{name}/design.md exists
  → feature mode

docs/changes/{name}/issue-clarification.md exists
  → issue mode

both exist
  → mixed mode
```

issue mode verify 检查：

- root cause 是否关闭
- semantic contract 是否仍成立
- recommended action 是否执行
- 是否引入 behavior change
- 是否需要更新 current/spec/decisions
- governance promotion 是否已被处理：无需提升、已生成候选、已获用户确认或仍需决策

Readiness 状态沿用：

- `ready`
- `ready_with_doc_updates`
- `not_ready`
- `needs_decision`

### 15.4 `/openflow-archive`

需要支持 issue-aware archive。

archive 输入：

- `issue-clarification.md`
- `promotion-candidate.md`（如存在）
- verify evidence
- git diff / changed files
- tests / checks

archive 输出：

- `issue-resolution.md`
- 必要时生成或补充 `implementation-mapper.md`
- 将已确认的当前事实 promotion 到 `docs/current/*`
- 将已确认的全局规则写入 `docs/decisions/*`
- 对未确认但有价值的规则保留为候选，不得自动生效

---

## 16. 用户交互规则

### 16.1 必须问用户

以下情况必须问：

- 涉及业务语义裁决
- 涉及历史数据处理
- 涉及用户可见行为变化
- 涉及高风险域
- 文档与代码冲突
- 多种修复方案语义不同
- 需要确认是否从 issue 升级为 feature

### 16.2 不应问用户

以下情况不应打断用户：

- 明确 typo
- 明确空值/边界 bug
- 明确违反 current/docs/decisions
- 明确测试失败对应实现错误
- 有唯一低风险修复路径

### 16.3 提问格式

必须问具体边界问题：

```text
当前有两种语义选择：
A. force_sell_destroy 永远不属于用户赠送券，因此列表和上链都应排除。
B. force_sell_destroy 可在历史列表展示，但不参与上链。
请选择哪一种作为当前系统语义。
```

禁止模糊提问：

```text
你觉得怎么修？
```

---

## 17. 状态流转

```text
/openflow-issue <case>
  │
  ├─ insufficient_input
  │    └─ ask targeted clarification
  │
  ├─ investigated
  │    └─ semantic alignment
  │
  ├─ bugfix
  │    └─ allow implement → verify → archive?
  │
  ├─ data_issue
  │    └─ data remediation / protective fix / user decision
  │
  ├─ config_issue
  │    └─ config fix → verify
  │
  ├─ environment_issue
  │    └─ environment fix → verify
  │
  ├─ doc_ambiguity
  │    └─ ask user / brainstorm / decision → governance promotion candidate
  │
  ├─ behavior_change
  │    └─ /openflow-brainstorm <feature> → current/decision promotion if accepted
  │
  ├─ governance_promotion_needed
  │    └─ propose current/decision update → user approval → archive/doc-sync
  │
  └─ cannot_determine
       └─ continue investigation
```

---

## 18. 示例输出

```md

# Issue Clarification

## 1. Issue Intake
- Symptom: api/ticket/user/ant/chain/give/out/2761095?category=give 展示不出蚂蚁链信息
- Entry Point: api/ticket/user/ant/chain/give/out/{id}
- Environment: production
- User Expected Behavior: 展示该券对应的蚂蚁链信息

## 2. Requirement Clarification
- User Expectation: 如果是用户赠送券，应展示链信息
- Existing Support: 当前代码存在 give category 查询链信息路径
- Missing Information: 该记录是否语义上属于用户赠送券

## 3. Constraint Clarification
- Must Preserve: 普通用户赠送券的链信息展示
- Must Not Change: 不应把非用户赠送券伪装成 give
- Data Handling Policy: 历史 force_sell_destroy 是否补链需业务裁决

## 4. Evidence
- Data Evidence: id=2761095, category=force_sell_destroy, uid=0
- Excluded Hypotheses: 未发现蚂蚁链服务不可用证据

## 5. Semantic Alignment
- Current Semantics: 用户赠送券应具备有效用户语义
- Violated Semantics: force_sell_destroy 被当作 give 展示
- Undefined Semantics: 历史 force_sell_destroy 是否继续展示

## 6. Classification
- Type: data_issue + bugfix
- Confidence: high
- Reason: 数据不属于正常赠送券，但列表逻辑将其纳入用户 give 场景

## 7. Next Action Gate
- Decision: allow minimal protective fix, ask user about historical data policy
- Allowed Actions: 过滤 force_sell_destroy，保护上链同步入口
- Blocked Actions: 不得盲目补链，不得改变普通 give 语义
- Needs Brainstorm: no, unless user wants new historical display policy
- Needs Harden: yes
- Needs Verify: yes

## 8. Governance Promotion
- Promotion Needed: yes
- Promotion Type: current fact candidate
- Target Location: docs/current/spec 或 docs/current/requirements
- Proposed Wording: force_sell_destroy 不属于普通用户赠送券，不应参与普通 give 列表和上链展示语义。
- Requires User Approval: yes
- Reason: 该规则来自本次 issue 澄清，未来同类记录应复用同一语义。
```

---

## 19. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 命令过重 | 默认只输出结果，复杂 issue 才写文档 |
| AI 过早实现 | Evidence 阶段禁止修改代码 |
| 将需求变化当 bug 修 | Classification 强制区分 behavior_change |
| 语义不清仍继续修 | doc_ambiguity 必须进入用户澄清或 brainstorm |
| 用户被频繁打断 | 仅业务裁决、历史数据、高风险域才提问 |
| verify/archive 不识别 issue | 增加 issue-aware mode |
| 澄清结果只修本次、不沉淀 | Governance Promotion 阶段强制判断是否提升为 current/decision |
| AI 擅自写入全局决策 | `docs/decisions/*` 必须用户确认后才生效 |

---

## 20. 验收标准

实现完成后应满足：

1. 用户可以运行 `/openflow-issue <case>`
2. 命令不预设 issue 是 bug
3. 命令输出需求澄清、约束澄清、证据、语义对齐、分类、下一步 gate 和治理提升建议
4. 复杂 issue 可写入 `issue-clarification.md`
5. `behavior_change` 和 `doc_ambiguity` 会建议升级 brainstorm 或生成 promotion candidate
6. `bugfix` 只在语义明确且修复恢复原行为时给出
7. 生产问题默认只读调查
8. 澄清出的长期约束会被判断是否提升到 `docs/current/*` 或 `docs/decisions/*`
9. 未经用户确认的全局规则不会自动写入 `docs/decisions/*`
10. verify 支持 issue-aware mode，并检查 governance promotion 状态
11. archive 支持 `issue-resolution.md` 和已确认治理产物的 promotion
12. 不影响现有 feature brainstorm/verify/archive 流程

---

## 21. 一句话总结

`/openflow-issue` 是 OpenFlow 面向“不确定问题”的澄清、分诊与语义治理命令。它通过需求澄清、约束澄清、证据调查和语义对齐，判断问题是 bug、数据问题、配置问题、环境问题、文档歧义还是需求变更，并用 Next Action Gate 决定是否直接修复、询问用户、继续调查或升级到 brainstorm；当 issue 暴露出长期有效的语义空白或约束缺失时，它还会生成治理提升候选，将澄清结果沉淀为 `docs/current/*` 或经用户确认后的 `docs/decisions/*`。
