# quality-gate-stage-applicability - Observable Behavior

## Human Consensus Summary

Feature title: 质量门阶段适用性判定
Internal slug: quality-gate-stage-applicability
Source intent: 收集质量门触发边界约束，生成可追溯设计文档，避免 AI 为通过门禁补写未授权文档。
Problem statement: 质量门当前会把缺少 design/workspace/plan 证据解释为 NotReady，诱导 AI 生成最小工作流产物。

## User Context

用户正在优化 OpenFlow 的质量治理流程，希望质量门对复杂实现仍然是硬性节点，但不要在设计、计划、元数据修正或 feature 重命名时被滥用。

## Trigger Rules

These conditions activate or require the feature behavior:

- Implementation or bugfix work is complete and the AI is about to claim completion.
- Archive readiness is explicitly requested.
- Quality gate output would otherwise report missing design/workspace/plan evidence for a non-implementation task.
- Harden rejects because `.sisyphus/plans/{feature}.md` is absent.

## Non-Trigger Rules

These conditions do NOT activate the quality gate as a hard readiness gate:

- The task only creates or revises feature design documents.
- The task only creates or revises an implementation plan.
- The task only renames a feature slug or updates metadata.
- The task is a documentation-only correction with no implementation diff.

## User-Visible Scenarios

Each scenario describes what a user or external caller observes — not how the system produces it internally.

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

## Required Content

The following content or outcomes must be present in any successful response:

- Must include: stage applicability classification for quality gate.
- Must include: NotApplicable/SkippedByStage behavior for non-implementation stages.
- Must include: harden missing-plan downgrade behavior.
- Must include: explicit prohibition against creating workflow artifacts only to satisfy readiness.

## Success Responses

**Success:** 非实现阶段的质量门请求不会产生普通 NotReady，也不会诱导 AI 补文档。

**Success:** 实现或 bugfix 完成后质量门仍然作为硬性节点运行。

## Must Not Behavior

The following outcomes must not occur as user-visible behavior:

- Must not: Treat every file change as implementation completion.
- Must not: Return ordinary NotReady for design-only/planning-only/metadata-only/rename-only work solely because design/workspace/plan is missing.
- Must not: Generate `plan.md`, `design.md`, `behavior.md`, or `issue-clarification.md` just to satisfy quality gate evidence.
- Must not: Skip quality gate for actual implementation or bugfix work.

## Acceptance / Verification Mapping

Each acceptance criterion maps to an observable scenario and verification approach:

| Acceptance Criterion | Scenario | Evidence Type | Expected Evidence | Status |
|---------------------|----------|--------------|-------------------|--------|
| 非实现阶段返回 NotApplicable/SkippedByStage | Scenario 2 | automated test | design-only/metadata-only fixtures do not produce ordinary NotReady for missing artifacts | pending |
| 缺失 workflow artifact 不授权自动创建 | Scenario 3 | report assertion | quality-gate output contains explicit non-creation guidance | pending |
| 实现完成后质量门仍然必跑 | Scenario 1 | automated test | source/test diff still routes through verify and harden decision | pending |
