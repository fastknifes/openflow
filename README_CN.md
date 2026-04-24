# OpenFlow

[English](./README.md)

---

## 概述

OpenFlow 是一个 OpenCode 插件，提供从需求到归档的完整开发工作流增强。它将 oh-my-openagent、Superpowers 和 OpenSpec 的最佳实践整合为统一的工作流。

## 功能特性

| 阶段 | 功能 | 描述 |
|------|------|------|
| 1. 头脑风暴 | 显式入口 | 检测新需求并引导用户主动运行 `/openflow/brainstorm`，作为新功能设计的起点 |
| 1. 头脑风暴 | 工作区文档 | 将文档写入形如 `docs/changes/2026-04-17-feature-name/` 的日期化工作区，并默认以 `design.md` 作为主入口 |
| 2. 计划增强 | TDD 提示 | 为计划添加 TDD（红-绿-重构）指导 |
| 2. 实现上下文 | 轻量注入 | 为宿主执行注入计划、设计、需求上下文，但不接管执行运行时 |
| 3. Verify | Evidence | 生成检查结果、行为观察、intent vs actual delta、文档对齐、冲突与缺失证据 |
| 3. Verify | Readiness | 输出 `ready`、`ready_with_doc_updates`、`not_ready` 或 `needs_decision` |
| 4. 归档 | 最终权威 | 执行 canonicalization、current promotion 与历史冻结 |
| 4. 归档 | 实现映射归档 | 生成 `implementation-mapper.md` 并冻结扁平工作区文档快照 |

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenCode IDE                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │ oh-my-openagent │  │         OpenFlow Plugin         │  │
│  │     (内置)       │  │                                 │  │
│  │                 │  │  ┌─────────┐ ┌─────────┐        │  │
│  │  - Prometheus   │  │  │头脑风暴 │ │  TDD    │        │  │
│  │  - Sisyphus     │  │  │  Hook   │ │增强器   │        │  │
│  │  - Explore      │  │  └─────────┘ └─────────┘        │  │
│  │  - Librarian    │  │  ┌─────────────────────────┐   │  │
│  │                 │  │  │     归档 Skill           │   │  │
│  └─────────────────┘  │  └─────────────────────────┘   │  │
│                        └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 参考文档

当前实现对应的架构与设计文档位于：

- `docs/changes/openflow-init/design.md` - 当前系统设计
- `docs/archive/openflow-init/implementation-mapper.md` - 实现映射与追溯主文档

这两份文档比 `docs/` 下较早期的 proposal 更接近当前真实代码实现。

## 安装

### 步骤 1：安装插件

```bash
npm install @fastknife/openflow
```

### 步骤 2：配置 opencode.json

在项目根目录的 `opencode.json` 中添加：

```json
{
  "plugins": ["@fastknife/openflow"],
  "openflow": {
    "brainstorming": {
      "enabled": true,
      "output_dir": "docs/changes",
      "auto_trigger": true,
      "generate_prd": true,
      "prd_output_dir": "docs/changes"
    },
    "tdd": {
      "enabled": true,
      "expand_threshold": 3
    },
    "verification": {
      "in_plan": true,
      "security": ["secret", "vuln"],
      "quality": ["lint", "typecheck", "test"],
      "auto_fix": false
    },
    "archive": {
      "enabled": true,
      "output_dir": "docs/archive"
    }
  }
}
```

### 步骤 3：重启 OpenCode

配置完成后，重启 OpenCode 或重新加载配置。插件会：
- 暴露 `/openflow/brainstorm` 显式命令
- 启用头脑风暴检测和计划增强 hooks

## 配置选项

### 1. 头脑风暴（自动）

对于新功能，推荐用户直接主动输入 brainstorm 命令，而不是等系统提醒：

```text
/openflow/brainstorm <feature-name>
```

当你只是自然语言提到新功能时，OpenFlow 也会补充提醒：

