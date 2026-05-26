# ImplementationRun Required Execution Token — Observable Behavior

## Human Consensus Summary

Feature title: ImplementationRun Required Execution Token
Internal slug: implementation-run-required-execution-token
Source intent: 将 /openflow-implement 从可被 AI 绕过的命令文本升级为实现阶段唯一合法入口，让 ImplementationRun 成为执行令牌。
Problem statement: 当前 /openflow-implement 未完整接入 command dispatch 路径，AI 可将其当普通文本自由解释并绕过全部实现阶段逻辑。

## Trigger Rules

- 用户输入 `/openflow-implement <feature>`。
- AI 检测到有 plan 但无 active ImplementationRun 并准备实现。
- 后续 backend/quality-gate/archive 需要绑定 ImplementationRun。

## Non-Trigger Rules

- 用户仍在设计或计划阶段。
- feature 没有对应的 plan 文件。
- 非实现类变更（design-only、docs-only）。

## User-Visible Scenarios

### Scenario: /openflow-implement 被 chat hook 拦截

**Given:**
- 用户在聊天中输入 `/openflow-implement foo`。

**When:**
- chat.message hook 处理该消息。

**Then (observable outcome):**
- `dispatchOpenFlowCommand` 匹配 `/openflow-implement` 模式。
- 直接调用 `handleImplement(ctx, 'foo', true, toolContext, observer)`。
- 不落入 AI 自由解释路径。
- 用户看到 ImplementationRun Created 输出（含 runID、worktree、backend 信息）。

### Scenario: 默认 worktree 隔离

**Given:**
- 用户输入 `/openflow-implement foo`，不传任何额外参数。

**When:**
- `handleImplement` 执行。

**Then (observable outcome):**
- `useWorktree` 默认为 `true`。
- 创建或复用 feature-specific worktree。
- ImplementationRun 记录 `containerMode: worktree` 和 `worktreeKind: derived`。

### Scenario: 显式主工作区执行

**Given:**
- 用户输入 `/openflow-implement foo --no-worktree`。

**When:**
- `handleImplement` 执行。

**Then (observable outcome):**
- `useWorktree` 为 `false`。
- ImplementationRun 记录 `containerMode: session` 和 `worktreeKind: main`。
- 不创建 worktree。

### Scenario: 显式主工作区执行但 main worktree dirty

**Given:**
- 用户输入 `/openflow-implement foo --no-worktree`。
- main worktree 存在未提交或未跟踪更改。

**When:**
- `handleImplement` 检查主工作区状态。

**Then (observable outcome):**
- OpenFlow 默认 blocked。
- 用户看到阻断原因：主工作区 dirty，`--no-worktree` 可能污染其它变更。
- 除非未来存在显式 override 并记录到 ImplementationRun，否则不得继续。

### Scenario: 参数解析不会污染 feature 名称

**Given:**
- 用户输入 `/openflow-implement foo --no-worktree` 或 `/openflow-implement --no-worktree foo`。

**When:**
- command dispatch 解析命令。

**Then (observable outcome):**
- feature 解析为 `foo`。
- `--no-worktree` 被解析为 flag。
- feature 不得变成 `foo --no-worktree`。
- 未知 flag 返回明确错误，不得静默忽略。

### Scenario: AI 绕过 /openflow-implement 被阻断

**Given:**
- `.sisyphus/plans/foo.md` 存在。
- 没有 active `ImplementationRun`。
- AI 或用户尝试直接进入实现（task_create、编辑源码、运行 build/test）。

**When:**
- plan→implement guard 检测到此情况。

**Then (observable outcome):**
- guard 输出阻断消息："Implementation blocked: feature has an implementation plan but no active ImplementationRun. Run /openflow-implement <feature> first."
- 记录 `bypassed_implement_detected` 事件到 observations。
- 不执行被阻断的实现操作。

### Scenario: 只读设计/调查行为不被 guard 误拦

**Given:**
- `.sisyphus/plans/foo.md` 存在。
- 没有 active `ImplementationRun`。

**When:**
- AI 只读取 plan、检查设计文档、调查上下文、或编辑设计/计划文档。

**Then (observable outcome):**
- plan→implement guard 不阻断。
- guard 仅在后续出现实现类动作时阻断。

### Scenario: OMO handoff 携带完整上下文

**Given:**
- omo 已安装。
- `/openflow-implement foo` 创建了 ImplementationRun（含 runID、worktree、planPath）。

**When:**
- `handoffToBackend` 发送 prompt 给 omo。

**Then (observable outcome):**
- 发送的 prompt 不只是 `/start-work foo`。
- prompt 包含 OpenFlow Implementation Context：runID、feature、executionRoot、worktree、planPath、containerMode。
- omo 收到足够的上下文，不需要重新推断 worktree 或 plan 位置。

### Scenario: 重复 /openflow-implement 默认 resume

**Given:**
- `/openflow-implement foo` 已执行。
- ImplementationRun 状态为 `running`。

