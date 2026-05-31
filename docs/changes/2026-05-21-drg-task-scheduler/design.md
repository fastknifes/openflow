# drg-task-scheduler - Design

**日期**: 2026-05-21  
**Feature**: drg-task-scheduler  
**状态**: Draft

---

## Human Consensus Summary

Feature title: DRG 全局任务调度器  
Internal slug: drg-task-scheduler  
Source intent: 用户需要一个全局任务调度基础设施，能创建对话、管理依赖和资源冲突  
Problem or improvement target: OpenFlow 缺少统一的后台任务调度器，各组件若需后台执行只能各自实现局部队列，导致重复、冲突、无法恢复  
Expected result: 提供轻量全局任务调度核心，支持任务依赖图（Dependency Graph）和资源锁（Resource Lock），可被现有和未来模块复用

---

## Identity And Assumptions

- Feature slug: drg-task-scheduler
- Feature title: DRG 全局任务调度器
- Source intent: 用户需要一个全局任务调度基础设施，能创建对话、管理依赖和资源冲突
- Assumptions:
  - 调度器是 OpenFlow 内部基础设施，不直接面向终端用户
  - 调度核心不依赖 LLM 或 OpenCode conversation API
  - executor 通过 registry 扩展，调度器不写死具体任务类型
  - 第一版只支持 in-process 调度，不支持多进程分布式
- Pending confirmations:
  - 是否需要支持 cron 表达式触发（第一版不做）
  - 是否需要支持任务优先级插队（第一版不做）

---

## Overview

Feature: drg-task-scheduler

In scope: 全局任务注册、依赖调度、资源锁管理、执行器注册、状态持久化、任务生命周期管理
Out of scope: 大需求拆解、feature 编排、项目自动化、cron 表达式解析、多进程分布式锁、自动创建 OpenCode conversation

---

## Problem

OpenFlow 目前有命令、hook、ContractRuntime、GuardianConsumer 等执行期组件，但缺少一个统一的后台任务调度基础设施：

- 没有统一的后台任务生命周期管理
- 没有统一的任务依赖图与 ready/running/done 状态推进
- 没有全局任务状态持久化与恢复
- 没有轻量方式创建、排队、取消、重试任务
- 多个运行期组件若都需要后台执行，只能各自实现局部队列，容易重复和冲突

本功能引入 DRG 全局任务调度器。DRG 指面向调度的 Dependency/Resource Graph：任务之间可以有依赖关系，也可以声明资源占用关系。调度器只负责执行图的状态推进和资源协调，不负责理解用户大需求，也不负责拆分 feature。

---

## Goals

- 统一后台任务模型：所有后台任务都有一致的 ID、状态、依赖、资源、结果
- 依赖调度：任务依赖完成后自动进入 ready
- 资源协调：任务声明资源读写需求，调度器避免冲突执行
- 可恢复：任务图和执行状态持久化到 `.sisyphus/openflow/scheduler/`
- 可扩展 executor：不同任务类型由注册的 executor 执行
- 不绑定业务：调度器不知道 feature、project、需求拆解等上层语义

---

## Non-Goals

- 不把大需求拆成 feature
- 不生成项目阶段计划
- 不自动执行 `/openflow-feature`
- 不替代 quality-gate
- 不决定业务需求
- 不承诺产出 MVP 或 Demo
- 不实现 cron 表达式解析
- 不实现多进程分布式锁

---

## Behavior Alignment

| Behavior Scenario | Design Response | Risk |
|------------------|-----------------|------|
| 用户或系统提交一个后台任务 | 任务被注册为 pending，等待依赖和资源满足后自动进入 ready | Medium |
| 任务依赖的前置任务完成 | 下游任务自动解锁为 ready，调度器择机执行 | High |
| 两个任务尝试写同一文件 | 资源锁阻止并发执行，先到先执行，后到者排队等待 | High |
| OpenCode 重启或 session 中断 | 状态持久化文件被加载，未完成任务恢复为 pending/ready | High |
| 任务执行超时 | executor 收到 AbortSignal，任务标记为 failed | Medium |
| 用户取消正在运行的任务 | running 任务通过 AbortSignal 中断，状态改为 cancelled | Medium |

---

## Design Constraints

- [must] 调度核心不得依赖 LLM：调度是纯确定性逻辑，LLM 只能作为 executor 的调用方能力
- [must] 调度核心不得依赖 OpenCode conversation API：第一版不绑定对话创建能力
- [must] 第一版不得自动创建 OpenCode conversation：如需对话能力，只能由外部 executor 自行实现，调度核心只接收 task.type 与 payload
- [must] 状态写入必须原子化：先写临时文件，rename 成功后才替换旧文件
- [must] 非法状态转换必须拒绝并抛出明确错误
- [should] 状态文件人类可读：JSON 格式，带缩进，方便调试
- [should] 模块间耦合度低：DagEngine、ResourceLockManager、StateStore 可独立测试
- [may] 向后兼容：状态文件包含 version 字段，支持未来迁移

---

## Implementation-Critical Constraints

### Public API Boundary

