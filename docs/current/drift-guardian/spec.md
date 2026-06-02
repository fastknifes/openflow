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

# 重构 OpenFlow 的质量门工作流：将 harden 从 quality-gate 拆成独立可改代码节点；新增 final-verify 与 code-mapper 内部节点；quality-gate 收敛为只读 readiness 判定节点；集成测试 - Observable Behavior

## Human Consensus Summary

Feature title: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
Internal slug: openflow-implement-quality-gate
Source intent: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
Problem statement: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。

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
- Must satisfy: 默认1轮对抗（reviewer→executor→reviewer 为一轮），可配置最多10轮，串行执行。当前默认是 maxRounds=5，改为1。
- Must satisfy: 流程结束当且仅当 reviewer 在一轮审查后认为没有需要继续追的问题（executor 的上报为空或 reviewer 全部认可），或达到 max rounds。终止判定权在 reviewer。
- Must satisfy: 同一 finding 被 executor 连续拒绝3次后，reviewer session 自行维护计数器，达到3次后忽略该 finding，不再上报给 executor。
- Must satisfy: reviewer 报告包含：问题、证据链、置信度（高/中/低）。executor 修复高置信度问题；对中低置信度自行决定是否修复；不需要修复的通过 DRG 报告回复 reviewer。
- Must satisfy: quality-gate 的对话负责决定是否启动 harden（风险评估）和最终收敛判定。harden 不直接修改 acceptance state 或 ImplementationRun 状态。
- Must satisfy: DRG 引擎核心不因本功能修改
- Must satisfy: harden 输出格式必须与现有格式兼容
- Must satisfy: quality-gate 编排逻辑不修改
- Must satisfy: 同一时间最多一个 harden DAG 运行

## Non-Trigger Rules

- 不改造 DRG 为事件总线
- 不支持并行 harden
- 不支持分布式多进程对抗
- 不修改 reviewer/executor 的 prompt 策略

## User-Visible Scenarios

Each scenario describes what a user or external caller observes — not how the system produces it internally.

### Scenario 1: 独立 harden 节点可运行并产出 harden result

**Criticality**: critical

**Given**:
- 一个 feature 有完整的 plan、design 和 behavior 文档
- feature-scoped diff 中存在非 trivial 变更
- quality-gate 编排器风险评估判定需要 harden

**When**:
- quality-gate 编排器触发 harden 节点

**Then (observable outcome)**:
- harden 节点独立运行 reviewer → executor 循环
- 产出 harden result（findings 列表 + status: pass / pass_with_risks / needs_human / max_rounds_reached / rejected）
- harden result 可被 final-verify 消费
- harden 不直接修改 acceptance state 或 ImplementationRun 状态

### Scenario 2: verify 产出 evidence packet，不直接决定 readiness

**Criticality**: critical

**Given**:
- feature 有 design/plan/behavior 上下文
- Applicability 分类为 applicable

**When**:
- quality-gate 编排器触发 verify 节点

**Then (observable outcome)**:
- verify 收集技术证据并生成 evidence packet
- evidence packet 包含 checks_run, check_results, observed_behavior_summary, intended_vs_actual_delta, doc_alignment_summary, current_decisions_conflict_summary, known_risks_or_missing_evidence
- verify 不产出 readiness 判定
- verify 不检查 constraints 满足情况

### Scenario 3: final-verify 汇总前置结果并产出 readiness_recommendation

**Criticality**: critical

**Given**:
- verify 已产出 evidence packet
- harden 已完成（或被跳过/禁用）
- 存在 `constraints.md`（或不存在，此时跳过约束验证）
- execution root 已解析
- quality-gate 已优先复用当前调用链中的结构化 `ImplementationRun`；若缺失，则已从 active run store 恢复或降级为 no-run 路径

**When**:
- quality-gate 编排器触发 final-verify 节点

