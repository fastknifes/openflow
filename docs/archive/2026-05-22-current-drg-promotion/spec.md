# current-drg-promotion - Specification

**日期**: 2026-05-22
**Feature**: current-drg-promotion
**状态**: Draft

---

## Overview

本文档定义文档治理重构的行为规格，包含 `docs/current/` 的新组织方式、`current-promotion.ts` 的新逻辑、以及 DRG 集成后的 archive 行为。

## Interface / Contract

### 限界上下文目录约定

```typescript
interface BoundedContextDirectory {
  name: string                    // 目录名，kebab-case
  path: string                    // docs/current/{name}/
  mandatoryFiles: ['design.md', 'spec.md', 'requirements.md']
  exceptionAllowed: boolean       // 内容极少时允许单文件例外
}
```

### `current-promotion` executor payload

```typescript
interface CurrentPromotionPayload {
  feature: string
  archiveDir: string              // 归档源目录
  promotionPlan: PromotionPlan[]  // 每个受影响的上下文及操作
}

interface PromotionPlan {
  context: string                 // e.g. 'quality-governance'
  operations: PromotionOperation[]
}

interface PromotionOperation {
  targetFile: 'design.md' | 'spec.md' | 'requirements.md'
  sourcePath: string              // archive 中的源文件路径
  strategy: 'direct_migration' | 'synthesized_refresh'
}
```

### DRG 任务资源声明

```typescript
interface PromotionResource {
  kind: 'file'
  id: string                      // 相对于 projectRoot 的路径，如 'docs/current/quality-governance/spec.md'
  mode: 'write'
}
```

## Behavior Scenarios

### Scenario: `docs/current/` 按限界上下文初始化

**Given:**
- 项目已启用 OpenFlow。
- `docs/current/` 下存在旧的 `design/`、`spec/`、`requirements/` 平面目录。

**When:**
- 执行迁移脚本或首次 archive 触发 restructuring。

**Then (observable outcome):**
- 创建 `docs/current/feature-lifecycle/`、`docs/current/quality-governance/` 等限界上下文目录。
- 旧 `docs/current/design/drift-guardian/` 下的内容被移动到 `docs/current/drift-guardian/design.md`。
- 旧 `docs/current/spec/feature-4e04eb6b/behavior.md` 的内容被分析并合并到对应的上下文 `spec.md` 中。
- 旧平面目录（`design/`、`spec/`）被删除或重命名为 `.bak`。
- `docs/current/` 下不再存在 `feature-xxx` 子目录。

### Scenario: archive 提交 DRG promotion 任务

**Given:**
- Feature 已完成验证，readiness 为 `Ready` 或 `ReadyWithDocUpdates`。
- DRG 调度器已启动。
- `auto_promote_current` 为 `true`。

**When:**
- 用户执行 `/openflow-archive <feature>`。

**Then (observable outcome):**
- archive 流程完成 staging、复制归档文件、生成 implementation-mapper 等现有步骤。
- `buildPromotionSuggestions` 基于新结构生成 promotion plan（指向 `docs/current/{context}/`）。
- archive 调用 `scheduler.submitTask({ type: 'current-promotion', payload, resources })`。
- archive 命令立即返回，结果消息中包含 DRG taskId。
- current 文件**不立即更新**（由 DRG 异步执行）。

### Scenario: DRG 异步执行 current promotion

**Given:**
- DRG 中存在一个 `type: 'current-promotion'` 的 pending/ready 任务。
- 该任务声明的资源锁未被其他 running 任务占用。

**When:**
- 依赖满足且资源可用，任务进入 running。

**Then (observable outcome):**
- `current-promotion` executor 被调用。
- executor 读取 `payload.promotionPlan`，按上下文分组执行文件操作。
- 对于 `synthesized_refresh` 策略：读取源文件和目标文件，按节（heading）匹配合并，保留目标独有节，更新匹配节，追加源独有节。
- 对于 `direct_migration` 策略：直接复制源文件到目标路径（覆盖）。
- executor 返回 `{ applied: [...], skipped: [...] }`。
- 任务状态变为 `succeeded`。
- 如果执行中抛错（如磁盘 IO 错误），任务状态变为 `failed`，error 包含详细原因。

### Scenario: 并发 promotion 资源锁冲突