**When:**
- 用户再次输入 `/openflow-implement foo`。

**Then (observable outcome):**
- 不创建新的 ImplementationRun。
- 返回 resume 信息："ImplementationRun already exists. Run ID: xxx, Worktree: ..., Status: running. Resume this run instead of creating a new one."
- 不启动第二批 backend/subagent。

### Scenario: Observer 检测到不一致

**Given:**
- 没有 active ImplementationRun。
- backend_started 或 quality_gate_started 事件被触发。

**When:**
- observer 检查事件与 run 的绑定关系。

**Then (observable outcome):**
- observer 记录 `implementation_context_mismatch` 事件。
- 后续 archive/quality-gate 流程可据此判断上下文不一致。

### Scenario: Quality-gate root 与 ImplementationRun 不匹配

**Given:**
- active ImplementationRun 记录的 execution root 是 worktree A。
- quality-gate 在主工作区或 worktree B 中运行。

**When:**
- quality-gate 尝试生成 readiness。

**Then (observable outcome):**
- readiness 标记为 mismatched/invalid。
- 不得进入 `ready_for_archive`。
- mismatch 被记录到 implementation events/observations。

### Scenario: Archive root 与 ImplementationRun 不匹配

**Given:**
- active ImplementationRun 记录的 execution root 是 worktree A。
- archive 从不同 root 执行，或找不到 matching run。

**When:**
- 用户调用 `/openflow-archive foo`。

**Then (observable outcome):**
- archive blocked。
- 输出说明：archive root 与 ImplementationRun 不匹配或缺失。
- 不得标记 archived。

### Scenario: /openflow-implement 出现在 / 命令菜单

**Given:**
- command registration 已包含 `openflow-implement`。

**When:**
- 用户在 OpenCode 中打开 `/` 命令菜单。

**Then (observable outcome):**
- `openflow-implement` 出现在命令列表中。
- 描述为 "OpenFlow implementation command. Creates an ImplementationRun and delegates to the selected backend."

## Must Not Behavior

- 不得在 `/openflow-implement` 输入后落入 AI 自由解释路径。
- 不得让 AI 直接从 plan 跳到实现而不经过 handleImplement。
- 不得在 worktree 创建失败后静默回退主工作区。
- 不得在重复 `/openflow-implement` 时创建第二批子会话。
- 不得将 `openflow-implement` 注册为 AI 自动触发的 Skill。
- 不得在 plan→implement guard 中误判非实现类操作。
- 不得把 flags 混入 feature 名称。
- 不得静默忽略未知 flags。
- 不得在 `--no-worktree` + dirty main 状态下继续实现。
- 不得在 quality-gate/archive root mismatch 时产生 ready_for_archive 或 archived。
- 不得在缺失 sessionID 时静默创建空 session 的 ImplementationRun。

## Acceptance / Verification Mapping

| Acceptance Criterion | Scenario | Evidence Type | Expected Evidence | Status |
|---------------------|----------|--------------|-------------------|--------|
| /openflow-implement 被 chat hook 拦截 | /openflow-implement 被 chat hook 拦截 | automated | dispatchOpenFlowCommand 匹配并调用 handleImplement | pending |
| 默认 worktree 隔离 | 默认 worktree 隔离 | automated | useWorktree=true, containerMode=worktree | pending |
| 显式主工作区执行 | 显式主工作区执行 | automated | --no-worktree 时 containerMode=session | pending |
| dirty main 阻断 | 显式主工作区执行但 main worktree dirty | automated | --no-worktree + dirty main 返回 blocked | pending |
| 参数解析安全 | 参数解析不会污染 feature 名称 | automated | feature=foo，flag=--no-worktree，未知 flag 报错 | pending |
| AI 绕过被阻断 | AI 绕过 /openflow-implement 被阻断 | automated | guard 输出阻断消息并记录 bypassed_implement_detected | pending |
| 只读行为不误拦 | 只读设计/调查行为不被 guard 误拦 | automated | read/design/investigation 不触发阻断 | pending |
| handoff 携带完整上下文 | OMO handoff 携带完整上下文 | automated | prompt 包含 runID/worktree/planPath/executionRoot | pending |
| 重复调用幂等恢复 | 重复 /openflow-implement 默认 resume | automated | 不创建新 run，返回 resume 信息 | pending |
| Observer 一致性校验 | Observer 检测到不一致 | automated | 记录 implementation_context_mismatch 事件 | pending |
| Quality-gate mismatch 阻断 | Quality-gate root 与 ImplementationRun 不匹配 | automated | readiness=mismatched/invalid，不进入 ready_for_archive | pending |
| Archive mismatch 阻断 | Archive root 与 ImplementationRun 不匹配 | automated | archive blocked，不标记 archived | pending |
| 命令出现在 / 菜单 | /openflow-implement 出现在 / 命令菜单 | manual | openflow-implement 在命令列表中 | pending |
