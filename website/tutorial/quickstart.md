---
layout: doc
---

# 10 分钟上手

这个教程让你跑通 OpenFlow 的主链路：初始化 → 设计 → 计划 → 实施 → 质量门 → 归档。

![OpenFlow 工作流流程图](/diagrams/workflow.svg)

## 1. 初始化项目

```text
/openflow-init
```

这会在项目根目录创建或刷新 `AGENTS.md` 的 OpenFlow 文档导航规则。

## 2. 创建 Feature 设计

```text
/openflow-feature user-profile-page
```

OpenFlow 会围绕目标、边界、约束和预期结果进行澄清。收敛后会在 `docs/changes/YYYY-MM-DD-user-profile-page/` 下生成设计文档。

## 3. 生成实施计划

```text
/openflow-writing-plan user-profile-page
```

计划会写入两个位置：

- `docs/changes/YYYY-MM-DD-user-profile-page/plan.md`
- `.sisyphus/plans/user-profile-page.md`

它只生成计划，不会自动开始实现。

## 4. 开始实施

```text
/openflow-implement user-profile-page
```

OpenFlow 会创建 `ImplementationRun`：

- 如果检测到 OMO，委派到 `/start-work user-profile-page`；
- 如果没有 OMO，使用 OpenCode 原生执行路径；
- 如果你希望隔离变更，可使用 `--worktree`。

```text
/openflow-implement user-profile-page --worktree
```

## 5. AI 调用质量门

实现完成后，AI 应调用：

```text
openflow-quality-gate
```

质量门会统一处理 harden / verify，并输出 readiness。

## 6. 归档

当质量门返回 `Ready` 或 `ReadyWithDocUpdates` 且相关要求已处理后，运行：

```text
/openflow-archive user-profile-page
```

归档会冻结工作文档、提升当前事实，并生成 `implementation-mapper.md`。

## 你已经完成了第一轮闭环

接下来可以继续阅读：

- [Feature 工作流](./feature-workflow)
- [质量门与归档](./quality-gate-and-archive)
- [命令速查](./commands)
