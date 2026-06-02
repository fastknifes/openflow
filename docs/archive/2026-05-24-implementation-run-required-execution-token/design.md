# ImplementationRun Required Execution Token — Design

## Human Consensus Summary

Feature title: ImplementationRun Required Execution Token
Internal slug: implementation-run-required-execution-token
Source intent: 将 `/openflow-implement` 从可被 AI 绕过的命令文本升级为实现阶段唯一合法入口，让 `ImplementationRun` 成为执行令牌。
Problem or improvement target: 当前 `/openflow-implement` 未完整接入 ADR-003 的 command dispatch 路径，AI 可将其当普通文本自由解释并绕过 worktree 创建、ImplementationRun 创建、backend handoff 等全部逻辑。
Expected result: `/openflow-implement` 成为不可绕过的实现阶段入口；有 plan 无 run 时禁止直接实现；handoff 携带完整上下文；重复调用幂等恢复。

## Identity And Assumptions

- Feature slug: implementation-run-required-execution-token
- Feature title: ImplementationRun Required Execution Token
- Scope type: workflow / command orchestration / execution governance
- Assumptions:
  - `openflow-implement-workflow` (2026-05-21) 已实现 `handleImplement`、`createWorktree`、`implementationRunStore`、`handoffToBackend` 等核心能力。
  - ADR-003 规定了 Command 文件注册 + `chat.message` hook 拦截模式，`openflow-implement` 未被纳入。
  - AI 代理（特别是 Ultraworker）可能在未调用 `openflow-implement` tool 的情况下直接读 plan 并调度子代理。
  - `handoffToBackend` 当前只传 `/start-work <feature>`，不传 runID/worktree/planPath 等上下文。

## Overview

这个变更不是新增一个命令，而是**补齐已有命令的注册路径 + 增加运行时防绕过守卫 + 强化后端交接上下文**。

核心思路：

```
用户输入 /openflow-implement foo
→ chat.message hook 拦截（不是 AI 解释）
→ handleImplement
→ createWorktree（默认）
→ create ImplementationRun
→ handoffToBackend（携带 run context）
→ 后续 backend/quality-gate/archive 全绑定同一 run
```

如果 AI 试图绕过（直接读 plan → 开始实现），运行时 guard 阻断。

## Problem

事故复盘（ses_1aba09bcaffeTmhQuJuPF7akNs）：

1. 用户输入 `/openflow-implement quality-gate-workflow-redesign`
2. `chat-command-dispatch.ts` 没有匹配规则，返回 `false`
3. 消息继续流转到 AI（Ultraworker）
4. Ultraworker 自己读计划、自己分解 Wave、自己调度子代理到主工作区
5. 完全绕过 `handleImplement` 的 worktree 创建、ImplementationRun 记录、后端交接
6. 后台子代理因 stale timeout 反复取消重建，产生 404 条 transcript

根因分析：

| 缺失 | 后果 |
|------|------|
| `chat-command-dispatch.ts` 没有 `/openflow-implement` 分支 | 用户 slash command 不被拦截，落到 AI 自由解释 |
| `command-registration.ts` 没有 implement command 文件 | 不在 `/` 菜单中，用户无法正常触发 |
| 无 plan→implement guard | AI 可以直接从 plan 跳到实现 |
| handoff 只传 feature | OMO/ULW 二次自由解释计划 |
| duplicate blocked 太硬 | 恢复时创建第二批子会话 |
| observer 偏记录 | 后续状态不绑定 run |

## Goals

1. 让 `/openflow-implement` 成为不可绕过的实现阶段入口。
2. 让 `ImplementationRun` 成为后续 backend/quality-gate/archive 的绑定令牌。
3. 防止 AI 直接从 plan 跳到实现而不走 `handleImplement`。
4. 让 handoff 传递足够的上下文，避免后端二次自由解释计划。
5. 支持幂等恢复，减少重复子会话。
6. 把这次规则固化为全局决策（ADR-005）。

