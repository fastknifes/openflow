# openflow-archive-design - Observable Behavior

## User Context

**当前状态**: `/openflow-archive` 是 OpenFlow 工作流的最终节点。它将已验证的变更固化为长期可追溯的归档记录。当前仅支持经过完整 feature 工作流的归档路径。

**期望变更**: 支持两种使用模式——计划驱动的归档（需要 quality-gate 通过）和 ad-hoc 问题归档（无需 quality-gate，直接记录问题解决经验）。

## Trigger Rules

### TR-001: 计划驱动归档触发

- **触发条件**: 用户运行 `/openflow-archive <feature>`，且 feature 匹配一个存在有效 readiness 的 acceptance state
- **前置条件**: quality-gate 已通过，readiness 为 Ready 或 ReadyWithDocUpdates
- **系统行为**: 执行完整验证 → 收集产物 → promotion → 归档

### TR-002: ad-hoc 问题归档触发

- **触发条件**: 用户运行 `/openflow-archive <feature>`，且无匹配的 acceptance state，或 acceptance state 无 readiness
- **前置条件**: 无。不需要 quality-gate。
- **系统行为**: 最小验证 → 从会话收集变更 → 生成简化 issue 产物 → 归档

### TR-003: 无 feature 参数时的降级

- **触发条件**: 用户运行 `/openflow-archive`（无参数）
- **系统行为**: 尝试解析 active feature；若无 active feature 但有代码变更，提示先运行 quality-gate

## Non-Trigger Rules

### NTR-001: archive 不主动触发

- archive 只响应用户的显式 `/openflow-archive` 命令调用
- 其他命令（quality-gate、implement）不应自动触发 archive

### NTR-002: archive 不重新运行验证

- archive 不调用 typecheck、lint、test
- archive 不重新运行 harden
- archive 只消费已有的 acceptance state 和 readiness

### NTR-003: ad-hoc 模式不修改 readiness

- ad-hoc 归档不创建或修改 acceptance state 的 readiness 字段
- ad-hoc 归档不改变现有 acceptance state 的状态

## User-Visible Scenarios

### Scenario 1: 计划驱动归档 — 正常流程

**Given**:
- Feature `user-login` 已通过 quality-gate
- Acceptance state 的 readiness 为 `Ready`
- Design、plan、behavior 文档存在于 change workspace
- Implementation mapper 已由 quality-gate 生成
- `auto_promote_current` 为 true

**When** 用户运行 `/openflow-archive user-login`

**Then**:
- 系统创建 `docs/archive/{date}-user-login/` 目录
- 目录包含: `design.md`, `plan.md`, `behavior.md`, `implementation-mapper.md`
- Current docs 被自动提升
- Acceptance state 更新为 `promoted` 阶段
- 返回归档报告，列出所有产物和 promotion 结果

**Success Response**:
```
## Archive Complete

**Feature**: user-login
**Archived**: 2026-06-01T...
**Files Changed**: 5

### Contents
- Design documents: ✅
- Plan: ✅
- Implementation mapper: ✅
- Archive mode: feature

### Location
docs/archive/2026-06-01-user-login/

### Current Promotion
- suggestions: 2
- auto apply: enabled
- applied: 2
```

### Scenario 2: 计划驱动归档 — 阻断（readiness 不足）

**Given**:
- Feature `user-login` 的 readiness 为 `NotReady`
- Quality-gate 尚未通过

**When** 用户运行 `/openflow-archive user-login`

**Then**:
- 系统返回阻断消息
- 不创建 staging 目录
- 不修改任何状态

**Response**:
```
## Archive Blocked

Feature: user-login

Archive stopped because verification readiness is **not ready**.

Please finish the remaining acceptance work, rerun verification, then archive again.
```

### Scenario 3: 计划驱动归档 — 阻断（harden 未解决）

