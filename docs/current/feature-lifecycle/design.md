# Feature Lifecycle Design

## Overview

Feature lifecycle 定义 OpenFlow 从需求探索到归档的完整流程架构。核心原则是"先澄清问题边界，再决定怎么改"，而不是直接进入代码生成。

## Lifecycle Stages

```
brainstorm → feature → writing-plan → implement → quality-gate → archive
     ↑           ↑                        ↑             ↑            ↑
  optional    设计澄清                 实现执行        质量门禁      归档冻结
```

### 1. Brainstorm（可选）

纯对话式需求探索，不生成文件。当需求不清晰时，`openflow-brainstorm` Skill 引导协作讨论，包括：

- 理解意图：评估范围，必要时帮助分解
- 探索方案：提出 2-3 种方案及权衡
- 收敛判断：足够清晰后建议进入 `/openflow-feature`

Brainstorm 不注册命令、不维护状态、不强加硬性门槛。它只是一个对话引导 Skill。

### 2. Feature（设计澄清）

`/openflow-feature` 是温和型设计助手，不是固定问卷或硬性关卡。

**入口方式**：无参数、slug 或自然语言描述均可。系统自动推导内部 feature identity。

**收敛逻辑**：不依赖固定问题序列，而是基于就绪度判断：
- 问题目标、变更边界、预期结果基本清晰时，可以生成文档
- 关键不确定性仍存在时，问一个问题而非直接生成
- 用户可以跳过问题、要求草稿、或拒绝代码层面的讨论

**文档生成策略**：
- `design.md`：方向清晰时生成；未收敛但用户要求时标记为 Draft with Assumptions
- `behavior.md`：存在可观察行为变更时生成，按场景选择结构（命令行为、Hook 行为、工作流行为等）
- 内部-only 且无外部可观察变更时，`behavior.md` 可省略或精简

**设计完成后**：确认式交互提供三个选项（进入开发计划 / 检查约束充分性 / 仅查看文档），记录选择到 `FeatureSession.postDesignDecision`，但不自动执行任何后续命令。

### 3. Writing-Plan（计划生成）

`/openflow-writing-plan` 从设计上下文生成结构化实现计划。

- **双路径保存**：`.sisyphus/plans/{feature}.md` 和 `docs/changes/{YYYY-MM-DD-feature}/plan.md`
- **OMO 检测**：检测 omo 环境时路由到 Prometheus，否则走 OpenCode 原生计划流程
- **有界拆分**：bounded work packages，不是无限并行分解
- **预算警告**：计划超过阈值时输出 Plan Budget Notice
- **Enhancer**：写入后自动注入 TDD guidance（非 checkbox 格式）和 verification 参考

Writing-plan 只保存计划，不自动开始实现。

### 4. Implement（实现执行）

`/openflow-implement` 创建 `ImplementationRun` 并委托执行。

- **OMO 环境**：路由到 `/start-work <feature>`
- **无 OMO**：回退到 OpenCode 原生构建流程
- **生命周期**：`created → starting_backend → running → quality_gate_pending → ready_for_archive → archived`
- **Worktree 隔离**：可选创建 git worktree

### 5. Quality-Gate（质量门禁）

`openflow-quality-gate` 是 AI 自动调用的质量门，不是用户命令。详细设计见 `quality-governance/design.md`。

Feature lifecycle 只关心接口边界：
- 实现完成后，AI 调用 quality-gate
- Quality-gate 决定是否需要 harden，然后执行 evidence-aware verify
- 输出 readiness 分类（Ready / ReadyWithDocUpdates / NotReady / NeedsDecision）
- 非实现类任务（design-only、planning-only、docs-only）不应被强制走质量门

### 6. Archive（归档冻结）

`/openflow-archive` 是最终关闭阶段。

- 冻结工作文档到 `docs/archive/`
- 提升 `docs/current/` 反映新状态
- 生成 `implementation-mapper.md` 实现需求到代码的追溯

## Feature Identity

Feature identity 是稳定、确定性、人类可读的标识符。

### 推导优先级

1. 当前聊天会话绑定的活跃 feature session
2. AI 从自然语言意图生成的 slug
3. 自然语言命令参数转换的安全 slug
4. `.sisyphus/feature/` 中无歧义的未完成 session
5. 确定性 fallback slug

### 规则

- **不使用 hash**：`feature-{hash}` 破坏可追溯性。过于模糊的输入应拒绝并要求澄清
- **同名即同 feature**：slug 相同则指向同一 session，不按日期/会话隔离
- **确定性推导**：相同输入必须产生相同 slug
- **中文映射**：维护 `inferChineseFeatureWords` 字典，将中文术语映射到英文 slug 组件。字典为 append-only
- **拒绝优于混淆**：模糊输入触发 `lowConfidenceReason`，不编造 slug

### 三元组

每个 feature 维护：
- `featureSlug`：安全内部标识
- `featureTitle`：人类可读标题
- `sourceIntent`：产生该 identity 的自然语言摘要

## Design Principles

### 自然语言优先

`/openflow-feature` 接受零参数启动。用户不需要提供文件系统安全的名称。所有自然语言输入（中文、混合语言、句子式描述）都应被接受为 feature 意图，不因 sanitize 失败而拒绝。

### 就绪度收敛，不是问卷完成

不依赖固定问题序列判断是否可以生成文档。判断标准是：问题目标、变更边界、预期结果基本清晰，剩余未知可以作为假设记录。

### 一次一个有价值的问题

后续问题只问能改变设计方向的那一个。每次只问一个问题，解释为什么重要，允许跳过。

### 用户反馈控制流程

用户说"跳过"就停止追问，说"不看代码层面"就降低抽象层级，说"先生成草稿"就生成带假设标记的文档。

### 文档双层结构

生成文档先服务人类理解（共识摘要），再服务执行约束。假设必须与确认事实分离。

## Design Constraints

1. `/openflow-feature` 必须接受零参数（当存在可推断上下文时）
2. 不要求用户手动提供 feature slug
3. 自然语言参数在 sanitize 失败前必须先作为意图处理
4. 固定问题完成不等于就绪
5. 设计方向有缺口时不生成最终文档
6. 假设不作为确认事实
7. 不把 `behavior.md` 写成实现设计文档
8. 确认交互不自动执行任何命令
9. 不对非实现类变更强制走实现级质量门