## Non-Goals

- 不重写 OMO `/start-work` 内部逻辑。
- 不重做计划生成或计划质量检查。
- 不把 `openflow-implement` 注册为 AI 自动触发的 Skill（遵循 ADR-003）。
- 不实现完整的多 feature 项目编排。

## Proposed Changes

### Phase 1：入口止血

#### 1.1 补 `/openflow-implement` 的 command dispatch

在 `src/hooks/chat-command-dispatch.ts` 的 `dispatchOpenFlowCommand` 中新增：

```typescript
const parsed = parseOpenFlowImplementCommand(trimmed)
if (parsed) {
  const { feature, useWorktree } = parsed
  const result = await handleImplement(ctx, feature, useWorktree, buildToolContext(input), observer)
  appendGuardMessage(output, result)
  return true
}
```

关键设计决策：

- `--worktree` 是默认行为，不需要显式传。
- `--no-worktree` 是显式 opt-out。
- `buildToolContext(input)` 从 chat hook 的 `input` 中提取 `sessionID` 等最小必需信息。
- `observer` 需要从 `src/index.ts` 传入 `createChatMessageHook`。

#### 1.2 补 command registration

在 `src/command-registration.ts` 中新增 `openflow-implement.md` 命令文件生成。

命令文件内容：

```markdown
---
description: "OpenFlow implementation command. Creates an ImplementationRun and delegates to the selected backend (omo /start-work or OpenCode native build)."
---

## Command Instructions

OpenFlow command: /openflow-implement <feature>

Options:
- Default: uses isolated git worktree
- --no-worktree: execute in current workspace (explicit opt-out)
```

#### 1.3 参数语义统一

| 输入 | useWorktree | containerMode |
|------|-------------|---------------|
| `/openflow-implement foo` | `true`（默认） | `worktree` |
| `/openflow-implement foo --no-worktree` | `false` | `session` |

#### 1.4 参数解析约束

`/openflow-implement` 的参数必须结构化解析，不能用简单字符串包含判断替代。

必须支持：

- `/openflow-implement foo`
- `/openflow-implement foo --no-worktree`
- `/openflow-implement --no-worktree foo`
- auto-slash-command 注入格式中的 `OpenFlow command: /openflow-implement foo`

必须禁止：

- 将 flags 混入 feature 名称，例如把 `foo --no-worktree` 当成 feature。
- 静默忽略未知 flags。
- 在 feature 无法唯一解析时猜测 feature。

未知 flags 必须返回明确错误，提示支持的参数。

### Phase 2：防绕过 Guard

#### 2.1 Plan → Implement Guard

在 `src/hooks/tool-before.ts` 或新增 `src/hooks/implementation-guard.ts` 中：

检测条件：
1. `.sisyphus/plans/{feature}.md` 存在
2. 没有 active `ImplementationRun`（通过 `implementationRunStore.getActiveRun` 检查）
3. 当前操作是 implementation-like action（`task_create`、源码编辑、build/test/typecheck）

响应：
- append guard message 阻断
- 记录 `bypassed_implement_detected` observation

Guard 边界：

- 读取 plan 本身不阻断。
- 设计、计划、调查、文档更新等非实现类动作不阻断。
- 只有在 plan 已存在、feature 可唯一解析、且即将执行实现类动作时才阻断。
- 如果 feature 无法唯一解析，guard 必须要求明确 feature，而不是猜测。
- implementation-like action 至少包括：`task_create`、`task(...)` 子代理执行、源码编辑、运行 build/test/typecheck/lint、启动后端执行。

#### 2.2 Bypass 事件记录

在 observations/events 中记录：

```json
{
  "type": "bypassed_implement_detected",
  "feature": "...",
  "sessionID": "...",
  "reason": "plan_read_without_active_implementation_run",
  "timestamp": "..."
}
```

### Phase 3：状态机化

#### 3.1 ImplementationRun 作为执行令牌

后续动作必须绑定 run：

