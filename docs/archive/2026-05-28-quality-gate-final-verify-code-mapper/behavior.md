# 重构 OpenFlow 的质量门工作流：将 harden 从 quality-gate 拆成独立可改代码节点；新增 final-verify 与 code-mapper 内部节点；quality-gate 收敛为只读 readiness 判定节点；集成测试 - Observable Behavior


## Human Consensus Summary

Feature title: 重构 OpenFlow 的质量门工作流：将 harden 从 quality-gate 拆成独立可改代码节点；新增 final-verify 与 code-mapper 内部节点；quality-gate 收敛为只读 readiness 判定节点；集成测试
Internal slug: openflow-harden-quality-gate-final-verify-code-mapper
Source intent: 重构 OpenFlow 的质量门工作流：将 harden 从 quality-gate 拆成独立可改代码节点；新增 final-verify 与 code-mapper 内部节点；quality-gate 收敛为只读 readiness 判定节点；集成测试
Problem statement: 重构 OpenFlow 的质量门工作流：将 harden 从 quality-gate 拆成独立可改代码节点；新增 final-verify 与 code-mapper 内部节点；quality-gate 收敛为只读 readiness 判定节点；集成测试

## User Context

**Problem statement:** 重构 OpenFlow 的质量门工作流：将 harden 从 quality-gate 拆成独立可改代码节点；新增 final-verify 与 code-mapper 内部节点；quality-gate 收敛为只读 readiness 判定节点；集成测试

## Trigger Rules

These conditions activate or require the feature behavior:

- Goal-driven: Solve: 重构 OpenFlow 的质量门工作流：将 harden 从 quality-gate 拆成独立可改代码节点；新增 final-verify 与 code-mapper 内部节点；quality-gate 收敛为只读 readiness 判定节点；集成测试
- In-scope match: openflow-harden-quality-gate-final-verify-code-mapper
- In-scope match: Address the stated problem: 重构 OpenFlow 的质量门工作流：将 harden 从 quality-gate 拆成独立可改代码节点；新增 final-verify 与 code-mapper 内部节点；quality-gate 收敛为只读 readiness 判定节点；集成测试

## Non-Trigger Rules

These conditions do NOT activate the feature:

- Not a goal: Unrelated product areas or workflows

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

- Must include: harden 独立节点
- Must include: verify 证据收集
- Must include: final-verify 汇总判定
- Must include: quality-gate 只读消费
- Must include: constraints enforcement 在 final-verify
- Must include: code-mapper 独立生成
- Must include: root mismatch 阻断
- Must include: limited_context 不升级
- Required outcome: quality-gate 收敛为只读 readiness 判定节点

## Success Responses

**Success:** quality-gate 不再内部执行 harden、verify 或 constraints enforcement，只读取 final-verify result 并给出 readiness。

**Success:** harden、verify、final-verify、code-mapper 均可独立运行和测试。

**Success:** 所有现有行为语义保持不变（root mismatch、applicability、evidence freshness）。

## Must Not Behavior

The following outcomes must not occur as user-visible behavior:

- Must not: quality-gate 直接调用 handleHarden() 或 handleVerify()
- Must not: quality-gate 自行执行 constraints enforcement
- Must not: quality-gate 在 final-verify 未完成时判定 readiness
- Must not: code-mapper 在 NotReady/NeedsDecision 状态下生成
- Must not: limited_context 被自动升级为完整 archive readiness
- Must not: harden 的 executor 改文档解决契约分歧

## Acceptance / Verification Mapping

Each acceptance criterion maps to an observable scenario and verification approach:

| Acceptance Criterion | Scenario | Evidence Type | Expected Evidence | Status |
|---------------------|----------|--------------|-------------------|--------|
| quality-gate 不调用 handleHarden | Scenario 4 | automated | 代码审查 / 集成测试确认编排器不包含 handleHarden 调用 | pending |
| quality-gate 不调用 handleVerify | Scenario 4 | automated | 代码审查 / 集成测试确认编排器不包含 handleVerify 调用 | pending |
| final-verify 是 enforcement 唯一点 | Scenario 3, 7 | automated | 集成测试确认 constraints enforcement 只在 final-verify | pending |
| run 解析优先级正确 | Scenario 3, 4 | automated | 已绑定 run 时直接复用；缺失时恢复 active run；仍缺失时降级 no-run 验证 | pending |
| root mismatch 强制 NotReady | Scenario 6 | automated | 集成测试 | pending |
| code-mapper 条件触发 | Scenario 5 | automated | 集成测试 | pending |
| limited_context 不升级 | Scenario 8 | automated | 集成测试 | pending |
| harden 契约分歧不改文档 | Scenario 10 | automated | 集成测试 | pending |
| 现有测试全部通过 | All | automated | npm test exits 0 | pending |

<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:BEGIN -->
## Cross-Validation Summary

- Status: Passed (conditional — scenarios 1-10 align with design.md node responsibilities)
- Documents checked in order:
  1. behavior.md (this document)
  2. design.md (node responsibilities match scenarios)
  3. state.md (status to be updated)
  4. implementation-constraints/behavior.md (scenarios 4-5 enforcement alignment)
  5. quality-gate-workflow.md (current baseline, to be replaced post-implementation)
- Non-blocking gaps: 1 (code-mapper 生成失败降级为 warning 需在 planning 阶段确认具体 observation 格式)
<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:END -->
