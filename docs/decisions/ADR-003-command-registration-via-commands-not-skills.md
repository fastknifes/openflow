# OpenFlow 命令注册：使用 Command 文件替代 Skill 注册

**日期**: 2026-05-08
**状态**: Accepted
**适用范围**: OpenFlow 命令的默认注册方式、`openflow-writing-plan` 例外、`chat.message` hook 拦截机制、`src/command-registration.ts`、`src/skills/registration.ts`

## 1. 背景

OpenFlow 当前通过两种方式注册命令：

1. **Plugin Tool**（`src/index.ts` 中的 `tool()` API）：注册 `openflow-brainstorm`、`openflow-verify`、`openflow-archive` 等可执行工具
2. **Skill 注册**（`src/skills/registration.ts` 中的 `registerSkills()`）：将 SKILL.md 写入 `~/.config/opencode/skills/` 目录

### 1.1 Skill 注册的副作用

OpenCode 的 `command/index.ts`（line 147-158）会自动将 Skill 提升为 Command：

```typescript
for (const item of yield* skill.all()) {
  if (commands[item.name]) continue
  commands[item.name] = {
    name: item.name,
    source: "skill",
    // ...
  }
}
```

同时 Skill 会出现在系统提示的 `<available_skills>` 块中（`skill/index.ts` line 264-278），导致 AI Agent 可基于关键词自动调用 Skill。

### 1.2 用户反馈的问题

- `openflow-brainstorm` 在检测到 "brainstorm" 关键词时被自动调用
- `openflow-verify` 在验证/完成语境下被自动调用
- 用户期望：交互式/治理类命令仅在用户手动输入 `/openflow-xxx` 时触发，AI 不应自动调用
- 例外：`openflow-writing-plan` 的职责是为 agent 准备计划编写上下文并指导写入 `.sisyphus/plans/{feature}.md`，需要允许 AI Agent 主动调用

## 2. 技术分析

### 2.1 OpenCode 的命令系统

OpenCode 支持三种命令来源（`command/index.ts`）：

| 来源 | 注册方式 | 出现在 `/` 弹出菜单 | 出现在 `<available_skills>` | AI 可自动调用 |
|------|----------|:---:|:---:|:---:|
| `source: "command"` | `{command,commands}/**/*.md` 配置文件 | ✅ | ❌ | ❌ |
| `source: "skill"` | `{skill,skills}/**/SKILL.md` Skill 文件 | ✅ | ✅ | ✅ |
| `source: "mcp"` | MCP Prompt | ✅ | ❌ | ❌ |

`source: "command"` 的命令以纯模板形式加载，不进入 `<available_skills>`，因此 AI 无法基于关键词自动触发。

### 2.2 `command-registration.ts` 的现状

当前 `src/command-registration.ts` 仅有清理函数，无注册函数：

- `unregisterCommands()` — 删除旧 `brainstorm.md`
- `cleanupLegacyCommandArtifacts()` — 同上
- `successfulRegistrations` Set 和 `registrationInFlight` Map — 定义但从未用于注册

该文件可以确认曾经计划支持命令注册，但从未完整实现。

### 2.3 OMO 的 command 加载链路（补充参考）

OMO 在 `command-config-handler.ts` 中将多种来源合并为 `config.command`，其包含：

- `~/.config/opencode/commands/*.md`（全局 OpenCode 命令）
- `.opencode/commands/*.md`（项目级 OpenCode 命令）
- `.claude/commands/*.md`（Claude Code 兼容命令）

OMO 的 `auto-slash-command/hook.ts` 通过 `chat.message` hook 拦截 `/command` 输入，解析模板并注入上下文。这为 OpenFlow 的实现提供了参考模式。

## 3. 决策

**OpenFlow 命令默认从 Skill 注册改为 Command 文件注册，配合 `chat.message` hook 拦截实现执行；`openflow-writing-plan` 作为可被 Agent 调用的计划编写入口，保留 Skill 注册。**

### 3.1 注册方式变更