```
用户: "实现用户登录功能"
→ OpenFlow: 建议运行 /openflow/brainstorm user-login
```

这是软提示，不是硬门禁。即使你暂时不运行 brainstorm，研究、阅读和实现类工具也不会被 OpenFlow 拦截。

但推荐的使用习惯仍然是：只要你已经确认要开始一个新功能，就先主动输入 brainstorm 命令，再进入设计和实现。

### 2. 计划增强（自动）

当 Prometheus 生成计划后，OpenFlow 自动：
- 为实现任务添加 TDD 指导
- 追加验证检查清单

这里的“验证”主要指代码完成前的 evidence gate，例如：

- tests
- build
- typecheck
- 安全检查

它对应的是 OpenFlow 的内部验证要求注入，不是人工验收本身。

### 3. Verify：Evidence + Readiness

`/openflow/verify <feature>` 是归档前的单一 readiness 入口。它不负责让变更成为 canonical truth，也不直接提升 `current`；它只建立“是否具备进入 Archive closure 的条件”。

Verify 内部分为两个阶段：

#### Evidence 阶段

生成 evidence packet，至少包含：

- checks run / result
- observed behavior summary
- intent vs actual delta
- doc alignment summary
- `current` / `decisions` conflict summary
- known risks / missing evidence

其中 checks 可以包含 tests、build、typecheck、安全扫描等。

#### Readiness 阶段

输出四种 readiness 状态之一：

- `ready`：证据充分，可以进入 Archive
- `ready_with_doc_updates`：核心语义已具备 closure 条件，但 Archive 前必须确认并处理文档更新
- `not_ready`：证据不足或约束未满足
- `needs_decision`：涉及 rule 级、`current` 级冲突，或需要显式业务裁决

> **原则**：Verify 建立 readiness，Archive 赋予 canonical status。

### 4. 归档（手动）

当功能完成时：

```
/openflow/archive user-login
```

Archive 是 closure 流程中的最终 authority。它读取 Verify 的 readiness 结果，执行 canonicalization、current promotion 与历史冻结。

只有以下 readiness 状态可以进入 Archive：

- `ready`
- `ready_with_doc_updates`

以下状态不能进入 Archive，必须先解决：

- `not_ready`
- `needs_decision`

归档将创建归档快照；在推荐工作流里，`current` 只应在 archive 阶段基于已完成的 `changes` 做正式提升：
```
docs/archive/2026-04-17-user-login/
├── implementation-mapper.md          # 强制生成：实现映射与追溯主文档
├── design.md                          # 条件复制：源文件存在时复制
├── proposal.md                        # 条件复制：源文件存在时复制
├── decisions.md                       # 条件复制：源文件存在时复制
├── prd.md                             # 条件复制：源文件存在时复制
└── plan.md                            # 条件复制：源文件存在时复制
```

**按需工作区文件**：`proposal.md`、`decisions.md`、`prd.md`、`plan.md` 仅在源文件存在时才写入或复制；历史嵌套文件保持兼容读取，不强制迁移。

## 可用 Skills

| Skill | 触发条件 | 用途 |
|-------|----------|------|
| `openflow/brainstorm` | 新功能 | 澄清需求，在 `changes` 工作区产出设计文档，默认以 `design.md` 为主入口 |
| `openflow/verify` | 归档前 | 执行 Evidence + Readiness，两阶段判断是否具备进入 Archive 的条件 |
| `openflow/archive` | 功能完成 | 作为最终 authority 执行 canonicalization、`changes -> current` 提升与历史冻结 |

## 命令

| 命令 | 描述 |
|------|------|
| `/openflow/verify <feature>` | 生成 Evidence packet 并输出 Readiness 状态 |
| `/openflow/archive <feature>` | 归档已完成的功能 |
| `/openflow/status` | 显示插件状态 |
| `/openflow/config` | 显示当前配置 |

## 推荐用法

