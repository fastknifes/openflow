---
layout: doc
---

# 快速开始

本页把安装、初始化、基础配置和 10 分钟上手流程放在一起。按顺序完成后，你就能在一个项目里跑完 OpenFlow 的主工作流。

## 前置条件

- 已安装 [OpenCode](https://github.com/opencode-ai/opencode)。
- 有一个项目目录。OpenFlow 对已有项目尤其有价值。
- 可以使用 npm 安装包。
- 可选：安装 Bun，用于 omo 多 Agent 编排。

## 安装

在项目或全局环境中安装 OpenFlow：

```bash
npm install @fastknife/openflow
```

然后在 OpenCode 配置中注册插件。通常是 `~/.config/opencode/opencode.json` 或 `opencode.jsonc`：

```json
{
  "plugin": ["@fastknife/openflow"]
}
```

如果已经有其他插件，请把 `@fastknife/openflow` 追加到已有 `plugin` 数组，不要覆盖原配置。

## 可选依赖

### omo：多 Agent 编排

OpenFlow 可以只依赖 OpenCode 工作；如果安装 omo（oh-my-openagent / oh-my-opencode），则可以获得更强的多 Agent 计划、执行和隔离能力。

常见安装入口：

```bash
bunx oh-my-opencode install
```

安装后可运行：

```bash
bunx oh-my-opencode doctor
```

### GitNexus：代码图谱与影响分析

GitNexus 可为 AI 提供调用图、影响分析和代码导航能力，适合大型或高风险项目：

```bash
npm install -g gitnexus
npx gitnexus analyze
```

如果需要语义搜索嵌入：

```bash
npx gitnexus analyze --embeddings
```

### Windows 特殊说明

在 Windows 上配置 GitNexus MCP 时，Node MCP 客户端可能无法直接启动无扩展名的 npm shim。建议先找到 `gitnexus.cmd`：

```powershell
where.exe gitnexus.cmd
```

然后在 OpenCode 配置中通过 `cmd /c` 调用 `.cmd` 包装器，并把路径替换为你的实际输出：

```json
{
  "mcp": {
    "gitnexus": {
      "type": "local",
      "command": ["cmd", "/c", "C:\\Users\\<your-user>\\AppData\\Roaming\\npm\\gitnexus.cmd", "mcp"],
      "enabled": true
    }
  }
}
```

如果 `opencode.json` 已经有 `mcp` 配置，只合并 `gitnexus` 条目，不要覆盖整个 `mcp` 对象。

## 初始化项目

在 OpenCode 中进入目标项目，运行：

```text
/openflow-init
```

它会在项目根目录写入或更新 `AGENTS.md`，把 OpenFlow 的文档目录约定、工作流入口和 AI 行为要求注入项目。之后 AI 进入这个项目时，会知道如何读取 current、changes、decisions 和 archive。

## 配置

OpenFlow 开箱即用，大多数项目不需要配置。需要自定义时，配置源按以下优先级生效：

1. 项目根目录的 `openflow.json`
2. 项目根目录的 `openflow.jsonc`
3. `opencode.json` 顶层的 `openflow` 字段

第一个找到的配置源生效，不会跨配置源深度合并。推荐优先使用项目根目录的 `openflow.json`，因为它更容易随项目版本化和审查。

### 最小配置示例

只写你想覆盖的字段，未声明的字段使用默认值：

```json
{
  "feature": {
    "trigger_mode": "smart"
  },
  "verification": {
    "quality": ["lint", "typecheck", "test"]
  }
}
```

### 常见场景配置

关闭自动触发，始终手动进入 Feature 工作流：

```json
{
  "feature": {
    "trigger_mode": "always"
  }
}
```

自定义归档目录：

```json
{
  "paths": {
    "archive": "docs/history"
  }
}
```

只运行 lint 和 test：

```json
{
  "verification": {
    "quality": ["lint", "test"]
  }
}
```

关闭漂移检测自动修复：

```json
{
  "guardian": {
    "auto_fix": false
  }
}
```

### 配置速查表

| 想要什么 | 配置 |
|---|---|
| 关闭 Feature 工作流 | `feature.enabled: false` |
| 始终手动触发 | `feature.trigger_mode: "always"` |
| 使用智能触发 | `feature.trigger_mode: "smart"` |
| 关闭 TDD 注入 | `tdd.enabled: false` |
| 只跑 lint 和 test | `verification.quality: ["lint", "test"]` |
| 关闭归档能力 | `archive.enabled: false` |
| 关闭漂移检测 | `guardian.enabled: false` |
| 关闭漂移自动修复 | `guardian.auto_fix: false` |

## 10 分钟上手流程

下面用“添加用户资料页”作为例子。你可以替换成自己的任务。

### 第 1 步：初始化

```text
/openflow-init
```

确认项目已经拥有 `AGENTS.md`，AI 能读取 OpenFlow 工作流约定。

### 第 2 步：brainstorm

```text
我们先 brainstorm，不要写代码。我想给应用加一个用户个人资料页面。
```

这一步用于低成本澄清需求、比较方案和控制范围。如果你已经非常确定要做什么，可以跳过。

### 第 3 步：创建 Feature

```text
/openflow-feature add user profile page
```

OpenFlow 会收集必要事实，读取当前约束，并生成本轮变更的设计与行为文档。通常会落在 `docs/changes/YYYY-MM-DD-user-profile-page/`。

### 第 4 步：生成 writing-plan

```text
/openflow-writing-plan user profile page
```

这一步把设计转成可执行计划，包括任务顺序、涉及文件、验证命令和必要的约束提示。计划生成后会停下来，等待实施。

### 第 5 步：implement

```text
/openflow-implement user profile page
```

OpenFlow 会创建实施记录，并根据环境选择 omo 或 OpenCode 原生执行。AI 应在设计边界内完成代码和测试变更。

### 第 6 步：quality-gate

实施完成后，AI 必须调用 `openflow-quality-gate`。你通常不需要手动触发，但需要关注它的输出。

质量门会检查适用性、风险、证据、验证命令和就绪状态。只有 Ready 或允许补文档后 Ready 的结果，才适合继续归档。

### 第 7 步：处理结果

- `Ready`：可以归档。
- `ReadyWithDocUpdates`：先补齐需要提升的文档，再归档。
- `NotReady`：回到实现或验证，修复问题。
- `NeedsDecision`：需要人工做取舍，不能让 AI 自行跳过。

### 第 8 步：archive

```text
/openflow-archive user profile page
```

归档会冻结变更历史、提升长期事实到 `docs/current/`，并生成 `implementation-mapper.md`。这一步之后，变更才真正进入 OpenFlow 意义上的完成状态。

完整链路如下：

```text
init → brainstorm → feature → writing-plan → implement → quality-gate → archive
```

## 常用场景速查

### 中途改需求

```text
/openflow-change user profile page "把头像改成方形裁剪"
```

用于在不丢失已有上下文的情况下调整范围和设计。

### 查看状态

```text
/openflow-status
```

查看当前活跃 feature/change 的状态。

### 查看配置

```text
/openflow-config
```

用于检查当前生效配置，或让 AI 帮你解释配置来源。

### 迁移已有文档

```text
/openflow-migrate-docs
```

把已有文档迁移到 OpenFlow 的 current / changes / archive 结构中。

### 查看命令参考

完整命令列表见：[命令参考](/使用指南/reference/commands)。

## 下一步

- [核心概念 →](/介绍/concepts)
- [与竞品对比 →](/介绍/comparison)
- [命令参考 →](/使用指南/reference/commands)
