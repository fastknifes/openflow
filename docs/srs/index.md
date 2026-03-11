# OpenFlow - DevFlow OpenCode 插件

## SRS: Software Requirements Specification

---

## 1. 项目概述

### 1.1 项目名称

**OpenFlow** - 基于 oh-my-openagent 的开发工作流增强插件

### 1.2 项目类型

OpenCode 插件（独立项目，不修改 oh-my-openagent 源码）

### 1.3 核心目标

将 oh-my-openagent、Superpowers、OpenSpec 的最佳实践整合为一个独立的开发工作流插件，提供从需求到归档的完整流程支持。

### 1.4 目标用户

- 使用 oh-my-openagent 进行开发的团队
- 追求规范化开发流程的开发者
- 希望建立功能-代码映射知识库的团队

---

## 2. 架构设计

### 2.1 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenCode IDE                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │ oh-my-openagent │  │         OpenFlow Plugin         │  │
│  │    (内置)        │  │                                 │  │
│  │                 │  │  ┌─────────┐ ┌─────────┐        │  │
│  │  - Prometheus   │  │  │Brainstorm│ │  TDD    │        │  │
│  │  - Sisyphus     │  │  │  Hook   │ │Enhancer │        │  │
│  │  - Explore      │  │  └─────────┘ └─────────┘        │  │
│  │  - Librarian    │  │  ┌─────────┐ ┌─────────┐        │  │
│  │                 │  │  │Verify   │ │ Archive │        │  │
│  │                 │  │  │Task     │ │ Skill  │        │  │
│  └─────────────────┘  │  └─────────┘ └─────────┘        │  │
│                        └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 插件架构

```
openflow/
├── src/
│   ├── index.ts                 # 插件入口
│   ├── config.ts               # 配置管理
│   │
│   ├── hooks/                  # OpenCode Hooks
│   │   ├── chat-message.ts     # 消息拦截
│   │   └── tool-after.ts       # 工具执行后拦截
│   │
│   ├── phases/                 # 工作流阶段
│   │   ├── brainstorm/         # 头脑风暴阶段
│   │   │   ├── hook.ts
│   │   │   ├── skill.ts
│   │   │   └── templates/
│   │   │       ├── proposal.md
│   │   │       ├── design.md
│   │   │       └── decisions.md
│   │   │
│   │   ├── plan-enhancer/      # 计划增强
│   │   │   ├── index.ts
│   │   │   ├── tdd-expander.ts
│   │   │   └── verification-adder.ts
│   │   │
│   │   └── verify/            # 验证阶段
│   │       └── task.ts
│   │
│   ├── skills/                 # 自定义 Skills
│   │   ├── archive.ts         # 归档 Skill
│   │   └── index.ts
│   │
│   └── utils/                  # 工具函数
│       ├── file-tracker.ts    # 文件变更跟踪
│       ├── srs-generator.ts   # SRS 生成器
│       └── code-mapper.ts     # 代码映射分析
│
├── templates/                  # 模板文件
│   ├── srs/
│   │   ├── index.md
│   │   ├── requirements.md
│   │   ├── code-mapping.md
│   │   └── test-mapping.md
│   └── skills/
│       └── brainstorm.md
│
└── package.json
```

---

## 3. 功能需求

### 3.1 阶段一：头脑风暴 (Brainstorming)

#### 3.1.1 功能描述

在 oh-my-openagent 的计划之前，自动触发头脑 Prometheus 生成风暴，生成设计文档。

#### 3.1.2 触发条件

- 用户输入新需求（首次提到的功能）
- 不存在现有的执行计划

#### 3.1.3 流程

1. 检测到新需求
2. 调用 Brainstorming Skill
3. 澄清需求（一次一个问题）
4. 提出 2-3 种方案
5. 生成设计文档

#### 3.1.4 输出

```
docs/design/{feature}/
├── proposal.md      # 提案文档
├── design.md        # 详细设计
└── decisions.md    # 决策记录
```

#### 3.1.5 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `brainstorming.enabled` | boolean | true | 是否启用头脑风暴 |
| `brainstorming.output_dir` | string | docs/design | 输出目录 |
| `brainstorming.auto_trigger` | boolean | true | 自动触发 |

---

### 3.2 阶段二：规划增强 (Plan Enhancement)

#### 3.2.1 功能描述

在 Prometheus 生成计划后、用户执行前，增强计划内容：展开 TDD 任务、添加验证任务。

#### 3.2.2 TDD 任务展开

将每个实现任务展开为三个子任务：

| 子任务 | 类型 | 描述 |
|--------|------|------|
| `{feature} - 写测试` | TDD-Red | 编写测试用例，运行确认失败 |
| `{feature} - 实现` | TDD-Green | 编写最小代码使测试通过 |
| `{feature} - 重构` | TDD-Refactor | 优化代码结构 |

#### 3.2.3 验证任务

