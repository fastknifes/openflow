# openflow-implement - Observable Behavior

## Human Consensus Summary

Feature title: 优化 openflow-implement 命令
Internal slug: openflow-implement
Source intent: 修复 OMO 检测过时、补全非 OMO 执行指导、修复 constraints 不生效、修复 worktree dirty main、修复 observer 过早推进

## Trigger Rules

These conditions activate or require the feature behavior:

- 用户运行 `/openflow-implement <feature>` 命令
- 系统执行 `detectOmoEnvironment()` 或 `detectOmoExecutionFlow()` 进行环境检测
- 系统执行 `handoffToBackend()` 进行后端交接
- AI 代理在活跃 ImplementationRun 中执行 `write`/`edit`/`task` 工具触发 constraint-guard
- AI 代理完成实现后调用 `/openflow-quality-gate`（衔接 implement → quality-gate）
- `implementation-observer.ts` 的 `toolAfterHook` 检测到后端工具完成事件

## Non-Trigger Rules

These conditions do NOT activate the feature:

- `/openflow-feature`、`/openflow-quality-gate`、`/openflow-archive` 等非 implement 命令
- OMO 环境下 `/start-work` 的执行流程（由 OMO 自身负责）
- 非 implement 场景下的 `git stash` 操作（auto-stash 仅在 createWorktree 中触发）

## User-Visible Scenarios

### Scenario: OMO 环境正确检测（.omo 目录）

**Criticality**: critical

**Given**:
- 项目安装了 OMO 插件（`oh-my-opencode` 或 `oh-my-openagent`）
- OMO 工作目录使用 `.omo/`（新版）而非 `.sisyphus/`
- `.omo/boulder.json` 存在且包含 `active_plan`

**When**:
- 用户运行 `/openflow-implement <feature>`
- 系统调用 `detectOmoEnvironment(ctx)`

**Then**:
- 返回 `'omo'`（而非 `'non-omo'`）
- 后端交接走 OMO 路径（`/start-work` 注入）
- AI 代理被正确路由到 Atlas/Sisyphus

### Scenario: OMO 兼容旧 .sisyphus 目录

**Criticality**: normal

**Given**:
- 项目存在 `.sisyphus/boulder.json`（未迁移的旧环境）
- 不存在 `.omo/` 目录

**When**:
- 系统调用 `detectOmoEnvironment(ctx)`

**Then**:
- 兼容检测仍然返回 `'omo'`（fallback）
- 功能不因迁移过渡期而中断

### Scenario: OMO 环境优先使用 .omo 目录

**Criticality**: normal

**Given**:
- `.omo/boulder.json` 和 `.sisyphus/boulder.json` 同时存在

**When**:
- 系统调用 `detectOmoEnvironment(ctx)`

**Then**:
- 优先检查 `.omo/`，先匹配先返回 `'omo'`
- 不检查 `.sisyphus/`（短路）

### Scenario: 非 OMO 环境提供完整执行指导

**Criticality**: critical

**Given**:
- `detectOmoEnvironment` 返回 `'non-omo'`
- ImplementationRun 已创建，plan 文件存在于 `docs/changes/{changeDir}/plan.md`

**When**:
- `handleImplement` 返回"Implementation Run Created"文本

**Then**:
- 返回文本包含 "OpenCode Native Build Execution Guide" 区块
- 指导包含 Execution Context（runID、feature、executionRoot、planPath、containerMode）
- 指导包含 What To Do（读取 plan → 分解任务 → 执行 → quality-gate），共 5 个步骤
- 指导包含 Task Breakdown (Mandatory) 要求
- 指导包含 Critical Rules，至少包含以下规则：
  - MUST read FULL plan before implementation
  - MUST call /openflow-quality-gate after completion
  - Do NOT skip TDD for core business logic
  - Do NOT claim completion before quality-gate returns readiness
- 如果使用 worktree，指导包含 Worktree Completion 步骤
- AI 代理能根据指导独立完成实现工作并正确衔接质量门

### Scenario: 非 OMO 环境注入约束摘要

**Criticality**: critical

**Given**:
- `detectOmoEnvironment` 返回 `'non-omo'`
- `constraints.md` 已成功生成，包含 N 条约束

**When**:
- `handleImplement` 返回执行指导

**Then**:
- 执行指导的 Constraints 区块包含约束摘要
- 摘要包含约束文件路径、生成状态、约束总数
- AI 代理知道约束存在并应遵守

### Scenario: 非 OMO 环境无约束时不输出 Constraints 区块

