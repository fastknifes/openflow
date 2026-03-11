# OpenFlow v3.0 重构计划

## 计划概述

| 项目 | 内容 |
|------|------|
| **目标** | 将 OpenFlow 从 v2.0 重构为 v3.0，移除 BuildTracker，改用 OpenCode Session API |
| **原因** | SRS v3.0 简化了架构，OpenCode 已内置会话变更记录能力 |
| **预计任务数** | 8 |
| **影响范围** | src/index.ts, src/types.ts, src/utils/, src/skills/ |

---

## Task 1: 删除 BuildTracker 相关代码

### 描述
移除不再需要的 BuildTracker 模块及其所有引用。

### 删除清单

| 文件 | 删除内容 |
|------|----------|
| `src/utils/build-tracker.ts` | **整个文件删除** (186 行) |
| `src/utils/index.ts` | 删除 `export { BuildTracker }` |
| `src/types.ts` | 删除 `BuildMetadata`, `ChangeRecord`, `BuildChangeset` 类型 |

### 验收标准
- [ ] `build-tracker.ts` 文件已删除
- [ ] 无 BuildTracker 相关的 import 语句
- [ ] TypeScript 编译通过

---

## Task 2: 重构 index.ts - 移除 BuildTracker 引用

### 描述
清理 index.ts 中所有 BuildTracker 相关代码。

### 修改内容

```typescript
// 删除以下内容:

// 1. 导入
import { BuildTracker } from './utils/build-tracker.js'

// 2. 创建实例 (约第 26 行)
const buildTracker = new BuildTracker(ctx.directory)

// 3. context 中的字段 (约第 31 行)
buildTracker: buildTracker

// 4. tool.execute.before hook (约第 139 行)
ctx.buildTracker.ensureChangesFile()

// 5. tool.execute.after hook 中的变更记录 (约第 155-169 行)
ctx.buildTracker.recordChange(...)

// 6. handleArchive 中的 cleanup 调用 (约第 375 行)
ctx.buildTracker.cleanup()

// 7. handleStatus 中的 buildTracker 状态显示
```

### 验收标准
- [ ] index.ts 中无 buildTracker 变量
- [ ] 无 buildTracker 相关方法调用
- [ ] TypeScript 编译通过

---

## Task 3: 更新类型定义

### 描述
清理 types.ts 中不再需要的类型，保留必要类型。

### 删除的类型
```typescript
// 删除:
interface BuildMetadata { ... }
interface ChangeRecord { ... }
interface BuildChangeset { ... }
```

### 保留/更新的类型
```typescript
// 保留:
interface OpenFlowConfig { ... }
interface ParsedTask { ... }
interface BrainstormingConfig { ... }
interface TddConfig { ... }
interface VerificationConfig { ... }
interface ArchiveConfig { ... }

// 可选新增: Session API 相关类型 (如需要)
```

### 验收标准
- [ ] 无 BuildMetadata, ChangeRecord, BuildChangeset 类型
- [ ] 其他类型保持完整
- [ ] TypeScript 编译通过

---

## Task 4: 新增 Session 工具函数

### 描述
创建新的工具函数，从 OpenCode Session API 获取文件变更记录。

### 新增文件
`src/utils/session.ts`

### 实现内容

```typescript
import type { OpencodeClient } from '@opencode-ai/sdk'

/**
 * 从 Session 中提取文件变更记录
 */
export async function getFileChanges(
  client: OpencodeClient,
  sessionID: string
): Promise<FileChange[]> {
  // 1. 调用 client.session.messages() 获取消息
  const messages = await client.session.messages({ sessionID })
  
  // 2. 提取所有 ToolPart
  const toolParts = messages
    .flatMap(m => m.parts)
    .filter(p => p.type === 'tool')
  
  // 3. 过滤 write/edit 工具调用
  const changes = toolParts
    .filter(p => ['write', 'edit'].includes(p.tool))
    .map(p => ({
      filePath: p.state.input.filePath,
      tool: p.tool,
      timestamp: p.state.time?.start,
    }))
  
  return changes
}

export interface FileChange {
  filePath: string
  tool: 'write' | 'edit'
  timestamp?: number
}
```

### 验收标准
- [ ] `session.ts` 文件已创建
- [ ] `getFileChanges` 函数可正确提取变更
- [ ] 类型定义完整

---

## Task 5: 重构 handleArchive 函数

### 描述
修改 archive 逻辑，使用 Session API 替代 changes.json。

### 修改内容

```typescript
// 旧实现 (使用 buildTracker):
async function handleArchive(ctx, feature) {
  const changes = ctx.buildTracker.getStatus().changes
  // ...
  ctx.buildTracker.cleanup()
}

// 新实现 (使用 Session API):
async function handleArchive(ctx, feature) {
  // 1. 获取当前 session 的变更记录
  const sessionID = getCurrentSessionID() // 需要实现
  const changes = await getFileChanges(ctx.client, sessionID)
  
  // 2. 复制设计文档
  await copyDesignDocs(feature, archiveDir)
  
  // 3. 复制计划文档
  await copyPlanDocs(feature, archiveDir)
  
  // 4. 不再需要 cleanup (OpenCode 管理 session)
}
```

