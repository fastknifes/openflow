# 为 OpenFlow 实现期增加 human review handoff 状态。AI 写完代码后，OpenFlow 进入人工审核交接，输出 worktree 路径、分支、启动命令、测试命令，允许 review checkpoint commit（非最终提交），最终 archive 时才创建代表完成的正式 commit。 - Observable Behavior


## Human Consensus Summary

Feature title: 为 OpenFlow 实现期增加 human review handoff 状态。AI 写完代码后，OpenFlow 进入人工审核交接，输出 worktree 路径、分支、启动命令、测试命令，允许 review checkpoint commit（非最终提交），最终 archive 时才创建代表完成的正式 commit。
Internal slug: openflow-human-review-handoff-ai-openflow-worktree-review
Source intent: 为 OpenFlow 实现期增加 human review handoff 状态。AI 写完代码后，OpenFlow 进入人工审核交接，输出 worktree 路径、分支、启动命令、测试命令，允许 review checkpoint commit（非最终提交），最终 archive 时才创建代表完成的正式 commit。
Problem statement: 改善体验

## User Context

**Target users:** 内部开发者

**Problem statement:** 改善体验
## Trigger Rules

These conditions activate or require the feature behavior:

- Goal-driven: Solve: 改善体验
- Goal-driven: Serve target users: 内部开发者
- Goal-driven: Honor priority: 易维护
- In-scope match: openflow-human-review-handoff-ai-openflow-worktree-review workflow
- In-scope match: Address the stated problem: 改善体验
- Should constraint: Favor code clarity and maintainable structure in the implementation
- Must constraint: Preserve compatibility guarantees with existing systems and interfaces
## Non-Trigger Rules

These conditions do NOT activate the feature:

- Out of scope: Large product-surface expansion beyond workflow optimization
- Not a goal: Unrelated product areas or workflows
- Not a goal: Broad product expansion outside the workflow itself
- May constraint (non-trigger): Optimize workflow steps without introducing unnecessary product surface area
## User-Visible Scenarios

Each scenario describes what a user or external caller observes — not how the system produces it internally.

### Scenario: openflow-human-review-handoff-ai-openflow-worktree-review addresses the stated problem: 改善体验

**Given:**
- The target user is: 内部开发者
- The problem context is: 改善体验

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- openflow-human-review-handoff-ai-openflow-worktree-review addresses the stated problem: 改善体验
- The outcome is visible to the user or caller without inspecting implementation internals

### Scenario: openflow-human-review-handoff-ai-openflow-worktree-review works for the target users: 内部开发者

**Given:**
- The target user is: 内部开发者
- The problem context is: 改善体验

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- openflow-human-review-handoff-ai-openflow-worktree-review works for the target users: 内部开发者
- The outcome is visible to the user or caller without inspecting implementation internals

### Scenario: openflow-human-review-handoff-ai-openflow-worktree-review implementation reflects the selected priority: 易维护

**Given:**
- The target user is: 内部开发者
- The problem context is: 改善体验

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- openflow-human-review-handoff-ai-openflow-worktree-review implementation reflects the selected priority: 易维护
- The outcome is visible to the user or caller without inspecting implementation internals

### Scenario: openflow-human-review-handoff-ai-openflow-worktree-review respects the stated constraint: 兼容现有系统

**Given:**
- The target user is: 内部开发者
- The problem context is: 改善体验

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- openflow-human-review-handoff-ai-openflow-worktree-review respects the stated constraint: 兼容现有系统
- The outcome is visible to the user or caller without inspecting implementation internals
## Required Content

The following content or outcomes must be present in any successful response:

- Must include: openflow-human-review-handoff-ai-openflow-worktree-review workflow
- Must include: Address the stated problem: 改善体验
- Required outcome: Solve: 改善体验
- Required outcome: Serve target users: 内部开发者
- Required outcome: Honor priority: 易维护
- Must satisfy constraint: Preserve compatibility guarantees with existing systems and interfaces (verify by: Validate existing callers and integration tests continue to pass unchanged)
## Success Responses

**Success:** openflow-human-review-handoff-ai-openflow-worktree-review addresses the stated problem: 改善体验

**Success:** openflow-human-review-handoff-ai-openflow-worktree-review works for the target users: 内部开发者

**Success:** openflow-human-review-handoff-ai-openflow-worktree-review implementation reflects the selected priority: 易维护

**Success:** openflow-human-review-handoff-ai-openflow-worktree-review respects the stated constraint: 兼容现有系统

**Success:** Solve: 改善体验

**Success:** Serve target users: 内部开发者

**Success:** Honor priority: 易维护
## Must Not Behavior

The following outcomes must not occur as user-visible behavior:

- Must not: Unrelated product areas or workflows
- Must not: Broad product expansion outside the workflow itself
- Excluded: Large product-surface expansion beyond workflow optimization
## Acceptance / Verification Mapping

Each acceptance criterion maps to an observable scenario and verification approach:

| Acceptance Criterion | Scenario | Evidence Type | Expected Evidence | Status |
|---------------------|----------|--------------|-------------------|--------|
| openflow-human-review-handoff-ai-openflow-worktree-review addresses the stated problem: 改善体验 | openflow-human-review-handoff-ai-openflow-worktree-review addresses the stated problem: 改善体验 | Use targeted tests and review to verify: 易维护, 兼容现有系统 | User-observable confirmation that "openflow-human-review-handoff-ai-openflow-worktree-review addresses the stated problem: 改善体验" occurs | pending |
| openflow-human-review-handoff-ai-openflow-worktree-review works for the target users: 内部开发者 | openflow-human-review-handoff-ai-openflow-worktree-review works for the target users: 内部开发者 | Use targeted tests and review to verify: 易维护, 兼容现有系统 | User-observable confirmation that "openflow-human-review-handoff-ai-openflow-worktree-review works for the target users: 内部开发者" occurs | pending |
| openflow-human-review-handoff-ai-openflow-worktree-review implementation reflects the selected priority: 易维护 | openflow-human-review-handoff-ai-openflow-worktree-review implementation reflects the selected priority: 易维护 | Use targeted tests and review to verify: 易维护, 兼容现有系统 | User-observable confirmation that "openflow-human-review-handoff-ai-openflow-worktree-review implementation reflects the selected priority: 易维护" occurs | pending |
| openflow-human-review-handoff-ai-openflow-worktree-review respects the stated constraint: 兼容现有系统 | openflow-human-review-handoff-ai-openflow-worktree-review respects the stated constraint: 兼容现有系统 | Use targeted tests and review to verify: 易维护, 兼容现有系统 | User-observable confirmation that "openflow-human-review-handoff-ai-openflow-worktree-review respects the stated constraint: 兼容现有系统" occurs | pending |
