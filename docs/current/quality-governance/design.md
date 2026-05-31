# 重构 OpenFlow 的质量门工作流：将 harden 从 quality-gate 拆成独立可改代码节点；新增 final-verify 与 code-mapper 内部节点；quality-gate 收敛为只读 readiness 判定节点；集成测试 - Design

## Human Consensus Summary

Feature title: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
Internal slug: openflow-implement-quality-gate
Source intent: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
Problem or improvement target: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
Expected result: Solve: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。; Serve target users: 内部开发者; Honor priority: 风险最小

## Identity And Assumptions

- Feature slug: openflow-implement-quality-gate
- Feature title: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
- Source intent: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
- Assumptions:
  - Not specified.
- Pending confirmations:
  - Not specified.

## Overview

Feature: openflow-implement-quality-gate
Target users: 内部开发者
In scope: openflow-implement-quality-gate workflow; Address the stated problem: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
Out of scope: Large product-surface expansion beyond workflow optimization

## Problem

质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。

## Goals

- Solve: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
- Serve target users: 内部开发者
- Honor priority: 风险最小

## Non-Goals

- Unrelated product areas or workflows
- Broad product expansion outside the workflow itself

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
| openflow-implement-quality-gate addresses the stated problem: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。 | Captured as observable product/workflow behavior; implementation structure is deferred until planning. | Medium |
| openflow-implement-quality-gate works for the target users: 内部开发者 | Captured as observable product/workflow behavior; implementation structure is deferred until planning. | Medium |
| openflow-implement-quality-gate implementation reflects the selected priority: 风险最小 | Captured as observable product/workflow behavior; implementation structure is deferred until planning. | Medium |

## Design Constraints

- [may] Optimize workflow steps without introducing unnecessary product surface area
- [must] Code edits must still be verified, but code edits alone must not automatically trigger Full Quality Gate.
- [must] Full Quality Gate must remain mandatory after `/openflow-implement` final implementation work.
- [must] Full Quality Gate must run when the user explicitly requests quality gate, final verification, or equivalent delivery-readiness validation.
- [must] Full Quality Gate must run when the current task is clearly a formal feature or bugfix delivery.
- [must] `/openflow-quality-gate` must remain available outside `/openflow-implement` as an explicit verification capability.
- [must] Making `/openflow-quality-gate` available outside `/openflow-implement` must not make it the default automatic response to all code edits.
- [must] In casual coding conversations, the assistant must not invoke Full Quality Gate merely because it edited code.
- [must] In casual coding conversations, the assistant may autonomously perform lightweight verification appropriate to the change.
- [should] In casual coding conversations, the assistant should ask before invoking Full Quality Gate unless a mandatory trigger applies.
- [must] The workflow must distinguish Full Quality Gate from lightweight verification.
- [must] Lightweight verification may include diff review, targeted tests, typecheck, lint, build, or change-risk summary depending on the target project.
- [must] Full Quality Gate represents final/formal verification and readiness assessment, not the default verification path for every edit.
- [must] Quality gate admission must evaluate the target workspace/project being modified, not assume changes are inside the OpenFlow repository.
- [must] Admission rules must avoid hard-coding OpenFlow repository paths as the basis for target-project risk classification.
- [must] Admission must upgrade to Full Quality Gate when change impact is unclear, formal delivery is intended, or the target project lacks adequate verification for behavior-changing edits.
- [should] Admission should treat security, permission, data, deployment, dependency, public API, shared infrastructure, and cross-module changes as Full Quality Gate candidates.
- [must] Keep a rollback path available for the change
- [must] Keep the change scope narrow to reduce regression surface area
- [must] Protect existing behavior with explicit regression coverage

## Risks And Mitigations

- Risk: The change could accidentally weaken `/openflow-implement` final verification.
  - Mitigation: Treat `/openflow-implement` final verification as a mandatory Full Quality Gate trigger and protect it with regression coverage.
- Risk: Casual coding could still over-trigger Full Quality Gate if prompt wording remains too broad.
  - Mitigation: Explicitly state that code edits require verification, but do not by themselves require Full Quality Gate.
