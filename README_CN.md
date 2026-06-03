# OpenFlow：AI 驱动开发的治理层

[English](./README.md) · [完整教学手册](https://fastknifes.github.io/openflow/)

OpenFlow 是运行在 OpenCode 上的**文档治理工作流**。它不让 AI 一上来就问“怎么写代码”，而是先问清楚：

- 这次变更的边界到底是什么？
- 哪些既有约束不能被破坏？
- 什么证据才算真正完成？
- 对话结束后，设计意图和实现依据保存在哪里？

它面向存量系统和真实团队协作场景：你可以让 AI 写代码，但必须让文档、证据和归档来守住边界。

## 为什么需要 OpenFlow

AI 写代码很快，但没有治理的 AI 开发通常会带来三个问题：

1. **范围漂移**：你让 AI 修一个按钮，它顺手重构了组件库。
2. **完成不可验证**：AI 说“完成了”，但没有新的 lint、typecheck、test 证据。
3. **历史不可追溯**：三个月后没人知道这段代码为什么存在、当时为什么这样设计。

OpenFlow 把文档变成 AI 必须遵守的行为契约：

- `docs/current/` 保存当前系统事实，AI 执行时必须遵守。
- `docs/changes/` 保存正在进行的 Feature 设计、计划与约束边界。
- `docs/decisions/` 保存跨 Feature 的架构决策。
- `docs/archive/` 保存已完成工作的冻结历史和需求到代码的追溯映射。

## 核心工作流

```text
brainstorm → feature → writing-plan → implement → quality-gate → archive
```

| 阶段 | 做什么 | 用户入口 |
|---|---|---|
| 头脑风暴 | 在正式建档前探索需求、方案和取舍。 | 直接让 AI “先 brainstorm”，或调用 `openflow-brainstorm` skill。 |
| Feature 设计 | 澄清边界，生成设计文档和行为约束。 | `/openflow-feature <描述>` |
| 开发计划 | 把设计转成结构化实施计划。 | `/openflow-writing-plan <feature>` |
| 实施 | 创建 ImplementationRun 并委托执行。 | `/openflow-implement <feature>` |
| 质量门 | 验证证据、风险、新鲜度与就绪状态。 | AI 自动调用 `openflow-quality-gate`。 |
| 归档 | 冻结历史、更新当前事实、生成追溯映射。 | `/openflow-archive <feature>` |

## 你会得到什么

- **需求到代码的追溯**：完成后的 Feature 会生成 `implementation-mapper.md`，把需求映射到具体文件、函数和符号。
- **证据驱动的完成标准**：不是 AI 口头说完成，而是新鲜的验证证据通过质量门。
- **项目级长期记忆**：设计、决策、约束不依赖某一次对话，不会因为换 Agent 或换人而丢失。
- **更安全的 AI 执行**：实现阶段会重新注入 current facts、decisions、behavior constraints，减少越界修改。
- **可选增强能力**：默认可在 OpenCode 中使用，也可以集成 oh-my-openagent（omo）和 GitNexus，获得多 Agent 编排与代码图谱能力。

## 快速安装

给 Claude Code、Cursor、Trae、OpenCode 等 LLM Agent，直接粘贴：

```text
Install and configure OpenFlow by following the instructions here:
https://fastknifes.github.io/openflow/getting-started/installation
```

手动安装：

```bash
npm install @fastknife/openflow
```

然后在 `~/.config/opencode/opencode.json` 或 `opencode.jsonc` 中启用插件：

```json
{
  "plugin": ["@fastknife/openflow"]
}
```

在 OpenCode 中初始化项目：

```text
/openflow-init
```

开始第一个受治理的 Feature：

```text
/openflow-feature add user profile page
```

## 学会怎么使用

- [10 分钟上手](https://fastknifes.github.io/openflow/getting-started/quickstart)
- [面向 AI Agent 的安装指南](https://fastknifes.github.io/openflow/getting-started/installation)
- [命令参考](https://fastknifes.github.io/openflow/reference/commands)
- [Feature 工作流详解](https://fastknifes.github.io/openflow/guide/feature-workflow)

## 开源协议

MIT License. 由 [fastknife](https://github.com/fastknifes) 开发。