**Given:**
- Task A（feature-alpha promotion）已 running，正在写 `docs/current/quality-governance/spec.md`。
- Task B（feature-beta promotion）已 submit，也声明了 `docs/current/quality-governance/spec.md` 的 write 锁。

**When:**
- DRG 调度循环尝试启动 Task B。

**Then (observable outcome):**
- `ResourceLockManager` 检测到 write/write 冲突。
- Task B 保持 `ready` 状态，不进入 `running`。
- Task A 完成后释放锁，Task B 在下一个调度 tick 进入 `running`。
- 两个 promotion 按顺序执行，不会产生并发写损坏。

### Scenario: promotion 任务失败并重试

**Given:**
- 一个 `current-promotion` 任务因磁盘 IO 错误进入 `failed`。

**When:**
- 用户或系统调用 `scheduler.retryTask(taskId)`。

**Then (observable outcome):**
- 任务状态从 `failed` 重置为 `pending`。
- `attemptCount` 递增。
- 任务重新参与调度，依赖满足后再次执行。
- 如果成功，状态变为 `succeeded`。

### Scenario: DRG 未启动时的回退执行

**Given:**
- 配置 `archive.sync_promotion_fallback = true`。
- DRG 调度器未启动（`scheduler` 未实例化或 `started = false`）。

**When:**
- 用户执行 `/openflow-archive <feature>` 且 `auto_promote_current = true`。

**Then (observable outcome):**
- archive 检测到 DRG 未启动。
- archive 回退到同步执行：`await applyPromotionSuggestions({...})`。
- archive 命令阻塞直到 promotion 完成。
- 结果消息中注明"DRG unavailable, executed synchronously"。

### Scenario: 小上下文单文件例外

**Given:**
- `ai-self-governance` 上下文内容极少（< 50 行）。

**When:**
- 迁移脚本或人工整理该上下文。

**Then (observable outcome):**
- 允许该上下文仅包含一个 `facts.md` 文件，而非 `design.md` + `spec.md` + `requirements.md`。
- `facts.md` 内部用章节区分设计、规格和需求。
- 目录中放置 `.context-meta.json` 说明此为单文件例外。

## Constraints

- `docs/current/` 下不得创建超过一层子目录（即 `docs/current/{context}/file.md`，不允许 `docs/current/{context}/subdir/file.md`）。
- `current-promotion` executor 不得修改 `docs/changes/` 或 `docs/archive/` 中的任何文件。
- `current-promotion` executor 的 `resources` 声明必须覆盖所有可能被写入的 `docs/current/` 文件路径。
- `spec.md` 的 `## Behavior Scenarios` 章节中，每个场景必须包含 **Given / When / Then** 三段式结构。
- 迁移过程中，旧 `docs/current/` 内容必须保留备份至少到验收完成。

## Integration Boundaries

### 与 Archive 的边界
- archive 负责：决策是否 promotion、生成 promotion plan、调用 `submitTask`。
- DRG executor 负责：实际文件操作、返回执行结果。
- archive 不关心 executor 内部如何合成或复制文件。

### 与 DRG 的边界
- DRG 负责：任务生命周期、依赖调度、资源锁、状态持久化。
- OpenFlow 负责：注册 `current-promotion` executor、在适当时机 `submitTask`。
- DRG 不感知 "feature"、"archive"、"current" 等业务语义，只接收 `type` 和 `payload`。

### 与 `docs/changes/` 的边界
- `changes/` 的结构和文件类型完全不变。
- feature 工作区仍可包含 `behavior.md`、 `design.md`、 `plan.md` 等。
- archive 流程从 `changes/` 复制到 `archive/` 的逻辑不受影响。

---

## Error Handling

| 错误场景 | 错误码 | 处理方式 |
|---|---|---|
| promotion executor 写入文件失败 | `EXECUTOR_FAILED` | 任务标记 `failed`，保留错误详情，可 retry |
| 资源锁冲突导致任务无法启动 | （无错误，正常排队） | 任务保持 `ready`，等待锁释放 |
| DRG 未启动且回退配置为 `false` | `SCHEDULER_NOT_STARTED` | archive 返回错误，提示用户启动 DRG 或启用回退 |
| promotion plan 中的源文件不存在 | `PROMOTION_SOURCE_MISSING` | executor 跳过该操作，记录到 `skipped`，任务仍可 `succeeded` |
| 目标上下文目录不存在 | `PROMOTION_TARGET_MISSING` | executor 自动创建目录，继续执行 |
