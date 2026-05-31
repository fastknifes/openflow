---
layout: doc
---

# 实施与执行后端

`/openflow-implement` 不是直接写代码的普通命令，而是创建一条可追踪的 `ImplementationRun`，再把实现交给当前可用后端。

![openflow-implement 工作原理](/diagrams/implement.svg)

```text
/openflow-implement <feature>
```

## 路径 A：安装了 OMO

如果检测到 OMO（oh-my-openagent / oh-my-opencode），OpenFlow 会把实现委派给 OMO 的 `/start-work <feature>`。

适合：

- 多 Agent 协同；
- 大型任务分解；
- 已经使用 OMO 的团队。

## 路径 B：未安装 OMO

如果没有 OMO，OpenFlow 使用 OpenCode 原生执行路径。OpenFlow 仍然负责：

- 绑定 feature identity；
- 记录 ImplementationRun；
- 保留计划、质量门和归档链路；
- 要求实现完成后调用 `openflow-quality-gate`。

## Worktree 隔离

```text
/openflow-implement <feature> --worktree
```

适合希望把实现放进独立 git worktree 的场景。

## 生命周期

```text
created → starting_backend → running → quality_gate_pending → ready_for_archive → archived
```

如果质量门返回 NotReady 或 NeedsDecision，流程会停在 blocked/待处理状态，不能宣称完成。
