# 重构 OpenFlow 的质量门工作流：将 harden 从 quality-gate 拆成独立可改代码节点；新增 final-verify 与 code-mapper 内部节点；quality-gate 收敛为只读 readiness 判定节点；集成测试 - Design


## Human Consensus Summary

Feature title: 重构 OpenFlow 的质量门工作流：将 harden 从 quality-gate 拆成独立可改代码节点；新增 final-verify 与 code-mapper 内部节点；quality-gate 收敛为只读 readiness 判定节点；集成测试
Internal slug: openflow-harden-quality-gate-final-verify-code-mapper
Source intent: 重构 OpenFlow 的质量门工作流：将 harden 从 quality-gate 拆成独立可改代码节点；新增 final-verify 与 code-mapper 内部节点；quality-gate 收敛为只读 readiness 判定节点；集成测试
Problem or improvement target: 重构 OpenFlow 的质量门工作流：将 harden 从 quality-gate 拆成独立可改代码节点；新增 final-verify 与 code-mapper 内部节点；quality-gate 收敛为只读 readiness 判定节点；集成测试
Expected result: Solve: 重构 OpenFlow 的质量门工作流：将 harden 从 quality-gate 拆成独立可改代码节点；新增 final-verify 与 code-mapper 内部节点；quality-gate 收敛为只读 readiness 判定节点；集成测试
## Identity And Assumptions

- Feature slug: openflow-harden-quality-gate-final-verify-code-mapper
- Feature title: 重构 OpenFlow 的质量门工作流：将 harden 从 quality-gate 拆成独立可改代码节点；新增 final-verify 与 code-mapper 内部节点；quality-gate 收敛为只读 readiness 判定节点；集成测试
- Source intent: 重构 OpenFlow 的质量门工作流：将 harden 从 quality-gate 拆成独立可改代码节点；新增 final-verify 与 code-mapper 内部节点；quality-gate 收敛为只读 readiness 判定节点；集成测试
- Assumptions:
  - Expected outcome is inferred from the source intent and should be revisited if implementation needs a sharper success criterion.
  - final-verify 是 implementation-constraints enforcement 的归属点，quality-gate 只消费 final-verify 结果
  - code-mapper 仍是独立内部节点，但触发条件不变（Ready/ReadyWithDocUpdates + behavior.md 存在）
  - implementation-constraints feature 的 behavior 场景 4 和 5 需同步更新 enforcement 归属
  - quality-gate 优先复用当前调用链已绑定的结构化 ImplementationRun；仅在缺失时才从持久化 run store 恢复 active run
- Resolved decisions:
  - verify / final-verify 边界：**已决策**。verify 只收集 evidence，final-verify 做最终判定与汇总。
  - code-mapper 失败语义：**已决策**。不阻断 readiness，降级为 warning observation。

## Overview

Feature: openflow-harden-quality-gate-final-verify-code-mapper
In scope: 将 quality-gate 的内部 harden/verify/mapper 步骤拆为独立节点；新增 final-verify 汇总节点；quality-gate 收敛为只读 readiness 判定

## Problem

当前 quality-gate 节点（`src/commands/quality-gate.ts`）内部执行 harden、verify、implementation-mapper 生成，职责过重，导致：

1. harden 无法作为独立流程被单独调用或测试
2. verify 的证据收集与 readiness 判定耦合
3. implementation-mapper 的生成是 quality-gate 的尾部副作用，无法独立触发或测试
4. implementation-constraints 的 enforcement 语义需要明确的归属节点
5. 集成测试难以验证单个节点的行为边界

## Goals

- 将 harden 从 quality-gate 内部步骤拆为独立可改代码节点（`src/commands/harden.ts` 已存在，需解除与 quality-gate 的内部耦合）
- 新增 final-verify 内部节点，负责汇总 verify evidence、harden result、constraints verification、root mismatch check，产出最终 verification result
- 将 code-mapper（`src/phases/archive/implementation-mapper.ts` 中的 `generateBehaviorCodeMapper()`）变为独立内部节点
- quality-gate 收敛为只读 readiness 判定节点，只消费前置节点输出
- 编写集成测试覆盖节点编排、阻断路径、回归保护

