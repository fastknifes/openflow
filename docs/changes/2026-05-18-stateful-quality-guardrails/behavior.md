# stateful-quality-guardrails - Observable Behavior

## Human Consensus Summary

Feature title: 状态化质量护栏
Internal slug: stateful-quality-guardrails
Source intent: 优化 OpenFlow 工作流，把质量治理从 advisory prompt 升级为 stateful guardrail。
Problem statement: 当前 AI 可以在实现类变更后跳过 quality-gate 并口头声称完成，旧 readiness 也可能在后续代码修改后继续被误用。

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
