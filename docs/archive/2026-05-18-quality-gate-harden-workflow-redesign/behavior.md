# quality-gate-harden-workflow-redesign - Observable Behavior

## User Context

目标用户是使用 OpenFlow 进行受治理 AI 开发的执行者、审查者和维护者。他们需要在代码完成后运行 `openflow-quality-gate`，并获得可信、可观察、可归档的 harden/verify 结果。

## Problem Statement

当前 harden 在复杂 feature 归档中可能出现 token 爆炸、重复 finding、fixer 未落地修改、设计分歧被误判为 spec violation，以及 harden 终态过度阻塞 archive 的问题。

## Trigger Rules

该行为在以下条件下生效：

- `openflow-quality-gate` 判断变更为高风险，需要 harden。
- harden reviewer 产生 blocking/spec/regression/test/design finding。
- executor 被要求修复 harden finding。
- harden 达到 budget、max rounds 或重复 finding 阈值。
- archive/readiness 需要消费 harden 结果。
- 用户需要观察 harden 过程质量。

## Non-Trigger Rules

以下情况不应触发完整 harden loop：

- 低风险变更，只需 evidence-aware verify。
- 中风险但无复杂语义分歧的变更，可 reviewer-only。
- 无 semantic context 时，不跳过 verify，但 semantic alignment 降级为 limited-context。
- 纯 style/preference finding 不应触发 executor 修复。

## User-Visible Scenarios

### Scenario 1: harden 过程可观察但不制造 session 爆炸

**Given:** AI 在 Quality Gate session 中完成实现后的质量门检查。  
**When:** risk triage 判定需要 harden。  
**Then:** 系统创建一个 `Harden: <feature>` child session，并在同一 session 内记录 reviewer/executor 多轮消息。Quality Gate 报告显示 Harden Trace，包括 session ID、round、agent、tokens、stop reason。

### Scenario 2: reviewer finding 进入 ledger 而不是直接阻塞

**Given:** reviewer 报告一个 `spec_violation`。  
**When:** finding 缺少明确设计引用，或更像 MVP 与设计之间的分歧。  
**Then:** finding 被记录为 `design_divergence` 或 `needs_decision` 候选，而不是无限进入 must-fix loop。

### Scenario 3: executor 没有实际修改时被识别

**Given:** executor 返回了修复报告。  
**When:** harden 比较 executor 前后的 scoped diff hash。  
**Then:** 如果 diff 未变化，finding 标记为 `no_material_fix`，repeat/no-fix counter 增加，并触发 stop reason `repeated_finding_no_material_fix` 或 `executor_blocked`。

### Scenario 4: 下一轮 reviewer 审查最新事实

**Given:** executor 已经修改了文件。  
**When:** harden 进入下一轮 reviewer。  
**Then:** reviewer 输入包含刷新后的 scoped diff、fresh evidence refs 和 active ledger summary，而不是旧 diff 加上一段 fixReport 文本。

### Scenario 5: budget exhausted 不再自动等于 archive blocked

**Given:** harden 达到 token budget 或 max rounds。  
**When:** verify 技术检查通过，且所有 finding 已经 fixed、dismissed、accepted_known_issue 或 needs_decision。  
**Then:** Quality Gate 根据 disposition 输出 Ready、ReadyWithDocUpdates 或 NeedsDecision，而不是无条件 NotReady。

### Scenario 6: 未解决的 must-fix 仍然阻塞

**Given:** ledger 中存在 confirmed `must_fix` blocking/spec/regression finding。  
**When:** 该 finding 未 fixed/verified，也没有有效反证。  
**Then:** Quality Gate 输出 NotReady，archive 不允许继续。

### Scenario 7: known issue acceptance 可审计

**Given:** 某 finding 被接受为已知风险或设计分歧。  
**When:** Quality Gate 生成报告。  
**Then:** 报告显示 finding ID、处置理由、证据引用、verify 状态和 archive effect；用户不需要也不允许手动修改 generated acceptance state。

## Required Content

成功实现必须包含：

- Harden Trace 输出。
- Evidence ledger / finding disposition 的最小数据模型。
- One harden run / one child session 机制。
- No nested `task(...)` prompt wrapper。
- Material-change detection。
- Fresh scoped diff per reviewer round。
- Non-convergence terminal states。
- Readiness mapping rules。
- Known issue / design divergence 可审计路径。

## Must Not Behavior

- 不得让 reviewer 自由文本直接决定 readiness。
- 不得在每轮 reviewer/executor 中创建新的 task 子代理 session。
- 不得通过 prompt 内 `task(...)` 触发二次嵌套。
- 不得把所有 budget exhaustion 直接放行。
- 不得把所有 design divergence 直接视为 NotReady。
- 不得要求用户手动修改 acceptance state。

## Acceptance / Verification Mapping

| Acceptance Criterion | Evidence Type | Expected Evidence |
|---|---|---|
| 一个 harden run 只创建一个 child session | unit/integration test | session.create called once; prompt called multiple times with same session ID |
| 不再嵌入 `task(...)` | unit test | captured prompt text does not contain `task(` wrapper |
| executor 后检测 material change | unit test | unchanged diff produces `no_material_fix`; changed diff refreshes evidence |
| repeated finding 提前停止 | unit test | same normalized finding reaches threshold and returns structured stop reason |
| budget/max rounds 映射不再粗暴 | quality-gate test | `review_inconclusive + disposed findings + verify pass` does not become unconditional NotReady |
| unresolved must-fix 仍阻塞 | quality-gate test | confirmed unresolved blocking finding maps to NotReady |
| accepted known issue 可审计 | report test | Quality Gate report contains finding ID, rationale, evidence refs, archive effect |

## Success Responses

当 feature 完成后，Quality Gate 应能输出类似：

```text
Harden Trace:
- Session: ses_harden_xxx
- Stop reason: known_issues_accepted
- Round 1 oracle/reviewer: 2 findings
- Round 1 deep/executor: fixed H-001, countered H-002
- Round 2 oracle/reviewer: no unresolved must-fix findings

Known Issues:
- H-002 design_divergence accepted with evidence EV-DESIGN-001 and EV-VERIFY-001

Readiness: ReadyWithDocUpdates
```

如果存在未解决 confirmed must-fix：

```text
Readiness: NotReady
Reason: unresolved harden finding H-003 requires fix or decision.
```