## Non-Goals

- 不改变 harden 的 finding 类型、reviewer/executor 行为
- 不改变 verify 的 evidence packet 格式
- 不改变 applicability 分类规则
- 不改变 execution root mismatch 语义
- 不改变 archive-workflow（只同步更新 documentation authority）
- 不引入新的 readiness 状态

## 新旧流程对照

| 维度 | 旧流程（当前） | 新流程（本 feature） |
|------|----------------|---------------------|
| harden 执行 | quality-gate 内部调用 `handleHarden()` | 独立节点，可由 quality-gate 编排器按风险触发或独立调用 |
| verify 执行 | quality-gate 内部调用 `handleVerify()` | 独立 verify 节点产出 evidence packet |
| readiness 判定 | quality-gate 合并 harden + verify 结果后判定 | quality-gate 只读取 final-verify result，不执行任何主动验证 |
| constraints enforcement | quality-gate 中 `verifyConstraintSatisfaction()`（当前独立在 `constraint-verifier.ts`） | final-verify 中执行（迁移 `constraint-verifier.ts` 的调用），quality-gate 只消费结果 |
| mapper 生成 | quality-gate Ready 后调用 `generateBehaviorCodeMapper()` | 独立 code-mapper 节点，条件不变 |
| 节点编排 | 单体 `handleQualityGate()` 内顺序调用 | 编排器按序触发独立节点链 |

## 节点职责边界

### harden（独立可改代码节点）

- **输入**：feature, feature-scoped diff, design, plan, behavior
- **输出**：harden result（findings, status: pass / pass_with_risks / needs_human / max_rounds_reached / rejected）
- **职责**：契约加固；reviewer 判断实现是否符合契约；executor 最小修复
- **禁止**：不能改文档解决契约分歧；不能批准 contract divergence
- **调用方**：quality-gate 编排器（按风险判定触发）或独立调用

### verify（证据收集节点）

- **输入**：feature, execution root, design/plan/behavior context
- **输出**：evidence packet（checks_run, check_results, observed_behavior_summary, intended_vs_actual_delta, doc_alignment_summary, current_decisions_conflict_summary, known_risks_or_missing_evidence）
- **职责**：收集技术证据、检查 behavior scenario coverage、评估 doc alignment
- **不负责**：不做最终 readiness 判定；不做 constraints enforcement
- **调用方**：quality-gate 编排器

### final-verify（最终一致性验证节点）

- **输入**：verify evidence packet, harden result, constraints.md + git diff（如存在约束文件）, execution root
- **输出**：final verification result（readiness_recommendation: Ready / ReadyWithDocUpdates / NotReady / NeedsDecision, constraint_satisfaction: satisfied / blocked / skipped, root_mismatch: boolean, behavior_coverage: summary）
- **职责**：
  1. 汇总 verify evidence 和 harden result
  2. 执行 constraints enforcement（implementation-constraints 的 enforcement 归属点）
  3. 检查 execution root mismatch
  4. 评估 behavior scenario 覆盖完整性
  5. 产出最终 readiness_recommendation
- **约束证据要求**：必须是命令输出（grep、测试结果），不接受口头陈述或 observation log
- **调用方**：quality-gate 编排器

### code-mapper（独立内部节点）

- **输入**：feature, behavior.md, evidence packet（来自 verify）
- **输出**：`docs/changes/{feature}/implementation-mapper.md`
- **触发条件**：final-verify 返回 Ready 或 ReadyWithDocUpdates，且存在 `behavior.md`
- **生成失败**：不阻断 readiness，降级为 warning observation
- **调用方**：quality-gate 编排器（在 final-verify 之后）

### quality-gate（只读 readiness 判定节点）

- **输入**：final-verify result, code-mapper result（如有）
- **输出**：readiness 报告 + acceptance state 更新 + ImplementationRun 状态更新
- **职责**：
  1. 优先使用当前调用链中已绑定的结构化 `ImplementationRun` / `runID`
  2. 若当前调用链缺少 run，再从持久化 run store 恢复 active `ImplementationRun`
  3. 若仍无 run，则降级为当前目录的 limited-context / no-run 验证
  4. 读取 final-verify result
  5. 映射为最终 readiness（Ready / ReadyWithDocUpdates / NotReady / NeedsDecision）
  6. 写 acceptance state
  7. 更新 ImplementationRun 状态
  8. 输出 readiness 报告
