# OpenFlow

[![npm 版本](https://img.shields.io/npm/v/@fastknife/openflow.svg)](https://www.npmjs.com/package/@fastknife/openflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js 版本](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

[English](./README.md)

**OpenFlow 是 AI 驱动开发的治理层。** 它不是先问"怎么写"，而是先问 **"问题边界是什么、哪些约束不能破、什么证据才算完成"**。

面向存量系统，关注需求可追溯、验证证据和归档权威，而非快速产出第一行代码。

## 核心特性

| 特性 | 描述 |
|------|------|
| **需求 ↔ 代码 可追溯** | 每个归档特性生成 `implementation-mapper.md`——需求精确映射到文件、函数、符号 |
| **证据级质量门** | 质量门不是"我觉得修好了"，而是 lint、typecheck、test 全部通过，加上明确的就绪分类（Ready / NotReady） |
| **项目级长期记忆** | 三层文档结构（current / decisions / archive）让项目知识在人员变动、会话丢失、Agent 切换后依然不丢失 |
| **双工作流模式** | Feature 工作流面向边界清晰的变更；Issue 工作流面向边界模糊的问题 |

## 快速开始

### 前提条件

- **Node.js** >= 18.0.0
- **OpenCode** 插件支持（通过 `opencode.json` 配置）

### 给 LLM Agent（Claude Code、Cursor、Trae 等）

```
安装和配置 OpenFlow：
1. 运行：npm install @fastknife/openflow
2. 添加到 opencode.json：{ "plugins": ["@fastknife/openflow"] }
3. 重启 Agent 会话

完整安装指南：https://fastknifes.github.io/openflow/getting-started/installation
```

### 手动安装

```bash
npm install @fastknife/openflow
```

然后在 `opencode.json` 中启用插件：

```json
{
  "plugins": ["@fastknife/openflow"]
}
```

## 核心工作流

### Feature 工作流（Mode 1）

适用于边界清晰的变更：新功能、需求修改、重构。

```
brainstorm → feature → writing-plan → implement → quality-gate → archive
```

### Issue 工作流（Mode 2）

适用于边界模糊的问题：先调查、分类，再决定下一步。

```
issue → investigate → classify → decide → next step
```

## 文档

**完整文档：[https://fastknifes.github.io/openflow/](https://fastknifes.github.io/openflow/)**

| 章节 | 描述 |
|------|------|
| [快速开始](https://fastknifes.github.io/openflow/getting-started/quickstart) | 10 分钟上手指南 |
| [核心概念](https://fastknifes.github.io/openflow/introduction/concepts) | 行为文档约束、目录结构、工作流模式 |
| [质量门](https://fastknifes.github.io/openflow/highlights/quality-gate) | 证据验证与就绪分类 |
| [竞品对比](https://fastknifes.github.io/openflow/introduction/comparison) | OpenFlow 与 OpenSpec、GSD 等的区别 |

## 项目结构

```
project/
├── docs/
│   ├── current/           # 当前仍有效的事实、设计、规范
│   ├── decisions/         # 跨特性的架构决策
│   ├── changes/           # 进行中的特性/变更工作区
│   └── archive/           # 冻结的历史上下文和正式记录
├── .sisyphus/             # 内部状态（计划、构建、验收）- 不纳入版本控制
└── opencode.json          # 插件配置
```

## 何时使用 OpenFlow

| 你的场景 | 推荐 |
|----------|------|
| 存量项目，有生产流量、历史行为和遗留约束 | **OpenFlow 是理想选择** |
| 需要统一循环：需求澄清 → 问题调查 → 验证证据 → 归档追溯 | **OpenFlow 是理想选择** |
| 技术负责人、架构师关心治理和可审查性 | **OpenFlow 是理想选择** |
| 个人原型项目，首次输出速度最重要 | 考虑更轻量的工具 |
| 团队只想要一个轻量级的规格层 | 考虑更轻量的工具 |

## 开源协议

MIT License. 由 [fastknife](https://github.com/fastknifes) 开发。
