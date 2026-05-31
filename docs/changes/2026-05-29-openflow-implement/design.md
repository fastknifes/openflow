# openflow-implement - Design

## Human Consensus Summary

Feature title: 优化 openflow-implement 命令
Internal slug: openflow-implement
Source intent: 修复 OMO 检测过时问题、补全非 OMO 环境下的执行指导、修复 implementation-constraints 不生效的 Bug、修复 worktree 创建前 dirty main 未保存、修复 observer 过早推进状态

## Problem Statement

`openflow-implement` 命令存在六个问题：

1. **OMO 检测过时**：`src/utils/omo-detection.ts` 的 `detectOmoEnvironment` 和 `detectOmoExecutionFlow` 仍在检查 `.sisyphus/` 目录下的 `boulder.json` 和 marker entries。OMO 已从 `.sisyphus` 迁移到 `.omo` 目录（参见 OMO 的 `legacy-workspace-migration.ts`），导致 OpenFlow 无法正确检测到已安装 OMO 的环境。

2. **非 OMO 环境缺少执行指导**：`handoffToBackend` 在 `non-omo` 分支仅设置 `command = 'opencode build'` 并记录 observation，不注入任何执行指导。对比 OMO 的 `/start-work`（`START_WORK_TEMPLATE`）提供了完整的 ARGUMENTS、WHAT TO DO、TASK BREAKDOWN (MANDATORY)、CRITICAL、WORKTREE COMPLETION 等结构化指导。非 OMO 路径下的 AI 代理缺少"如何读取 plan、如何分解任务、如何执行 TDD、如何处理约束、如何完成 worktree merge"等关键指导。

3. **implementation-constraints 不生效**：
   - `handoffToBackend` 的 `non-omo` 分支只记录 observation，不注入 prompt（因为非 OMO 不发送 `session.prompt`），约束信息不会到达 AI
   - `constraint-guard.ts` 的 `parseConstraintsMd` 解析旧格式（`- [N] Source: ...`），但 `context-resolver.ts` 的 `renderConstraintPacket` 使用新格式（`### N. rule`），导致约束解析完全无效
   - `extractTargetFromTool` 对 `write`/`edit` 工具返回 `null`，只有 `task` 工具有效

4. **Worktree 创建前不保存 dirty main**：`createWorktree` 在创建 worktree 时不检查也不保存主工作区的未提交改动。虽然 `handleImplement` 检测了 `mainWorktreeDirty`，但仅在 `--no-worktree` 模式下阻断，worktree 模式下只记录 observation 警告后就继续创建。用户的未提交代码可能因 worktree 操作受到影响。

5. **Observer 过早推进到 quality_gate_pending**：`implementation-observer.ts` 的 `toolAfterHook` 在检测到 `opencode build` 工具完成时就立即将 run status 推进到 `quality_gate_pending`。但在 non-OMO 环境下，AI 可能还有后续 task/write/edit 调用要做，一次工具完成不代表整个实现结束。过早推进导致后续操作时 run 状态已不在 `running`。

6. **代码未按 design.md 实现**：`docs/changes/2026-05-29-openflow-implement/design.md` 列出了 4 个文件的修改要求，但只有 `constraint-guard.ts`（D4）已落地。`omo-detection.ts`（D1）、`implementation-backend.ts`（D2/D3）、`implement.ts`（D2）均未按设计修改。

## Design Decisions

| # | 决策点 | 决策 | 解决问题 |
|---|--------|------|---------|
| D1 | OMO 检测路径 | `.omo` 优先检测，`.sisyphus` 保留为兼容 fallback | #1 |
| D2 | 非 OMO 执行指导方式 | 在 `handoffToBackend` 中构建 Execution Guide，通过 `handleImplement` 返回文本注入 | #2 |
| D3 | constraints 在非 OMO 的注入方式 | 在 Execution Guide 的 Constraints 区块中包含约束摘要 | #3 |
| D4 | constraint-guard 格式修复 | 重写 `parseConstraintsMd` 匹配 `renderConstraintPacket` 的输出格式；增强 `extractTargetFromTool` 支持 write/edit | #3 |
| D5 | Worktree 创建前 auto-stash | `createWorktree` 中 dirty 时先 `git stash --include-untracked`，创建后 `git stash pop`，无论成功失败都恢复 | #4 |
| D6 | Observer non-omo 不自动推进 | `toolAfterHook` 中 OMO 后端继续推进到 `quality_gate_pending`，non-OMO 后端只记录 event 保持 `running` | #5 |

