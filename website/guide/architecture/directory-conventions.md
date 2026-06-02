---
layout: doc
---

# 目录约定

OpenFlow 使用固定目录表达不同生命周期的知识。不要把所有文档都塞进一个目录；每个目录都有治理含义。

```text
docs/
├── current/      # 当前仍有效的事实、设计和工作流约定
├── changes/      # 正在进行的 feature/change 工作区
├── archive/      # 已完成并冻结的历史记录
├── decisions/    # 跨 feature 的全局决策
└── references/   # 可选参考资料

.sisyphus/
├── plans/        # 实施计划
├── builds/       # 构建/执行状态
└── openflow/     # OpenFlow 运行状态
```

## `docs/current/`

这里记录当前有效事实。AI 在执行时应把它当成约束，而不是背景资料。

## `docs/changes/`

每个正在进行的 feature/change 有自己的工作区，通常包含 `design.md`、`behavior.md`、`plan.md` 等文件。

## `docs/archive/`

归档后的历史记录。这里的文档不应被随意重写，它回答“当时为什么这样做”。

## `docs/decisions/`

跨 feature 生效的正式决策，通常使用 ADR 风格记录。AI 不能在没有确认的情况下擅自新增全局规则。