在计划末尾添加批量验证任务：

```
## Task N: 批量验证
- Security Check
  - Secret scan
  - Vulnerability check
- Quality Check
  - Lint
  - Type check
  - Test run
```

#### 3.2.4 输出

增强后的 `.sisyphus/plans/{name}.md`

#### 3.2.5 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `tdd.enabled` | boolean | true | 是否展开 TDD 任务 |
| `tdd.expand_threshold` | number | 3 | 超过此文件数才展开 TDD |
| `verification.in_plan` | boolean | true | 是否添加验证任务 |
| `verification.security` | string[] | [secret, vuln] | 安全检查项 |
| `verification.quality` | string[] | [lint, typecheck, test] | 质量检查项 |

---

### 3.3 阶段三：执行与验证 (Execute & Verify)

#### 3.3.1 功能描述

Sisyphus 按增强后的计划执行任务，验证任务自动批量检查。

#### 3.3.2 代码变更跟踪

- 拦截 WriteTool、EditTool
- 记录所有变更文件
- 保存到 `.devflow/build/{id}/changes.json`

#### 3.3.3 验证执行

验证任务执行时：

1. **Security Check**
   - Secret scan: 扫描密钥、密码、Token
   - Vulnerability check: 检查依赖漏洞

2. **Quality Check**
   - Lint: 代码规范检查
   - Type check: 类型检查
   - Test run: 运行测试

3. **生成报告**
   - `docs/verification/{feature}-security.md`
   - `docs/verification/{feature}-quality.md`

#### 3.3.4 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `tracking.enabled` | boolean | true | 是否跟踪代码变更 |
| `verification.auto_fix` | boolean | false | 是否自动修复问题 |

---

### 3.4 阶段四：归档 (Archive)

#### 3.4.1 功能描述

用户手动触发归档，生成完整的 SRS 文档和归档包。

#### 3.4.2 触发条件

- 用户输入："归档"、"archive"、"完成"

#### 3.4.3 归档内容

```
docs/archive/{feature}/
├── README.md                    # 总览
│
├── srs/                         # 软件需求规格
│   ├── index.md                 # SRS 索引
│   ├── requirements.md          # 功能需求映射
│   ├── code-mapping.md          # 功能 ↔ 代码映射
│   └── test-mapping.md          # 功能 ↔ 测试映射
│
├── design/                      # 设计文档
│   ├── proposal.md
│   ├── design.md
│   └── decisions.md
│
├── plan/                        # 执行计划
│   ├── tasks.md
│   └── execution-log.md
│
└── verification/                # 验证报告
    ├── security-report.md
    └── quality-report.md
```

#### 3.4.4 SRS 自动生成

**Code Mapping 内容**：

```markdown
## 功能 ↔ 代码映射

| 功能点 | 类型 | 文件路径 | 行号 | 函数/类 |
|--------|------|----------|------|---------|
| 用户登录 | 核心逻辑 | src/auth/login.ts | L10-30 | login() |
| 密码加密 | 工具函数 | src/auth/crypto.ts | L8-18 | hashPassword() |
```

**Test Mapping 内容**：

```markdown
## 功能 ↔ 测试映射

| 功能点 | 测试文件 | 测试函数 | 行号 |
|--------|----------|----------|------|
| 用户登录 | tests/auth/login.test.ts | should_login_success | L15-35 |
| 密码加密 | tests/auth/crypto.test.ts | should_hash_password | L8-20 |
```

#### 3.4.5 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `archive.enabled` | boolean | true | 是否启用归档 |
| `archive.output_dir` | string | docs/archive | 归档目录 |
| `archive.generate_srs` | boolean | true | 是否生成 SRS |

---

## 4. 用户流程

### 4.1 完整流程

```
1. 用户: "实现用户登录功能"
   │
   ▼
2. [自动] Brainstorming
   ├── 澄清需求
   ├── 生成 2-3 种方案
   └── docs/design/user-login/proposal.md, design.md
   │
   ▼
3. 用户确认设计方案
   │
   ▼
4. [自动] Prometheus 生成计划
   │
   ▼
5. [自动] 插件增强计划
   ├── 展开 TDD 任务
   └── 添加验证任务
   │
   ▼
6. 用户: /start-work user-login
   │
   ▼
7. Sisyphus 执行
   ├── Task 1: 写测试 → 失败
   ├── Task 2: 写代码 → 通过
   ├── Task 3: 重构
   ├── ...
   └── Task N: 批量验证
       ├── Security Check
       └── Quality Check
   │
   ▼
8. [自动] 验证报告生成
   └── docs/verification/user-login-security.md, -quality.md
   │
   ▼
9. 用户: "归档"
   │
   ▼
10. [自动] 归档生成
    └── docs/archive/user-login/
        ├── SRS (功能-代码映射)
        ├── 设计文档
        └── 验证报告
```

### 4.2 命令接口