**Given**:
- Feature `user-login` 的 readiness 为 `Ready`
- Harden summary 中有 1 个 unresolved must-fix

**When** 用户运行 `/openflow-archive user-login`

**Then**:
- 系统返回阻断消息，指出 harden 发现
- 不创建 staging 目录

### Scenario 4: ad-hoc 问题归档 — 正常流程

**Given**:
- 用户修复了 `login-timeout-bug` 的 bug
- 经过了多轮对话修复
- 无匹配的 acceptance state（或 acceptance state 属于其他 feature）
- 会话中有文件变更记录

**When** 用户运行 `/openflow-archive login-timeout-bug`

**Then**:
- 系统检测到无匹配 acceptance state，进入 ad-hoc 模式
- 从会话/构建数据中收集变更文件列表
- 生成 `issue-clarification.md`（从会话上下文提取问题描述）
- 生成 `issue-resolution.md`（记录修复摘要、涉及文件、验证证据）
- 创建 `docs/archive/{date}-login-timeout-bug/` 目录
- 返回简化归档报告

**Success Response**:
```
## Archive Complete

**Feature**: login-timeout-bug
**Archived**: 2026-06-01T...
**Files Changed**: 3
**Mode**: ad-hoc

### Contents
- Issue clarification: ✅
- Issue resolution: ✅

### Location
docs/archive/2026-06-01-login-timeout-bug/

### Next Step

This ad-hoc archive captures the problem-solving experience. To start a structured workflow, run:

/openflow-feature <new-feature-name>
```

### Scenario 5: ad-hoc 归档 — 无代码变更

**Given**:
- 用户运行 `/openflow-archive config-tweak`
- 无匹配的 acceptance state
- 无代码变更记录

**When** 命令执行

**Then**:
- ad-hoc 模式仍然允许归档
- issue-resolution 中标注"无跟踪的文件变更"
- 归档目录只包含 issue-clarification 和 issue-resolution

### Scenario 6: 计划驱动归档 — Worktree 流程

**Given**:
- Feature `api-refactor` 使用了 derived worktree 执行
- Implementation run 状态为 `ready_for_archive`
- 用户已确认归档

**When** 用户运行 `/openflow-archive api-refactor`

**Then**:
- 在 worktree 内创建 archive commit
- 将 worktree branch 合并到主仓库
- 清理 worktree 和 branch
- 归档报告包含 worktree 状态

### Scenario 7: ad-hoc 归档 — 有 pending doc updates

**Given**:
- ad-hoc 模式归档
- 存在 `pendingDocUpdates`

**When** 归档执行

**Then**:
- promotion suggestions 正常构建
- 如果 `auto_promote_current` 为 true，正常应用
- issue-resolution 中包含 governance 信息

## Required Content

### Planned 模式归档产物

归档目录中**可能**包含（取决于源文件是否存在）：

| 文件 | 来源 | 必选 |
|------|------|------|
| `design.md` | change workspace | 否 |
| `plan.md` | change workspace 或 plans 目录 | 否 |
| `prd.md` | change workspace | 否 |
| `behavior.md` | change workspace | 否 |
| `implementation-mapper.md` | change workspace | 否 |
| `proposal.md` | change workspace | 否 |
| `decisions.md` | change workspace | 否 |
| `issue-clarification.md` | change workspace (issue/mixed mode) | 否 |
| `issue-resolution.md` | 生成或复制 (issue/mixed mode) | 否 |
| `promotion-candidate.md` | change workspace (issue/mixed mode) | 否 |

### Ad-hoc 模式归档产物

| 文件 | 来源 | 必选 |
|------|------|------|
| `issue-clarification.md` | 生成 | 是 |
| `issue-resolution.md` | 生成 | 是 |
| `promotion-candidate.md` | 生成（有 pending doc updates 时） | 否 |

### Ad-hoc Issue-Resolution 内容结构

