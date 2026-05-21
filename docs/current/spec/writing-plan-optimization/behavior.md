# writing-plan-optimization - Observable Behavior

## User Context

用户希望 OpenFlow 通过文档和状态共同约束 AI：不让 AI 跑偏、不乱写代码、不跳过验证，并尽量通过一次 feature 完成需求，而不是让用户后续手动修补。

## Trigger Rules

These conditions activate or require the feature behavior:

- AI writes or edits runtime source code, tests, public API, commands, hooks, or bugfix-related files.
- AI attempts to claim completion after implementation-like changes.
- `openflow-quality-gate` produces readiness for a feature or issue.
- Additional implementation-like changes occur after readiness was produced.
- `/openflow-archive` is requested for a feature or issue with prior readiness.

## Non-Trigger Rules

These conditions do NOT activate the implementation dirty hard path:

- The change is design-only.
- The change is planning-only.
- The change is docs-only with no implementation diff.
- The change is metadata-only and does not affect runtime behavior.
- The quality gate applicability classifier returns NotApplicable/SkippedByStage.

## User-Visible Scenarios

### Scenario: 运行 `/openflow-writing-plan <feature>` 后输出双路径

**Given:**
- The target user is: 内部开发者
- The problem context is: `openflow-writing-plan` 存在三层放大导致 subagent 爆炸和路径缺失

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- 运行 `/openflow-writing-plan <feature>` 后输出双路径
- The outcome is visible to the user or caller without inspecting implementation internals

### Scenario: OMO 安装时 skill 指导保存两份内容一致的 plan.md

**Given:**
- The target user is: 内部开发者
- The problem context is: `openflow-writing-plan` 存在三层放大导致 subagent 爆炸和路径缺失

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- OMO 安装时 skill 指导保存两份内容一致的 plan.md
- The outcome is visible to the user or caller without inspecting implementation internals

### Scenario: 写入 plan 后 enhancer 不再注入 checkbox 格式的 TDD expansion

**Given:**
- The target user is: 内部开发者
- The problem context is: `openflow-writing-plan` 存在三层放大导致 subagent 爆炸和路径缺失

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- 写入 plan 后 enhancer 不再注入 checkbox 格式的 TDD expansion
- The outcome is visible to the user or caller without inspecting implementation internals

### Scenario: 写入 plan 后 enhancer 不再注入 Verification Phase checkbox

**Given:**
- The target user is: 内部开发者
- The problem context is: `openflow-writing-plan` 存在三层放大导致 subagent 爆炸和路径缺失

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- 写入 plan 后 enhancer 不再注入 Verification Phase checkbox
- The outcome is visible to the user or caller without inspecting implementation internals

### Scenario: Plan budget 超过阈值时输出警告

**Given:**
- The target user is: 内部开发者
- The problem context is: `openflow-writing-plan` 存在三层放大导致 subagent 爆炸和路径缺失

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- Plan budget 超过阈值时输出警告
- The outcome is visible to the user or caller without inspecting implementation internals

### Scenario: Task 段落 parser 兼容性不变

**Given:**
- The target user is: 内部开发者
- The problem context is: `openflow-writing-plan` 存在三层放大导致 subagent 爆炸和路径缺失

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- Task 段落 parser 兼容性不变
- The outcome is visible to the user or caller without inspecting implementation internals

## Required Content

The following content or outcomes must be present in any successful response:

- Must include: implementation dirty/stale state after implementation-like edits.
- Must include: completion claim guard before verified readiness.
- Must include: quality-gate as the standard path to clear dirty/stale state.
- Must include: readiness freshness invalidation after post-verify implementation edits.
- Must include: limited-context handling when semantic workflow context is missing.
- Must include: NotApplicable/SkippedByStage behavior for non-implementation work.

## Success Responses

**Success:** AI cannot legitimately claim implementation completion after code changes until quality-gate produces fresh readiness.

**Success:** Archive cannot proceed with stale readiness after additional code edits.

**Success:** Pure workflow/documentation changes are not forced through implementation-grade quality gates.

## Must Not Behavior

The following outcomes must not occur as user-visible behavior:

- Must not: Let AI claim completion after implementation-like changes without fresh quality-gate readiness.
- Must not: Reuse readiness after additional implementation-like edits.
- Must not: Treat limited-context technical checks as full semantic archive readiness.
- Must not: Generate `design.md`, `behavior.md`, `plan.md`, or `issue-clarification.md` only to satisfy readiness.
- Must not: Force design-only/planning-only/docs-only changes through implementation dirty hard path.

## Acceptance / Verification Mapping

| Acceptance Criterion | Scenario | Evidence Type | Expected Evidence | Status |
|---------------------|----------|--------------|-------------------|--------|
| 实现变更污染 readiness | Scenario 1 | automated test | runtime/test edit marks state dirty or stale | pending |
| 未验证完成声明被拦截 | Scenario 2 | hook test | completion phrase injects Completion Blocked Until Quality Gate | pending |
| quality-gate 清洁状态 | Scenario 3 | command test | successful quality-gate saves fresh readiness and verified state | pending |
| verified 后再改代码失效 | Scenario 4 | integration test | post-verify runtime edit marks readiness stale | pending |
| 缺上下文禁止 archive-ready | Scenario 5 | quality-gate/archive test | limited-context result cannot be archive-ready | pending |
| 非实现阶段不过度治理 | Scenario 6 | regression test | docs/design/plan-only changes return NotApplicable/SkippedByStage | pending |