**Then (observable outcome)**:
- final-verify 读取 verify evidence packet
- final-verify 读取 harden result（如有）
- final-verify 执行 constraints enforcement：
  - 读取 constraints.md
  - 计算 changedFiles ∩ constrainedPaths
  - blocking 约束命中 → 要求命令输出证据
  - warning 约束命中 → 列出但不阻断
  - 证据不足 → constraint_satisfaction = blocked
- final-verify 检查 execution root mismatch
- final-verify 评估 behavior scenario 覆盖
- final-verify 产出 final verification result：
  - readiness_recommendation: Ready / ReadyWithDocUpdates / NotReady / NeedsDecision
  - constraint_satisfaction: satisfied / blocked / skipped
  - root_mismatch: boolean
  - behavior_coverage: summary

### Scenario 4: quality-gate 只读消费 final-verify result

**Criticality**: critical

**Given**:
- final-verify 已产出 final verification result
- quality-gate 已解析运行上下文：优先使用结构化 `ImplementationRun`，缺失时才恢复 active run

**When**:
- quality-gate 编排器读取 final-verify result

**Then (observable outcome)**:
- quality-gate 不调用 handleHarden() 或 handleVerify()
- quality-gate 不执行 constraints enforcement
- quality-gate 不把 LLM 会话中的计划上下文当作运行时 authority
- 若当前调用链已绑定结构化 run，则不必再依赖磁盘恢复作为主路径
- quality-gate 根据 final-verify readiness_recommendation 映射最终 readiness
- quality-gate 写 acceptance state
- quality-gate 更新 ImplementationRun 状态
- quality-gate 输出 readiness 报告

### Scenario 5: code-mapper 独立生成 implementation-mapper.md

**Criticality**: normal

**Given**:
- final-verify 返回 Ready 或 ReadyWithDocUpdates
- feature 的 change workspace 中存在 behavior.md

**When**:
- quality-gate 编排器触发 code-mapper 节点

**Then (observable outcome)**:
- code-mapper 读取 behavior.md 和 evidence packet
- 生成 `docs/changes/{feature}/implementation-mapper.md`
- mapper 记录 behavior scenario 与代码文件的映射

**Must Not**:
- final-verify 返回 NotReady 或 NeedsDecision 时不触发 code-mapper
- 不存在 behavior.md 时不触发 code-mapper
- code-mapper 生成失败不阻断 readiness，降级为 warning observation

### Scenario 6: root mismatch 无条件导致 NotReady

**Criticality**: critical

**Given**:
- 绑定了 ImplementationRun
- 当前 execution root 与 run 记录不一致

**When**:
- final-verify 执行

**Then (observable outcome)**:
- root_mismatch = true
- readiness_recommendation 强制为 NotReady
- 不允许进入 ready_for_archive
- 不受其他检查结果影响（即使 verify 和 harden 都通过）

### Scenario 7: constraints enforcement 缺命令输出证据时阻断

**Criticality**: critical

**Given**:
- constraints.md 列出了 blocking constraint 适用于 `src/auth/token.ts`
- git diff 显示 `src/auth/token.ts` 被修改
- AI agent 未提供命令输出证据（只提供口头陈述或 observation log）

**When**:
- final-verify 执行 constraints enforcement

**Then (observable outcome)**:
- final-verify 拒绝非命令输出证据
- constraint_satisfaction = blocked
- 列出缺失的证据要求
- readiness_recommendation 受阻断影响

### Scenario 8: limited_context 不升级为完整 archive readiness

**Criticality**: normal

**Given**:
- Applicability 分类为 limited_context
- final-verify 技术验证通过

**When**:
- quality-gate 输出 readiness 报告

**Then (observable outcome)**:
- 报告中标注 limited_context
- 结果不能自动等同于完整 feature 语义 readiness
- 不能直接当作常规 archive 资格
- 需要显式的人工确认或补充上下文

### Scenario 9: Applicability 分类为 not_applicable 时终止

**Criticality**: normal

**Given**:
- Applicability 分类为 not_applicable

