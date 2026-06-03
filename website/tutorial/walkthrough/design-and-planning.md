---
layout: doc
---

# 设计与规划实操

本页带你完成从想法到可执行计划的完整流程：头脑风暴 → 设计澄清 → 生成开发计划。

## 流程概览

```mermaid
flowchart LR
    brainstorm([头脑风暴]) -.-> feature
    feature[设计澄清] --> plan[生成计划]

    classDef main fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#01579b
    classDef optional fill:#f5f5f5,stroke:#9e9e9e,stroke-width:2px,color:#9e9e9e,stroke-dasharray: 5 5

    class brainstorm optional
    class feature,plan main
```

## Step 1: 头脑风暴（可选）

当你还不知道方案、范围或取舍时，先让 AI 进行对话探索：

```text
我们先 brainstorm，不要写代码。请帮我比较几种方案，并指出最小可交付范围。
```

如果你的 OpenCode 客户端支持按名称调用 Skill，也可以调用 `openflow-brainstorm`。

头脑风暴不会生成正式文件，只帮助你收敛意图。

**何时可以跳过：** 需求已经清楚时，直接进入 Step 2。

## Step 2: 设计澄清

```text
/openflow-feature <feature>
```

`<feature>` 支持三种输入方式：

- **无参数** — 从当前上下文自动推断
- **slug** — 如 `user-auth`
- **自然语言描述** — 如"给用户管理模块添加角色权限功能"

### 会发生什么

AI 会判断目标、边界和预期结果是否足够清晰。缺少关键事实时，它只会问一个有价值的问题——不会走固定问卷。

你可以用自然语言回答：

```text
/openflow-feature 这个功能的边界是只处理本地文件，不涉及远程存储
```

### 完成标志

设计澄清完成后，`docs/changes/<feature>/` 目录下会生成工作文档（如 design.md、behavior.md 等）。

## Step 3: 生成开发计划

```text
/openflow-writing-plan <feature>
```

### 计划内容

生成的计划包含：

- 实施步骤与任务分解
- TDD / 验证提示
- 完成后调用 `openflow-quality-gate` 的提醒

### 保存位置

```text
docs/changes/<feature>/plan.md
.sisyphus/plans/<feature>.md   (硬链接)
```

两个路径指向同一份文件。如果检测到 OMO 环境，计划由 Prometheus 写入；否则由 OpenCode build agent 写入。

## 常见问题

**Q: 设计澄清问了太多问题，如何加快？**
在调用 `/openflow-feature` 时附上足够的背景信息，AI 会跳过已明确的部分。

**Q: 生成的计划不满意怎么办？**
直接告诉 AI 修改计划的具体部分，或重新运行 `/openflow-writing-plan` 覆盖。

**Q: 可以跳过计划直接实施吗？**
技术上可以调用 `/openflow-implement`，但质量门会因缺少计划而无法完整验证。