- [must] 第一版公开 API 必须限定为：`submitTask`、`getTask`、`listTasks`、`cancelTask`、`retryTask`、`registerExecutor`、`startScheduler`、`stopScheduler`。
- [must] `submitTask` 输入必须包含 `type`、可选 `payload`、可选 `dependsOn`、可选 `resources`、可选 `timeoutMs`、可选 `runAfter`；输出必须返回稳定唯一 `taskId`。
- [must] `listTasks` 至少支持按 `status` 过滤；`getTask` 找不到任务时必须返回明确的 not-found 错误。
- [must] `registerExecutor` 对同一 `task.type` 重复注册必须拒绝，避免运行期覆盖导致不可预测行为。
- [must] 未注册 executor 的任务不得进入 `running`，必须保持 `ready` 并记录可观测 warning，直到 executor 注册或任务被取消。

### Executor Contract

- [must] `registerExecutor(type, executor)` 的 `type` 必须是非空字符串；已注册类型再次注册必须抛出 `DUPLICATE_EXECUTOR`。
- [must] executor 函数签名固定为 `execute(task, context): Promise<unknown>`，其中 `context` 必须包含 `projectDir`、`signal: AbortSignal`、`logger`。
- [must] executor 返回值必须可 JSON 序列化；不可序列化结果必须导致任务 `failed`，错误码为 `RESULT_NOT_SERIALIZABLE`。
- [must] cancel 与 timeout 都通过同一个 `AbortSignal` 通知 executor；若 cancel 与 timeout 同时发生，用户显式 cancel 优先，最终状态为 `cancelled`。
- [must] executor 抛错或 reject 时任务进入 `failed`，错误码默认为 `EXECUTOR_FAILED`，并保存 `message`。

### Scheduler Lifecycle

- [must] `startScheduler` 必须加载状态、恢复中断任务、清理孤儿锁，然后开始调度 tick；重复 start 必须幂等。
- [must] `stopScheduler` 必须停止接收新的调度 tick，不得启动新任务；默认不 abort 已 running 任务，而是等待当前 running settle 后保存状态。
- [must] `stopScheduler({ abortRunning: true })` 才允许 abort running 任务；被 abort 的 running 任务进入 `failed`，错误码为 `SCHEDULER_STOPPED`。
- [must] stop 完成前必须持久化最新状态并释放当前进程持有的资源锁。

### Dependency Validation

- [must] `submitTask` 必须拒绝自依赖，错误码为 `SELF_DEPENDENCY`。
- [must] `submitTask` 必须拒绝不存在的 dependency，错误码为 `DEPENDENCY_NOT_FOUND`。
- [must] 添加任务依赖后若形成循环依赖，必须拒绝提交，错误码为 `CYCLE_DETECTED`。

### Task Data Model

- [must] 持久化任务对象必须包含：`id`、`type`、`status`、`payload`、`dependsOn`、`resources`、`attemptCount`、`createdAt`、`updatedAt`。
- [must] 任务完成后若有结果，必须写入 `result`；失败时必须写入结构化 `error`，至少包含 `message` 与可选 `code`。
- [must] `payload`、`result`、`error` 必须可 JSON 序列化；不可序列化值必须在 submit 或保存前拒绝。
- [must] 状态文件不得保存密钥、token、密码；实现必须提供最小脱敏策略，至少对 key 名包含 `secret`、`token`、`password` 的字段拒绝或脱敏。
- [must] `resources` 必须使用 `{ kind, id, mode }` 结构，其中 `mode` 只能是 `read` 或 `write`。

### State Machine

- [must] 第一版状态集合固定为：`pending`、`ready`、`running`、`succeeded`、`failed`、`cancelled`、`blocked`。
- [must] 合法转换必须显式编码并测试：`pending -> ready|blocked|cancelled`，`ready -> running|blocked|cancelled`，`running -> succeeded|failed|cancelled`，`failed -> pending`（retry only）。
- [must] `succeeded`、`cancelled`、`blocked` 为终态；除非未来迁移明确允许，否则不得从终态恢复执行。
- [must] 依赖任务 `failed` 或 `cancelled` 时，所有仍未运行且依赖它的后继任务必须进入 `blocked`。
- [must] `cancelTask` 作用于 `pending` 或 `ready` 任务时必须立即转为 `cancelled`，并阻塞其未运行下游。
- [must] `cancelTask` 作用于 `running` 任务时必须触发 `AbortSignal`，最终状态为 `cancelled`，并阻塞其未运行下游。
- [must] `retryTask` 只允许作用于 `failed` 任务，并将该任务重置为 `pending`、递增 `attemptCount`、清除旧 `error`；第一版不自动解锁已经 `blocked` 的下游任务。

### Recovery Semantics