**When**:
- quality-gate 编排器评估适用性

**Then (observable outcome)**:
- 返回适用性报告
- 不触发 harden
- 不触发 verify
- 不触发 final-verify
- 不生成 mapper

### Scenario 10: harden 契约分歧不可通过改文档解决

**Criticality**: critical

**Given**:
- harden reviewer 发现 contract_divergence finding
- finding 标记为 must_fix

**When**:
- executor 尝试修复

**Then (observable outcome)**:
- executor 只能修改实现代码
- executor 不能修改 design.md、behavior.md 或其他文档来解决契约分歧
- executor 不能批准 contract divergence
- 如果 same finding 重复且没有 material change，harden 返回 review_inconclusive

## Required Content

The following content or outcomes must be present in any successful response:

- Must include: openflow-implement-quality-gate workflow
- Must include: Address the stated problem: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
- Must include: Code edits require verification, but code edits alone do not require Full Quality Gate.
- Must include: `/openflow-implement` final verification remains a mandatory Full Quality Gate trigger.
- Must include: Explicit user requests can invoke Full Quality Gate outside `/openflow-implement`.
- Must include: Casual coding defaults to basic or lightweight verification unless admission requires escalation.
- Must include: Admission evaluates the target workspace/project rather than assuming edits are inside the OpenFlow repository.
- Must include: Full Quality Gate and lightweight verification are distinct verification levels.
- Required outcome: Solve: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
- Required outcome: Serve target users: 内部开发者
- Required outcome: Honor priority: 风险最小
- Must satisfy constraint: Keep a rollback path available for the change (verify by: Confirm the rollout can be disabled or reverted without manual data repair)
- Must satisfy constraint: Keep the change scope narrow to reduce regression surface area (verify by: Review the touched files and modules for unnecessary breadth)
- Must satisfy constraint: Protect existing behavior with explicit regression coverage (verify by: Run targeted regression tests around existing behavior)

## Success Responses

**Success:** openflow-implement-quality-gate addresses the stated problem: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。

**Success:** openflow-implement-quality-gate works for the target users: 内部开发者

**Success:** openflow-implement-quality-gate implementation reflects the selected priority: 风险最小

**Success:** Solve: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。

**Success:** Serve target users: 内部开发者

**Success:** Honor priority: 风险最小

## Must Not Behavior

- Must not: 不改造 DRG 为事件总线
- Must not: 不支持并行 harden
- Must not: 不支持分布式多进程对抗
- Must not: 不修改 reviewer/executor 的 prompt 策略

<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:BEGIN -->

## Acceptance / Verification Mapping

| Criterion | Verification | Evidence Type |
|-----------|--------------|---------------|
| Verify that 异步通信总线模式：reviewer 和 executor 各持一个长生命周期 session，DRG 调度'思考回合任务'在已有 session 上追加消息。像聊天一样来回对话。 | Design and implementation review | manual-review |
| Verify that 每次 harden 调用创建独立 DAG（如 harden-<uuid\>），任务 ID 带前缀隔离。harden 结束后整个 DAG 归档/销毁。 | Design and implementation review | manual-review |
| Verify that harden 输出格式必须与现有格式兼容 | Compatibility review and regression test | manual-review |
| Verify that 默认1轮对抗（reviewer→executor→reviewer 为一轮），可配置最多10轮，串行执行。当前默认是 maxRounds=5，改为1。 | Design and implementation review | manual-review |
| Verify that 流程结束当且仅当 reviewer 在一轮审查后认为没有需要继续追的问题（executor 的上报为空或 reviewer 全部认可），或达到 max rounds。终止判定权在 reviewer。 | Automated or integration test | manual-review |
| Verify that 同一 finding 被 executor 连续拒绝3次后，reviewer session 自行维护计数器，达到3次后忽略该 finding，不再上报给 executor。 | Design and implementation review | manual-review |
| Verify that reviewer 报告包含：问题、证据链、置信度（高/中/低）。executor 修复高置信度问题；对中低置信度自行决定是否修复；不需要修复的通过 DRG 报告回复 reviewer。 | Design and implementation review | manual-review |
| Verify that DRG 任务粒度是'思考回合'：让 session 基于当前消息历史生成下一轮报告。任务输出包含 session ID 和报告内容。 | Design and implementation review | manual-review |

