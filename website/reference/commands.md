---
layout: doc
---

# 命令参考

OpenFlow 所有命令和 Skill 的完整参考。命令通常以 `/` 开头，在 OpenCode 中直接输入即可使用；Skill 是 AI 能力扩展，可由 AI 自动触发，或在支持的客户端中按名称调用。

## 核心工作流命令

### `/openflow-init`

初始化项目，写入 `AGENTS.md` 文档导航指南。

```bash
/openflow-init
```

- 在项目根目录生成 `AGENTS.md`
- AI 读取此文件后即知晓 OpenFlow 的文档结构和工作流约定
- 已有 `AGENTS.md` 时会刷新而非覆盖

---

### `/openflow-feature`

设计一个功能。通过苏格拉底式对话收集事实，生成设计文档和行为约束。

```bash
/openflow-feature add user profile page
```

- Feature 名称从自然语言描述中自动推导
- 自动扫描 `docs/current/` 和 `docs/decisions/` 中的既有约束
- 生成 `design.md`（问题、目标、约束、方案）和 `behavior.md`（行为规范、验收标准）
- 文档保存在 `docs/changes/YYYY-MM-DD-{feature}/`

---

### `/openflow-writing-plan`

从设计文档生成结构化实施计划。

```bash
/openflow-writing-plan user profile page
```

- 前置条件：`design.md` 和 `behavior.md` 必须已存在
- 任务按依赖关系分组为执行波次，同波次可并行
- 每个任务包含文件路径、验证命令和代理配置
- 自动注入 TDD 要求和约束传递
- 输出 `plan.md`

---

### `/openflow-implement`

创建实施运行并委托执行。

```bash
/openflow-implement user profile page
```

- 创建 ImplementationRun 记录
- 自动检测环境：OMO 环境路由到 Prometheus，否则路由到 OpenCode 原生 build 代理
- 可选 Git Worktree 隔离执行
- 注入约束包到执行上下文
- 实施完成后 AI 自动调用质量门

---

### `openflow-quality-gate`

质量门验证。**这是 AI 自动调用的内部命令，不是用户直接使用的命令。**

AI 在实现完成后必须调用此命令，验证：

1. **适用性分类**：判断当前工作是否需要完整验证
2. **风险评估**：变更文件数、diff 行数、敏感路径等多维信号
3. **对抗性硬化**：高风险变更触发攻击者视角审查
4. **证据验证**：lint / typecheck / test 必须全部通过
5. **就绪分类**：输出 Ready / ReadyWithDocUpdates / NotReady / NeedsDecision

---

### `/openflow-archive`

归档已完成的功能。

```bash
/openflow-archive user profile page
```

- 前置条件：质量门已返回 Ready
- 需要用户显式确认才会执行
- 冻结：工作文档复制到 `docs/archive/YYYY-MM-DD-{feature}/`
- 提升：自动更新 `docs/current/` 中的活跃文档
- 映射：生成 `implementation-mapper.md`（需求→代码追溯）

## 管理命令

### `/openflow-status`

查看所有活跃功能会话的状态。

```bash
/openflow-status
```

### `/openflow-config`

查看或更新 OpenFlow 配置。

```bash
/openflow-config
```

### `/openflow-change`

在开发过程中处理需求变更。

```bash
/openflow-change user profile page "把头像改成方形裁剪"
```

- 不丢失已有工作
- 调整设计文档和计划
- 详见[中途改需求](/guide/mid-development-change)

### `/openflow-migrate-docs`

从其他工作流工具迁移文档到 OpenFlow 结构。

```bash
/openflow-migrate-docs
```

## Skill（高级能力）

Skill 是 OpenFlow 的扩展能力，在特定阶段自动激活或按需调用。

### `openflow-brainstorm` — 头脑风暴

在进入正式工作流之前，通过自由对话探索问题空间。

- 每次只问一个聚焦问题
- 自动提取上下文包（问题、决策、约束、非目标）
- 想法过大时主动帮助拆分
- 不产生正式文档，纯探索阶段
- 对话结束后可平滑过渡到 Feature 工作流

### `openflow-tdd` — 测试驱动开发

在计划增强阶段自动注入 TDD 要求。

- 根据复杂度阈值决定是否展开 TDD 任务
- 将测试和验证要求注入实施计划的里程碑
- 确保行为文档中的验收标准有对应的测试覆盖

### `openflow-ai-reflection` — AI 自我反思

AI 自动记录自己犯过的错误和学到的经验。

- 反思文件存储在 `docs/current/workflow/ai-reflection/`
- 后续 Feature 设计时会扫描反思文件作为约束
- 防止同一个错误在不同会话中重复出现

## 命令速查表

| 命令 | 类型 | 说明 |
|------|------|------|
| `/openflow-init` | 初始化 | 生成 `AGENTS.md` 文档导航指南 |
| `openflow-brainstorm` | Skill | 头脑风暴，理清想法 |
| `/openflow-feature` | 核心 | 设计一个功能，生成设计文档 |
| `/openflow-writing-plan` | 核心 | 从设计生成实施计划 |
| `/openflow-implement` | 核心 | 创建实施运行并执行 |
| `openflow-quality-gate` | 自动 | AI 自动调用的质量门验证 |
| `/openflow-archive` | 核心 | 归档已完成功能，生成追溯映射 |
| `/openflow-change` | 管理 | 开发中途的需求变更 |
| `/openflow-status` | 管理 | 查看活跃功能状态 |
| `/openflow-config` | 管理 | 查看或更新配置 |
| `/openflow-migrate-docs` | 管理 | 迁移已有文档 |
| `openflow-tdd` | Skill | 测试驱动开发增强 |
| `openflow-ai-reflection` | Skill | AI 自我反思与经验积累 |

## 典型工作流

```
┌─────────────────────────────────────────────────────────────┐
│  Feature 工作流（边界清晰的变更）                              │
│                                                             │
│  brainstorm → feature → writing-plan → implement            │
│                                    ↓                        │
│                              quality-gate（自动）            │
│                                    ↓                        │
│                                 archive                     │
└─────────────────────────────────────────────────────────────┘
```
