# quality-gate-harden-workflow-redesign - Design

## Overview

本 feature 重设计 OpenFlow `openflow-quality-gate` 中的 harden 子流程，使其从“自由文本 reviewer/executor 对话”升级为“证据账本驱动、可观察、可降级、可收敛”的质量治理流程。

范围不是单点修复，而是覆盖本轮讨论中的完整问题簇：

- harden reviewer 结论不能直接成为最终事实，必须进入证据链。
- reviewer/executor 不应被设计成无边界对抗，而应通过 evidence ledger 协作。
- harden 过程需要像 explore 子代理一样可观察，但不能回到“每轮一个 task 子代理 session”。
- budget exhausted、max rounds、重复 finding、fixer 无实质修改等情况必须有明确终态。
- 设计-实现分歧、MVP 偏离、文档结构偏好不能被无限升级为无法归档的 spec violation。
- archive/readiness 不能依赖手动修改 generated acceptance state。

## Scope Decision

主范围：`workflow`。

次级属性：`enhancement + refactor`。

理由：这不是全新用户功能，也不只是内部重构；核心是优化现有 quality-gate/harden/archive 工作流，同时需要增强 harden 状态模型和重构当前 session/finding 编排。

## Problem

现有 harden 流程存在四类系统性缺陷：

1. **证据链不足**：reviewer 输出自由文本 finding，quality gate 难以区分已证实缺陷、设计歧义、偏好建议和误报。
2. **过程不可稳定观察**：当前实现每次 reviewer/executor 调用都会创建新的子 session，并在 prompt 中嵌入 `task(...)` 形式，容易造成 session 膨胀、上下级关系丢失和二次嵌套。
3. **不收敛时阻塞过强**：`budget_exhausted` / `max_rounds_reached` 直接阻塞 readiness；重复相同 finding 时没有处置路径。
4. **fixer 落地不可验证**：executor 返回文本被当作 `fixReport`，但 harden 没有检查工作区是否真的产生 material diff，也没有在下一轮 reviewer 前刷新 scoped diff。

## Goals

- 建立 evidence ledger，使 harden finding 成为可验证 claim，而不是最终裁判。
- 建立 finding disposition 模型，支持 `must_fix`、`accepted_known_issue`、`design_divergence`、`false_positive`、`needs_decision`、`superseded`。
- 建立一个 harden run 一个可见 child session 的模型，保留 inline trace。
- 避免每轮创建 task 子代理 session，避免 prompt 内嵌 `task(...)`。
- 增加 fixer material-change 检测：executor 后必须比较 before/after diff hash 或 changed files。
- 下一轮 reviewer 必须基于刷新后的 scoped diff 和 ledger，而不是旧 diff + fix report 文本。
- 将 review non-convergence 与真实代码失败分开处理。
- 让 quality gate 根据 verify 证据、finding disposition 和 harden 终态统一映射 readiness。
- 保持现有入口兼容：`openflow-quality-gate` 仍是 AI-callable skill，`/openflow-harden` 和 `/openflow-verify` 不恢复为正常用户入口。

## Non-Goals

- 不绕过 quality gate。
- 不允许手动修改 generated acceptance state 作为正常流程。
- 不把所有 `budget_exhausted` 自动视为 Ready。
- 不要求 harden 每次都运行完整语义审查。
- 不把 reviewer/executor 的对抗关系作为正确性保证。

## Architecture

### 1. Quality Gate Orchestration

```text
AI completes implementation
  -> openflow-quality-gate
     -> context resolution
     -> risk triage
     -> machine evidence collection
     -> optional harden child session
     -> evidence-aware verify
     -> readiness classification
```

Quality gate 仍然是最终入口。Harden 是 quality gate 内部的风险型子流程，不是用户手动执行的独立治理命令。

### 2. Harden Child Session

每次 harden run 只创建一个可观察 child session：

```text
Quality Gate session
└── Harden: <feature>
    ├── Round 1 reviewer message
    ├── Round 1 executor message
    ├── Round 2 reviewer message
    └── Final harden summary
```

要求：

