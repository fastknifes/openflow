---
{
  "scenarios": [
    {
      "id": "SC-001",
      "name": "reviewer and executor exchange adversarial findings",
      "given": ["reviewer and executor sessions are available or can be lazily created"],
      "when": "the relevant workflow step executes",
      "then": ["reviewer 报告包含：问题、证据链、置信度（高/中/低）。executor 修复高置信度问题；对中低置信度自行决定是否修复；不需要修复的通过 DRG 报告回复 reviewer。"],
      "criticality": "critical"
    },
    {
      "id": "SC-002",
      "name": "each harden run uses an isolated DAG",
      "given": ["A harden request is ready to run"],
      "when": "the workflow reaches the described trigger point",
      "then": ["每次 harden 调用创建独立 DAG（如 harden-<uuid>），任务 ID 带前缀隔离。harden 结束后整个 DAG 归档/销毁。"],
      "criticality": "critical"
    },
    {
      "id": "SC-003",
      "name": "DAG dynamically grows at runtime",
      "given": ["reviewer and executor sessions are available or can be lazily created"],
      "when": "the workflow reaches the described trigger point",
      "then": ["DAG 动态生长: 运行时动态创建，reviewer/executor 完成后根据输出决定是否注入下游任务"],
      "criticality": "critical"
    },
    {
      "id": "SC-004",
      "name": "reviewer and executor communicate via async bus",
      "given": ["reviewer and executor sessions are available or can be lazily created"],
      "when": "the relevant workflow step executes",
      "then": ["异步通信总线模式：reviewer 和 executor 各持一个长生命周期 session，DRG 调度'思考回合任务'在已有 session 上追加消息。像聊天一样来回对话。"],
      "criticality": "critical"
    }
  ]
}
---

# harden-drg-async - Observable Behavior

## User Context

Current state: 重新设计 harden 工作流，使用 DRG 做异步 AI 对话交互
Desired change: reviewer 报告包含：问题、证据链、置信度（高/中/低）。executor 修复高置信度问题；对中低置信度自行决定是否修复；不需要修复的通过 DRG 报告回复 reviewer。; 每次 harden 调用创建独立 DAG（如 harden-<uuid\>），任务 ID 带前缀隔离。harden 结束后整个 DAG 归档/销毁。; quality-gate 的对话负责决定是否启动 harden（风险评估）和最终收敛判定。harden 不直接修改 acceptance state 或 ImplementationRun 状态。
## Trigger Rules

- Goal: reviewer 报告包含：问题、证据链、置信度（高/中/低）。executor 修复高置信度问题；对中低置信度自行决定是否修复；不需要修复的通过 DRG 报告回复 reviewer。
- Goal: 每次 harden 调用创建独立 DAG（如 harden-<uuid\>），任务 ID 带前缀隔离。harden 结束后整个 DAG 归档/销毁。
- Goal: quality-gate 的对话负责决定是否启动 harden（风险评估）和最终收敛判定。harden 不直接修改 acceptance state 或 ImplementationRun 状态。
- Goal: harden 输出格式必须与现有格式兼容
- Goal: DAG 动态生长: 运行时动态创建，reviewer/executor 完成后根据输出决定是否注入下游任务
- Must satisfy: DRG 保持为全局单例任务调度器（不是事件总线），插件启动时初始化。所有异步任务共享同一个 SchedulerLoop 和 DagEngine 实例，统一状态存储。
- Must satisfy: 每次 harden 调用创建独立 DAG（如 harden-<uuid\>），任务 ID 带前缀隔离。harden 结束后整个 DAG 归档/销毁。
- Must satisfy: 异步通信总线模式：reviewer 和 executor 各持一个长生命周期 session，DRG 调度'思考回合任务'在已有 session 上追加消息。像聊天一样来回对话。
- Must satisfy: DRG 任务粒度是'思考回合'：让 session 基于当前消息历史生成下一轮报告。任务输出包含 session ID 和报告内容。
- Must satisfy: 默认1轮对抗；1轮是 reviewer 与 executor 的完整对话，直到 reviewer 判定已无 bug / 文档漂移需要继续追，或循环次数耗尽。每轮最多5个循环，executor 每输出一次修复/审查报告算1个循环；总轮数可配置最多10轮，串行执行。当前默认 maxRounds 从5改为1。
- Must satisfy: 流程结束当且仅当 reviewer 在审查 executor 报告后判定没有需要继续追的问题，或达到每轮最大循环次数 / max rounds。终止判定权在 reviewer；executor 只能修复、审查、报告，不能单方面结束循环。
- Must satisfy: 同一 finding 被 executor 连续拒绝3次后，reviewer session 自行维护计数器，达到3次后忽略该 finding，不再上报给 executor。
- Must satisfy: reviewer 报告包含：问题、证据链、置信度（高/中/低）。executor 修复高置信度问题；对中低置信度自行决定是否修复；不需要修复的通过 DRG 报告回复 reviewer。
- Must satisfy: quality-gate 的对话负责决定是否启动 harden（风险评估）和最终收敛判定。harden 不直接修改 acceptance state 或 ImplementationRun 状态。
- Must satisfy: DRG 引擎核心不因本功能修改
- Must satisfy: harden 输出格式必须与现有格式兼容
- Must satisfy: quality-gate 编排逻辑不修改
- Must satisfy: 同一时间最多一个 harden DAG 运行
## Execution Safety / Confirmation Guard