## Architecture

### 修改文件清单

```
src/utils/omo-detection.ts              (MODIFY — D1: .omo 优先 + .sisyphus 兼容)
src/utils/implementation-backend.ts     (MODIFY — D2/D3: 新增 buildExecutionGuide，返回 executionGuide)
src/utils/implementation-worktree.ts    (MODIFY — D5: auto-stash/pop)
src/hooks/constraint-guard.ts           (MODIFY — D4: parseConstraintsMd + extractTargetFromTool) ← 已实现
src/commands/implement.ts               (MODIFY — D2: 返回文本追加 Execution Guide)
src/hooks/implementation-observer.ts    (MODIFY — D6: non-omo 不自动推进 quality_gate_pending)
```

### 1. OMO 检测更新（`omo-detection.ts`）— D1

**变更**：`.omo` 优先检测，`.sisyphus` 保留兼容。

**`detectOmoExecutionFlow` Rule 2 修改**：

```typescript
// Before:
const boulderPath = join(ctx.directory, '.sisyphus', 'boulder.json')

// After:
const boulderPaths = [
  join(ctx.directory, '.omo', 'boulder.json'),      // 新路径（优先）
  join(ctx.directory, '.sisyphus', 'boulder.json'), // 兼容旧路径
]
for (const boulderPath of boulderPaths) {
  try {
    const raw = await readFile(boulderPath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && parsed.active_plan) return 'omo'
  } catch { /* fall through */ }
}
```

**`detectOmoEnvironment` Rule 3 修改**：

```typescript
// Before:
const sisyphusPath = join(ctx.directory, '.sisyphus')
const entries = await readdir(sisyphusPath)

// After:
const omoDirs = ['.omo', '.sisyphus']
for (const dir of omoDirs) {
  try {
    const entries = await readdir(join(ctx.directory, dir))
    if (entries.some(e => OMO_MARKER_ENTRIES.includes(e))) return 'omo'
  } catch { /* fall through */ }
}
```

Rule 4（Plugin ID 验证）无需变更：`OMO_PLUGIN_IDS = ['oh-my-openagent', 'oh-my-opencode']` 仍有效。

### 2. Non-OMO 执行指导（`implementation-backend.ts`）— D2/D3

**问题**：`handoffToBackend` 的 `non-omo` 分支没有向 AI 传递任何执行上下文。AI 只看到 `opencode build`，不知道要做什么。

**方案**：新增 `buildExecutionGuide()` 函数，构建结构化执行指导，通过 `BackendHandoffResult.executionGuide` 返回给 `handleImplement`。

**`BackendHandoffResult` 扩展**：

```typescript
export interface BackendHandoffResult {
  success: boolean
  backend: 'omo' | 'opencode'
  command?: string
  executionGuide?: string   // NEW
  error?: string
}
```

**`buildExecutionGuide` 函数**：