- child session 使用 `parentID = toolContext.sessionID`。
- reviewer/executor 在同一个 harden session 内连续追加 prompt。
- 不在 prompt 中嵌入 `task(...)`。
- agent 选择由 request body 控制：`body.agent = 'oracle' | 'deep'`。
- Quality Gate 报告输出 Harden Trace：`sessionID`、round、agent、tokens、stop reason、finding summary。

### 3. Evidence Ledger

Harden run 维护结构化账本：

```text
HardenSession
- id
- featureOrIssue
- parentSessionID
- hardenSessionID
- riskLevel
- triggerReasons
- diffHash
- stage
- stopReason
- tokenBudget
- trace[]
- evidenceRefs[]
- findings[]
- finalRecommendation
```

```text
EvidenceRef
- id
- type: diff | test | lint | typecheck | design | issue | impact | review | executor
- sourcePath or command
- scope: files/symbols
- summary
- hash
- freshForDiffHash
- status: fresh | stale | superseded | invalid
```

```text
Finding
- id
- normalizedKey
- level: blocking_bug | spec_violation | regression_risk | test_gap | design_ambiguity | style_or_preference
- claim
- affectedFiles
- evidenceRefs
- confidence
- status: suspected | confirmed | fixed | verified | dismissed | needs_decision
- disposition: must_fix | accepted_known_issue | design_divergence | false_positive | needs_decision | superseded
- repeatCount
```

### 4. Reviewer Rules

Reviewer 只能创建或更新 finding claim，不能直接裁决 readiness。

Reviewer 必须：

- 引用 evidence refs。
- 区分 explicit design violation 与 design ambiguity。
- 对缺少明确设计依据的问题输出 `design_ambiguity` 或 `needs_evidence`，而不是 `spec_violation`。
- 将文档结构偏好、指令层添加、测试覆盖范围争议降级为 `design_divergence` / `accepted_known_issue` / `false_positive` 候选。
- 限制 active findings 数量，避免 finding inflation。

### 5. Executor Rules

Executor 只处理 `confirmed + must_fix` finding。

Executor 可以输出三类结果：

- `fixed`：实际修改文件并说明验证计划。
- `rejected_with_counter_evidence`：提供反证，要求 finding 转为 dismissed 或 needs_decision。
- `blocked`：说明无法自动修复原因。

Executor 后 harden 必须执行 material-change 检测：

```text
beforeDiffHash = hash(scoped git diff before executor)
afterDiffHash = hash(scoped git diff after executor)

if beforeDiffHash == afterDiffHash:
  mark executor result as no_material_fix
  increment finding repeat/no-fix counter
```

如果无实质修改，不能继续让 reviewer 审旧 diff 到预算耗尽。

### 6. Diff Refresh Rule

每轮 reviewer 前必须重新读取 scoped diff：

```text
reviewerInput = latest scoped diff + active ledger summary + fresh evidence refs
```

禁止使用旧 `rollingDiff + Latest fix report` 作为下一轮主要事实源。

### 7. Convergence Guardrails

Harden 应在以下情况提前停止：

- reviewer 单轮 token 超预算。
- 相同 normalized finding 重复达到阈值。
- executor 连续无法产生 material fix。
- finding 本质是设计-实现分歧而非可自动修复缺陷。
- active findings 全部已有 disposition。

新增 stop reasons：

```text
reviewer_no_findings
all_findings_verified
known_issues_accepted
needs_decision
review_inconclusive
token_budget_exhausted
max_rounds_reached
repeated_finding_no_material_fix
executor_blocked
evidence_stale
```

### 8. Known Issue Acceptance

不允许手动改 acceptance state。需要正规处置记录：

```text
KnownIssueAcceptance
- findingId
- disposition
- rationale
- evidenceRefs
- verifyStatus
- acceptedBy: ai | user | decision-doc
- archiveEffect: non_blocking | doc_update_required | decision_required
```

接受 known issue 的前提：

- verify 技术检查通过，或失败项已被明确记录为非阻塞。
- finding 不是未解决的 `must_fix` blocking defect。
- 有 issue/design/decision 上下文说明为什么可以接受。
- Quality Gate 报告中可见。

### 9. Readiness Mapping

Quality gate 根据 verify + harden ledger 统一裁决：

