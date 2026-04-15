# OpenFlow

[English](./README.md)

---

## 概述

OpenFlow 是一个 OpenCode 插件，提供从需求到归档的完整开发工作流增强。它将 oh-my-openagent、Superpowers 和 OpenSpec 的最佳实践整合为统一的工作流。

## 功能特性

| 阶段 | 功能 | 描述 |
|------|------|------|
| 1. 头脑风暴 | 显式入口 | 检测新需求并引导用户主动运行 `/openflow/brainstorm`，作为新功能设计的起点 |
| 1. 头脑风暴 | 工作区文档 | 将设计文档写入 `docs/changes/{feature}/`，并默认以 `design.md` 作为主入口 |
| 2. 计划增强 | TDD 提示 | 为计划添加 TDD（红-绿-重构）指导 |
| 2. 计划增强 | 验证任务 | 自动生成安全和质量检查清单 |
| 2. 实现上下文 | 轻量注入 | 为宿主执行注入计划、设计、需求上下文，但不接管执行运行时 |
| 3. 验收阶段 | 触发词识别 | 自动识别"调整"、"改一下"等验收触发词 |
| 3. 验收阶段 | 文档同步提示 | 代码变更后询问是否同步更新设计/需求文档 |
| 3. 验收阶段 | 漂移留痕 | 记录 acceptance 阶段的变更和 drift 信息，供归档使用 |
| 3. 验收阶段 | 人工验收指引 | 目标能力已明确，但 GSD 风格的分步人工验收步骤尚未完整实现 |
| 4. 归档 | 实现映射归档 | 生成 `implementation-mapper.md` 并冻结设计/需求/计划快照 |

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

- `docs/current/design/openflow/20260322-architecture.md` - 当前系统架构、模块边界、运行流与迁移态说明
- `docs/current/design/openflow/20260322-design.md` - 当前技术设计、hooks 职责、archive 行为与设计债务

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

### 3. 验收与人工验证（部分实现）

当前 acceptance 相关能力已经实现了：

- 验收阶段触发词识别
- acceptance state 持久化
- 验收阶段代码变更记录
- 文档同步提示
- drift 信息进入 archive 输入

但下面这项能力**还没有完整落地**：

- 像 get-shit-done 那样，由 AI 基于 requirements / design / 当前实现生成“人工可执行的验收标准与验收步骤”，再由人逐步测试并反馈结果

也就是说，当前状态是：

- 验证要求注入（verify）已实现
- `acceptance state + drift tracking` 已部分实现
- `GSD 风格人工验收步骤生成` 尚未完整实现

### 4. 归档（手动）

当功能完成时：

```
/openflow/archive user-login
```

这将创建归档快照；在推荐工作流里，`current` 只应在 archive 阶段基于已完成的 `changes` 做正式提升：
```
docs/archive/user-login/
├── implementation-mapper.md
├── design/             # 设计文档（复制）
├── requirements/       # 需求文档（复制）
└── plans/              # 执行计划（复制）
```

## 可用 Skills

| Skill | 触发条件 | 用途 |
|-------|----------|------|
| `openflow/brainstorm` | 新功能 | 澄清需求，在 `changes` 工作区产出设计文档，默认以 `design.md` 为主入口 |
| `openflow/verify` | 完成声明前 | 展示或执行验证步骤，作为非阻塞的代码级验证入口 |
| `openflow/archive` | 功能完成 | 冻结变更工作区产物，并在归档时处理 `changes -> current` 的正式提升 |

## 命令

| 命令 | 描述 |
|------|------|
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
- 开发阶段以 `docs/changes/{feature}/` 为准，完成态以 `docs/current/` 为准

推荐的当前闭环是：

1. `/openflow/brainstorm <feature>`
2. 在 `docs/changes/{feature}/` 中推进设计与实现
3. `openflow/verify`（验证 skill）
4. 人工进行 acceptance 测试
5. `/openflow/archive <feature>`

其中第 4 步目前主要依赖人工自行测试；系统虽然已经能识别 acceptance 阶段并留痕，但还没有完整生成人工验收步骤清单。

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
   └── 生成 docs/changes/user-login/ 下的工作文档，默认主入口为 design/YYYYMMDD-design.md
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
7. 宿主根据 OpenFlow 注入的验证要求完成代码级验证（tests / build / typecheck / security checks）
   │
   ▼
8. 人工进行 acceptance 测试
   └── 当前由人自行测试；系统能识别 acceptance 阶段并记录后续漂移
   │
   ▼
9. 用户: `/openflow/archive user-login`
    │
    ▼
10. 生成 implementation-mapper、冻结 changes 快照，并在需要时将完成态内容提升到 current
```

当前项目级架构与设计说明请查看 `docs/current/design/openflow/`。

## 许可证

MIT