| 组件 | 变更前 | 变更后 |
|------|--------|--------|
| Tool 注册（`tool()` API） | ✅ 保留 | ✅ 保留 |
| Skill 注册（`registerSkills()`） | ✅ 写入 SKILL.md | ⚠️ 仅注册 `openflow/writing-plan`，其他 OpenFlow 命令不注册为 Skill |
| Command 注册 | ❌ 仅清理旧文件 | ✅ 新增 `registerCommands()`，写入 `.opencode/commands/*.md`，但不写入 `openflow-writing-plan.md` |
| `chat.message` hook | ❌ 无拦截 | ✅ 新增：检测 `/openflow-*` 模式，调用对应 tool handler |

### 3.2 实现架构

```
用户输入 /openflow-brainstorm <feature>
  → chat.message hook 拦截
    → 解析命令名和参数
    → 调用 handleBrainstorm(ctx, feature)
    → 返回结果
```

同时，`.opencode/commands/openflow-brainstorm.md` 文件提供命令元数据（描述、参数提示），确保该命令出现在 `/` 弹出菜单中。

### 3.3 命令文件格式

每个 OpenFlow 命令在 `.opencode/commands/` 下生成一个 `.md` 文件：

```markdown
---
description: "OpenFlow brainstorm for design clarification"
---

## Command Instructions

Start the OpenFlow brainstorm workflow for the specified feature.
Use the `openflow-brainstorm` tool to begin.
```

前端 YAML 的 `description` 字段驱动 `/` 弹出菜单中的命令描述。

### 3.4 覆盖的命令与例外

除 `openflow-writing-plan` 外，现有 OpenFlow 命令均适用 Command 文件注册：

| 命令 | Command 文件 | Handler |
|------|-------------|---------|
| `openflow-brainstorm` | `brainstorm.md` | `handleBrainstorm` |
| `openflow-verify` | `verify.md` | `handleVerify` |
| `openflow-archive` | `archive.md` | `handleArchive` |
| `openflow-init` | `init.md` | `handleInit` |
| `openflow-status` | `status.md` | `handleStatus` |
| `openflow-config` | `config.md` | `handleConfig` |
| `openflow-migrate-docs` | `migrate-docs.md` | `handleMigrateDocs` |

`openflow-writing-plan` 不写入 Command 文件，而是注册为 `openflow/writing-plan` Skill。该 Skill 会出现在 `<available_skills>` 中，使 agent 可以在需要生成开发计划时主动调用内部 `openflow-writing-plan` tool，读取计划上下文后写入 `.sisyphus/plans/{feature}.md`。

## 4. 理由

1. **防止 AI 自动触发治理类命令**：Command 文件（`source: "command"`）不进入 `<available_skills>`，AI 无法基于关键词或语义自动触发 brainstorm/verify/archive 等交互式命令
2. **保留用户手动调用**：Command 文件出现在 `/` 弹出菜单，用户可手动输入 `/openflow-xxx` 触发
3. **保留可执行逻辑**：`tool()` 注册仍然存在，`chat.message` hook 拦截后可直接调用 handler，不依赖 AI 中间层
4. **兼容现有工具链**：不需要修改 OpenCode 或 OMO 源码，完全通过插件 hook 实现
5. **保留计划编写自动化**：`openflow-writing-plan` 是 agent 工作流入口，不是用户交互式治理命令；作为 Skill 注册能让 agent 按需生成计划
6. **清理死代码**：`command-registration.ts` 中的 `successfulRegistrations` 和 `registrationInFlight` 死状态可一并清理

## 5. 影响范围

### 5.1 需修改的文件