| 动作 | 必须绑定 |
|------|----------|
| backend handoff | runID |
| worktree root | run.worktree / run.directory |
| quality-gate | run.executionRoot |
| archive | run.feature + run.commitPolicy |
| observer event | runID + sessionID |

#### 3.2 Observer 一致性校验

在 `src/hooks/implementation-observer.ts` 中增加：

- `backend_started` 无 active run → 记录 `implementation_context_mismatch`
- `quality_gate_started` 根目录不等于 run.directory → 记录 mismatch
- archive 找不到 run → blocked

Mismatch 不是纯日志事件。任何 backend、quality-gate 或 archive 动作如果无法绑定到预期 active `ImplementationRun`，必须被视为 blocked 或 invalid，除非存在显式 override 并被记录到 implementation events。

约束：

- quality-gate root 与 run.directory / run.worktree 不一致时，readiness 必须标记为 mismatched/invalid，不得进入 ready_for_archive。
- archive 找不到 matching run 或执行 root 与 run 不一致时必须 blocked。
- backend_started 无 active run 时必须记录 mismatch，并不得把 feature 推进到 running。

### Phase 4：Backend Handoff 强上下文

#### 4.1 handoffToBackend 上下文化

修改 `src/utils/implementation-backend.ts` 的 `handoffToBackend`：

OMO 环境下，发送的 prompt 从：

```
/start-work foo
```

变为：

```
/start-work foo

OpenFlow Implementation Context:
- runID: <runID>
- feature: foo
- executionRoot: <worktree path>
- worktree: <worktree path>
- planPath: .sisyphus/plans/foo.md
- containerMode: worktree
- mustUseExistingImplementationRun: true
```

非 OMO 环境下，返回的 `command` 字段也应包含这些上下文信息。

### Phase 5：幂等恢复

#### 5.1 重复调用行为

同 feature 再次运行 `/openflow-implement`：

| 当前状态 | 行为 |
|----------|------|
| created | 返回 prepared/resume 信息，不重复创建 run |
| starting_backend | 返回 resume 信息，不重复 handoff |
| active run exists + worktree exists | 返回 resume 信息 |
| active run exists + backend running | 不重复 handoff，只显示当前 run |
| quality_gate_pending | 返回当前 run，并提示下一步运行/等待 quality-gate |
| ready_for_archive | 返回当前 run，并提示可以 archive |
| run blocked | 给出恢复建议 |
| failed / cancelled | 不自动 resume；提示用户重新 implement 或显式 recover |
| worktree exists but run missing | 提示 recover/adopt |
| run archived | 允许新一轮实现或提示已完成 |

#### 5.2 handleImplement 修改

在 `handleImplement` 的 duplicate 检测逻辑中（第60-74行）：

当前行为：返回 "Duplicate Blocked"。

新行为：检查 `activeRun.status`，如果可以 resume 则返回 resume 信息。

## Design Constraints

1. 不重写 OMO `/start-work` 内部逻辑。
2. 不重做计划生成或计划质量检查。
3. 不把 `openflow-implement` 注册为 AI 自动触发的 Skill（遵循 ADR-003）。
4. worktree 创建失败时不静默回退主工作区。
5. 不允许 AI 把 `/openflow-implement` 当普通自然语言任务自行执行。

## Hard Constraints And Invariants

### 入口拦截

- `/openflow-implement` 必须被 `chat.message` hook 拦截并调用 `handleImplement`。
- 不允许用户输入 `/openflow-implement` 后落到 AI 自由解释路径。

### 实现阶段令牌

- 有 `.sisyphus/plans/{feature}.md` 但无 active `ImplementationRun` 时，不允许直接进入实现。
- 这个 guard 不只针对 `/openflow-implement` 命令，而是针对所有可能的绕过路径。

### Worktree 策略