- Risk: Target-project risk could be misclassified by OpenFlow-repository-specific path rules.
  - Mitigation: Define admission around target workspace context, verification capability, formal-delivery intent, and risk categories rather than fixed OpenFlow paths.
- Risk: Opening `/openflow-quality-gate` outside `/openflow-implement` could be confused with making it automatic everywhere.
  - Mitigation: Document it as an explicit public verification capability whose automatic use is still governed by admission rules.

## Testing Strategy

Use targeted tests and review to verify: 风险最小

- Regression test that `/openflow-implement` still requires Full Quality Gate at final verification.
- Regression test that an explicit user request for quality gate/final verification can run Full Quality Gate outside `/openflow-implement`.
- Regression test or prompt-behavior fixture that casual coding with a low-risk edit selects lightweight verification and does not automatically invoke Full Quality Gate.
- Regression test or scenario review that high-risk or unclear target-project changes upgrade to Full Quality Gate or ask before invoking it when no mandatory trigger applies.
- Review that admission wording avoids OpenFlow-repository-specific path assumptions for target-project risk classification.
- **New**: Test that quality gate output does NOT contain `nextCommand: openflow-quality-gate` when NotReady.
- **New**: Test that quality gate report contains "Code Changes" section when harden/verify modify files.
- **New**: Test that retry counter stops at 2 and escalates to user on third NotReady.

<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:BEGIN -->

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

- [ ] openflow-implement-quality-gate addresses the stated problem: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
- [ ] openflow-implement-quality-gate works for the target users: 内部开发者
- [ ] openflow-implement-quality-gate implementation reflects the selected priority: 风险最小
- [ ] Casual coding code edits use basic or lightweight verification by default instead of automatically invoking Full Quality Gate.
- [ ] `/openflow-implement` final verification still requires Full Quality Gate.
- [ ] User-explicit quality gate or final-verification requests can invoke Full Quality Gate outside `/openflow-implement`.
- [ ] Admission decisions are based on the target workspace/project context rather than OpenFlow repository path assumptions.

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

- Status: Passed
- Documents checked in order:

- Non-blocking gaps: 0
<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:END -->

# 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。 - Design

## Architecture Decision: State Machine + Pyramid Layering

### Decision

Refactor `handleQualityGate` from a monolithic "god function" into a **state machine** with four explicit phases. Each phase is a self-contained state with single responsibility.

### Pyramid Structure

```
Top:    Quality Gate = Readiness Assessment Only (not execution, not command)
        └── Must NOT command retry; must NOT auto-loop

Layer 1: Detect  → Risk assessment + applicability classification
Layer 2: Harden  → Adversarial review + code fixes (changes visible to user)
Layer 3: Verify  → Evidence checks + test execution (changes visible to user)
Layer 4: Assess  → Final readiness classification based on Harden+Verify results
```

### State Machine Transitions

```
Detect ──[harden required]──→ Harden ──[complete]──→ Verify ──[complete]──→ Assess
   ↑                                                              │
   └──────────────────[NotReady, retry < 2]───────────────────────┘
   └──────────────────[NotReady, retry >= 2]──→ STOP, escalate to user
```

### Design Patterns Applied

1. **State Pattern**: Each phase (Detect/Harden/Verify/Assess) is an independent state class.
2. **Template Method**: Each state follows `enter → execute → exit` skeleton; shared logic (code-change capture) lives in base class.
3. **Observer Pattern**: State transitions notify `ImplementationRunStore`, `AcceptanceState`, `Logger`.
4. **Chain of Responsibility**: Admission strategy evaluation uses strategy chain (`Formal → Explicit → HighRisk → Casual`).

### Dead Loop Fix

- Remove unconditional "re-invoke the gate" from skill instruction.
- Remove `nextCommand: openflow-quality-gate` from NotReady/NeedsDecision output.
- Add max-retry guard (2 rounds); third NotReady forces escalation to user.

### Code Change Visibility

- Harden state captures `git diff --stat` before and after execution.
- Verify state captures file changes during verification.
- Quality Gate report includes aggregated "Code Changes" section.
- Changes are persisted to `acceptance-state` via observer.