## Cross-Validation Summary

- Status: Passed
- Documents checked in order:
- design.md: present
- behavior.md: present
- Non-blocking gaps: 0
<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:END -->

<!-- OPENFLOW:DESIGN_REVIEW_SUMMARY:BEGIN -->

# 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。 - Observable Behavior

### Scenario: Casual coding low-risk edit uses lightweight verification

**Given:**
- The user is in a normal chat or casual coding conversation.
- The assistant edits code in the target workspace/project.
- No mandatory Full Quality Gate trigger applies.

**When:**
- The assistant finishes the edit and selects verification.

**Then (observable outcome):**
- The assistant verifies the change with basic or lightweight verification appropriate to the target project.
- The assistant does not invoke Full Quality Gate merely because code was edited.
- The assistant may mention that Full Quality Gate was not run because the conversation is not in formal delivery mode.

### Scenario: OpenFlow implement final verification requires Full Quality Gate

**Given:**
- The active workflow is `/openflow-implement`.
- Implementation work has reached final verification.

**When:**
- The workflow performs final readiness verification.

**Then (observable outcome):**
- Full Quality Gate is required.
- The workflow must not downgrade final `/openflow-implement` verification to lightweight verification.

### Scenario: Explicit quality gate request outside implement runs Full Quality Gate

**Given:**
- The user is not necessarily in `/openflow-implement`.
- The user explicitly asks to run quality gate, final verification, or equivalent delivery-readiness validation.

**When:**
- The assistant handles the explicit verification request.

**Then (observable outcome):**
- Full Quality Gate can run outside `/openflow-implement`.
- The assistant treats `/openflow-quality-gate` as an explicit public verification capability, not an implement-only private step.

### Scenario: Public quality gate capability is not default automatic behavior

**Given:**
- `/openflow-quality-gate` is available outside `/openflow-implement`.
- The assistant has edited code during a normal chat.
- The user has not explicitly asked for quality gate or final verification.
- No mandatory Full Quality Gate trigger applies.

**When:**
- The assistant chooses post-edit verification.

**Then (observable outcome):**
- Availability of `/openflow-quality-gate` does not cause automatic Full Quality Gate invocation.
- The assistant uses basic or lightweight verification unless admission upgrades the change.

### Scenario: High-risk or unclear target-project change upgrades verification

**Given:**
- The assistant changed behavior in the target workspace/project.
- The change impact is unclear, formal delivery is intended, or the target project lacks adequate verification for the behavior-changing edit.

**When:**
- The assistant selects the verification level.

**Then (observable outcome):**
- The workflow upgrades to Full Quality Gate when a mandatory trigger applies.
- If no mandatory trigger applies, the assistant asks before invoking Full Quality Gate or clearly recommends it as the next step.

### Scenario: Admission is based on the target workspace, not OpenFlow repository paths

**Given:**
- OpenFlow is being used as a tool for another project.
- The assistant needs to classify verification risk after target-project edits.

**When:**
- The assistant evaluates quality gate admission.

**Then (observable outcome):**
- The assistant evaluates the target workspace/project context, verification capability, delivery intent, and risk category.
- The assistant does not rely on hard-coded OpenFlow repository paths to classify target-project risk.

### Scenario: Full Quality Gate and lightweight verification remain distinguishable

**Given:**
- A code edit needs post-change verification.

**When:**
- The assistant reports or selects the verification path.

**Then (observable outcome):**
- Lightweight verification is described as targeted checks such as diff review, relevant tests, typecheck, lint, build, or risk summary.
- Full Quality Gate is described as final/formal verification and readiness assessment.
- The assistant does not use the two terms interchangeably.