**Criticality**: normal

**Given**:
- `detectOmoEnvironment` 返回 `'non-omo'`
- 没有 constraintResult 或 constraintCount 为 0

**When**:
- `handleImplement` 返回执行指导

**Then**:
- 执行指导不包含 Constraints 区块
- 不因缺少约束而报错或异常

### Scenario: OMO 环境不包含 Execution Guide

**Criticality**: normal

**Given**:
- `detectOmoEnvironment` 返回 `'omo'`
- `handoffToBackend` 走 OMO 路径

**When**:
- `handleImplement` 返回"Implementation Run Created"文本

**Then**:
- 返回文本不包含 "OpenCode Native Build Execution Guide" 区块
- OMO 流程由 `/start-work` 提供执行指导

### Scenario: constraint-guard 正确解析 constraints.md

**Criticality**: critical

**Given**:
- 活跃 ImplementationRun 存在
- `constraints.md` 由 `renderConstraintPacket` 生成（`### N. rule` 格式）
- 约束列表包含 applies to `src/auth/token.ts` 的 blocking 约束

**When**:
- AI 代理通过 `task` 工具执行涉及 `src/auth/token.ts` 的任务

**Then**:
- `parseConstraintsMd` 正确解析 `### N.` 格式
- `checkConstraintGuard` 返回 `{ advisory: true, message: "..." }`
- advisory 消息包含约束 ID、severity、rule 摘要
- 任务不被阻断，但 AI 收到提醒

### Scenario: constraint-guard 对 write/edit 工具生效

**Criticality**: normal

**Given**:
- 活跃 ImplementationRun 存在，`constraints.md` 包含对 `src/auth/token.ts` 的约束
- AI 代理调用 `write` 或 `edit` 工具，参数包含 `filePath: "src/auth/token.ts"`

**When**:
- `checkConstraintGuard` 被调用，`tool = 'write'` 或 `tool = 'edit'`

**Then**:
- `extractTargetFromTool` 从 `taskArgs.filePath` 提取到目标路径
- 返回 advisory 提醒（而非被静默跳过）
- 编辑不被阻断

### Scenario: 约束文件为空或不存在时无报错

**Criticality**: normal

**Given**:
- 活跃 ImplementationRun 存在
- `constraints.md` 不存在或内容为 degraded 状态（无约束条目）

**When**:
- AI 代理执行任何文件操作

**Then**:
- `checkConstraintGuard` 返回 `{ advisory: false }`
- 无报错，无异常，正常执行

### Scenario: 无活跃 ImplementationRun 时 constraint-guard 不介入

**Criticality**: normal

**Given**:
- 没有活跃的 ImplementationRun

**When**:
- AI 代理执行任何文件操作

**Then**:
- `checkConstraintGuard` 立即返回 `{ advisory: false }`
- 不扫描约束文件，不影响任何操作

### Scenario: Worktree 创建前 auto-stash dirty main

**Criticality**: critical

**Given**:
- 用户运行 `/openflow-implement <feature>`（默认 worktree 模式）
- 主工作区有未提交和/或未跟踪的文件变更（dirty）
- 不存在可复用的已有 worktree

**When**:
- `createWorktree` 被调用

**Then**:
- 系统先执行 `git stash push --include-untracked` 保存 dirty changes
- 然后执行 `git worktree add` 创建 worktree
- 无论 worktree 创建成功或失败，系统都执行 `git stash pop` 恢复主工作区
- observation 记录 auto-stash 操作和结果

### Scenario: Worktree 创建前 main 干净时不 stash

**Criticality**: normal

**Given**:
- 主工作区无未提交改动（干净）

**When**:
- `createWorktree` 被调用

**Then**:
- 不执行 `git stash`
- 直接创建 worktree
- 无 stash/pop 操作

### Scenario: auto-stash 失败不阻断 worktree 创建

**Criticality**: normal

**Given**:
- 主工作区 dirty
- `git stash` 命令执行失败（如权限问题、git 配置问题）

**When**:
- `autoStashIfDirty` 被调用

**Then**:
- 记录 warn 日志
- 不阻断后续 worktree 创建流程
- 返回 `false`（stashed=false），后续不执行 stash pop

### Scenario: OMO 后端 toolAfterHook 推进到 quality_gate_pending

**Criticality**: critical

**Given**:
- 活跃 ImplementationRun 存在，backendCommand 以 `/start-work` 开头
- `toolAfterHook` 检测到后端工具调用完成（无错误）