```typescript
export function buildExecutionGuide(options: {
  run: ImplementationRun
  constraintResult?: ConstraintPacketResult
  executionRoot: string
  changeDir: string
}): string {
  const { run, constraintResult, executionRoot, changeDir } = options
  const planPath = `docs/changes/${changeDir}/plan.md`

  const lines: string[] = [
    '## OpenCode Native Build Execution Guide',
    '',
    '### Execution Context',
    `- **Run ID**: ${run.runID}`,
    `- **Feature**: ${run.feature}`,
    `- **Execution Root**: \`${executionRoot}\``,
    `- **Plan Path**: \`${planPath}\``,
    `- **Container Mode**: ${run.containerMode}`,
    '',
    '### What To Do',
    `1. Read the FULL plan file at \`${planPath}\` — this is the ONLY source of truth for tasks`,
    '2. Decompose every plan checkbox into granular sub-steps BEFORE starting any code changes',
    '3. For each sub-step: identify files to modify, expected behavior, verification method',
    '4. Execute sub-steps sequentially, writing tests first for core logic (TDD: RED → GREEN → REFACTOR)',
    '5. After ALL tasks are done, call `/openflow-quality-gate` — do NOT skip this step',
    '',
    '### Task Breakdown (Mandatory)',
    '- Each plan checkbox MUST be split into concrete, actionable sub-tasks',
    '- Sub-tasks MUST specify: file to modify, what to change, expected behavior',
    '- Register ALL sub-tasks as TODO items before starting any code changes',
    '- Mark each TODO as completed only after the code change is verified',
    '',
    '### Critical Rules',
    '- You MUST read the FULL plan before starting any implementation',
    '- You MUST call `/openflow-quality-gate` after implementation completes',
    '- Do NOT skip TDD for core business logic changes',
    '- Do NOT modify files outside the execution root',
    '- Do NOT claim completion before quality-gate returns readiness',
    '- If constraint conflicts with plan, stop and report drift',
  ]

  // Constraints section — D3
  if (constraintResult && constraintResult.constraintCount > 0) {
    lines.push(
      '',
      '### Constraints',
      `- **Constraint file**: \`docs/changes/${changeDir}/constraints.md\``,
      `- **Status**: ${constraintResult.status}`,
      `- **Total constraints**: ${constraintResult.constraintCount}`,
      '- You MUST read the constraint file before creating or executing tasks',
      '- Every task prompt MUST include applicable constraints',
    )
  }

  // Worktree completion section
  if (run.worktree) {
    lines.push(
      '',
      '### Worktree Completion',
      '- After all tasks complete, commit all changes in the worktree',
      '- Switch to main working directory',
      `- Merge worktree branch: \`git merge ${run.branch}\``,
      '- The system will handle cleanup during archive',
    )
  }

  return lines.join('\n')
}
```

**non-omo 分支调用**：

```typescript
if (environment === 'non-omo') {
  // ... 现有逻辑 ...
  const executionGuide = buildExecutionGuide({ run, constraintResult, executionRoot, changeDir })
  return { success: true, backend: 'opencode', command, executionGuide }
}
```

**`implement.ts` 返回文本追加** — D2：

```typescript
// handleImplement 返回文本构造中
const resultLines: string[] = [
  '## Implementation Run Created',
  // ... 现有字段 ...
]

// NEW: non-omo 追加执行指导
if (handoffResult.executionGuide) {
  resultLines.push('', handoffResult.executionGuide)
}

resultLines.push(
  '',
  `*Implementation run created at ${new Date().toISOString()}*`,
  '',
  `> 提醒：实现完成并通过质量门禁后，请运行 \`/openflow-archive ${sanitizedFeature}\` 来归档本次变更。`,
)

return resultLines.filter(Boolean).join('\n')
```

### 3. Constraints 修复（`constraint-guard.ts`）— D4

> **已实现**。`parseConstraintsMd` 已重写为匹配 `### N.` 格式，`extractTargetFromTool` 已支持 `write`/`edit` 的 `filePath` 提取。

保留原始设计描述以供追溯：

- `parseConstraintsMd`：匹配 `### N. rule` 格式，提取 `**Applies to**` 和 `**Severity**` 字段
- `extractTargetFromTool`：为 `write`/`edit` 工具从 `taskArgs.filePath` 提取目标路径

### 4. Worktree 创建前 auto-stash（`implementation-worktree.ts`）— D5

**问题**：`createWorktree` 不保存主工作区 dirty 改动，可能影响用户未提交代码。

**方案**：dirty 时 auto-stash → 创建 worktree → auto-stash-pop（无论 worktree 创建成功失败都恢复）。

```typescript
export async function createWorktree(ctx, feature): Promise<WorktreeResult> {
  // ... 现有 verifyWorktree 和冲突路径检查 ...

  const stashed = autoStashIfDirty(ctx, feature)
  try {
    // ... 现有 worktree add 逻辑 ...
  } finally {
    if (stashed) autoStashPop(ctx)
  }
}

function autoStashIfDirty(ctx: OpenFlowContext, feature: string): boolean {
  if (!isMainWorktreeDirty(ctx)) return false
  try {
    runGitCommand(ctx, [
      'stash', 'push', '-m',
      `openflow:auto-stash before worktree for ${feature}`,
      '--include-untracked',
    ])
    logger.info('orchestrator', 'auto-stashed dirty main worktree', { feature })
    return true
  } catch {
    logger.warn('orchestrator', 'auto-stash failed, proceeding anyway', { feature })
    return false  // stash 失败不阻断
  }
}

function autoStashPop(ctx: OpenFlowContext): void {
  try {
    runGitCommand(ctx, ['stash', 'pop'])
    logger.info('orchestrator', 'auto-stash pop restored main worktree')
  } catch {
    logger.warn('orchestrator', 'auto-stash pop failed')
  }
}
```

