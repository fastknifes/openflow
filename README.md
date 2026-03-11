# OpenFlow

[English](#english) | [中文](#中文)

---

<a name="english"></a>

## English

### Overview

OpenFlow is an OpenCode plugin that enhances the development workflow from requirements to archiving. It integrates best practices from oh-my-openagent, Superpowers, and OpenSpec into a unified workflow.

### Features

| Phase | Feature | Description |
|-------|---------|-------------|
| 1. Brainstorming | Auto Detection | Detects new feature requirements and suggests brainstorming |
| 2. Plan Enhancement | TDD Hints | Adds TDD (Red-Green-Refactor) guidance to plans |
| 2. Plan Enhancement | Verification Tasks | Auto-generates security and quality checklists |
| 3. Archive | SRS Generation | Creates Software Requirements Specification with code mapping |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenCode IDE                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │ oh-my-openagent │  │         OpenFlow Plugin         │  │
│  │    (Built-in)   │  │                                 │  │
│  │                 │  │  ┌─────────┐ ┌─────────┐        │  │
│  │  - Prometheus   │  │  │Brainstorm│ │  TDD    │        │  │
│  │  - Sisyphus     │  │  │  Hook   │ │Enhancer │        │  │
│  │  - Explore      │  │  └─────────┘ └─────────┘        │  │
│  │  - Librarian    │  │  ┌─────────────────────────┐   │  │
│  │                 │  │  │     Archive Skill        │   │  │
│  └─────────────────┘  │  └─────────────────────────┘   │  │
│                        └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Installation

#### Step 1: Install the package

```bash
npm install @fastknife/openflow
```

#### Step 2: Configure opencode.json

Create or update `opencode.json` in your project root:

```json
{
  "plugins": ["@fastknife/openflow"],
  "openflow": {
    "brainstorming": {
      "enabled": true,
      "output_dir": "docs/design",
      "auto_trigger": true
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

#### Step 3: Restart OpenCode

After configuration, restart OpenCode or reload the configuration. The plugin will:
- Auto-register skills to `.opencode/skills/openflow/`
- Enable hooks for brainstorming detection and plan enhancement

### Configuration Options

Add to your `opencode.json`:

```json
{
  "plugins": ["@fastknife/openflow"],
  "openflow": {
    "brainstorming": {
      "enabled": true,
      "output_dir": "docs/design",
      "auto_trigger": true
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

### Usage

#### 1. Brainstorming (Automatic)

When you mention a new feature, OpenFlow suggests running the brainstorming skill:

```
User: "Implement user login feature"
→ OpenFlow: Consider running openflow-brainstorm skill
```

#### 2. Plan Enhancement (Automatic)

When Prometheus generates a plan, OpenFlow automatically:
- Adds TDD guidance for implementation tasks
- Appends verification checklist

#### 3. Archive (Manual)

When a feature is complete:

```
skill(name="openflow-archive", feature="user-login")
```

This creates:
```
docs/archive/user-login/
├── srs/
│   └── srs.md          # Software Requirements Specification
├── design/             # Design documents (copied)
└── plan/               # Execution plan (copied)
```

### Available Skills

| Skill | Trigger | Purpose |
|-------|---------|---------|
| `openflow-brainstorm` | New feature | Clarify requirements, generate design docs |
| `openflow-verify` | Before archive | Run security and quality checks |
| `openflow-archive` | Feature complete | Generate SRS and archive artifacts |

### Commands

| Command | Description |
|---------|-------------|
| `openflow archive <feature>` | Archive a completed feature |
| `openflow status` | Show plugin status |
| `openflow config` | Display current configuration |

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@opencode-ai/plugin` | latest | OpenCode plugin API |
| `typescript` | ^5.9.3 | TypeScript compiler |
| `zod` | (peer) | Schema validation |

### Requirements

- Node.js >= 18.0.0
- OpenCode with oh-my-openagent

### Project Structure

```
openflow/
├── src/
│   ├── index.ts           # Plugin entry point
│   ├── config.ts          # Configuration loader
│   ├── types.ts           # Type definitions
│   ├── skills/            # Skill definitions
│   │   └── index.ts
│   └── utils/             # Utilities
│       ├── security.ts    # Path validation, input sanitization
│       ├── session.ts     # Session API integration
│       ├── errors.ts      # Error handling
│       └── logger.ts      # Logging
├── dist/                  # Compiled output
├── docs/
│   └── srs/               # SRS documentation
└── package.json
```

### License

MIT

---

<a name="中文"></a>

## 中文

### 概述

OpenFlow 是一个 OpenCode 插件，提供从需求到归档的完整开发工作流增强。它将 oh-my-openagent、Superpowers 和 OpenSpec 的最佳实践整合为统一的工作流。

### 功能特性

| 阶段 | 功能 | 描述 |
|------|------|------|
| 1. 头脑风暴 | 自动检测 | 检测新需求并建议运行头脑风暴 |
| 2. 计划增强 | TDD 提示 | 为计划添加 TDD（红-绿-重构）指导 |
| 2. 计划增强 | 验证任务 | 自动生成安全和质量检查清单 |
| 3. 归档 | SRS 生成 | 创建包含代码映射的软件需求规格文档 |

### 架构

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

### 安装

#### 步骤 1：安装插件

```bash
npm install @fastknife/openflow
```

#### 步骤 2：配置 opencode.json

在项目根目录的 `opencode.json` 中添加：

```json
{
  "plugins": ["@fastknife/openflow"],
  "openflow": {
    "brainstorming": {
      "enabled": true,
      "output_dir": "docs/design",
      "auto_trigger": true
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

#### 步骤 3：重启 OpenCode

配置完成后，重启 OpenCode 或重新加载配置。插件会：
- 自动注册 skills 到 `.opencode/skills/openflow/`
- 启用头脑风暴检测和计划增强 hooks

### 配置选项

#### 1. 头脑风暴（自动）

当你提到新功能时，OpenFlow 会建议运行头脑风暴 skill：

```
用户: "实现用户登录功能"
→ OpenFlow: 建议运行 openflow-brainstorm skill
```

#### 2. 计划增强（自动）

当 Prometheus 生成计划后，OpenFlow 自动：
- 为实现任务添加 TDD 指导
- 追加验证检查清单

#### 3. 归档（手动）

当功能完成时：

```
skill(name="openflow-archive", feature="user-login")
```

这将创建：
```
docs/archive/user-login/
├── srs/
│   └── srs.md          # 软件需求规格文档
├── design/             # 设计文档（复制）
└── plan/               # 执行计划（复制）
```

### 可用 Skills

| Skill | 触发条件 | 用途 |
|-------|----------|------|
| `openflow-brainstorm` | 新功能 | 澄清需求，生成设计文档 |
| `openflow-verify` | 归档前 | 运行安全和质量检查 |
| `openflow-archive` | 功能完成 | 生成 SRS 并归档产物 |

### 命令

| 命令 | 描述 |
|------|------|
| `openflow archive <feature>` | 归档已完成的功能 |
| `openflow status` | 显示插件状态 |
| `openflow config` | 显示当前配置 |

### 依赖

| 包 | 版本 | 用途 |
|---|------|------|
| `@opencode-ai/plugin` | latest | OpenCode 插件 API |
| `typescript` | ^5.9.3 | TypeScript 编译器 |
| `zod` | (peer) | Schema 验证 |

### 环境要求

- Node.js >= 18.0.0
- OpenCode 及 oh-my-openagent

### 项目结构

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
│   └── srs/               # SRS 文档
└── package.json
```

### 工作流程

```
1. 用户: "实现用户登录功能"
   │
   ▼
2. [自动] 头脑风暴 Hook 检测
   └── 建议运行 openflow-brainstorm skill
   │
   ▼
3. 用户: skill(name="openflow-brainstorm")
   └── 生成 docs/design/user-login/
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
6. 用户: /start-work user-login
   │
   ▼
7. Sisyphus 执行计划
   │
   ▼
8. 用户: skill(name="openflow-archive", feature="user-login")
   │
   ▼
9. 生成 SRS 并归档
```

### 许可证

MIT

---

**文档版本**: 1.0  
**更新日期**: 2026-03-11
