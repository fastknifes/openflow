---
layout: doc
---

# 集成与依赖

OpenFlow 可以独立运行，不依赖任何外部工具。但如果你安装了特定的编排工具，OpenFlow 会自动检测并解锁更强的能力。

## OpenCode

OpenCode 是 OpenFlow 唯一的必需依赖。OpenFlow 作为 OpenCode 的插件运行，所有核心功能——需求设计、开发计划、实施、质量门、归档——都通过 OpenCode 的命令和 Skill 系统驱动。

安装方式见[快速开始](/介绍/quickstart)。

## omo（oh-my-openagent）

[omo](https://github.com/code-yeongyu/oh-my-openagent) 是一个多 Agent 编排工具。OpenFlow 对它做了专门适配：当你同时安装了 omo 时，OpenFlow 会自动检测并启用增强能力。

### omo 带来什么

| 能力 | 没有 omo | 有 omo |
|---|---|---|
| **实施编排** | 单 Agent 执行 | `/openflow-implement` 内部通过 omo 的 `/start-work` 能力启动多 Agent 并行任务 |
| **计划代理** | 使用 OpenCode 原生计划 Agent | 使用 Prometheus 专用计划代理，支持访谈、清除和分阶段执行 |
| **计划同步** | 只保存到 `docs/changes/` | 同时保存到 `.sisyphus/plans/`，支持执行过程中的进度追踪 |

### 注意事项

omo 功能强大，但会消耗大量 Token。它适合有充足预算的团队或高价值项目。

### 安装

```bash
bunx oh-my-opencode install
```

安装后 OpenFlow 会自动检测，无需额外配置。

## oh-my-opencode-slim

[oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) 是 omo 的轻量替代方案，保留了核心编排能力，同时大幅降低了 Token 消耗。

如果你想要多 Agent 编排的能力，但预算有限，slim 是更务实的选择。

## 没有安装任何编排工具？

完全没问题。OpenFlow 的所有核心功能都能独立工作：

- 需求设计（`/openflow-feature`）
- 开发计划（`/openflow-writing-plan`）
- 实施（`/openflow-implement`）——使用 OpenCode 原生执行，支持 Git Worktree 隔离
- 质量门（自动触发）
- 归档（`/openflow-archive`）

没有 omo 时，OpenFlow 会使用单 Agent 模式执行。对于大多数日常开发任务，这已经足够了。

## 其他可选集成

### GitNexus

[GitNexus](https://github.com/abhigyanpatwari/GitNexus) 提供代码图谱和影响分析能力，为 AI 增加调用图追踪、安全重构和代码导航。适合大型项目或高风险变更场景。

安装方式见 GitNexus 官方文档。

## 下一步

- [快速开始 →](/介绍/quickstart)
- [核心概念 →](/介绍/concepts)
- [概览 →](/介绍/)