| 文件 | 变更 |
|------|------|
| `src/command-registration.ts` | 新增 `registerCommands(ctx)`，写入 `.opencode/commands/*.md`；排除 `openflow-writing-plan`；清理死状态 |
| `src/index.ts` | 调用 `registerCommands()`；仅为 `openflow-writing-plan` 调用 `registerSkills()`；新增 `chat.message` hook 拦截逻辑 |
| `src/hooks/chat-message.ts` | 新增 `/openflow-*` 模式检测和 handler 分发逻辑 |
| `src/skills/registry.ts` | 仅暴露 `openflow/writing-plan` Skill，避免其他命令进入 `<available_skills>` |
| `tests/skills/registration.test.ts` | 更新为测试仅注册 `openflow/writing-plan` Skill |
| `tests/index-runtime-registration.test.ts` | 更新为测试 Command 注册路径与 writing-plan Skill 例外 |

### 5.2 不受影响的部分

- `tool()` 注册（`src/index.ts` line 52-168）— 保持不变
- 各命令 handler（`src/commands/*.ts`）— 保持不变
- OpenFlow 命令的命名约定（ADR-002）— 保持不变
- 配置系统（`src/config.ts`）— 保持不变

### 5.3 风险评估

**风险等级：LOW**

- 变更仅涉及 OpenFlow 插件内部的注册方式，不改变命令执行逻辑
- 不修改 OpenCode 或 OMO 源码
- 非 writing-plan 的 Skill 文件移除后，已生成的 SKILL.md 缓存文件会在下次插件加载时被清理
- 回退简单：将目标命令重新加入 `COMMANDS` 或 `src/skills/registry.ts` 即可

## 6. 执行

### 6.1 实现顺序

1. 重写 `command-registration.ts`：
   - 移除 `successfulRegistrations` 和 `registrationInFlight` 死状态
   - 新增 `registerCommands(ctx)` 函数
   - 新增命令 `.md` 模板常量和生成逻辑
   - 保留 `cleanupLegacyCommandArtifacts()` 以清理旧的 `brainstorm.md`
2. 修改 `src/index.ts`：
   - 将 `registerSkills(openflowCtx)` 替换为 `registerCommands(openflowCtx)`
   - 在 `chat.message` hook 中新增 `/openflow-*` 拦截逻辑
3. 修改 `src/hooks/chat-message.ts`：
   - 新增 `/openflow-*` 模式匹配
   - 新增命令描述信息提示（列表当前可用命令）
4. 更新测试：
   - `registration.test.ts` — 验证 Command 文件写入 `.opencode/commands/` 路径
   - `index-runtime-registration.test.ts` — 验证 plugin 初始化调用 `registerCommands()`
   - 新增 `chat-message-slash-command.test.ts` — 验证 `/openflow-*` 拦截逻辑
5. 清理全局 Skill 缓存：
   - 用户手动删除 `~/.config/opencode/skills/openflow-*/` 目录
   - 或由插件在下次加载时自动清理（可在 `registerCommands()` 中添加清理逻辑）

### 6.2 验收标准

- [ ] 所有 `/openflow-*` 命令出现在 OpenCode 的 `/` 弹出菜单
- [ ] AI 不再自动调用 `openflow-brainstorm`、`openflow-verify` 等命令
- [ ] 用户手动输入 `/openflow-brainstorm <feature>` 后正确执行对应 handler
- [ ] 所有现有测试通过
- [ ] 新增测试覆盖 `/` 拦截和 Command 写入路径

## 7. 不适用范围

- 不改变 OpenCode 全局框架行为
- 不影响其他插件的 Skill 注册
- 不移除 OpenFlow 的 `tool()` API 注册（工具仍然是可执行入口）
- 不适用于 GitNexus 的 skill 注册（GitNexus 按 AGENTS.md 约定使用 skill 是合理设计）

## 8. 参考

- ADR-002：OpenFlow 命令命名约定（中划线分隔符）
- OpenCode `config/command.ts`：命令文件加载逻辑
- OpenCode `command/index.ts`：统一命令注册表（Skill 自动提升为 Command）
- OpenCode `skill/index.ts`：Skill 发现与 `<available_skills>` 生成
- OMO `command-config-handler.ts`：多种命令来源合并逻辑
- OMO `auto-slash-command/hook.ts`：`chat.message` 拦截模式参考
