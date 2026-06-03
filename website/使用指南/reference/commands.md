---
layout: doc
---

# 命令速查

OpenFlow 的命令负责推进正式工作流，Skill 负责在合适时机增强 AI 的协作能力。命令通常以 `/` 开头，在 OpenCode 中直接输入；Skill 可以由 AI 自动调用，也可以在支持的客户端中按名称调用。

## 工作流概览

```mermaid
flowchart LR
    A[init] --> B[brainstorm]
    B --> C[feature]
    C --> D[writing-plan]
    D --> E[implement]
    E --> F[quality-gate]
    F --> G[archive]

    classDef main fill:#eef6ff,stroke:#2563eb,color:#1e3a8a,stroke-width:1.5px;
    classDef success fill:#ecfdf5,stroke:#16a34a,color:#14532d,stroke-width:1.5px;
    class A,B,C,D,E main;
    class F,G success;
```

## 命令列表

| 命令 | 类型 | 说明 | 用法 |
|------|------|------|------|
| `/openflow-init` | 命令 | 初始化项目，生成 AGENTS.md | `/openflow-init` |
| `/openflow-feature` | 命令 | 创建 Feature 设计 | `/openflow-feature 添加用户资料页` |
| `/openflow-writing-plan` | 命令 | 生成开发计划 | `/openflow-writing-plan 用户资料页` |
| `/openflow-implement` | 命令 | 执行开发计划 | `/openflow-implement 用户资料页` |
| `/openflow-archive` | 命令 | 归档完成的特性 | `/openflow-archive 用户资料页` |
| `/openflow-status` | 命令 | 查看活跃特性状态 | `/openflow-status` |
| `/openflow-config` | 命令 | 查看/更新配置 | `/openflow-config` |
| `/openflow-migrate-docs` | 命令 | 迁移已有文档 | `/openflow-migrate-docs` |
| `openflow-brainstorm` | Skill | 头脑风暴（自然语言或按名调用） | `openflow-brainstorm` |
| `openflow-quality-gate` | Skill | 质量门（AI 自动调用） | AI 在实现后自动调用 |
| `openflow-tdd` | Skill | TDD 指导（AI 自动调用） | AI 在计划或实现阶段自动调用 |
| `openflow-harden` | Skill | 对抗性硬化审查 | `openflow-harden` |

## 详细说明

### `/openflow-init`

初始化项目，让 AI 知道如何读取 OpenFlow 文档结构。

```text
/openflow-init
```

它通常会生成或刷新 `AGENTS.md`，写入 `docs/current/`、`docs/decisions/`、`docs/changes/`、`docs/archive/` 等目录的使用规则。已有 `AGENTS.md` 时，OpenFlow 会尽量保留项目原有说明并补充 OpenFlow 导航约定。

### `/openflow-feature`

创建一个 Feature 设计，用于把模糊需求变成可实施的正式文档。

```text
/openflow-feature 添加用户资料页
```

AI 会先读取当前有效事实和架构决策，再通过对话澄清目标、非目标、约束、验收标准和设计边界。输出通常位于 `docs/changes/YYYY-MM-DD-{feature}/`，用于承接后续计划与实现。

### `/openflow-writing-plan`

根据已确认的 Feature 文档生成开发计划。

```text
/openflow-writing-plan 用户资料页
```

计划会把工作拆成可执行任务，标明目标文件、依赖关系、验证方式和执行约束。启用 TDD 时，计划阶段会加入测试优先或测试补强要求。更多测试相关能力可参考 [TDD 亮点](/使用指南/highlights/tdd)。

### `/openflow-implement`

执行开发计划，并把计划中的任务交给合适的实现流程。

```text
/openflow-implement 用户资料页
```

OpenFlow 会创建实现运行记录，传递约束包，并在实现完成后触发质量验证。若项目集成 OMO，执行流程可路由到对应的构建代理；否则使用 OpenCode 原生能力完成实现。

### `/openflow-archive`

归档已完成并通过验证的 Feature。

```text
/openflow-archive 用户资料页
```

归档会把变更工作区中的文档冻结到 `docs/archive/`，并根据配置把仍然有效的事实提升到 `docs/current/`。这一步用于形成“完成记录”和“当前事实”的清晰分界。

### `/openflow-status`

查看当前活跃 Feature、计划、实现运行和可能存在的待处理事项。

```text
/openflow-status
```

当你不确定项目中有哪些未归档工作，或需要接手他人未完成的 Feature 时，优先使用这个命令。

### `/openflow-config`

查看或更新 OpenFlow 配置。

```text
/openflow-config
```

配置来源包括项目根目录的 `openflow.json`、`openflow.jsonc`，以及 `opencode.json` 中的 `openflow` 键。完整字段请查看[配置项参考](/使用指南/reference/config-options)。

### `/openflow-migrate-docs`

迁移已有文档，把旧资料重组为 OpenFlow 文档结构。

```text
/openflow-migrate-docs
```

AI 会读取现有文档，将当前有效事实放入 `docs/current/`，将长期决策放入 `docs/decisions/`，将历史资料放入 `docs/archive/`。迁移只处理文档结构，不修改业务代码。详情见[迁移已有文档](/使用指南/migrate-existing-docs)。

### `openflow-brainstorm`

用于正式 Feature 之前的头脑风暴。

```text
openflow-brainstorm
```

它适合需求还不清晰、方案需要比较、范围需要拆分的阶段。Brainstorm 不直接写入正式 Feature 文档，而是帮助整理问题、约束、备选方案和非目标。讨论成熟后，可进入 `/openflow-feature`。

### `openflow-quality-gate`

质量门 Skill，通常由 AI 在实现完成后自动调用。

它会检查变更是否需要验证、验证证据是否充分、文档是否需要同步、风险是否需要升级审查，并输出是否可以交付。用户通常不需要手动调用它。

### `openflow-tdd`

TDD 指导 Skill，通常由 AI 在计划或核心逻辑实现阶段自动调用。

它会根据任务复杂度和验收标准决定是否要求先写测试、补充测试夹具、增加失败用例，或把验证步骤写入实施计划。

### `openflow-harden`

对抗性硬化审查 Skill，用攻击者或严格审查者视角检查方案与实现。

```text
openflow-harden
```

它适合高风险变更、安全敏感代码、复杂边界条件或质量门要求升级审查的场景。审查会提出可验证的问题，并要求实现方修复或给出有证据的反驳。
