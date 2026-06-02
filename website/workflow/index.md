---
layout: doc
---

# 工作流

- brainstorm：头脑风暴，确定目标
- feature：设计澄清，生成计划
- plan：生成计划
- implement：功能实施
- archive：归档结项

```mermaid
flowchart LR
    brainstorm([头脑风暴]) -.-> feature
    feature[设计澄清] --> plan[生成计划]
    plan --> implement[功能实施]
    implement --> archive[归档结项]

    %% 样式定义
    classDef main fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#01579b
    classDef optional fill:#f5f5f5,stroke:#9e9e9e,stroke-width:2px,color:#9e9e9e,stroke-dasharray: 5 5
    classDef success fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#2e7d32

    class brainstorm optional
    class feature,plan,implement main
    class archive success
```

## 什么时候先 brainstorm？

当需求还停留在模糊想法阶段——方案、范围或取舍都还没有结论时，先让 AI 使用 `openflow-brainstorm` 做对话探索。它不会生成正式文件，只负责帮你把模糊的想法收敛成清晰的意图。

需求已经清楚时，可以直接进入 `/openflow-feature`。

> 💡 **举个例子**：把开发一个功能比作一次旅行——`openflow-brainstorm` 是"确定目的地"，你只知道"我想去旅行"但不知道去哪，它帮你逐步收敛；而 `/openflow-feature` 是"制定攻略"，目的地已经确定（比如上海到云南），它帮你解决出行方式和准备工作等具体问题。

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
