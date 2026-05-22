---
layout: doc
---

# 10 分钟上手

本文档帮助你在 10 分钟内完成 OpenFlow 的基本设置，并运行一次完整的 Feature 工作流。

## 前置条件

- 已安装 [OpenCode](https://github.com/opencode-ai/opencode)
- 一个已有的项目目录（OpenFlow 更适合棕地项目）
- （可选）[Bun](https://bun.sh/) 运行时，用于 oh-my-openagent 集成

## 第 1 步：安装 OpenFlow

```bash
npm install @fastknife/openflow
```

在 `~/.config/opencode/opencode.json` 中注册插件：

```json
{
  "plugin": ["@fastknife/openflow"]
}
```

> 详细的安装指南（包括 omo 和 GitNexus 可选集成），请参阅[安装指南](./installation)。

## 第 2 步：初始化项目

在 OpenCode 中运行：

```
/openflow-init
```

这会在项目根目录生成 `AGENTS.md`，其中包含 OpenFlow 的文档治理指南。

## 第 3 步：创建你的第一个 Feature

```
/openflow-feature add user profile page
```

OpenFlow 会：

1. 探索你的意图，提出澄清问题
2. 根据复杂度生成设计文档（`design.md`、`requirements.md` 等）
3. 将文档保存到 `docs/changes/YYYY-MM-DD-user-profile-page/`

## 第 4 步：生成实施计划

```
/openflow-writing-plan user profile page
```

OpenFlow 会读取设计文档，生成结构化的实施计划。

## 第 5 步：开始实施

```
/openflow-implement user profile page
```

OpenFlow 会：

1. 创建 ImplementationRun
2. 委托给可用的后端（omo 或 OpenCode 原生构建）
3. 实施完成后自动调用质量门

## 第 6 步：质量门验证

实施完成后，AI 会自动调用 `openflow-quality-gate`，验证：

- lint / typecheck / test 是否通过
- 变更复杂度评估
- 就绪分类（Ready / NotReady / NeedsDecision）

## 第 7 步：归档

```
/openflow-archive user profile page
```

归档会：

1. 将工作文档移入 `docs/archive/`
2. 更新 `docs/current/` 中的项目事实
3. 生成 `implementation-mapper.md`（需求→代码追溯映射）

## 就是这样！

你已经完成了一次完整的 OpenFlow Feature 工作流。接下来可以：

- [配置 OpenFlow](./configuration) —— 根据项目需求调整配置
- [了解 Feature 工作流](/guide/feature-workflow) —— 深入理解功能开发流程
- [命令参考](/reference/commands) —— 查看所有可用命令