| 命令 | 说明 |
|------|------|
| 无需命令 | Brainstorming 自动触发 |
| 无需命令 | 计划增强自动触发 |
| 无需命令 | 验证任务在计划中自动执行 |
| `/archive` | 手动触发归档 |
| `/archive --edit` | 归档后编辑 |

---

## 5. 技术设计

### 5.1 插件入口

```typescript
// src/index.ts
import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { createBrainstormHook } from "./phases/brainstorm/hook"
import { createPlanEnhancer } from "./phases/plan-enhancer"
import { createVerifyTask } from "./phases/verify/task"
import { archiveSkill } from "./skills/archive"

export const OpenFlowPlugin: Plugin = async (ctx) => {
  const config = loadConfig(ctx.config)
  
  return {
    tool: {
      openflow: tool({
        description: "OpenFlow workflow commands",
        args: {
          action: tool.schema.enum(["archive", "status", "config"])
        },
        async execute(args, ctx) {
          if (args.action === "archive") {
            return await runArchive(ctx)
          }
          // ...
        }
      })
    },
    
    "chat.message": async (input, output) => {
      if (config.brainstorming.enabled) {
        await createBrainstormHook(config)(input, output)
      }
    },
    
    "tool.execute.after": async (input, output) => {
      // Plan 增强
      if (config.planEnhancer.enabled && isPlanGeneration(input)) {
        await createPlanEnhancer(config)(input, output)
      }
      
      // 代码变更跟踪
      if (config.tracking.enabled && isWriteTool(input)) {
        await trackChanges(input, output)
      }
    }
  }
}
```

### 5.2 配置管理

```typescript
// src/config.ts
export interface OpenFlowConfig {
  brainstorming: {
    enabled: boolean
    output_dir: string
    auto_trigger: boolean
  }
  tdd: {
    enabled: boolean
    expand_threshold: number
  }
  verification: {
    in_plan: boolean
    security: string[]
    quality: string[]
    auto_fix: boolean
  }
  archive: {
    enabled: boolean
    output_dir: string
    generate_srs: boolean
  }
}

export const defaultConfig: OpenFlowConfig = {
  brainstorming: {
    enabled: true,
    output_dir: "docs/design",
    auto_trigger: true
  },
  tdd: {
    enabled: true,
    expand_threshold: 3
  },
  verification: {
    in_plan: true,
    security: ["secret", "vuln"],
    quality: ["lint", "typecheck", "test"],
    auto_fix: false
  },
  archive: {
    enabled: true,
    output_dir: "docs/archive",
    generate_srs: true
  }
}
```

---

## 6. 非功能需求

### 6.1 性能

- 插件加载时间 < 100ms
- 计划增强处理时间 < 500ms
- SRS 生成时间 < 5s（取决于变更文件数）

### 6.2 兼容性

- 兼容 oh-my-openagent 所有版本
- 兼容 OpenCode 最新版本
- 不修改 oh-my-openagent 任何文件

### 6.3 可扩展性

- 支持自定义 Brainstorming 模板
- 支持自定义验证工具
- 支持自定义 SRS 生成逻辑

---

## 7. 验收标准

### 7.1 Brainstorming 阶段

- [ ] 检测到新需求时自动触发
- [ ] 生成 proposal.md、design.md、decisions.md
- [ ] 文档保存在 docs/design/{feature}/

### 7.2 计划增强阶段

- [ ] Prometheus 生成计划后自动增强
- [ ] 每个实现任务展开为 3 个 TDD 子任务
- [ ] 计划末尾添加验证任务

### 7.3 执行验证阶段

- [ ] 跟踪所有代码变更文件
- [ ] 验证任务执行 Security Check
- [ ] 验证任务执行 Quality Check
- [ ] 生成验证报告

### 7.4 归档阶段

- [ ] 用户输入 /archive 时触发
- [ ] 生成完整的 SRS 文档
- [ ] 包含功能-代码映射
- [ ] 包含功能-测试映射

---

## 8. 术语表

| 术语 | 定义 |
|------|------|
| OpenCode | AI 代码编辑器 |
| oh-my-openagent | OpenCode 插件，提供 Agent 编排能力 |
| Prometheus | oh-my-openagent 的规划 Agent |
| Sisyphus | oh-my-openagent 的执行 Agent |
| TDD | 测试驱动开发 (Test-Driven Development) |
| SRS | 软件需求规格说明书 (Software Requirements Specification) |
| Code Mapping | 功能与代码文件的映射关系 |
| Test Mapping | 功能与测试用例的映射关系 |

---

## 9. 参考资料

- oh-my-openagent: `f:\ai-code\oh-my-openagent`
- Superpowers: `f:\ai-code\superpowers\skills`
- OpenSpec: `f:\ai-code\OpenSpec`

---

**文档版本**: 1.0  
**创建日期**: 2026-03-10  
**作者**: OpenFlow Team