- **禁止**：不执行 harden；不执行 verify；不做 constraints enforcement；不生成 mapper；不改代码

## ImplementationRun 解析优先级

quality-gate 依赖 `ImplementationRun` 的主要目的不是“重新获取计划内容”，而是恢复**结构化运行状态**，尤其是 execution root、worktree 路径、run 状态和 root mismatch 校验基线。

推荐的解析优先级如下：

1. **当前调用链已绑定的结构化 run / runID**
   - 例如 implement → quality-gate 的同链路调用，或当前 session 中已显式注入 `ImplementationRun`。
   - 这是首选路径，避免无意义地扫描磁盘 run store。
2. **当前会话可用的内存 active run**
   - 例如 observer / session 层已经绑定了 active run。
   - 可直接复用，但仍需做 execution root 与 terminal status 轻量校验。
3. **持久化 run store 恢复 active run**
   - 仅当前两级都缺失时，调用 `findActiveImplementationRun()` / run store 扫描。
   - 该路径用于跨会话恢复、AI 重启恢复、worktree 隔离恢复。
4. **无 run 降级路径**
   - 若完全无法解析 run，则以当前目录继续 limited-context / no-run 验证。
   - 这种模式下不能提供完整的 run 生命周期保护，但仍可执行有限质量验证。

无论 run 来源是什么，都必须保留两类轻量校验：

- execution root 是否与 run 记录一致
- run 是否已经进入 terminal status（如 `archived` / `blocked` / `failed` / `cancelled`）

## 节点编排顺序

```
实现/修复完成
  ↓
quality-gate 编排器启动
  ↓
1. 解析 feature + execution root
   - 优先复用当前调用链的结构化 `ImplementationRun`
   - 缺失时再从持久化 run store 恢复 active run
   - 仍缺失则降级为当前目录验证
  ↓
2. Applicability 分类
  ├─ not_applicable / needs_workflow_stage → 返回适用性报告，终止
  └─ applicable / limited_context → 继续
  ↓
3. 风险评估 → 决定是否触发 harden
  ↓
4. [如需 harden] 执行 harden 节点
  ↓
5. 执行 verify 节点
  ↓
6. 执行 final-verify 节点
  ↓
7. quality-gate 读取 final-verify result → 判定 readiness
  ↓
8. [如 Ready/ReadyWithDocUpdates 且有 behavior.md] 执行 code-mapper 节点
  ↓
9. 写 acceptance state + 更新 run 状态 + 输出报告
```

## 保留不变量

| # | 不变量 | 来源 | 验证方式 |
|---|--------|------|----------|
| I1 | execution root mismatch 强制 NotReady | quality-gate-workflow.md 规则 36-37 | 集成测试 |
| I2 | Applicability 分类语义不变（not_applicable / needs_workflow_stage / limited_context / applicable） | quality-gate-workflow.md 规则 10-16 | 回归测试 |
| I3 | harden 不能通过改文档解决契约分歧 | quality-gate-workflow.md 规则 13-14 | 集成测试 |
| I4 | 约束验证证据必须是命令输出（grep、测试结果） | implementation-constraints/design.md D5 | 集成测试 |
| I5 | implementation-mapper 仅在 Ready/ReadyWithDocUpdates 且存在 behavior.md 时生成 | quality-gate-workflow.md 规则 41 | 集成测试 |
| I6 | quality-gate 不自动归档 | quality-gate-workflow.md 规则 50 | 回归测试 |
| I7 | limited_context 不得升级为完整 archive readiness | quality-gate-workflow.md 规则 15 | 集成测试 |
| I8 | harden 的 finding 类型集不变 | quality-gate-workflow.md 规则 11 | 回归测试 |

## implementation-constraints enforcement 归属

采用方案 B：enforcement 前移到 final-verify。

