# drg-task-scheduler - Requirements

**日期**: 2026-05-21  
**Feature**: drg-task-scheduler  
**状态**: Draft

---

## 1. 功能需求

| ID | 需求 | 优先级 | 验收标准 |
|---|---|---|---|
| R1 | 创建任务 | P0 | 调用 submit 后任务进入 `pending`，生成唯一 ID |
| R2 | 依赖调度 | P0 | 依赖任务全部 `succeeded` 后，下游任务进入 `ready` |
| R3 | 资源锁 | P0 | 两个写同一 `file:<path>` 的任务不得并发运行 |
| R4 | 执行器注册 | P0 | 根据 task.type 找到对应 executor 并执行 |
| R5 | 状态持久化 | P0 | 重启后能恢复 pending/running/succeeded/failed 状态 |
| R6 | 取消任务 | P0 | pending/ready/running 任务可取消；running 任务通过 AbortSignal 中断 |
| R7 | 重试任务 | P1 | failed 任务可显式 retry，attemptCount 增加 |
| R8 | 查询任务 | P0 | 能列出全部任务，按状态过滤 |
| R9 | 历史记录 | P1 | 任务完成/失败/取消写入 history.jsonl |

---

## 2. 明确非目标

- 不拆分用户大需求。
- 不创建 feature DAG。
- 不自动调用 `/openflow-feature`。
- 不执行 quality-gate。
- 不判断业务歧义。
- 不承诺项目级自动化。
- 不实现 cron 表达式解析。

---

## 3. 约束

### 3.1 架构约束

- 调度器必须是 OpenFlow 内部全局服务，可由 hooks、commands、consumers 共同调用。
- 调度核心不得依赖 LLM。
- 调度核心不得依赖 OpenCode conversation API。
- 第一版不得自动创建 OpenCode conversation；对话能力只能由外部 executor 自行封装。
- executor 通过 registry 扩展，调度器不写死具体任务类型。
- 第一版公开 API 限定为 `submitTask`、`getTask`、`listTasks`、`cancelTask`、`retryTask`、`registerExecutor`、`startScheduler`、`stopScheduler`。
- 同一 `task.type` 重复注册 executor 必须拒绝。
- 未注册 executor 的任务不得进入 running，必须保持 ready 并记录 warning。
- executor 函数签名固定为 `execute(task, context): Promise<unknown>`，`context` 必须包含 `projectDir`、`signal`、`logger`。
- `startScheduler` 重复调用必须幂等；`stopScheduler` 默认 drain running，不启动新任务，只有传入 `abortRunning: true` 时才中断 running。

### 3.1.1 任务模型约束

- 任务必须持久化 `id`、`type`、`status`、`payload`、`dependsOn`、`resources`、`attemptCount`、`createdAt`、`updatedAt`。
- `payload`、`result`、`error` 必须可 JSON 序列化。
- `resources` 必须使用 `{ kind, id, mode }`，其中 `mode` 只能是 `read` 或 `write`。
- 失败 `error` 至少包含 `message`，可选包含 `code`。
- 状态文件不得保存 key 名包含 `secret`、`token`、`password` 的敏感字段，必须拒绝或脱敏。

### 3.2 状态约束

- 状态目录固定为 `.sisyphus/openflow/scheduler/`。
- 写入使用 tmp + rename，保留 `.bak`。
- 状态文件必须带 version 字段。
- 状态文件不得保存密钥、token、密码。
- 状态集合固定为 `pending`、`ready`、`running`、`succeeded`、`failed`、`cancelled`、`blocked`。
- 合法转换必须显式编码：`pending -> ready|blocked|cancelled`，`ready -> running|blocked|cancelled`，`running -> succeeded|failed|cancelled`，`failed -> pending`（retry only）。
- `succeeded`、`cancelled`、`blocked` 为终态。
- `cancelTask` 取消 pending/ready 时立即进入 `cancelled`；取消 running 时必须 abort executor，最终进入 `cancelled`。
- 重启恢复时，旧 `running` 任务必须转为 `failed`，错误码为 `SCHEDULER_INTERRUPTED`。
- `tasks.json` 与 `.bak` 都损坏时，调度器必须以空状态启动并暴露 corrupted 日志/状态，不得崩溃。
- `submitTask` 必须拒绝自依赖、不存在依赖和循环依赖，分别返回 `SELF_DEPENDENCY`、`DEPENDENCY_NOT_FOUND`、`CYCLE_DETECTED`。

### 3.3 并发约束

- 同一调度器实例内，同一任务不得被执行两次。
- read/read 可并发，read/write 与 write/write 冲突。
- running 任务结束后必须释放所有资源锁。
- 启动时必须清理孤儿锁。
- 第一版最大并发数必须可配置，默认值为 `1`。
- ready 任务调度顺序必须确定：按 `runAfter` 到期、`createdAt` 升序、`id` 升序。
- `runAfter` 未到期任务必须保持 `pending`，不得提前进入 `ready`。
- `file` 资源 id 加锁前必须路径规范化。
- 任一资源锁获取失败时不得部分运行，已获取锁必须回滚释放。

### 3.4 故障约束

- executor 抛错时任务进入 failed，并记录 error。
- timeout 时必须 abort executor。
- dependency failed 时后继任务进入 blocked。
- 非法状态转换必须抛出明确错误。
- dependency cancelled 时后继任务也必须进入 blocked。
- retry 只允许作用于 failed 任务，递增 `attemptCount`，清除旧 error；第一版不自动解锁已 blocked 的下游任务。
- executor 异常不得导致调度循环退出。
- 所有 API 错误必须使用 `{ code, message, taskId? }` 稳定结构。
- 必须定义并测试错误码：`TASK_NOT_FOUND`、`DUPLICATE_EXECUTOR`、`EXECUTOR_NOT_FOUND`、`SELF_DEPENDENCY`、`DEPENDENCY_NOT_FOUND`、`CYCLE_DETECTED`、`INVALID_RESOURCE`、`PAYLOAD_NOT_SERIALIZABLE`、`RESULT_NOT_SERIALIZABLE`、`SENSITIVE_FIELD_REJECTED`、`INVALID_STATE_TRANSITION`。

### 3.5 可观测性约束

- submit、start、succeeded、failed、cancelled、blocked 必须记录日志。
- list/status API 必须能显示任务 ID、type、status、dependsOn、resources、error。
- history.jsonl 必须记录关键生命周期事件。
- history.jsonl 每行必须是 `{ timestamp, taskId, event, previousStatus?, nextStatus?, reason? }` JSON 对象。
- corrupted state 必须通过 list/status 查询结果显式暴露。

### 3.6 测试约束

- DRGEngine 单元测试覆盖：依赖解锁、循环依赖、失败传播。
- ResourceLockManager 单元测试覆盖：read/write 冲突矩阵。
- StateStore 单元测试覆盖：正常保存、bak 恢复、损坏文件降级。

---

## 4. 验收标准

- [ ] 可以 submit 一个无依赖任务并执行成功。
- [ ] 可以 submit A → B，A 成功后 B 自动 ready。
- [ ] 两个写同一文件的任务不会并发运行。
- [ ] executor 失败时任务进入 failed。
- [ ] 重启后能从 tasks.json 恢复状态。
- [ ] tasks.json 损坏时能从 tasks.json.bak 恢复。
- [ ] list/status 能展示当前任务图。
