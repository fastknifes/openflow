# ADR-005: ImplementationRun Required Execution Token

**日期**: 2026-05-24
**状态**: Accepted
**适用范围**: `/openflow-implement` 命令拦截、ImplementationRun 生命周期、plan-to-implement guard、backend handoff、observer 一致性、quality-gate/archive root 匹配
**关联**: ADR-003 (Command Registration Pattern)

---

## 1. 背景

### 1.1 问题描述

`/openflow-implement` 命令在 ADR-003 的 command dispatch 路径中没有注册。当用户输入 `/openflow-implement` 时，`chat-command-dispatch` 没有匹配规则，消息落到 AI 自由处理。AI 可以将其当作普通文本解释，绕过 worktree 创建、ImplementationRun 创建、backend handoff 等全部逻辑。

事故复盘（ses_1aba09bcaffeTmhQuJuPF7akNs）中观察到的行为：

```text
用户输入 /openflow-implement <feature>
  → chat-command-dispatch 没有匹配规则
  → 消息作为普通文本落到 AI
  → AI 自己调度子代理到主工作区
  → 完全绕过 handleImplement
```

### 1.2 缺失的保障

在本次决策之前，OpenFlow 缺少以下保障：

1. **入口拦截**：`/openflow-implement` 没有被 dispatch 拦截，AI 可以自由解释
2. **实现阶段令牌**：没有 ImplementationRun 作为后续流程的绑定令牌，quality-gate 和 archive 无法确认实现阶段的身份
3. **plan-to-implement guard**：有 plan 但没有 run 时，AI 可以直接跳到实现，绕过正式的 implement 入口
4. **handoff 上下文**：backend 交接缺少 runID、worktree 等完整上下文
5. **幂等恢复**：重复调用 `/openflow-implement` 会创建重复的子会话
6. **observer 一致性**：backend/quality-gate/archive 事件没有绑定 active run 的机制

## 2. 决策

### 2.1 核心决策

1. `/openflow-implement` 必须通过 `chat.message` hook 拦截并调用 `handleImplement`，不允许 AI 绕过
2. `ImplementationRun` 成为后续 backend、quality-gate、archive 的绑定令牌
3. 有 plan 但没有 active `ImplementationRun` 时，guard 阻断 AI 直接实现
4. handoff 携带完整上下文（runID、worktree、planPath、executionRoot）
5. 重复 `/openflow-implement` 默认 resume，不创建第二批子会话
6. `/openflow-implement` 不注册为 AI 自动触发的 Skill

### 2.2 注册方式

遵循 ADR-003 的 Command 文件注册模式：

| 属性 | 值 |
|------|-----|
| 注册方式 | Command 文件 (`.opencode/commands/implement.md`) |
| 拦截方式 | `chat-command-dispatch.ts` 中的 `/openflow-implement` 分支 |
| Skill 注册 | **不注册**，不进入 `<available_skills>` |
| AI 可自动调用 | **否** |

## 3. 实现规则

### 3.1 入口拦截

- `chat-command-dispatch.ts` 新增 `/openflow-implement` 分支，与 `/openflow-feature`、`/openflow-archive` 等并列
- `parseOpenFlowImplementCommand` 结构化解析 feature 名称和 flags
- 不允许 flags 混入 feature 名称（例如 `/openflow-implement my-feature --no-worktree` 中 `--no-worktree` 不是 feature 名的一部分）
- 未知 flags 明确报错，不静默忽略

涉及文件：

| 文件 | 变更 |
|------|------|
| `src/hooks/chat-command-dispatch.ts` | 新增 implement 分支和参数解析 |
| `src/hooks/chat-message.ts` | dispatch 路由 |
| `src/index.ts` | tool 注册 |

### 3.2 参数语义

| 参数 | 默认值 | 行为 |
|------|--------|------|
| `useWorktree` | `true` | 默认使用 worktree 隔离模式 |
| `--no-worktree` | N/A | 显式 opt-out，不从 worktree 隔离模式回退 |
| `--no-worktree` + dirty main | N/A | blocked，不允许在 dirty main 上直接实现 |

关键规则：

- `--no-worktree` 是显式 opt-out，不是默认行为
- worktree 创建失败时 blocked，不静默回退到主工作区
- 只有用户明确使用 `--no-worktree` 时才在主工作区执行

涉及文件：

| 文件 | 变更 |
|------|------|
| `src/commands/implement.ts` | worktree 默认值和 dirty-main 检查 |

### 3.3 状态模型与恢复矩阵

ImplementationRun 的状态和重复调用恢复策略：

| 当前状态 | 重复调用行为 |
|----------|-------------|
| active (running) | 返回 resume 信息，不创建新 run |
| active (pending) | 返回 resume 信息 |
| completed | 需要显式 action |
| failed | 需要显式 action |
| cancelled | 需要显式 action |
| 缺失 sessionID | blocked |

涉及文件：

| 文件 | 变更 |
|------|------|
| `src/types.ts` | ImplementationRun 类型定义 |
| `src/utils/implementation-run.ts` | run 状态管理 |
| `src/commands/implement.ts` | resume 逻辑 |

### 3.4 Plan-to-Implement Guard