| 维度 | 方案 B（采用） |
|------|---------------|
| enforcement 执行点 | final-verify 节点 |
| quality-gate 角色 | 只读取 final-verify 的 constraint_satisfaction 结果 |
| 语义变更 | "enforcement is at quality gate" → "enforcement is performed during final-verify, consumed by quality-gate readiness judgment" |
| 对 implementation-constraints 文档的影响 | design.md D3 和 QualityGate 增强章节需更新 enforcement 归属描述 |
| 对 behavior.md 的影响 | 场景 4 和 5 的触发描述需从 "quality gate reads and enforces" 改为 "final-verify reads and enforces, quality-gate consumes result" |
| 实现迁移路径 | `src/commands/constraint-verifier.ts` 已有 `verifyConstraintSatisfaction()` 和注释 "Transitional path — this will migrate to final-verify"，final-verify 直接导入复用 |

## Behavior Alignment

| Behavior Scenario | Design Response | Risk |
|------------------|-----------------|------|
| 独立 harden 节点可运行并产出 harden result | harden 从 quality-gate 内部步骤拆为独立节点，保留现有 finding 类型和 review/executor 行为 | Medium |
| verify 产出 evidence packet，不直接决定 readiness | verify 只负责证据收集，readiness 判定由 final-verify 完成 | Low |
| final-verify 汇总所有前置结果并产出 readiness_recommendation | 新增 final-verify 节点，包括 constraints enforcement 和 root mismatch | High |
| quality-gate 只读消费 final-verify result | quality-gate 不再调用 handleHarden / handleVerify，只读取结果 | High |
| constraints enforcement 在 final-verify 执行 | 从 quality-gate 前移到 final-verify，保持证据要求不变 | Medium |
| code-mapper 独立生成 | 从 quality-gate 尾部副作用拆为独立节点，条件不变 | Low |

## Design Constraints

| # | 约束 | 来源 | 理由 |
|---|------|------|------|
| DC1 | quality-gate 不得直接调用 `handleHarden()` 或 `handleVerify()` | 本 feature 目标 | 职责分离 |
| DC2 | final-verify 是 constraints enforcement 的唯一点 | implementation-constraints D3 | 避免重复验证 |
| DC3 | code-mapper 生成失败不阻断 readiness | 可操作性 | mapper 是辅助产物 |
| DC4 | 节点编排顺序不可跳过（applicability → risk → harden? → verify → final-verify → quality-gate → mapper?） | 流程完整性 | 防止绕过检查 |
| DC5 | 所有现有 acceptance-state 字段语义保持向后兼容 | 消费者兼容性 | archive 和 UI 依赖这些字段 |
| DC6 | harden 独立后仍由 quality-gate 编排器按风险触发 | 现有行为保留 | 非无条件执行 |
| DC7 | quality-gate 必须优先复用当前调用链的结构化 ImplementationRun，仅在缺失时才恢复 active run | 运行时效率 + 跨会话恢复 | 避免把 LLM 上下文误当作 authority，同时减少无意义恢复 |

## Risks And Mitigations

| # | 风险 | 影响 | 缓解 |
|---|------|------|------|
| R1 | 节点间数据传递格式变更导致 acceptance state 不兼容 | archive 或 UI 无法解析 | 保持现有 acceptance state 字段名和语义，新字段使用新 key |
| R2 | final-verify 与 verify 职责边界模糊 | 开发者不确定在哪层实现什么检查 | 明确文档：verify 收集证据，final-verify 做判定和汇总 |
| R3 | constraints enforcement 归属迁移遗漏 | quality-gate 和 final-verify 都做或都不做 | 唯一归属点 + 集成测试 |
| R4 | code-mapper 生成时机漂移 | mapper 在非 Ready 状态下生成或 Ready 下未生成 | 保持触发条件不变 + 集成测试 |
| R5 | 旧 quality-gate-workflow.md 与新文档冲突 | 实现者不确定以哪份为准 | feature 文档明确为替代关系，实现完成后同步更新 current workflow |
| R6 | 集成测试覆盖不足 | 重构引入回归 | 每个 invariant 对应至少一个集成测试 |
| R7 | 每次都扫描 active run 导致语义混乱 | 同会话场景把持久化恢复误当主路径 | 明确优先级：结构化 run → 内存 active run → 持久化恢复 → 无 run 降级 |

## Testing Strategy

### 集成测试（必须）