对于明确要进入设计阶段的新功能，建议用户把下面这条命令当作固定起手式：

```text
/openflow/brainstorm <feature-name>
```

OpenFlow 会在检测到新需求时提醒这条命令，但不会强制锁住后续工具。

也就是说：

- OpenFlow 负责提醒
- 用户负责主动执行 brainstorm 命令
- brainstorm 是新功能设计阶段的显式入口
- 开发阶段优先查看 `docs/changes/{YYYY-MM-DD-feature}/`；跨 feature 的当前规则与规格事实看 `docs/current/`，已完成 feature 的交付快照看对应 `docs/archive/{YYYY-MM-DD-feature}/`

推荐的当前闭环是：

1. `/openflow/brainstorm <feature>`
2. 在 `docs/changes/{YYYY-MM-DD-feature}/` 中推进设计与实现
3. `/openflow/verify <feature>`
   - Evidence：收集检查结果、行为观察、delta、文档对齐与冲突信息
   - Readiness：输出 `ready` / `ready_with_doc_updates` / `not_ready` / `needs_decision`
4. 当 readiness 为 `ready` 或 `ready_with_doc_updates` 时，执行 `/openflow/archive <feature>`
5. Archive 完成 canonicalization、current promotion 与历史冻结

其中 `Verify` 只建立 readiness，不写入 `current`；`Archive` 才是最终 authority。

## 依赖

| 包 | 版本 | 用途 |
|---|------|------|
| `@opencode-ai/plugin` | latest | OpenCode 插件 API |
| `typescript` | ^5.9.3 | TypeScript 编译器 |
| `zod` | (peer) | Schema 验证 |

## 环境要求

- Node.js >= 18.0.0
- OpenCode 及 oh-my-openagent

## 项目结构

```
openflow/
├── src/
│   ├── index.ts           # 插件入口
│   ├── config.ts          # 配置加载器
│   ├── types.ts           # 类型定义
│   ├── skills/            # Skill 定义
│   │   └── index.ts
│   └── utils/             # 工具函数
│       ├── security.ts    # 路径验证、输入清理
│       ├── session.ts     # Session API 集成
│       ├── errors.ts      # 错误处理
│       └── logger.ts      # 日志系统
├── dist/                  # 编译输出
├── docs/
│   ├── current/           # 当前事实文档
│   ├── changes/           # 变更工作区
│   └── archive/           # 归档冻结结果
└── package.json
```

## 工作流程

```
1. 用户准备开始一个新功能
   │
   ▼
2. 用户主动输入 `/openflow/brainstorm user-login`
    └── 生成 docs/changes/2026-04-17-user-login/ 下的工作文档，默认主入口为 design.md
   │
   ▼
3. [补充路径] 如果用户先用自然语言提出需求
   └── OpenFlow 会提醒这条 brainstorm 命令
   │
   ▼
4. [自动] Prometheus 生成计划
   │
   ▼
5. [自动] 计划增强 Hook
    ├── 添加 TDD 提示
    └── 添加验证任务
    │
    ▼
6. 宿主执行系统读取最新 plan / design / requirements 并执行
    │
    ▼
7. 用户运行 `/openflow/verify user-login`
   ├── Evidence：收集 tests / build / typecheck / security checks、行为观察、delta 与冲突信息
   └── Readiness：输出 ready / ready_with_doc_updates / not_ready / needs_decision
    │
    ▼
8. 若 readiness 为 ready 或 ready_with_doc_updates，进入 Archive
    │
    ▼
9. 用户: `/openflow/archive user-login`
     │
     ▼
10. Archive 执行 canonicalization、生成 implementation-mapper、提升 current，并冻结 changes 快照
```

当前项目级架构与设计说明请查看 `docs/changes/2026-04-15-openflow-init/design.md` 与 `docs/archive/2026-04-15-openflow-init/implementation-mapper.md`。

## 许可证

MIT