### 验收标准
- [ ] archive 使用 Session API 获取变更
- [ ] 不依赖 changes.json 文件
- [ ] 归档功能正常工作

---

## Task 6: 重构 handleStatus 函数

### 描述
更新 status 命令，移除 buildTracker 状态，显示 Session 相关信息。

### 修改内容

```typescript
// 旧实现:
function handleStatus(ctx) {
  // 显示 buildTracker 状态
  const status = ctx.buildTracker.getStatus()
  console.log(`Build: ${status.id}`)
  console.log(`Changes: ${status.changes.length}`)
}

// 新实现:
async function handleStatus(ctx) {
  console.log('OpenFlow Plugin Status')
  console.log('---')
  console.log(`Config: ${JSON.stringify(ctx.config, null, 2)}`)
  console.log(`Archive Dir: ${ctx.config.archive.output_dir}`)
  // 可选: 显示当前 session 信息
}
```

### 验收标准
- [ ] 无 buildTracker 相关输出
- [ ] 显示有意义的插件状态信息

---

## Task 7: 更新 openflow-archive Skill

### 描述
更新 skill 内容，明确使用 Session API 和 AI 生成 SRS 的流程。

### 修改文件
`.opencode/skills/openflow/openflow-archive.md`

### 更新内容

```markdown
---
name: openflow-archive
description: 归档功能，生成包含代码映射的 SRS 文档
---

# OpenFlow Archive Skill

## 触发条件
- 功能开发完成
- 需要归档到 docs/archive/

## 执行流程

### 1. 获取变更记录
使用 OpenCode Session API 获取当前会话的文件变更:
- 读取 session 中的 write/edit 工具调用
- 提取变更的文件列表

### 2. 读取设计文档
- docs/design/{feature}/proposal.md
- docs/design/{feature}/design.md
- docs/design/{feature}/decisions.md

### 3. 读取计划文档
- .sisyphus/plans/{feature}.md

### 4. 获取代码符号 (可选)
调用 lsp_symbols 工具获取关键文件的符号信息

### 5. 生成 SRS 文档
基于以上信息，生成 docs/archive/{feature}/srs.md:
- 概述
- 业务流程
- 代码实现 (功能-代码映射表)
- 修改的文件列表
- 相关文档链接

### 6. 复制文档
- 复制 design/ 到归档目录
- 复制 plan/ 到归档目录
```

### 验收标准
- [ ] Skill 文档已更新
- [ ] 明确使用 Session API
- [ ] 描述 AI 生成 SRS 的流程

---

## Task 8: 清理和测试

### 描述
清理遗留代码，运行测试确保功能正常。

### 清理项

| 项目 | 操作 |
|------|------|
| `.sisyphus/builds/` 目录 | 可选删除（旧的 changes.json 不再需要） |
| 未使用的导入 | 检查并删除 |
| 未使用的类型 | 检查并删除 |

### 测试项

| 测试 | 预期结果 |
|------|----------|
| `bun run build` | 编译成功 |
| `bun run typecheck` | 无类型错误 |
| Brainstorming Hook | 正常检测需求 |
| Plan Enhancement | 正常增强计划 |
| Archive 功能 | 正常归档（使用 Session API） |

### 验收标准
- [ ] TypeScript 编译无错误
- [ ] 无遗留的 BuildTracker 引用
- [ ] 核心功能正常工作

---

## 文件变更汇总

| 文件 | 操作 | 行数变化 |
|------|------|----------|
| `src/utils/build-tracker.ts` | 删除 | -186 |
| `src/utils/session.ts` | 新增 | +50 |
| `src/utils/index.ts` | 修改 | -1 |
| `src/types.ts` | 修改 | -40 |
| `src/index.ts` | 修改 | -80, +30 |
| `.opencode/skills/openflow/openflow-archive.md` | 更新 | ~20 |

**净变化**: 约 -200 行代码

---

## 依赖关系

```
Task 1 (删除 BuildTracker)
    │
    ├──→ Task 2 (重构 index.ts)
    │        │
    │        └──→ Task 5 (重构 handleArchive)
    │        └──→ Task 6 (重构 handleStatus)
    │
    ├──→ Task 3 (更新类型)
    │
    ├──→ Task 4 (新增 Session 工具) ──→ Task 5
    │
    ├──→ Task 7 (更新 Skill)
    │
    └──→ Task 8 (清理和测试)
```

**建议执行顺序**: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

---

## 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Session API 不稳定 | Archive 功能失效 | 添加错误处理和降级方案 |
| 旧 changes.json 丢失 | 无影响（已有数据可忽略） | 提示用户旧数据不兼容 |
| LSP 工具未启用 | 代码映射为空 | 在 skill 中提供手动填写模板 |

---

**计划版本**: 1.0  
**创建日期**: 2026-03-11  
**基于 SRS**: v3.0