- 有 `.sisyphus/plans/{feature}.md` 但没有 active `ImplementationRun` 时，guard 阻断实现类动作
- read、design、investigation 等非实现类操作不被 guard 误拦
- guard 触发时记录 `bypassed_implement_detected` observation

涉及文件：

| 文件 | 变更 |
|------|------|
| `src/hooks/implementation-guard.ts` | guard 逻辑 |
| `src/hooks/tool-before.ts` | hook 注册 |

### 3.5 Backend Handoff 上下文

Handoff 携带的完整上下文：

| 字段 | 说明 |
|------|------|
| `runID` | ImplementationRun 的唯一标识 |
| `feature` | feature 名称 |
| `executionRoot` | 执行根目录 |
| `worktree` | worktree 路径（如使用） |
| `planPath` | plan 文件路径 |
| `containerMode` | 容器模式 |
| `mustUseExistingImplementationRun` | `true`，强制使用已有 run |

涉及文件：

| 文件 | 变更 |
|------|------|
| `src/utils/implementation-backend.ts` | handoff 上下文构建 |

### 3.6 Observer 一致性

- backend、quality-gate、archive 事件必须绑定 active run
- 不绑定时记录 `implementation_context_mismatch` observation
- mismatch 必须影响后续状态流转（例如阻止 ready_for_archive 转换）

涉及文件：

| 文件 | 变更 |
|------|------|
| `src/hooks/implementation-observer.ts` | mismatch 检测和记录 |

### 3.7 Quality-Gate/Archive Root 匹配

- quality-gate root 与 run 不一致时，readiness invalid，不进入 `ready_for_archive`
- archive root 与 run 不一致时，blocked，不执行归档

涉及文件：

| 文件 | 变更 |
|------|------|
| `src/commands/quality-gate.ts` | root 匹配检查 |
| `src/commands/archive.ts` | root 匹配检查 |

## 4. 实现概要

本次实现共 7 个任务，覆盖从入口到归档的完整链路：

| 任务 | 主要文件 | 测试文件 |
|------|---------|---------|
| Parser + dispatch | `chat-command-dispatch.ts`, `chat-message.ts`, `index.ts` | `chat-command-dispatch-implement.test.ts` |
| Status model + resume | `types.ts`, `implementation-run.ts`, `implement.ts` | `implement-resume.test.ts` |
| Worktree defaults + dirty-main | `implement.ts` | `implement-worktree-dirty.test.ts` |
| Plan-to-implement guard | `implementation-guard.ts`, `tool-before.ts` | `implementation-guard.test.ts` |
| Backend handoff | `implementation-backend.ts` | `implementation-backend.test.ts` |
| Observer mismatch | `implementation-observer.ts` | `implementation-observer.test.ts` |
| Quality-gate/archive root | `quality-gate.ts`, `archive.ts` | 覆盖在对应测试中 |

## 5. 理由

1. **不可绕过的入口**：`/openflow-implement` 必须被 dispatch 拦截，因为实现阶段涉及 worktree 创建、状态初始化、上下文传递等关键副作用，这些不能由 AI 自由解释后省略
2. **ImplementationRun 作为令牌**：后续的 quality-gate 和 archive 需要确认"实现阶段已正式开始"，ImplementationRun 提供这个绑定关系
3. **guard 防跳步**：有 plan 但没有 run 时，AI 不应直接开始实现。Guard 记录但不阻断非实现类操作，避免误判
4. **幂等恢复**：重复调用 resume 而非重建，减少重复子会话和资源浪费
5. **root 匹配**：quality-gate 和 archive 必须确认自己操作的是正确的 run，防止跨 run 的误操作
6. **不注册为 Skill**：与 ADR-003 一致，`/openflow-implement` 是交互式治理命令，不应被 AI 自动触发

## 6. 后果

### 正面

- `/openflow-implement` 成为不可绕过的实现阶段入口
- ImplementationRun 提供完整的执行追踪和状态管理
- AI 不能直接从 plan 跳到实现
- 幂等恢复减少重复子会话
- Quality-gate 和 archive 有明确的实现阶段绑定
- Observer 一致性保证后续流程的 traceability

### 风险

| 风险 | 缓解措施 |
|------|---------|
| guard 误判非实现类操作 | 通过 writing category 白名单缓解，只拦截实现类动作 |
| chat hook 中 input 可能不包含完整 ToolContext | 通过最小 ToolContext 构造缓解 |
| worktree 创建失败阻断流程 | 明确报错，不静默回退，用户可选择 `--no-worktree` |

## 7. 不适用范围

- 不改变 `/openflow-feature`、`/openflow-archive` 等其他命令的注册方式
- 不改变 OMO 或 OpenCode 的命令加载机制
- 不引入新的 Skill 注册
- 不改变 quality-gate 的核心 harden/verify 逻辑（仅增加 root 匹配检查）

## 8. 参考

- ADR-003：Command Registration Pattern（`/openflow-implement` 遵循相同的 Command 文件注册模式）
- ADR-004：AI-callable Quality Gate Skill（quality-gate 的 root 匹配与此 ADR 关联）
- `src/hooks/chat-command-dispatch.ts`：命令拦截实现
- `src/hooks/implementation-guard.ts`：plan-to-implement guard 实现
- `src/utils/implementation-backend.ts`：backend handoff 上下文构建
- `src/hooks/implementation-observer.ts`：observer mismatch 检测