```markdown
# Issue Resolution

## Symptom
{从 feature slug 或会话上下文推断}

## Evidence
{从构建/会话数据中提取的技术验证证据}

## Root Cause
{标注为 ad-hoc 归档，根因来自用户上下文}

## Implementation Summary
- archive mode: ad-hoc
- changed files:
  - `path/to/file.ts` (edit)

## Verification Evidence
{技术验证状态，来自构建/会话数据}

## Governance Promotion
- status: {governance status}

## Residual Risk
{来自会话上下文的风险记录}
```

## Success Responses

### Planned 模式成功

返回 `## Archive Complete` 报告，包含：
- Feature 名称
- 归档时间
- 变更文件数
- 产物清单（design/plan/prd/behavior/mapper 各项 ✅/❌）
- 归档路径
- Verification 状态
- Current promotion 结果
- Worktree 状态（如适用）
- 下一步建议

### Ad-hoc 模式成功

返回简化版 `## Archive Complete` 报告，包含：
- Feature 名称
- 归档时间
- 变更文件数
- 归档模式标记为 `ad-hoc`
- 产物清单（issue-clarification ✅, issue-resolution ✅）
- 归档路径
- Current promotion 结果（如适用）
- 下一步建议

## Must Not Behavior

1. **不得在 NotReady/NeedsDecision 时执行 planned 归档** — 必须返回阻断消息
2. **不得忽略 harden unresolved must-fix** — planned 模式必须阻断
3. **不得跳过 archive run confirmation** — implementation run 为 `ready_for_archive` 时必须确认
4. **不得在 execution root mismatch 时归档** — worktree 模式必须阻断
5. **不得在 staging 未完成时写最终 archive 目录** — 必须先 staging 再 rename
6. **不得静默修改 `docs/current/`** — 必须受 `auto_promote_current` 控制
7. **ad-hoc 模式不得修改现有 acceptance state 的 readiness** — 不干扰其他 feature 的状态
8. **ad-hoc 模式不得要求 quality-gate 作为前置** — 用户可直接归档
9. **archive 不重新运行 harden/verify/typecheck/lint/test** — 只消费已有状态

## Acceptance / Verification Mapping

| 标准 | 验证方式 | 证据类型 |
|------|----------|----------|
| handleArchive 函数体 ≤ 60 行 | 代码审查 + 行数统计 | manual-review |
| 6 个阶段模块各自 ≤ 300 行 | 代码审查 + 行数统计 | manual-review |
| 现有测试全部通过 | `npm test` | automated |
| planned 模式所有阻断条件保持 | 单元测试覆盖每种阻断 | automated |
| ad-hoc 模式可在无 acceptance state 下归档 | 集成测试 | automated |
| ad-hoc 模式生成 issue-resolution.md | 集成测试检查产物 | automated |
| archive 目录结构与现有一致 | 归档产物对比测试 | automated |
| 向后兼容：现有命令接口不变 | 回归测试 | automated |
| 每个阶段有独立单元测试 | 测试文件存在且通过 | automated |

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

- Status: Ready
- Structural Completeness: complete
- Design Readiness: ready
- Blocking findings: 0
- Warnings: 0
- Summary: Behavior covers planned and ad-hoc archive modes with 7 observable scenarios, clear trigger/non-trigger rules, and 9 must-not constraints aligned with design goals.

### Findings

(none)

### Constraint Coverage Matrix

| Constraint | Scenarios | Must-Not | Acceptance |
|------------|-----------|----------|------------|
| 计划驱动归档 | S1, S2, S3, S6 | 1,2,3,4,5,6,9 | 4 |
| ad-hoc 归档 | S4, S5, S7 | 7,8 | 5,6 |
| 向后兼容 | S1, S2, S3, S6 | 1,2,5,6 | 7,8 |
| 职责解耦 | all | all | 1,2,9 |

<!-- OPENFLOW:DESIGN_REVIEW_SUMMARY:END -->