# quality-gate-harden-workflow-redesign - Observable Behavior

## Problem Statement

当前 harden 在复杂 feature 归档中可能出现 token 爆炸、重复 finding、fixer 未落地修改、设计分歧被误判为 spec violation，以及 harden 终态过度阻塞 archive 的问题。

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

# quality-gate-stage-applicability - Observable Behavior

## Human Consensus Summary

Feature title: 状态化质量护栏
Internal slug: stateful-quality-guardrails
Source intent: 优化 OpenFlow 工作流，把质量治理从 advisory prompt 升级为 stateful guardrail。
Problem statement: 当前 AI 可以在实现类变更后跳过 quality-gate 并口头声称完成，旧 readiness 也可能在后续代码修改后继续被误用。

### Scenario 1: 实现完成后质量门仍然不可跳过

**Given:**
- AI 修改了源代码、测试、公共 API、hooks、commands 或 bugfix 相关文件。

**When:**
- AI 准备声明任务完成。

**Then (observable outcome):**
- OpenFlow 要求质量门运行。
- 质量门执行风险评估、harden 决策和 evidence-aware verify。

### Scenario 2: 非实现阶段返回不适用而不是失败

**Given:**
- AI 只完成了 design-only、planning-only、metadata-only 或 feature-renaming 工作。

**When:**
- 质量门被触发或被请求检查。

**Then (observable outcome):**
- OpenFlow 返回 NotApplicable/SkippedByStage 或等价报告。
- 报告说明该阶段不需要质量门。
- AI 不生成 plan/design/behavior/issue 文档来让结果变绿。

### Scenario 3: 缺失 workflow artifact 不授权自动创建

**Given:**
- 质量门发现缺少 `.sisyphus/plans/{feature}.md`、`design.md`、`behavior.md` 或 `issue-clarification.md`。

**When:**
- 缺失产物不是用户明确请求的当前阶段。

**Then (observable outcome):**
- 报告把缺失项标记为 workflow-state blocker、limited context 或 not applicable。
- 报告建议用户显式运行对应命令，而不是让 AI 自动创建。

# stateful-quality-guardrails - Observable Behavior

### Scenario 1: 实现变更污染 readiness

**Given:**
- 当前 feature 或 issue 已有 acceptance state。
- AI 修改了 `src/`、测试文件、commands、hooks 或其他实现类文件。

**When:**
- 修改通过 write/edit 工具完成。

**Then (observable outcome):**
- OpenFlow 记录 implementation dirty/stale 状态。
- 旧 readiness 不再代表当前工作区。
- 后续完成声明或 archive 不能复用旧 readiness。

### Scenario 2: 未验证完成声明被拦截

**Given:**
- 当前 session 存在 dirty/stale implementation state。
- 没有 fresh verified readiness。

**When:**
- AI 输出 “完成了”、“done”、“finished”、“ready to archive” 或等价完成语义。

**Then (observable outcome):**
- OpenFlow 输出 `Completion Blocked Until Quality Gate` 或等价强提示。
- 提示 AI 必须先调用 `openflow-quality-gate`。
- AI 不应声称任务已经完成。

### Scenario 3: Quality gate 清洁 dirty 状态

**Given:**
- 当前 feature/issue 处于 dirty/stale 状态。

**When:**
- AI 调用 `openflow-quality-gate`，并且 verify readiness 允许收口。

**Then (observable outcome):**
- OpenFlow 保存 fresh readiness 与 freshness metadata。
- 当前 implementation state 转为 verified。
- 完成声明可以基于该 fresh verified state 继续。

### Scenario 4: Verified 后再次改代码会重新失效

**Given:**
- 当前 feature/issue 已经通过 quality-gate，状态为 verified。

**When:**
- AI 再次修改实现类文件。

**Then (observable outcome):**
- OpenFlow 将 readiness 标记为 stale。
- 再次完成或 archive 前必须重新运行 quality-gate。

### Scenario 5: 缺少语义上下文时禁止 archive-ready

**Given:**
- 存在实现类变更。
- 没有 `design.md`、`behavior.md`、`issue-packet.json` 或等价语义上下文。

**When:**
- AI 请求 quality-gate 或尝试 archive。

**Then (observable outcome):**
- OpenFlow 可以运行技术检查。
- 结果必须标记为 limited-context。
- 结果不得声明 archive-ready 或完整语义 readiness。

### Scenario 6: 非实现阶段不被过度治理

**Given:**
- AI 只修改设计文档、计划文档或普通文档。

**When:**
- AI 尝试收口或 quality-gate 被请求。

**Then (observable outcome):**
- OpenFlow 不进入 implementation dirty hard path。
- 质量门可返回 NotApplicable/SkippedByStage。
- AI 不需要补写无关实现证据。
