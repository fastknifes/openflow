# current-drg-promotion - Requirements

**日期**: 2026-05-22
**Feature**: current-drg-promotion
**状态**: Draft

---

## 1. 功能需求

| ID | 需求 | 优先级 | 验收标准 |
|---|---|---|---|
| R1 | `docs/current/` 按限界上下文组织 | P0 | `docs/current/` 下存在 6-7 个上下文目录，无 `feature-xxx` 子目录 |
| R2 | 上下文内部按文档类型拆分 | P0 | 每个上下文目录包含 `design.md`、`spec.md`、`requirements.md` |
| R3 | `behavior.md` 合并到 `spec.md` | P0 | `docs/current/` 下无独立 `behavior.md`，原内容已合并到各上下文 `spec.md` |
| R4 | `docs/changes/` 结构不变 | P0 | feature 工作区仍保留 `behavior.md` 等现有文件，无结构调整 |
| R5 | `docs/archive/` 结构不变 | P0 | 归档产物和归档流程不受影响 |
| R6 | current promotion 逻辑重写 | P0 | `current-promotion.ts` 能基于新结构生成正确的 promotion suggestions 并执行 |
| R7 | DRG 调度器实例化接入 | P0 | OpenFlow 启动时创建 `SchedulerLoop` 实例，注册 `current-promotion` executor，启动调度循环 |
| R8 | archive 提交 DRG promotion 任务 | P0 | `archive` 命令调用 `scheduler.submitTask({ type: 'current-promotion', ... })` 替代同步执行 |
| R9 | promotion 资源锁保护 | P0 | 两个并发 promotion 任务对同一 `docs/current/` 文件不会并发写 |
| R10 | promotion 任务可重试 | P1 | DRG 任务 failed 后，可通过 `retryTask` 重新执行 |
| R11 | archive 输出包含 DRG taskId | P1 | archive 完成消息中包含 promotion 任务的 taskId 和状态查询指引 |
| R12 | DRG 未启动时的回退 | P1 | 如果 DRG 未启动，archive 可回退到同步执行（配置开关控制） |

## 2. 明确非目标

- 不拆分用户大需求。
- 不创建新的限界上下文（只重组现有文档）。
- 不修改 `docs/changes/` 的 feature 工作区结构。
- 不修改 `docs/archive/` 的归档产物。
- 不将 archive 的决策权移交给 DRG。
- 不引入 cron 触发或自动归档。
- 不要求立即迁移历史 archive 内容。

## 3. 约束

### 3.1 架构约束

- `docs/current/` 下不得再出现 `feature-xxx` 子目录。
- `docs/changes/` 和 `docs/archive/` 的结构必须保持不变。
- archive 仍然是 current promotion 的决策 authority。
- DRG 调度核心不依赖 LLM，`current-promotion` executor 是纯文件操作逻辑。
- `current-promotion` executor 的返回值必须可 JSON 序列化。
- DRG 状态目录固定为 `.sisyphus/openflow/scheduler/`。

### 3.2 文档约束

- `spec.md` 必须包含 `## Behavior Scenarios` 章节（承接原 `behavior.md` 内容）。
- `spec.md` 必须包含 `## Constraints` 章节（承接原 `behavior.md` 的 Must/Must Not）。
- 小上下文（预计内容 < 50 行）允许合并为单文件，但需显式说明。

### 3.3 迁移约束

- 旧 `docs/current/` 内容迁移前必须保留备份。
- 迁移过程中不得丢失现有 `current/` 中的任何事实内容。
- `current-promotion.ts` 重写后，所有现有 archive 测试必须通过（或明确更新预期）。

---

## 4. 验收映射

| 需求 | 测试类型 | 预期证据 |
|---|---|---|
| R1 | 目录结构检查 | `fs.readdir('docs/current')` 无 `feature-xxx` 条目 |
| R2 | 目录结构检查 | 每个上下文目录存在 `design.md`、`spec.md`、`requirements.md` |
| R3 | 文件检查 | `glob('docs/current/**/behavior.md')` 返回空数组 |
| R4-R5 | 回归测试 | 现有 changes/archive 相关测试通过 |
| R6 | 单元测试 | `buildPromotionSuggestions` 和 `applyPromotionSuggestions` 基于新结构返回正确结果 |
| R7 | 集成测试 | OpenFlow 启动后 `listTasks` 返回空任务列表（调度器已启动） |
| R8 | 集成测试 | archive 完成后 `listTasks` 包含一个 `type: 'current-promotion'` 的任务 |
| R9 | 并发测试 | 两个同时提交的 promotion 任务对同一文件，后者状态为 `ready` 而非 `running` |
| R10 | 集成测试 | `retryTask` 后 failed 任务重置为 `pending` 并最终 `succeeded` |
| R11 | 输出检查 | archive 结果字符串中包含 `taskId` |
| R12 | 配置测试 | `config.archive.sync_promotion_fallback = true` 时，DRG 未启动仍同步执行 |