**关键约束**：
- stash 失败不阻断 worktree 创建（降级处理）
- pop 在 finally 中执行，确保无论 worktree 创建成功失败都恢复
- 返回值增加 `stashed` 标记，让 `handleImplement` 可在 observation 中记录
- **stash pop 失败恢复**：pop 失败时不抛异常，只记录 warn 日志和 observation warning（`User may need to run 'git stash pop' manually`）。用户的 dirty changes 保留在 stash 栈中，不会丢失，用户可手动恢复。系统不自动尝试 `git stash apply`，避免在冲突场景下做出错误决策。

### 5. Observer non-omo 不自动推进（`implementation-observer.ts`）— D6

**问题**：`toolAfterHook` 在 `opencode build` 完成后立即推进到 `quality_gate_pending`，但 AI 可能还有后续操作。

**方案**：区分 OMO 和 non-OMO 后端。OMO 后端（`/start-work`）保持原有行为；non-OMO 后端（`opencode build`）只记录 event，保持 `running` 状态。

```typescript
// toolAfterHook 中，匹配 backend tool 完成后：
const error = extractError(output)
if (error) {
  await recordEvent(run, { ...withToolCall('backend_failed', ...), error }, 'blocked')
  return
}

// D6: 区分 OMO 和 non-OMO
const isOmoBackend = run.backendCommand?.trim().startsWith('/start-work')
if (isOmoBackend) {
  // OMO: 保持原有行为，推进到 quality_gate_pending
  await recordEvent(run, withToolCall('backend_completed', ...), 'quality_gate_pending')
} else {
  // non-OMO: 只记录 event，保持 running，让 /openflow-quality-gate 推进
  await recordEvent(run, withToolCall('backend_completed', ...), 'running')
}
```

**关键约束**：
- OMO 后端行为不变（`/start-work` 完成后推进到 `quality_gate_pending`）
- non-OMO 后端只记录完成 event，不改变 run status
- `/openflow-quality-gate` 命令会在 setup 阶段从 `running` 推进到 `quality_gate_running`
- **backendCommand undefined 处理**：当 `run.backendCommand` 为 `undefined` 或空字符串时，`startsWith('/start-work')` 返回 `false`，按 non-OMO 路径处理。这不会崩溃，但意味着如果 OMO run 未正确设置 backendCommand，observer 不会推进状态。确保 `handoffToBackend` OMO 分支始终设置 backendCommand。

## Implement 与质量门衔接设计

`/openflow-implement` 和 `/openflow-quality-gate` 通过 **ImplementationRun 状态机** 串联：

```
implement 创建 run (status=running)
    │
    ├── OMO: session.prompt('/start-work') → toolAfterHook → quality_gate_pending
    │
    └── non-OMO: 返回 Execution Guide → AI 自行执行 → AI 调用 /openflow-quality-gate
                                                       ↓
                                              quality-gate setup:
                                              running → quality_gate_running
                                                       ↓
                                              detect → harden → verify → assess
                                                       ↓
                                         ready → ready_for_archive
                                         not_ready → blocked
```

**衔接纽带**：ImplementationRun（runID、executionRoot、status、events、observations、constraints）

**Execution Guide 中的衔接指令**：
- "After ALL tasks are done, call `/openflow-quality-gate`" — 明确告知 AI 必须手动触发质量门
- "Do NOT claim completion before quality-gate returns readiness" — 防止 AI 幻觉提前完工

## Cross-Validation Summary

- Status: Passed
- Documents checked: design.md, behavior.md
- Design decisions: D1–D6
- Behavior scenarios: 21
- Must Not behaviors: 11
- Acceptance criteria: 21
- Edge cases covered: .omo 畸形 fallback、stash pop 失败恢复、backendCommand undefined、Execution Guide 不含 OMO 内容
- Non-blocking gaps: 0
