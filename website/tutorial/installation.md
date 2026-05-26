---
layout: doc
---

# 手动安装

本文面向人类用户。如果你想让 Claude Code、Cursor、Trae、Qoder 等 Agent 自动安装，请看 [LLM 自动安装](./installation-for-agents)。

## 前置条件

- 已安装 [OpenCode](https://github.com/opencode-ai/opencode)。
- 当前项目使用 OpenCode 运行 Agent。
- Node.js / npm 可用。

OMO 和 GitNexus 都是可选增强，不是 OpenFlow 的必需依赖。

## 1. 安装 OpenFlow

```bash
npm install @fastknife/openflow
```

## 2. 启用 OpenCode 插件

在 `~/.config/opencode/opencode.json` 或 `opencode.jsonc` 中加入 OpenFlow 插件。

::: warning 注意字段名
OpenCode 插件字段是 `plugins`。如果你的配置里已经有其他插件，请追加，不要覆盖。
:::

```json
{
  "plugins": ["@fastknife/openflow"]
}
```

如果已有插件：

```json
{
  "plugins": ["existing-plugin", "@fastknife/openflow"]
}
```

## 3. 重启 OpenCode 并初始化项目

在目标项目中运行：

```text
/openflow-init
```

它会创建或刷新项目根目录的 `AGENTS.md`，写入 OpenFlow 文档导航规则。

## 4. 可选：安装 OMO

OMO（oh-my-openagent / oh-my-opencode）提供多 Agent 编排能力。OpenFlow 没有强依赖它。

- 如果已经安装并配置了 `oh-my-openagent` 或 `oh-my-opencode`，跳过本步。
- 如果不需要多 Agent 编排，也可以跳过。
- 如果选择安装，请按 OMO 官方安装指南执行，并在完成后运行它的 doctor/检查命令。

安装 OMO 后，`/openflow-implement <feature>` 会优先委派到 OMO 的 `/start-work` 执行路径；未安装时则使用 OpenCode 原生执行路径。

## 5. 可选：安装 GitNexus

GitNexus 提供代码图谱、影响分析和调用链导航。OpenFlow 可以不用 GitNexus 运行。

- 如果当前 Agent 已经能看到 `gitnexus_*` MCP 工具，跳过本步。
- 如果已全局安装 `gitnexus` 并配置 MCP，跳过安装，只确认当前项目是否已索引。
- 如果不需要代码图谱能力，也可以跳过。

常见安装方式：

```bash
npm install -g gitnexus
npx gitnexus analyze
```

Windows MCP 配置通常需要通过 `cmd /c gitnexus.cmd mcp` 启动；不要覆盖已有 `mcp` 配置，应合并 `gitnexus` 条目。

## 6. 验证

运行：

```text
/openflow-status
```

如果能看到 OpenFlow 状态信息，即安装完成。下一步阅读[10 分钟上手](./quickstart)。