Automatic execution is constrained by the following confirmation / safety guard mechanisms:
- quality-gate 的对话负责决定是否启动 harden（风险评估）和最终收敛判定。harden 不直接修改 acceptance state 或 ImplementationRun 状态。
## State Isolation / Safety

The following isolation mechanisms apply to global/cross-session state:
- 每次 harden 调用创建独立 DAG（如 harden-<uuid\>），任务 ID 带前缀隔离。harden 结束后整个 DAG 归档/销毁。
## Non-Trigger Rules

- 不改造 DRG 为事件总线
- 不支持并行 harden
- 不支持分布式多进程对抗
- 不修改 reviewer/executor 的 prompt 策略
## Behavior Scenarios

### reviewer and executor exchange adversarial findings
Actor: reviewer

Given:
- reviewer and executor sessions are available or can be lazily created
When: the relevant workflow step executes
Then:
- reviewer 报告包含：问题、证据链、置信度（高/中/低）。executor 修复高置信度问题；对中低置信度自行决定是否修复；不需要修复的通过 DRG 报告回复 reviewer。

### each harden run uses an isolated DAG
Actor: system

Given:
- A harden request is ready to run
When: the workflow reaches the described trigger point
Then:
- 每次 harden 调用创建独立 DAG（如 harden-<uuid\>），任务 ID 带前缀隔离。harden 结束后整个 DAG 归档/销毁。

### reviewer and executor exchange adversarial findings
Actor: reviewer

Given:
- reviewer and executor sessions are available or can be lazily created
When: the workflow reaches the described trigger point
Then:
- DAG 动态生长: 运行时动态创建，reviewer/executor 完成后根据输出决定是否注入下游任务

### reviewer and executor exchange adversarial findings
Actor: reviewer

Given:
- reviewer and executor sessions are available or can be lazily created
When: the relevant workflow step executes
Then:
- 异步通信总线模式：reviewer 和 executor 各持一个长生命周期 session，DRG 调度'思考回合任务'在已有 session 上追加消息。像聊天一样来回对话。

## Behavior Evidence

| Scenario ID | Criticality | Evidence Ref | Evidence Type | Coverage Level | Equivalence Rationale | Freshness | Status |
|-------------|-------------|--------------|---------------|----------------|----------------------|-----------|--------|
| SC-001 | critical | Harden DRG implementation code review | code-review | exact | Verified by harden round 1 reviewer/executor execution | fresh | verified |
| SC-002 | critical | Harden DAG manager isolation review | code-review | exact | Verified by per-run DAG prefix and archive implementation | fresh | verified |
| SC-003 | critical | Harden dynamic task injection review | code-review | exact | Verified by runDrgAdversarialLoop dynamic task submission | fresh | verified |
| SC-004 | critical | Harden async session bus review | code-review | exact | Verified by DRG task chaining with session ID propagation | fresh | verified |

## Acceptance / Verification Mapping

| Criterion | Verification | Evidence Type |
|-----------|--------------|---------------|
| Verify that 异步通信总线模式：reviewer 和 executor 各持一个长生命周期 session，DRG 调度'思考回合任务'在已有 session 上追加消息。像聊天一样来回对话。 | Design and implementation review | manual-review |
| Verify that 每次 harden 调用创建独立 DAG（如 harden-<uuid\>），任务 ID 带前缀隔离。harden 结束后整个 DAG 归档/销毁。 | Design and implementation review | manual-review |
| Verify that harden 输出格式必须与现有格式兼容 | Compatibility review and regression test | manual-review |
| Verify that 默认1轮对抗；1轮是 reviewer 与 executor 的完整对话，直到 reviewer 判定已无 bug / 文档漂移需要继续追，或循环次数耗尽。每轮最多5个循环，executor 每输出一次修复/审查报告算1个循环；总轮数可配置最多10轮，串行执行。当前默认 maxRounds 从5改为1。 | Design and implementation review | manual-review |
| Verify that 流程结束当且仅当 reviewer 在审查 executor 报告后判定没有需要继续追的问题，或达到每轮最大循环次数 / max rounds。终止判定权在 reviewer；executor 只能修复、审查、报告，不能单方面结束循环。 | Automated or integration test | manual-review |
| Verify that 同一 finding 被 executor 连续拒绝3次后，reviewer session 自行维护计数器，达到3次后忽略该 finding，不再上报给 executor。 | Design and implementation review | manual-review |
| Verify that reviewer 报告包含：问题、证据链、置信度（高/中/低）。executor 修复高置信度问题；对中低置信度自行决定是否修复；不需要修复的通过 DRG 报告回复 reviewer。 | Design and implementation review | manual-review |
| Verify that DRG 任务粒度是'思考回合'：让 session 基于当前消息历史生成下一轮报告。任务输出包含 session ID 和报告内容。 | Design and implementation review | manual-review |
## Must Not Behavior