- [must] 重启恢复时，`pending` 与 `ready` 保持原状态；`succeeded`、`failed`、`cancelled`、`blocked` 保持终态。
- [must] 重启恢复时，旧 `running` 任务不得直接继续运行，必须转为 `failed`，错误码为 `SCHEDULER_INTERRUPTED`，避免重复执行有副作用任务。
- [must] `tasks.json` 损坏时必须尝试读取 `tasks.json.bak`；若 bak 也损坏，调度器必须以空状态启动并暴露 corrupted 状态/日志，不得崩溃。
- [must] 启动时资源锁不得从持久化文件恢复为已占用；锁只能由当前进程中实际 `running` 任务持有。

### Scheduling Policy

- [must] ready 任务选择顺序必须确定性：先按 `runAfter` 是否到期过滤，再按 `createdAt` 升序，最后按 `id` 升序。
- [must] 第一版最大并发数必须可配置，默认值为 `1`；资源不冲突时允许并发执行到最大并发数。
- [must] `runAfter` 未到期的任务必须保持 `pending`；只有到期且依赖满足时才可进入 `ready`。
- [must] 同一调度器实例内必须保证同一任务同一时间最多一个 executor invocation。
- [must] 调度循环中的 executor 异常必须被捕获并转为任务 `failed`，不得导致循环退出。

### Resource Lock Semantics

- [must] `file` 资源的 `id` 必须在加锁前规范化为稳定路径表示，避免 `./a` 与 `a` 绕过冲突检测。
- [must] 冲突矩阵固定为：`read/read` 不冲突，`read/write` 冲突，`write/write` 冲突。
- [must] 资源锁必须只在任务进入 `running` 前一次性获取；任一资源获取失败时不得部分运行，已获取锁必须回滚释放。
- [must] running 任务完成、失败、取消或 timeout 后必须在 finally 路径释放所有资源锁。
- [must] 锁等待不得无限阻塞调度循环；资源不可用时任务保持 `ready`，由后续 tick 重新尝试。

### Error And History Contract

- [must] 所有 API 错误必须使用稳定结构 `{ code: string, message: string, taskId?: string }`。
- [must] 第一版必须定义并测试错误码：`TASK_NOT_FOUND`、`DUPLICATE_EXECUTOR`、`EXECUTOR_NOT_FOUND`、`SELF_DEPENDENCY`、`DEPENDENCY_NOT_FOUND`、`CYCLE_DETECTED`、`INVALID_RESOURCE`、`PAYLOAD_NOT_SERIALIZABLE`、`RESULT_NOT_SERIALIZABLE`、`SENSITIVE_FIELD_REJECTED`、`INVALID_STATE_TRANSITION`。
- [must] `history.jsonl` 每行必须是 `{ timestamp, taskId, event, previousStatus?, nextStatus?, reason? }` JSON 对象。
- [must] corrupted state 必须通过 `listTasks` 的元信息或 `getSchedulerStatus` 暴露；若第一版不新增 `getSchedulerStatus`，则 `listTasks` 必须返回 `{ tasks, corrupted: boolean }`。

### Scope Guardrails

- [must] 第一版不得修改或调用 `/openflow-feature`、quality-gate、Project Orchestrator、conversation 创建流程。
- [must] `src/contracts/runtime.ts` 与 `src/config.ts` 只有在暴露 scheduler 配置或接入调用方确有必要时才可修改；基础调度核心应优先限制在 `src/orchestrator/`。
- [should] 第一版不要求 CLI 或用户命令；若实现 list/status，优先作为内部 API 暴露。

---

## Success Criteria

- [ ] 可以 submit 一个无依赖任务并执行成功
- [ ] 可以 submit A → B，A 成功后 B 自动 ready
- [ ] 两个写同一文件的任务不会并发运行
- [ ] executor 失败时任务进入 failed 并记录 error
- [ ] 重启后能从 tasks.json 恢复状态
- [ ] tasks.json 损坏时能从 tasks.json.bak 恢复
- [ ] list/status 能展示当前任务图
- [ ] 任务取消时 running executor 收到 AbortSignal
- [ ] 启动时自动清理孤儿资源锁

---

## Risks And Mitigations

- Risk: 调度器成为性能瓶颈，大量任务导致内存或 I/O 压力 Mitigation: 第一版限制最大任务数（如 100 个 active 任务），状态文件定期压缩历史
- Risk: 资源锁设计不当导致死锁 Mitigation: running 任务结束后必须释放锁，启动时清理孤儿锁，锁必须有超时机制
- Risk: 状态文件损坏导致整个调度器无法启动 Mitigation: 原子写入 + .bak 备份 + 损坏时优雅降级（标记 corrupted 而非崩溃）
- Risk: executor 抛未捕获异常导致调度循环崩溃 Mitigation: executor 调用用 try/catch 包裹，异常任务标记为 failed，调度循环继续

---

## Testing Strategy

- DagEngine 单元测试：依赖解锁、循环依赖检测、失败传播、拓扑排序
- ResourceLockManager 单元测试：read/write 冲突矩阵、死锁预防、孤儿锁清理
- StateStore 单元测试：正常保存、bak 恢复、损坏文件降级、并发写入安全
- SchedulerLoop 集成测试：完整生命周期 submit → ready → running → succeeded/failed
- 边界测试：空依赖图、自依赖、循环依赖、超时任务、取消任务
