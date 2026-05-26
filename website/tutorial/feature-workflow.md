---
layout: doc
---

# Feature 工作流

Feature 工作流适合边界基本清晰的新功能、规则变更、结构改造或重构。

```text
brainstorm → feature → writing-plan → implement → quality-gate → archive
```

![OpenFlow 工作流流程图](/diagrams/workflow.svg)

## 什么时候先 brainstorm？

当你还不知道方案、范围或取舍时，先让 AI 使用 `openflow-brainstorm` 做对话探索。它不会生成正式文件，只帮助你收敛意图。

需求已经清楚时，可以直接进入 `/openflow-feature`。

## Step 1：设计澄清

```text
/openflow-feature <feature>
```

`/openflow-feature` 是自然语言优先的设计助手：

- 可以无参数，从上下文推断；
- 可以传 slug；
- 也可以传自然语言描述。

它不会机械地走固定问卷，而是判断目标、边界和预期结果是否足够清晰。缺少关键事实时，只问一个有价值的问题。

## Step 2：生成计划

```text
/openflow-writing-plan <feature>
```

计划会保存到 `docs/changes/*/plan.md` 和 `.sisyphus/plans/*.md`。它会包含 TDD/验证提示，并提醒实现完成后调用 `openflow-quality-gate`。

## Step 3：实施

```text
/openflow-implement <feature>
```

OpenFlow 会创建 `ImplementationRun`，并根据环境选择 OMO 或 OpenCode 原生后端。详见[实施与执行后端](./implementation)。

## Step 4：质量门

实现完成后，AI 调用 `openflow-quality-gate`。它是最终验证权威，不应被口头说明替代。

## Step 5：归档

```text
/openflow-archive <feature>
```

归档会生成 `implementation-mapper.md`，把需求/设计约束映射到代码和证据。