- Must not: 不改造 DRG 为事件总线
- Must not: 不支持并行 harden
- Must not: 不支持分布式多进程对抗
- Must not: 不修改 reviewer/executor 的 prompt 策略

<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:BEGIN -->
## Cross-Validation Summary

- Status: Passed
- Documents checked in order:
- design.md: present
- behavior.md: present
- Non-blocking gaps: 0
<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:END -->

<!-- OPENFLOW:DESIGN_REVIEW_SUMMARY:BEGIN -->
## Design Sufficiency Review

- Status: Not Ready
- Structural Completeness: structurally_complete
- Design Readiness: needs_implementation_constraints
- Blocking findings: 1
- Warnings: 0
- Summary: Design is generated, but implementation constraints are not yet sufficient for reliable planning.

### Findings

#### F-0002: constraint_specificity
- Severity: blocking
- Finding: 8 important constraint(s) are not sufficiently covered by scenarios, criteria, and architecture.
- Suggested fix: Add implementation-level constraints that name owners, triggers, state changes, failure behavior, and verification methods.

### Constraint Coverage Matrix

| Constraint | Goals | Scenarios | Criteria | Architecture | Sufficiency | Missing Details |
|------------|-------|-----------|----------|--------------|-------------|-----------------|
| DRG 保持为全局单例任务调度器（不是事件总线），插件启动时初始化。所有异步任务共享同一个 SchedulerLoop 和 DagEngine 实例，统一状态存储。 | 0 | 0 | 0 | 0 | missing | strong verification |
| 每次 harden 调用创建独立 DAG（如 harden-<uuid>），任务 ID 带前缀隔离。harden 结束后整个 DAG 归档/销毁。 | 1 | 1 | 1 | 5 | partial | strong verification |
| 异步通信总线模式：reviewer 和 executor 各持一个长生命周期 session，DRG 调度'思考回合任务'在已有 session 上追加消息。像聊天一样来回对话。 | 2 | 3 | 6 | 4 | sufficient | - |
| DRG 任务粒度是'思考回合'：让 session 基于当前消息历史生成下一轮报告。任务输出包含 session ID 和报告内容。 | 0 | 1 | 2 | 2 | partial | strong verification |
| 默认1轮对抗；1轮是 reviewer 与 executor 的完整对话，直到 reviewer 判定已无 bug / 文档漂移需要继续追，或循环次数耗尽。每轮最多5个循环，executor 每输出一次修复/审查报告算1个循环；总轮数可配置最多10轮，串行执行。当前默认 maxRounds 从5改为1。 | 2 | 3 | 5 | 4 | sufficient | - |
| 流程结束当且仅当 reviewer 在审查 executor 报告后判定没有需要继续追的问题，或达到每轮最大循环次数 / max rounds。终止判定权在 reviewer；executor 只能修复、审查、报告，不能单方面结束循环。 | 2 | 3 | 5 | 4 | sufficient | - |
| 同一 finding 被 executor 连续拒绝3次后，reviewer session 自行维护计数器，达到3次后忽略该 finding，不再上报给 executor。 | 2 | 3 | 5 | 4 | sufficient | - |
| reviewer 报告包含：问题、证据链、置信度（高/中/低）。executor 修复高置信度问题；对中低置信度自行决定是否修复；不需要修复的通过 DRG 报告回复 reviewer。 | 2 | 3 | 5 | 4 | sufficient | - |
| quality-gate 的对话负责决定是否启动 harden（风险评估）和最终收敛判定。harden 不直接修改 acceptance state 或 ImplementationRun 状态。 | 1 | 0 | 0 | 3 | partial | strong verification |
| DRG 引擎核心不因本功能修改 | 0 | 0 | 0 | 0 | missing | strong verification |
| harden 输出格式必须与现有格式兼容 | 1 | 0 | 1 | 0 | partial | - |
| quality-gate 编排逻辑不修改 | 0 | 0 | 0 | 0 | missing | strong verification |
| 同一时间最多一个 harden DAG 运行 | 1 | 1 | 1 | 5 | partial | strong verification |

### Next Required Facts
- **implementation_constraints**: Which concrete APIs, state transitions, payload fields, and ownership rules must the implementation follow?
  - Reason: 8 important constraint(s) are not sufficiently covered by scenarios, criteria, and architecture.
  - Example: Define task ids, output schema, state transitions, and ownership for each workflow step.
<!-- OPENFLOW:DESIGN_REVIEW_SUMMARY:END -->