**When**:
- `toolAfterHook` 执行

**Then**:
- 记录 `backend_completed` event
- run status 推进到 `quality_gate_pending`
- 行为与修改前一致（不改变 OMO 路径）

### Scenario: Non-OMO 后端 toolAfterHook 不自动推进 quality_gate_pending

**Criticality**: critical

**Given**:
- 活跃 ImplementationRun 存在，backendCommand 为 `opencode build`（non-OMO）
- `toolAfterHook` 检测到后端工具调用完成（无错误）

**When**:
- `toolAfterHook` 执行

**Then**:
- 记录 `backend_completed` event
- run status 保持 `running`（不推进到 `quality_gate_pending`）
- AI 代理可继续执行后续 task/write/edit 操作
- 质量门由 AI 显式调用 `/openflow-quality-gate` 触发状态推进

### Scenario: Non-OMO 后端 toolAfterHook 错误时推进到 blocked

**Criticality**: normal

**Given**:
- 活跃 ImplementationRun 存在，backendCommand 为 `opencode build`（non-OMO）
- `toolAfterHook` 检测到后端工具调用失败（有错误）

**When**:
- `toolAfterHook` 执行

**Then**:
- 记录 `backend_failed` event（含错误信息）
- run status 推进到 `blocked`（OMO 和 non-OMO 行为一致）

### Scenario: .omo/boulder.json 畸形时 fallback 到 .sisyphus

**Criticality**: normal

**Given**:
- `.omo/boulder.json` 存在但内容为无效 JSON
- `.sisyphus/boulder.json` 存在且包含有效 `active_plan`

**When**:
- `detectOmoExecutionFlow(ctx)` 被调用

**Then**:
- `.omo/boulder.json` 解析失败后 fall through
- `.sisyphus/boulder.json` 解析成功，返回 `'omo'`
- 不因畸形文件而返回 `'non-omo'`

### Scenario: auto-stash pop 失败后记录恢复指引

**Criticality**: normal

**Given**:
- 主工作区 dirty，auto-stash 成功
- worktree 创建成功
- `git stash pop` 失败（如冲突）

**When**:
- `autoStashPop(ctx)` 执行

**Then**:
- 记录 warn 日志
- observation 记录 `WARNING: auto-stash pop failed. User may need to run 'git stash pop' manually.`
- 不抛出异常，不影响 worktree 创建结果
- 用户的 dirty changes 保留在 stash 栈中，用户可手动 `git stash pop` 恢复

### Scenario: backendCommand undefined 时按 non-OMO 处理

**Criticality**: normal

**Given**:
- 活跃 ImplementationRun 存在
- `run.backendCommand` 为 `undefined` 或空字符串

**When**:
- `toolAfterHook` 执行，`run.backendCommand?.trim().startsWith('/start-work')` 求值

**Then**:
- 表达式求值为 `false`（non-OMO 路径）
- run status 保持 `running`，不推进到 `quality_gate_pending`
- 不因 undefined 而崩溃

### Scenario: Execution Guide 内容不含 OMO 特有字符串

**Criticality**: normal

**Given**:
- `detectOmoEnvironment` 返回 `'non-omo'`
- `buildExecutionGuide` 生成执行指导文本

**When**:
- `handleImplement` 返回包含 Execution Guide 的文本

**Then**:
- Execution Guide 不包含 `/start-work`
- Execution Guide 不包含 `mustUseExistingImplementationRun`
- Execution Guide 不包含 `boulder.json` 引用
- Execution Guide 只包含 non-OMO 可执行的内容

## Must Not Behavior

- OMO 检测不得只检查 `.sisyphus` 而忽略 `.omo`（D1 修复前 Bug）
- 非 OMO 路径不得只返回 `opencode build` 而无执行上下文（D2 修复前 Bug）
- constraint-guard 不得使用与 `renderConstraintPacket` 不匹配的解析格式（D4 已修复）
- `extractTargetFromTool` 对 `write`/`edit` 不得永远返回 null（D4 已修复）
- OMO 检测不得删除对 `.sisyphus` 的兼容支持（需要 fallback）
- 执行指导不得替代 `/start-work` 的 OMO 流程（仅用于非 OMO）
- constraint advisory 不得阻断任何编辑操作（advisory-only 约束不变）
- auto-stash 失败不得阻断 worktree 创建（降级处理）
- auto-stash pop 必须在 finally 中执行，不得因 worktree 创建失败而跳过恢复
- non-OMO observer 不得在单次工具完成后自动推进到 `quality_gate_pending`（D6 修复前 Bug）
- 执行指导不得包含 OMO 特有的 `/start-work` 或 `mustUseExistingImplementationRun` 内容

