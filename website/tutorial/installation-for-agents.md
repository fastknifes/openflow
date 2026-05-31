---
layout: doc
---

# LLM 自动安装

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
