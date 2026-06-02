---
layout: doc
---

# 安装

本文提供两种安装方式：[手动安装](#手动安装)和 [LLM 自动安装](#llm-自动安装)。

## 手动安装

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

如果能看到 OpenFlow 状态信息，即安装完成。下一步阅读[10 分钟上手](/tutorial/getting-started/quickstart)。

## LLM 自动安装

把本页内容交给你的 LLM Agent（Claude Code、Cursor、Trae、Qoder 等）。Agent 应按步骤安装 OpenFlow，并在执行前保留用户现有配置。

::: danger 给 Agent 的硬性要求
- 不要覆盖已有 `plugins`、`mcp` 或其他配置。
- OMO 和 GitNexus 都是可选安装；如果用户拒绝或已经安装，必须跳过。
- 修改配置前先读取现有配置，合并而不是重写。
:::

## Agent 任务

你正在把 OpenFlow 安装到当前项目使用的 OpenCode 环境中。

### Step 1：安装 OpenFlow

```bash
npm install @fastknife/openflow
```

读取 `~/.config/opencode/opencode.json` 或 `opencode.jsonc`，把 `@fastknife/openflow` 追加到 `plugins` 数组。

如果已经存在：跳过，不重复添加。

示例：

```json
{
  "plugins": ["@fastknife/openflow"]
}
```

完成后告诉用户重启 OpenCode，并在项目中运行：

```text
/openflow-init
```

### Step 2：询问是否安装 OMO（可选）

向用户说明：OMO 是可选的多 Agent 编排增强，OpenFlow 不依赖它。

先检查是否已安装：

- `plugins` 中包含 `oh-my-openagent` 或 `oh-my-opencode`；或
- 用户环境中已有 OMO 相关配置。

如果已经安装：告诉用户“检测到 OMO，跳过安装”。

如果未安装，询问用户是否安装。用户拒绝时跳过。

用户同意后，获取并遵循 OMO 官方安装指南。注意：OMO 通常需要 Bun，优先使用它推荐的 `bunx` 安装方式，不要擅自改用 `npx`。

安装后运行 OMO 的 doctor/检查命令；如果失败，报告错误并停止，不要继续修改无关配置。

### Step 3：询问是否安装 GitNexus（可选）

向用户说明：GitNexus 是可选代码智能增强，用于调用图、影响分析和安全导航；OpenFlow 不依赖它。

先检查是否已安装：

- Agent 工具列表中是否已有 `gitnexus_query`、`gitnexus_impact` 等工具；
- `opencode.json` 是否已有 `mcp.gitnexus` 配置；
- 命令行是否能找到 `gitnexus` 或 `gitnexus.cmd`。

如果已经安装：跳过安装，只在需要时运行项目索引。

如果未安装，询问用户是否安装。用户拒绝时跳过。

用户同意后：

```bash
npm install -g gitnexus
npx gitnexus analyze
```

如果用户需要语义搜索，可在确认后使用：

```bash
npx gitnexus analyze --embeddings
```

配置 MCP 时必须合并已有 `mcp` 对象。Windows 下优先查找 `gitnexus.cmd`：

```powershell
where.exe gitnexus.cmd
```

然后使用 `cmd /c <path-to-gitnexus.cmd> mcp` 形式配置，避免 Node MCP 客户端无法启动 extensionless shim。

### Step 4：完成提示

安装结束后告诉用户：

```text
OpenFlow 已准备就绪。请在项目中运行 /openflow-init，然后从 /openflow-feature <feature> 开始第一个受治理变更。
```

如果用户同时启用了 OMO 或 GitNexus，也说明它们是增强能力，不是 OpenFlow 的必需条件。