### Scenario: Quality gate does not loop indefinitely on NotReady

**Given:**
- The quality gate returns NotReady or NeedsDecision.

**When:**
- The assistant reviews the quality gate output.

**Then (observable outcome):**
- The quality gate output does NOT contain an automatic command to re-invoke itself (e.g. `nextCommand: openflow-quality-gate`).
- The output provides specific blocker descriptions and fix suggestions.
- The skill instruction tells the assistant to fix blockers and only re-verify when resolved, with a 2-round limit before escalating to the user.

### Scenario: Code changes during harden and verify are visible to user

**Given:**
- Harden or verify modifies code during quality gate execution.

**When:**
- The quality gate generates its report.

**Then (observable outcome):**
- The harden output includes a "Code Changes" section listing files modified by the harden executor.
- The verify output includes a "Code Changes Detected During Verify" section listing files modified during verification.
- The quality gate summary includes a pointer to these change sections when changes exist.
- The user can review what changed before archive readiness is assessed.

### Scenario: openflow-implement-quality-gate addresses the stated problem: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。

**Given:**
- The target user is: 内部开发者
- The problem context is: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- openflow-implement-quality-gate addresses the stated problem: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
- The outcome is visible to the user or caller without inspecting implementation internals

### Scenario: openflow-implement-quality-gate works for the target users: 内部开发者

**Given:**
- The target user is: 内部开发者
- The problem context is: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- openflow-implement-quality-gate works for the target users: 内部开发者
- The outcome is visible to the user or caller without inspecting implementation internals

### Scenario: openflow-implement-quality-gate implementation reflects the selected priority: 风险最小

**Given:**
- The target user is: 内部开发者
- The problem context is: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- openflow-implement-quality-gate implementation reflects the selected priority: 风险最小
- The outcome is visible to the user or caller without inspecting implementation internals

# harden-drg-async - Observable Behavior

## Execution Safety / Confirmation Guard

Automatic execution is constrained by the following confirmation / safety guard mechanisms:
- quality-gate 的对话负责决定是否启动 harden（风险评估）和最终收敛判定。harden 不直接修改 acceptance state 或 ImplementationRun 状态。

## State Isolation / Safety

The following isolation mechanisms apply to global/cross-session state:
- 每次 harden 调用创建独立 DAG（如 harden-<uuid\>），任务 ID 带前缀隔离。harden 结束后整个 DAG 归档/销毁。

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

<<<<<<< Updated upstream
## Behavior Evidence

| Scenario ID | Criticality | Evidence Ref | Evidence Type | Coverage Level | Equivalence Rationale | Freshness | Status |
|-------------|-------------|--------------|---------------|----------------|----------------------|-----------|--------|
| SC-001 | critical | Harden DRG implementation code review | code-review | exact | Verified by harden round 1 reviewer/executor execution | fresh | verified |
| SC-002 | critical | Harden DAG manager isolation review | code-review | exact | Verified by per-run DAG prefix and archive implementation | fresh | verified |
| SC-003 | critical | Harden dynamic task injection review | code-review | exact | Verified by runDrgAdversarialLoop dynamic task submission | fresh | verified |
| SC-004 | critical | Harden async session bus review | code-review | exact | Verified by DRG task chaining with session ID propagation | fresh | verified |

=======
>>>>>>> Stashed changes
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
| 默认1轮对抗（reviewer→executor→reviewer 为一轮），可配置最多10轮，串行执行。当前默认是 maxRounds=5，改为1。 | 2 | 3 | 5 | 4 | sufficient | - |
| 流程结束当且仅当 reviewer 在一轮审查后认为没有需要继续追的问题（executor 的上报为空或 reviewer 全部认可），或达到 max rounds。终止判定权在 reviewer。 | 2 | 3 | 5 | 4 | sufficient | - |
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
