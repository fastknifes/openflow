---
layout: doc
---

# 目录约定

本文档描述 OpenFlow 使用的标准目录结构及其用途。

## 整体结构

```
docs/
├── current/          # 当前有效的事实与约定
├── changes/          # 进行中的功能/变更工作区
├── archive/          # 已完成的历史归档
├── decisions/        # 跨功能的正式全局决策
└── references/       # 参考资料（可选）
```

## docs/current/ — 当前有效事实

存放项目当前仍然有效的事实、设计和约定。这是团队共享的"项目记忆"。

| 子目录 | 用途 |
|--------|------|
| `current/requirements/` | 当前有效的需求定义 |
| `current/design/` | 当前有效的设计文档 |
| `current/spec/` | 当前有效的规格说明 |
| `current/workflow/` | 当前工作流约定 |
| `current/workflow/ai-reflection/` | AI 自我反思记录 |

**原则**：当信息不再有效时，应通过归档流程移至 `docs/archive/`，而非直接删除。

## docs/changes/ — 变更工作区

每个活跃的功能或变更在此目录下拥有独立的工作区。

```
docs/changes/
└── 2026-05-10-dark-mode/
    ├── design.md
    ├── requirements.md
    ├── plan.md
    └── ...
```

命名规范：`{YYYY-MM-DD}-{feature-name}/`

## docs/archive/ — 历史归档

已完成的功能通过 `/openflow-archive` 命令归档至此。归档是正式的工程行为，不是简单的文件移动。

归档时会产生：
- 冻结的历史上下文
- `implementation-mapper.md`（需求→代码追溯映射）
- 更新后的 `docs/current/` 事实

## docs/decisions/ — 全局决策

跨功能的架构决策记录（ADR）。格式参考 `ADR-001-docs-governance-and-workflow.md`。

**用途**：
- 记录关键架构判断及其理由
- 解释系统为什么呈现当前形态
- 为未来的决策提供上下文

## .sisyphus/ — 内部状态

OpenFlow 的内部运行时状态，通常不需要手动编辑。

| 路径 | 用途 |
|------|------|
| `.sisyphus/plans/` | 实施计划文件 |
| `.sisyphus/builds/` | 构建产物 |
| `.sisyphus/feature/` | 功能状态 |
| `.sisyphus/openflow/guardian/` | Guardian 状态 |

> 本文档正在建设中，更多示例和最佳实践将持续补充。