| Condition | Readiness |
|---|---|
| verify fail + unresolved must_fix | NotReady |
| unresolved confirmed blocking/spec violation | NotReady |
| design ambiguity requiring product/architecture choice | NeedsDecision |
| review inconclusive + no accepted disposition | NeedsDecision |
| budget exhausted but findings all disposed and verify pass | ReadyWithDocUpdates or ReadyWithKnownIssues-style report |
| only non-blocking/test-gap/doc divergence remains | ReadyWithDocUpdates |
| all findings verified and verify pass | Ready |

OpenFlow 现有 readiness 枚举若没有 `ReadyWithKnownIssues`，MVP 可先映射到 `ReadyWithDocUpdates`，并在报告中明确 `Known Issues Accepted`。

## Behavior Alignment

| Scenario | Expected Design Response | Risk |
|---|---|---|
| reviewer 反复报告相同 spec_violation | normalized finding repeat counter stops loop and routes to disposition | High |
| executor 返回 fix report 但没有改文件 | material-change detection marks `no_material_fix` and prevents false convergence | High |
| MVP 与设计细节不一致但功能可用 | classify as `design_divergence` / `needs_decision`, not endless must-fix | Medium |
| verify 全绿但 harden budget exhausted | quality gate checks unresolved finding disposition before blocking archive | High |
| 开发者想观察 harden 质量 | one visible harden child session with inline trace | Medium |
| harden 需要多 agent | same child session, different `body.agent`, no nested task prompt | Medium |

## Design Constraints

- [must] 保持 `openflow-quality-gate` 作为 AI 完成代码后的统一入口。
- [must] 不恢复 `/openflow-harden` 和 `/openflow-verify` 作为正常用户工作流入口。
- [must] 不允许通过手动修改 generated acceptance state 推进归档。
- [must] harden reviewer finding 必须有证据引用和处置状态。
- [must] executor 后必须检查是否产生 material workspace change。
- [must] 下一轮 reviewer 必须基于刷新后的 scoped diff。
- [should] token 使用按风险分层触发，低风险跳过 harden，中风险 reviewer-only，高风险才进入 ledger loop。
- [should] 一个 harden run 只创建一个 child session。
- [should] 与现有 config、acceptance、verify、archive 行为兼容。

## Success Criteria

- [ ] Quality Gate 报告包含 Harden Trace：session ID、round、agent、tokens、stop reason。
- [ ] Harden 不再每轮创建独立 child task session。
- [ ] Harden prompt 不再嵌入 `task(...)` 调用文本。
- [ ] Repeated finding/no material fix 能提前停止并给出明确 disposition。
- [ ] `budget_exhausted` / `max_rounds_reached` 不再无条件阻塞归档，而是通过 ledger disposition 和 verify 证据映射 readiness。
- [ ] 设计-实现分歧可以进入 `NeedsDecision` 或 accepted known issue，而不是无限 must-fix。
- [ ] Executor 未落地修改时不会被误认为已修复。
- [ ] 现有 quality-gate、verify、archive 测试继续通过。

## Testing Strategy

- Unit tests for finding normalization, repeat detection, and disposition mapping.
- Unit tests for material diff detection before/after executor.
- Unit tests for harden session creation: one child session per run, multiple prompts in same session.
- Unit tests ensuring prompt payload does not include `task(...)` wrapper.
- Quality gate tests for readiness mapping: budget exhausted, max rounds, needs decision, accepted known issues.
- Archive/readiness tests proving generated acceptance state is not manually edited and accepted known issues are auditable.

## Risks And Mitigations

- **Risk**: accepted known issue becomes a bypass.  
  **Mitigation**: require evidence refs, verify status, rationale, and visible report output.
- **Risk**: ledger adds implementation complexity.  
  **Mitigation**: MVP starts with in-memory/markdown trace and minimal structured data before persistence expansion.
- **Risk**: session API may not support changing agent per prompt in same session.  
  **Mitigation**: feature requires confirming API behavior; if unsupported, use one harden session as parent trace and record child message refs without per-round task nesting.
- **Risk**: readiness enum lacks `ReadyWithKnownIssues`.  
  **Mitigation**: map to `ReadyWithDocUpdates` in MVP while preserving explicit known-issue section.