## Acceptance / Verification Mapping

| Acceptance Criterion | Scenario | Evidence Type | Expected Evidence | Status |
|---------------------|----------|--------------|-------------------|--------|
| D1: OMO 环境通过 .omo 目录检测 | OMO 环境正确检测 | unit test | `detectOmoEnvironment` 在 .omo/boulder.json 存在时返回 'omo' | pending |
| D1: 旧 .sisyphus 兼容 | OMO 兼容旧 .sisyphus 目录 | unit test | `.sisyphus/boulder.json` 但无 `.omo/` 时仍返回 'omo' | pending |
| D1: .omo 优先于 .sisyphus | OMO 环境优先使用 .omo 目录 | unit test | 两者同时存在时优先匹配 `.omo/` | pending |
| D2: 非 OMO 返回执行指导 | 非 OMO 环境提供完整执行指导 | unit test | `handleImplement` 返回文本包含 Execution Guide 全部 5 个 section | pending |
| D3: 非 OMO 注入约束 | 非 OMO 环境注入约束摘要 | unit test | 返回文本 Constraints 区块包含约束数量和路径 | pending |
| D3: 无约束时不输出 Constraints | 非 OMO 环境无约束时不输出 Constraints 区块 | unit test | 返回文本不包含 Constraints section | pending |
| D2: OMO 不包含 Execution Guide | OMO 环境不包含 Execution Guide | unit test | OMO 返回文本不含 "OpenCode Native Build Execution Guide" | pending |
| D4: constraint-guard 解析新格式 | constraint-guard 正确解析 constraints.md | unit test | `parseConstraintsMd` 正确解析 `### N.` 格式 | implemented |
| D4: write/edit 提取目标路径 | constraint-guard 对 write/edit 工具生效 | unit test | `extractTargetFromTool('write', {filePath: 'x.ts'})` 返回路径 | implemented |
| D4: 约束文件为空无报错 | 约束文件为空或不存在时无报错 | unit test | `checkConstraintGuard` 返回 `{ advisory: false }`，无异常 | pending |
| D4: 无 activeRun 不介入 | 无活跃 ImplementationRun 时 constraint-guard 不介入 | unit test | `checkConstraintGuard` 返回 `{ advisory: false }`，不扫描文件 | pending |
| D5: dirty main auto-stash | Worktree 创建前 auto-stash dirty main | unit test | dirty 时先 stash 再 worktree add 再 stash pop | pending |
| D5: 干净 main 不 stash | Worktree 创建前 main 干净时不 stash | unit test | 不执行 stash，直接 worktree add | pending |
| D5: stash 失败不阻断 | auto-stash 失败不阻断 worktree 创建 | unit test | stash 失败后继续创建 worktree | pending |
| D6: OMO toolAfterHook 推进 | OMO 后端 toolAfterHook 推进到 quality_gate_pending | unit test | OMO 路径 status 推进到 quality_gate_pending | pending |
| D6: non-OMO toolAfterHook 不推进 | Non-OMO 后端 toolAfterHook 不自动推进 | unit test | non-OMO 路径 status 保持 running | pending |
| D6: 错误时推进到 blocked | Non-OMO 后端 toolAfterHook 错误时推进到 blocked | unit test | 错误路径 status 推进到 blocked | pending |
| D1: .omo 畸形 fallback | .omo/boulder.json 畸形时 fallback 到 .sisyphus | unit test | 畸形 .omo 后 fall through 到 .sisyphus 返回 'omo' | pending |
| D5: stash pop 失败恢复 | auto-stash pop 失败后记录恢复指引 | unit test | pop 失败时记录 warning observation，不抛异常 | pending |
| D6: backendCommand undefined | backendCommand undefined 时按 non-OMO 处理 | unit test | undefined 时不崩溃，status 保持 running | pending |
| D2: Execution Guide 不含 OMO 内容 | Execution Guide 内容不含 OMO 特有字符串 | unit test | 返回文本不含 `/start-work`、`mustUseExistingImplementationRun`、`boulder.json` | pending |

<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:BEGIN -->
## Cross-Validation Summary

- Status: Pending Review
- Documents checked: design.md, behavior.md
- Design decisions: D1–D6
- Behavior scenarios: 21
- Must Not behaviors: 11
- Acceptance criteria: 21
- Cross-validated: PASSED
<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:END -->
