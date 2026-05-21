# drg-task-scheduler - Decisions

**日期**: 2026-05-21  
**Feature**: drg-task-scheduler  
**状态**: Draft

---

## D-1: 调度器只做基础设施，不做项目编排

**决策**：DRG Task Scheduler 不理解 feature、project、用户需求拆解。

**原因**：调度器应当是可复用底层能力。Project Orchestrator 未来可以使用它，但不是它的第一版目标。

---

## D-2: 使用 Dependency/Resource Graph 而不是单纯 DAG

**决策**：任务 ready 判定同时考虑依赖关系和资源锁。

**原因**：全局后台任务不只存在先后依赖，也存在资源冲突，例如多个任务写同一文件。

---

## D-3: 调度核心不依赖 LLM

**决策**：DRGEngine、ResourceLockManager、StateStore 必须是纯确定性逻辑。

**原因**：调度基础设施必须可靠、可测试、可恢复。LLM 只能作为 executor 的调用方能力，而不是调度核心依赖。

---

## D-4: executor registry 扩展任务类型

**决策**：调度器通过 task.type 查找 executor，不在核心中写死 drift、docs、conversation 等任务。

**原因**：避免调度器膨胀为业务模块，保持基础设施边界清晰。

---

## D-5: 第一版不做 cron parser

**决策**：第一版只支持立即任务、runAfter 时间点任务，不支持 cron 表达式。

**原因**：依赖/资源调度是核心，cron 是触发层能力，可后续添加。

---

## D-6: JSON 文件持久化

**决策**：使用 `.sisyphus/openflow/scheduler/tasks.json` 等 JSON 文件保存状态。

**原因**：与 OpenFlow 现有状态管理方式一致，零额外依赖，人类可读。

---

## D-7: 重启后 running 任务标记为 failed

**决策**：恢复状态时，旧 `running` 任务不得继续运行，必须转为 `failed`，错误码为 `SCHEDULER_INTERRUPTED`。

**原因**：第一版没有跨进程执行句柄，也无法证明 executor 是否已产生副作用；直接重跑可能造成重复写入。

---

## D-8: 第一版默认最大并发为 1

**决策**：调度器支持可配置最大并发数，但默认值为 `1`。

**原因**：保守默认更适合基础设施第一版；资源锁语义稳定后再由调用方显式提高并发。

---

## D-9: 未注册 executor 的任务保持 ready

**决策**：任务依赖满足但 executor 未注册时，不进入 `running`，保持 `ready` 并记录 warning。

**原因**：executor 可能由后续模块注册；直接 failed 会让扩展加载顺序变成不可恢复错误。

---

## D-10: blocked 是终态，retry 不自动解锁下游

**决策**：第一版中 `blocked` 为终态；retry failed 任务只重置该任务本身，不自动恢复已经 blocked 的下游任务。

**原因**：自动级联恢复需要额外的依赖重算和用户意图判断，容易引入隐式重跑风险。

---

## D-11: 资源锁只存在于当前进程内存

**决策**：启动时不从状态文件恢复已占用锁；锁只能由当前进程实际 running 任务持有。

**原因**：第一版明确不做多进程分布式锁，持久化锁会导致重启后误判资源被永久占用。

---

## D-12: 第一版不提供用户命令层

**决策**：submit/list/status/cancel/retry 优先作为内部 API 暴露，不要求实现 CLI 或 OpenCode 用户命令。

**原因**：本功能是内部基础设施；命令层属于后续集成需求，第一版应先稳定调度核心。

---

## D-13: executor 契约固定为 execute(task, context)

**决策**：executor 以 `execute(task, context): Promise<unknown>` 形式注册，context 包含 `projectDir`、`AbortSignal`、`logger`。

**原因**：固定 executor 形状可以让 timeout、cancel、日志和测试语义稳定，避免每种任务类型自行定义执行协议。

---

## D-14: stopScheduler 默认 drain，不 abort

**决策**：`stopScheduler()` 默认停止新任务调度并等待 running settle；只有 `abortRunning: true` 才中断 running。

**原因**：默认 abort 可能造成任务副作用中断；drain 是更安全的基础设施默认行为。

---

## D-15: runAfter 未到期保持 pending

**决策**：`runAfter` 未到期任务保持 `pending`，不提前进入 `ready`。

**原因**：ready 表示可被调度执行；未到期任务提前 ready 会让状态语义混乱。

---

## D-16: dependency validation 在 submit 阶段完成

**决策**：自依赖、缺失依赖和循环依赖在 `submitTask` 阶段直接拒绝。

**原因**：这些属于任务图结构错误，不应进入运行期再转换为 blocked/failed。

---

## D-17: API 错误使用稳定错误码

**决策**：所有 API 错误使用 `{ code, message, taskId? }`，并定义固定错误码集合。

**原因**：稳定错误码是实现测试、调用方恢复和后续自动化调度的基础。