| 测试 | 验证目标 | 对应不变量 |
|------|----------|-----------|
| harden 独立可调用 | harden 节点可独立运行并产出 findings | — |
| quality-gate 不直接调用 harden | `handleQualityGate` 不包含 `handleHarden` 调用 | DC1 |
| verify → final-verify → readiness | 节点链顺序正确 | DC4 |
| run 解析优先级正确 | 已绑定 run 时不必扫描磁盘；缺失时仍可恢复 active run | DC7 |
| root mismatch 强制 NotReady | execution root 不匹配时 readiness = NotReady | I1 |
| constraints 缺证据阻断 | final-verify 在 blocking constraint 无命令输出时返回 blocked | I4 |
| code-mapper 生成条件 | Ready + behavior.md → mapper 生成；其他情况 → 不生成 | I5 |
| limited_context 不升级 | limited_context + Ready → 不自动等于 archive readiness | I7 |
| harden 契约分歧不可通过改文档解决 | finding = contract_divergence → executor 只改代码 | I3 |

### 回归测试

- 现有 quality-gate 测试必须全部通过
- 现有 harden 测试必须全部通过
- 现有 verify 测试必须全部通过
- 现有 implementation-mapper 测试必须全部通过

## Success Criteria

- [ ] quality-gate 不再直接调用 `handleHarden()`（DC1）
- [ ] quality-gate 不再直接调用 `handleVerify()`（DC1）
- [ ] final-verify 是 constraints enforcement 的唯一点（DC2）
- [ ] code-mapper 在 Ready/ReadyWithDocUpdates + behavior.md 存在时生成，其他情况不生成（I5）
- [ ] code-mapper 生成失败不阻断 readiness（DC3）
- [ ] quality-gate 优先复用当前调用链的结构化 ImplementationRun，仅在缺失时恢复 active run（DC7）
- [ ] execution root mismatch 仍强制 NotReady（I1）
- [ ] Applicability 分类语义不变（I2）
- [ ] limited_context 不升级为完整 archive readiness（I7）
- [ ] 现有测试全部通过
- [ ] 新增集成测试覆盖 DC1-DC6 和 I1-I8

## 与 implementation-constraints 的对齐

| 维度 | implementation-constraints 现有表述 | 需更新为 |
|------|-------------------------------------|----------|
| D3 blocking 语义 | "quality gate 时 enforcement（阻断）" | "final-verify 时 enforcement（阻断），quality-gate 消费判定结果" |
| QualityGate 增强章节 | quality-gate 中 `verifyConstraintSatisfaction()` | final-verify 中 `verifyConstraintSatisfaction()`，quality-gate 读取结果 |
| behavior 场景 4 | "quality gate reads the constraints file" | "final-verify reads the constraints file, quality-gate consumes result" |
| behavior 场景 4 触发 | "/openflow-quality-gate" 触发 | "/openflow-quality-gate" 触发编排器，enforcement 在 final-verify 中执行 |

## 实现完成后必须同步的文档

- [ ] `docs/changes/2026-05-27-openflow-harden-quality-gate-final-verify-code-mapper/workflow-sync-draft.md`：作为 `docs/current` 同步草案维护，不能替代 current authority
- [ ] `docs/current/workflow/quality-gate-workflow.md`：替换为新的节点编排流程
- [ ] `docs/current/workflow/archive-workflow.md` 第 5 节：更新 mapper 生成来源描述
- [ ] 确认 `docs/decisions/ADR-001-docs-governance-and-workflow.md` 中 implementation-mapper 的 authority 定义不受影响

<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:BEGIN -->
## Cross-Validation Summary

- Status: Passed (conditional — design constraints and behavior scenarios require implementation verification)
- Documents checked in order:
  1. design.md (this document)
  2. behavior.md (scenarios align with node responsibilities)
  3. state.md (status to be updated)
  4. implementation-constraints/design.md (D3 enforcement alignment)
  5. implementation-constraints/behavior.md (scenarios 4-5 alignment)
  6. quality-gate-workflow.md (current baseline, to be replaced post-implementation)
- Non-blocking gaps: 1 (final-verify vs verify exact boundary to be refined during planning)
<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:END -->
