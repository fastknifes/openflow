---
layout: doc
---

# 10 分钟上手

从零开始，跑一遍完整的 OpenFlow Feature 工作流。你会体验从想法到归档的全过程。

## 前置条件

- 已安装 [OpenCode](https://github.com/opencode-ai/opencode)
- 一个已有的项目目录（OpenFlow 对棕地项目特别友好）
- （可选）[Bun](https://bun.sh/) 运行时，用于 oh-my-openagent 集成

> 详细的安装指南（包括 omo 和 GitNexus 可选集成），请参阅[安装指南](./installation)。

---

## 第 1 步：安装

```bash
npm install @fastknife/openflow
```

在 `~/.config/opencode/opencode.json` 中注册插件：

```json
{
  "plugin": ["@fastknife/openflow"]
}
```

## 第 2 步：初始化项目

在 OpenCode 中运行：

```
/openflow-init
```

这会在项目根目录生成 `AGENTS.md`——一份给 AI 的文档治理导航指南。AI 读完它就知道如何遵循 OpenFlow 的文档结构和工作流约定。

## 第 3 步：头脑风暴（可选但推荐）

在直接进入设计之前，先理清想法：

直接自然地告诉 AI：

```text
我们先 brainstorm，不要写代码。我想给应用加一个用户个人资料页面。
```

如果你的 OpenCode 客户端支持按名称调用 Skill，也可以调用 `openflow-brainstorm`。核心不是命令形式，而是让 AI 先进入**探索需求、比较方案、控制范围**的对话模式。

你也可以这样描述：

> 我想给应用加一个用户个人资料页面

AI 会通过对话帮你：
- 理清意图和范围
- 识别潜在风险
- 如果想法过大，主动帮你拆分为小块
- 最终保存上下文包，过渡到 Feature 设计

::: tip
头脑风暴不产生正式文档，只是一个低成本探索。如果你的想法已经很清晰，可以跳过这步。
:::

## 第 4 步：创建 Feature 设计

```
/openflow-feature add user profile page
```

OpenFlow 会通过对话逐步收集事实：

1. **理解意图**：AI 提出聚焦问题，每次只问一个
2. **扫描约束**：自动检查 `docs/current/` 和 `docs/decisions/` 中的既有约束
3. **生成设计文档**：当信息足够时，自动生成 `design.md` 和 `behavior.md`

文档保存在 `docs/changes/YYYY-MM-DD-user-profile-page/`。

::: info
Feature 名称从你的自然语言描述中自动推导，不需要手动指定 slug。
:::

## 第 5 步：生成开发计划

```
/openflow-writing-plan user profile page
```

OpenFlow 会读取设计文档，生成结构化的实施计划 `plan.md`：
- 任务按依赖关系分组为执行波次
- 每个任务包含明确的文件路径和验证命令
- 约束（如 `[HIGH / security]`）自动跟随受影响的任务
- TDD 要求默认注入

## 第 6 步：开始实施

```
/openflow-implement user profile page
```

OpenFlow 会：
1. 创建 ImplementationRun 记录
2. 根据环境自动选择后端（omo 或 OpenCode 原生构建）
3. 可选在独立 Git Worktree 中隔离执行
4. 注入约束包到执行上下文

## 第 7 步：质量门验证（自动）

实施完成后，AI 会**自动**调用 `openflow-quality-gate`。你不需要手动触发。

质量门会验证：

| 检查项 | 说明 |
|--------|------|
| 适用性分类 | 判断当前工作是否需要完整验证 |
| 上下文检测 | 确认执行上下文完整 |
| 风险评估 | 基于变更文件数、diff 行数、敏感路径等 |
| 对抗性硬化 | 高风险变更触发攻击者视角审查 |
| 证据验证 | lint / typecheck / test 必须全部通过 |
| 就绪分类 | 输出 Ready / ReadyWithDocUpdates / NotReady / NeedsDecision |

::: warning
AI 在实现完成后**必须**调用 `openflow-quality-gate`，不能跳过质量门直接声称完成。
:::

## 第 8 步：归档

质量门返回 Ready 后，运行：

```
/openflow-archive user profile page
```

归档会执行三件事：

1. **冻结**：将工作文档复制到 `docs/archive/YYYY-MM-DD-user-profile-page/`（只读历史记录）
2. **提升**：自动更新 `docs/current/` 中的活跃文档，反映新的系统状态
3. **映射**：生成 `implementation-mapper.md`——需求到代码的精确追溯映射

::: info
归档需要用户显式确认才会执行，不会自动触发。
:::

## 就是这样！

你刚刚完成了一次完整的 OpenFlow Feature 工作流：

```
init → brainstorm → feature → writing-plan → implement → quality-gate → archive
```

## 常用场景速查

### 开发中途需求变了

```
/openflow-change user profile page "把头像改成方形裁剪"
```

在不丢失已有工作的情况下调整方向。详见[中途改需求](/guide/mid-development-change)。

### 查看当前状态

```
/openflow-status
```

查看所有活跃特性会话的状态。

### 查看或更新配置

```
/openflow-config
```

### 迁移已有文档

如果你之前用其他工具管理文档，可以运行：

```text
/openflow-migrate-docs
```

把已有文档迁移到 OpenFlow 结构。

## 下一步

- [配置 OpenFlow](./configuration) —— 根据项目需求调整配置（大多数项目不需要）
- [核心概念](/introduction/concepts) —— 深入理解行为文档约束和漂移检测
- [命令参考](/reference/commands) —— 所有命令和 Skill 的完整参考
- [Feature 工作流详解](/guide/feature-workflow) —— 理解每个阶段的内部机制
