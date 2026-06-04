# drg-task-scheduler - Proposal

**日期**: 2026-05-21  
**Feature**: drg-task-scheduler  
**状态**: Draft

---

## 1. 问题陈述

OpenFlow 目前有命令、hook、ContractRuntime、GuardianConsumer 等执行期组件，但缺少一个**全局任务调度基础设施**：

- 没有统一的后台任务生命周期管理。
- 没有统一的任务依赖图与 ready/running/done 状态推进。
- 没有全局任务状态持久化与恢复。
- 没有轻量方式创建、排队、取消、重试任务。
- 多个运行期组件若都需要后台执行，只能各自实现局部队列，容易重复和冲突。

本功能引入 **DRG 全局任务调度器**。这里的 DRG 指面向调度的 **Dependency/Resource Graph**：任务之间可以有依赖关系，也可以声明资源占用关系。调度器只负责执行图的状态推进和资源协调，不负责理解用户大需求，也不负责拆分 feature。

---

## 2. 正确边界

DRG Task Scheduler 是**底层基础设施**，不是 Project Orchestrator。

### 做什么

- 创建任务。
- 管理任务状态。
- 管理任务依赖关系。
- 管理任务资源占用。
- 根据依赖与资源判断任务是否 ready。
- 触发 task executor 执行任务。
- 持久化任务图与执行结果。
- 支持事件触发、定时触发、手动触发。

### 不做什么

- 不把大需求拆成 feature。
- 不生成项目阶段计划。
- 不自动执行 `/openflow-feature`。
- 不替代 quality-gate。
- 不决定业务需求。
- 不承诺产出 MVP 或 Demo。

---

## 3. 典型用途

DRG 调度器可以被其他 OpenFlow 功能复用，例如：

- Drift Guardian 的异步检查任务。
- 后台文档一致性扫描。
- 多个组件共享同一文件资源时的串行化控制。
- 长耗时命令的后台执行与恢复。
- 未来 Project Orchestrator 的底层调度引擎。

这些都是**调用方场景**，不是调度器自身的业务职责。

---

## 4. 核心价值

1. **统一后台执行模型**：所有内部后台任务都走同一个 task lifecycle。
2. **减少重复实现**：Guardian、未来 Orchestrator、维护任务不各自造队列。
3. **更可靠恢复**：OpenCode 重启后可以恢复未完成任务状态。
4. **更安全并发**：通过资源声明避免多个任务同时写同一文件或状态。
5. **可测试基础设施**：调度核心是纯逻辑，可独立测试。

---

## 5. 第一版目标

第一版只实现最小可用全局调度器：

- DRG task model。
- dependency graph。
- resource lock model。
- task lifecycle state machine。
- in-process scheduler loop。
- JSON state store。
- executor registry。

不实现高级项目编排，不实现用户需求拆解。
