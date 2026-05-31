# drg-task-scheduler - Behavior Contracts

**日期**: 2026-05-21  
**Feature**: drg-task-scheduler  
**状态**: Draft

---

## Purpose

本文档记录 DRG 全局任务调度器第一版必须满足的可观察行为，用于实现计划、测试用例和后续 Drift Guardian checkpoint。

---

## Behavior Scenarios

### B-1: 无依赖任务执行成功

- Given 注册了匹配 `task.type` 的 executor
- When 调用 `submitTask` 提交无依赖任务
- Then 任务获得唯一 `id` 并进入 `pending`
- And 调度循环将其推进为 `ready`、`running`、`succeeded`
- And `result` 被持久化（若 executor 返回 result）

### B-2: 依赖任务成功后下游解锁

- Given 任务 B dependsOn 任务 A
- When A 进入 `succeeded`
- Then B 在下一次调度判定中进入 `ready`
- And B 只有在资源可用且 executor 已注册时才进入 `running`

### B-3: 依赖失败或取消后下游阻塞

- Given 任务 B dependsOn 任务 A
- When A 进入 `failed` 或 `cancelled`
- Then B 必须进入 `blocked`
- And B 不得自动执行

### B-4: retry failed 任务不自动恢复 blocked 下游

- Given 任务 A failed 且任务 B 因依赖 A 进入 `blocked`
- When 对 A 调用 `retryTask`
- Then A 重置为 `pending` 且 `attemptCount` 增加
- And B 保持 `blocked`

### B-5: 写同一 file 资源不得并发

- Given 两个任务都声明 `{ kind: "file", id: "same-path", mode: "write" }`
- When 两个任务都 ready
- Then 同一时间最多一个任务进入 `running`
- And 另一个任务保持 `ready` 等待后续 tick

### B-6: read/read 可并发，read/write 冲突

- Given 两个 ready 任务声明同一资源
- When 两者 mode 都为 `read`
- Then 它们可在最大并发限制内同时运行
- When 任一任务 mode 为 `write`
- Then 它们不得同时运行

### B-7: running 任务取消

- Given 任务处于 `running`
- When 调用 `cancelTask`
- Then executor 收到 AbortSignal
- And 任务最终进入 `cancelled`
- And 所有资源锁被释放

### B-8: timeout 导致任务失败

- Given 任务设置了 `timeoutMs`
- When executor 超过 timeout 未完成
- Then executor 收到 AbortSignal
- And 任务进入 `failed`
- And error.code 应表示 timeout

### B-9: executor 未注册时不运行

- Given 任务依赖已满足且资源可用
- When 没有注册对应 `task.type` 的 executor
- Then 任务保持 `ready`
- And 调度器记录 warning
- And 任务不得进入 `failed` 或 `running`

### B-10: 重启恢复 running 任务

- Given `tasks.json` 中存在旧 `running` 任务
- When 调度器启动并加载状态
- Then 该任务转为 `failed`
- And error.code 为 `SCHEDULER_INTERRUPTED`
- And 不恢复任何旧资源锁

### B-11: tasks.json 损坏时使用 bak

- Given `tasks.json` 损坏且 `tasks.json.bak` 可读
- When 调度器启动
- Then 使用 bak 恢复任务图
- And 记录恢复事件

### B-12: tasks.json 与 bak 都损坏时降级启动

- Given `tasks.json` 与 `tasks.json.bak` 都损坏
- When 调度器启动
- Then 以空任务状态启动
- And 暴露 corrupted 状态或日志
- And 不因状态文件损坏崩溃

### B-13: 调度顺序确定

- Given 多个任务同时 ready 且资源都可用
- When 调度器选择下一批任务
- Then 先排除 `runAfter` 未到期的任务
- And 对可运行任务按 `createdAt` 升序、`id` 升序选择

### B-14: 状态文件不得泄露敏感字段

- Given task payload/result/error 中包含 key 名匹配 `secret`、`token` 或 `password`
- When 任务被 submit 或状态被保存
- Then 调度器必须拒绝保存或脱敏这些字段
- And 持久化 JSON 中不得出现原始敏感值

### B-15: 自依赖、缺失依赖和循环依赖被拒绝

- Given 调用方提交任务
- When `dependsOn` 包含自身任务 ID、未知任务 ID，或提交后形成循环依赖
- Then `submitTask` 必须拒绝提交
- And 返回稳定错误码 `SELF_DEPENDENCY`、`DEPENDENCY_NOT_FOUND` 或 `CYCLE_DETECTED`

### B-16: pending 和 ready 任务取消

- Given 任务处于 `pending` 或 `ready`
- When 调用 `cancelTask`
- Then 任务立即进入 `cancelled`
- And 依赖该任务且尚未运行的下游任务进入 `blocked`

### B-17: stopScheduler 默认 drain running

- Given 调度器存在 running 任务
- When 调用 `stopScheduler` 且未传入 `abortRunning: true`
- Then 调度器不得启动新任务
- And 已 running 任务允许 settle
- And stop 完成前必须保存状态并释放当前进程持有的锁

### B-18: stopScheduler abort running

- Given 调度器存在 running 任务
- When 调用 `stopScheduler({ abortRunning: true })`
- Then running executor 收到 AbortSignal
- And 任务进入 `failed`
- And error.code 为 `SCHEDULER_STOPPED`

### B-19: runAfter 未到期任务保持 pending

- Given 任务依赖已满足但 `runAfter` 晚于当前时间
- When 调度器 tick
- Then 该任务保持 `pending`
- And 不进入 `ready` 或 `running`

### B-20: 部分资源锁获取失败时回滚

- Given ready 任务需要多个资源锁
- When 其中一个资源锁获取失败
- Then 任务不得进入 `running`
- And 已获取的锁必须立即释放
- And 任务保持 `ready` 等待后续 tick

### B-21: executor 异常不会终止调度循环

- Given 一个 executor 抛出异常或 reject
- When 调度器执行该任务
- Then 该任务进入 `failed`
- And 调度循环继续处理后续任务

### B-22: corrupted state 通过查询暴露

- Given `tasks.json` 与 `tasks.json.bak` 都损坏
- When 调度器启动并随后调用 list/status 查询
- Then 查询结果必须包含 corrupted 标记或等效状态
- And 调度器不得崩溃