- 默认 `useWorktree=true`。
- 主工作区执行必须显式 `--no-worktree`。
- worktree 创建失败时必须 blocked，不能静默回退。
- `--no-worktree` 且 main worktree dirty 时默认 blocked；除非未来新增显式 override（例如 `--allow-dirty-main`）并记录到 ImplementationRun。
- worktree 模式下 main worktree dirty 不阻断，但 dirty summary 必须记录到 observations。

### 后端交接

- handoff 必须携带 runID、worktree、planPath、executionRoot。
- 后端不应该需要重新推断这些信息。

### 幂等性

- 重复 `/openflow-implement` 默认 resume。
- 不创建第二批子会话。

### Observer 一致性

- backend_started / quality_gate_started / archive 必须绑定 active run。
- 不绑定时记录 mismatch 事件。
- mismatch 必须影响状态流转：不得在 mismatch 状态下产生 ready_for_archive 或 archived。

### Session 绑定

- chat hook 调用 `handleImplement` 时必须传入可用 sessionID。
- 如果无法取得 sessionID，ImplementationRun 创建必须进入 degraded/blocked 输出，不得静默创建空 session 运行。
- degraded 情况必须在 observations 中记录，以便后续 quality-gate/archive 判断上下文可信度。

## Behavior Alignment

| Behavior Scenario | Design Response | Risk |
|------------------|-----------------|------|
| 用户输入 /openflow-implement | chat hook 拦截 → handleImplement | Low |
| AI 直接从 plan 开始实现 | plan→implement guard 阻断 | Medium |
| worktree 创建失败 | blocked，不静默回退 | Low |
| 重复 /openflow-implement | resume existing run | Medium |
| OMO handoff | 传完整 context | Medium |
| observer 不一致 | 记录 mismatch 事件 | Low |

## Success Criteria

- [ ] 用户输入 `/openflow-implement foo` 必须被 chat hook 拦截并调用 handleImplement。
- [ ] 有 plan 无 run 时，AI 尝试直接实现被阻断。
- [ ] handoff 携带 runID/worktree/planPath/executionRoot。
- [ ] 重复 `/openflow-implement` 默认 resume。
- [ ] observer 不一致时记录 mismatch 事件。
- [ ] bypass 检测事件被记录。
- [ ] 新增 ADR-005。
- [ ] flags 不混入 feature，未知 flags 明确报错。
- [ ] `--no-worktree` + dirty main 默认 blocked。
- [ ] quality-gate/archive mismatch 必须 blocked 或 invalid。

## Risks And Mitigations

- Risk: chat hook 中的 `input` 不包含完整 ToolContext。
  - Mitigation: 构造最小 ToolContext（含 sessionID），handleImplement 已支持 toolContext 可选。
- Risk: guard 误判（非实现类 task_create 被阻断）。
  - Mitigation: guard 仅在"plan exists + no run"条件下触发，非 plan 场景不受影响。
- Risk: resume 逻辑引入新的状态不一致。
  - Mitigation: resume 仅在 active run 状态为 running/starting_backend 时生效，其他状态仍显式报告。

## Testing Strategy

1. **命令入口测试**：输入 `/openflow-implement foo`，断言调用 handleImplement，不会落到 AI 自由解释路径。
2. **Worktree 默认测试**：不传参数时 `useWorktree=true`。
3. **No-worktree 显式测试**：`--no-worktree` 才允许主工作区模式。
4. **防绕过测试**：plan exists + no run + implementation action → blocked。
5. **Handoff context 测试**：OMO 分支发送的 prompt 包含 runID/worktree/planPath。
6. **幂等测试**：已有 active run 时，再次 `/openflow-implement foo` 不创建新 run。
7. **Observer 一致性测试**：未绑定 run 时记录 mismatch 事件。
8. **参数解析负例测试**：`foo --no-worktree` 不得作为 feature；未知 flag 必须报错。
9. **dirty main 测试**：`--no-worktree` + dirty main blocked；worktree 模式只记录 dirty summary。
10. **mismatch 阻断测试**：quality-gate/archive root mismatch 不得产生 ready/archive 状态。
