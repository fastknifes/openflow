# OpenFlow 使用教程

[English Version](./openflow-usage-tutorial.en.md)

## 1. 这份教程是给谁的

如果你已经装好了 OpenFlow，但还不确定：

- 什么时候该用 `/openflow-feature`
- 什么时候该用 `issue`
- 计划与执行是不是一定要依赖 omo
- `harden`、`verify`、`archive` 分别在什么时机运行
- 如何把旧文档迁移进 OpenFlow

这份教程就是面向这些问题的。

一句话先记住：

> OpenFlow 不是替你写代码的 Agent；它是把“设计、约束、验证、归档”持续绑定到实现过程中的治理层。

---

## 2. 使用 OpenFlow 之前先理解一件事

OpenFlow 的核心理念是：

> **文档编程就是约束编程。**

也就是说，在 OpenFlow 里：

- `docs/changes/` 不是备忘录，而是当前变更的工作区
- `docs/current/` 不是介绍页，而是当前有效事实
- `docs/decisions/` 不是灵感草稿，而是全局决策边界
- `verify` 不是“跑一下测试”，而是生成可复核的证据
- `archive` 不是“把文档挪一下”，而是正式固化当前变更

所以使用 OpenFlow 的关键，不是记住命令本身，而是知道：

**什么时候需要先澄清、什么时候可以实现、什么时候必须验证、什么时候才能归档。**

---

## 3. 安装与基础配置

安装 OpenFlow 插件：

```bash
npm install @fastknife/openflow
```

然后在 `opencode.json` 中启用：

```json
{
  "plugins": ["@fastknife/openflow"]
}
```

如果你还没有初始化项目，先运行：

```text
/openflow-init
```

它会在仓库根目录写入或更新 `AGENTS.md` 中的 OpenFlow docs guide，告诉后续 Agent 如何理解 `docs/current/`、`docs/changes/`、`docs/archive/`、`docs/decisions/`。

---

## 4. 10 分钟快速上手

如果你不想先看完整手册，直接照下面做一次，就能快速理解 OpenFlow：

### 路径 1：做一个新功能

1. 初始化项目

```text
/openflow-init
```

2. 为功能建立设计工作区

```text
/openflow-feature demo-feature
```

2.5. 生成实现计划（推荐）

```text
/openflow-writing-plan demo-feature
```

4. 开始实现

- 如果你在用 omo：走 `Prometheus + /startwork`
- 如果你不用 omo：直接走 OpenCode 原生 `plan / build`

5. 实现完成后运行质量门

```text
openflow-quality-gate
```

6. 质量门给出 readiness 后归档

```text
/openflow-archive demo-feature
```

### 路径 2：调查一个不确定问题

1. 先做 issue 澄清

```text
/openflow-issue demo-issue --readonly
```

2. 根据 issue 结果判断：

- 继续调查
- 进入修复
- 升级到 `/openflow-feature`

3. 后续仍然回到 `openflow-quality-gate / archive` 主链路

如果你只记住这一节，也已经足够开始使用 OpenFlow。

---

## 5. 先学会选命令：你现在属于哪一类任务？

### 场景 A：你要做一个新功能或明确变更

用：

```text
/openflow-feature <feature>
```

适用场景：

- 新功能
- 明确的改造任务
- 规则变更
- 需要先做设计比较和约束澄清的工作

---

### 场景 B：你看到一个问题，但还不能确定它是不是 bug

用：

```text
/openflow-issue <issue-name-or-description>
```

适用场景：

- 接口结果不对
- 某个页面展示异常
- 数据状态不一致
- 不知道该修代码、修配置、补数据，还是先问业务

这个命令的重点不是直接修，而是先把问题分类清楚。

常见参数：

```text
/openflow-issue order-status-wrong --readonly
/openflow-issue coupon-chain-missing --write-doc
/openflow-issue coupon-chain-missing --continue
```

---

### 场景 B.5：功能开发中途需求变了

用：

```text
/openflow-change <feature> "<change description>"
```

适用场景：

- 功能已经在开发中（设计后、归档前），需求方提出新要求
- 不想重新开一个完整的 feature 设计周期

---

### 场景 C：你已经有一套旧文档，想迁移到 OpenFlow

用：

```text
/openflow-migrate-docs --sourceDir <source-docs-dir>
```

例如：

```text
/openflow-migrate-docs --sourceDir ./legacy-docs --dryRun
/openflow-migrate-docs --sourceDir ./.specify --targetDir .
```

适用场景：

- 从 OpenSpec 迁移
- 从 Spec Kit / Kiro / Cursor / Trae 风格文档迁移
- 从手工维护的旧 `docs/` 目录迁移

默认行为是：**先扫描、先报告、先澄清，再执行落盘**。

---

## 6. 命令选择决策树

如果你还是拿不准该先用哪个命令，可以直接套下面这棵树：

### 先问自己第一个问题：你现在面对的是“功能”还是“问题”？

- **我要新增/修改一个明确功能**
  - 用 `/openflow-feature <feature>`
- **我看到一个异常，但还不能确定是不是 bug**
  - 用 `/openflow-issue <issue>`

### 第 1.5 个问题：你是在开发中途遇到需求变更吗？

- **需求变了，但功能还没归档**
  - 用 `/openflow-change <feature> "<变更描述>"`

### 第二个问题：你现在有没有旧文档要迁移？

- **有一套外部文档要接进来**
  - 用 `/openflow-migrate-docs --sourceDir <source-docs-dir>`

### 第三个问题：你已经实现完了吗？

- **还没实现**
  - 继续 plan / build / 执行
- **已经实现，想确认是否可以宣称完成**
  - 让 AI 调用 `openflow-quality-gate`
- **quality gate 已通过，准备正式固化**
  - 运行 `/openflow-archive <feature>`

一个简单记忆方式：

- `feature` = 做设计
- `writing-plan` = 生成实现计划
- `change` = 处理中途需求变更
- `issue` = 先查清楚
- `quality-gate` = 代码完成后自动判断 harden，并用证据判断是否就绪
- `archive` = 正式固化
- `migrate-docs` = 搬旧文档

---

## 7. 一个完整的新功能使用流程

下面是最典型的 OpenFlow 用法。

### Step 1：初始化项目

```text
/openflow-init
```

如果项目已经初始化过，这一步通常只会刷新 OpenFlow 的 docs guide 区块。

### Step 2：为新功能做 feature 设计

```text
/openflow-feature user-coupon-filter
```

运行后，OpenFlow 会围绕这个功能生成 `docs/changes/YYYY-MM-DD-user-coupon-filter/` 工作区，核心通常是 `design.md`，复杂时还可能补 `prd.md`、`proposal.md`、`decisions.md`。

### Step 2.5（可选）：需求不清时先头脑风暴

如果你的需求还很模糊，不知道具体怎么做，先用 `/openflow-brainstorm` 探索讨论：

```text
/openflow-brainstorm 用户券列表需要支持按渠道筛选
```

AI 会跟你对话讨论方案、比较取舍，**不生成任何正式文档**。探索清楚后会总结关键决策，然后建议你用 `/openflow-feature` 正式化。

> **何时跳过**：UI 改动、bug 修复、边界清晰的新功能 — 直接进入 Step 2。

### Step 3：生成实现计划

```text
/openflow-writing-plan user-coupon-filter
```

预期结果：

- 双路径保存：`docs/changes/YYYY-MM-DD-user-coupon-filter/plan.md` 和 `.sisyphus/plans/user-coupon-filter.md`
- 计划采用 bounded work packages 策略

### Step 3：开始实现

这里有两条执行路径，根据你是否使用 omo 选择。

#### 路径 1：配合 omo 执行（推荐）

如果你安装了 [oh-my-openagent (omo)](https://github.com/nicepkg/oh-my-openagent)，完整流程是：

1. **计划已由 Step 3 生成**：`/openflow-writing-plan` 已经把开发计划写入了 `.sisyphus/plans/user-coupon-filter.md`
2. **切换到 Prometheus**：这是 omo 的计划执行 agent。在 OpenCode 中切换到 Prometheus，它会自动读取你的计划文件
3. **执行**：运行 `/start-work`，omo 按计划自动分配任务给子 agent 并行执行

```text
[Step 2.5 已完成：/openflow-writing-plan 生成了计划]
          ↓
切换到 Prometheus（omo 的计划执行 agent）
          ↓
/start-work        ← 读取 .sisyphus/plans/*.md 并开始执行
```

#### 路径 2：使用 OpenCode 原生 plan / build

- 直接使用 OpenCode 原生的 `plan` 能力组织任务
- 直接使用 OpenCode 原生的 `build` / 执行能力推进实现

适合你不想依赖 omo，只想把 OpenFlow 当成“文档约束 + 验证归档治理层”的场景。

无论哪条路径，原则都一样：

- 实现必须尊重 `docs/changes/*` 中的设计约束
- 不能把实现偷跑到文档之外
- 改完以后要回到 OpenFlow 的验证与归档链路

### Step 4：运行 quality gate

```text
openflow-quality-gate
```

质量门适合以下情况：

- 多文件改动
- 状态流转变化
- 权限、金额、订单、库存等高风险逻辑
- 接口契约变化
- 轻量 bug fix 后需要确认能否宣称完成

它会回答的不是“像不像完成了”，而是：

- 是否需要 harden
- 证据是否充分
- 是否与设计漂移
- readiness 是 `ready`、`ready_with_doc_updates`、`not_ready` 还是 `needs_decision`

### Step 5：归档

只有当 verify 给出可进入归档的状态时，再运行：

```text
/openflow-archive user-coupon-filter
```

归档后，OpenFlow 会：

- 冻结工作区文档
- 按需要更新 `docs/current/`
- 生成 `implementation-mapper.md`

---

## 8. 一个“问题调查”使用流程

如果你的输入不是“做个功能”，而是“这里为什么不对”，正确路径通常不是先做 feature 设计，而是先 issue。

### Step 1：先用 issue 澄清

```text
/openflow-issue order-discount-wrong --readonly
```

这一步的目标是：

- 明确用户期望
- 明确不能改什么
- 找证据
- 对齐当前语义
- 判断这是 bugfix、data issue、config issue、environment issue，还是 behavior change

### Step 2：根据结论分流

- 如果是明确 bugfix：进入实现
- 如果是 `behavior_change`：升级到 `/openflow-feature`
- 如果是 `doc_ambiguity`：先做用户澄清或决策
- 如果是数据/配置/环境问题：按对应路径处理

确认为 bugfix 后，也可以直接用 `--resolve` 进入 Work Node（自动 harden + verify）：

```text
/openflow-issue order-discount-wrong --resolve
```

### Step 3：实现后仍然走 harden / verify / archive

也就是说，`issue` 不是替代主流程，而是进入主流程前的调查与分诊入口。

---

## 9. 文档迁移怎么用

如果你手里已经有一套文档，不想手工一份份重组，可以这样做：

### Step 1：先 dry-run

```text
/openflow-migrate-docs --sourceDir ./legacy-docs --dryRun
```

先看 OpenFlow 识别出了什么、准备怎么分类、哪些地方需要你确认。

### Step 2：确认迁移目标

常见目标包括：

- `docs/current/requirements/`
- `docs/current/design/`
- `docs/current/spec/`
- `docs/current/workflow/`
- `docs/changes/`
- `docs/archive/`
- `docs/decisions/`
- `docs/references/`

### Step 3：正式执行迁移

```text
/openflow-migrate-docs --sourceDir ./legacy-docs --targetDir .
```

迁移默认是复制优先；**删除原文档不会自动发生**，需要显式确认。

---

## 10. 最容易踩的坑

### 坑 1：把 `issue` 当成“直接修 bug"命令

不是。`issue` 的第一职责是澄清、调查、分诊，不是立即改代码。`--resolve` 确实可以在分类后直接进入修复流程，但它的前提是 issue 已经完成了澄清与分诊。先分诊、再修复，顺序不能颠倒。

### 坑 2：把 `verify` 当成“跑个测试”

不是。`verify` 还要判断设计漂移、证据完整性和是否具备归档条件。

### 坑 3：复杂改动跳过 `harden`

不是所有改动都必须 harden，但复杂变更跳过 harden，往往会把回归风险留到 verify 之后才暴露。

### 坑 4：把 `archive` 当成整理文档的命令

不是。`archive` 是正式固化。它意味着这次变更已经通过验证，并要把结果写进项目的长期知识结构。

### 坑 5：以为 OpenFlow 强依赖 omo

不是。OpenFlow 可以和 omo 协同得很好，但也可以单独作为 OpenCode 上的文档治理层来使用。计划与执行既可以走 omo，也可以走 OpenCode 原生 plan / build。

---

## 11. 推荐的最小上手路径

如果你今天第一次用 OpenFlow，最推荐这样开始：

1. 运行 `/openflow-init`
2. 选一个小功能，运行 `/openflow-feature demo-feature`
3. 用你熟悉的执行方式实现它（omo 或 OpenCode 原生 plan/build 都可以）
4. 实现完成后让 AI 调用 `openflow-quality-gate`
5. 通过后运行 `/openflow-archive demo-feature`

如果你不是做功能，而是在查问题，则把第 2 步换成：

```text
/openflow-issue demo-issue --readonly
```

---

## 12. 核心命令详解

这一节不再只告诉你“什么时候用”，而是直接说明：

- 命令怎么写
- 参数是什么意思
- 执行后通常会发生什么
- 什么情况下不该用

### 12.1 `/openflow-init`

**作用**：初始化或刷新仓库根目录 `AGENTS.md` 中的 OpenFlow docs guide。

**用法**：

```text
/openflow-init
```

**参数**：无。

**执行后会发生什么**：

- 如果仓库还没有 `AGENTS.md`，会创建它
- 如果已经有 `AGENTS.md`，会刷新 OpenFlow 管理的 guide 区块
- 用户自己写在该区块之外的内容会保留

**什么时候用**：

- 新项目第一次接入 OpenFlow
- 你怀疑 `AGENTS.md` 中的 OpenFlow docs guide 已经过时

---

### 12.2 `/openflow-feature <feature>`

**作用**：为一个明确的功能或变更建立设计澄清工作区。

**用法**：

```text
/openflow-feature user-coupon-filter
```

**参数**：

- `<feature>`：功能名，建议用稳定、可读的 slug

**执行后会发生什么**：

- OpenFlow 会一轮一轮推进 feature 设计问题
- 结束后在 `docs/changes/YYYY-MM-DD-feature/` 生成设计工作区
- 常见产物包括：`design.md`、`proposal.md`、`decisions.md`、`prd.md`

**什么时候用**：

- 你要做一个新功能
- 你需要先比较方案、明确约束再实现

**什么时候不要先用它**：

- 你看到的是一个异常现象，还不能判断是不是 bug —— 这时先用 `issue`

---

### 12.3 `/openflow-change <feature> "<change description>"`

**作用**：在功能已经有 active docs、但还没 verify/archive 完成时，处理需求变更。

**用法**：

```text
/openflow-change user-coupon-filter "新增按渠道过滤并保持老接口兼容"
```

**参数**：

- `<feature>`：已有功能名
- `"<change description>"`：这次变更的需求说明，建议总是用引号包起来

**执行后会发生什么**：

- OpenFlow 先要求你更新 `docs/changes/{feature}/` 下的设计与约束
- 然后再进入代码改动
- 变更完成后仍要重新 `verify`

**什么时候用**：

- 功能已经在开发中，但需求变了
- 你不想重新开一个全新的 feature 设计周期

**什么时候不要用**：

- 功能已经 archive 了；这时应该开新的 `/openflow-feature`

---

### 12.4 `/openflow-writing-plan <feature>`

**作用**：根据已有设计文档，生成一份实现计划，写入 `.sisyphus/plans/{feature}.md`。

**用法**：

```text
/openflow-writing-plan user-coupon-filter
```

**参数**：

- `<feature>`：必须与设计工作区中的 feature 名对应

**执行后会发生什么**：

- 读取设计上下文
- 生成 parser-compatible 的开发计划
- 写入 `.sisyphus/plans/{feature}.md`
- **到此为止，不会自动开始实现**

**什么时候用**：

- 设计已经明确，你需要一份结构化执行计划

**什么时候不要用**：

- 设计文档还没出来；这时应该先 `/openflow-feature`

---

### 12.5 `/openflow-issue <issue-name-or-description>`

**作用**：调查一个“不确定性质的问题”，先澄清、分诊，再决定下一步。

**基本用法**：

```text
/openflow-issue "api returning 500 on login endpoint"
```

**常用参数**：

- `--name <slug>`：手动指定 issue slug
- `--env <local|staging|production>`：指定问题发生环境
- `--readonly`：强制只读调查，不允许写代码/改配置/改数据
- `--write-doc`：把澄清结果写入 `docs/changes/{date}-{slug}/issue-clarification.md`
- `--no-doc`：只输出结果，不写文件
- `--continue`：基于已有 issue workspace 继续调查
- `--resolve`：完成修复后自动生成 `issue-resolution.md` 和 `promotion-candidate.md`，质量门自动按风险判断是否需要 harden

**例子**：

```text
/openflow-issue "wrong data displayed in dashboard panel" --readonly
/openflow-issue "config drift detected in staging" --env staging --write-doc
/openflow-issue --name api-timeout --continue
/openflow-issue "payment button invisible on mobile" --resolve
```

**执行后会发生什么**：

- 生成 expectation / constraints / evidence / semantics / classification / next action gate
- 判断它更像 bugfix、data issue、config issue、environment issue、doc ambiguity 或 behavior change
- 自动搜索历史相似 issue（来自 `docs/archive/` 和 `docs/changes/`），输出提示
- 根据分类结果给出下一步建议（如 `--resolve` 进入修复流程，或转 `/openflow-feature`）

**什么时候用**：

- 你先要查清楚“到底是什么问题”

---

### 12.6 `openflow-quality-gate` Skill

**作用**：代码实现或 bug 修复完成后，由 AI 主动调用的质量门。它包含两步：

1. 根据风险自动判断是否运行 harden。
2. 执行 evidence-aware verify，复用新鲜证据，只补跑缺失或过期检查。

**基本用法**：

你通常不需要手动输入命令。实现 agent 应在代码改动完成后调用 Skill：

```text
openflow-quality-gate
```

**执行后会发生什么**：

- trivial/simple 低风险改动：跳过 harden，但仍执行 verify
- complex/high-risk 改动：自动运行 harden，然后执行 verify
- 已有新鲜的 test/typecheck/lint 证据：复用
- 缺失、过期或覆盖不足的证据：补跑
- 缺少 design.md 或 issue-clarification.md：不跳过 verify，只降级 context alignment
- 输出 readiness 和 evidence summary

**什么时候用**：

- AI 完成 feature 实现后
- AI 完成 bug fix 后
- 准备宣称“完成”之前
- 准备 archive 之前

`/openflow-harden` 和 `/openflow-verify` 不再作为正常手动流程入口；它们的底层能力由 `openflow-quality-gate` 统一调度。

---

### 12.7 `openflow-ai-reflection` Skill（AI 自触发，内部能力）

**作用**：当 AI 发现自己犯了或差点犯了一个可重复的工作流/流程错误时，自动触发并记录反思条目。用户通常不需要手动运行任何命令。

**基本用法**：

这是一个 AI 内部自触发的 Skill，不是用户命令。触发条件是 AI 基于当前对话、工具输出、审查反馈和 OpenFlow 指令进行的自我评估。

**规范分类**：

- `premature-implementation`：过早动手实现，未完成设计澄清
- `verification-skipped`：跳过了必须的验证步骤
- `docs-misuse`：错误使用文档体系（如把 `docs/current/` 当成草稿区）
- `delegation-misuse`：不当委派（如把多任务打包给单一 Agent）
- `context-loss`：丢失了关键上下文（如忽略已存在的设计约束）

**执行后会发生什么**：

- 在 `docs/current/workflow/ai-reflection/` 目录下记录结构化反思条目
- 后续会话可以参考这些记录，避免同一类错误再次发生

**典型触发信号**：

- AI 注意到自己违反了 OpenFlow 的硬性指令
- AI 跳过了必须的 harden 或 verify 步骤
- 用户纠正了 AI 的流程行为——这是 AI 自触发的信号，不是用户需要运行命令
- AI 在审查反馈中发现了自身可重复的流程问题

**什么不是触发场景**：

- 普通代码 bug（无 AI 流程教训）
- 拼写/格式问题
- 外部工具故障（AI 本身没有做出错误决策）

**MVP 不包含的内容**：

- 不包含 `/openflow-reflect` 命令
- 不包含 plugin tool 注册、command handler、event listener、hook、guardian/后台任务
- 不包含自动提升——反思记录中可以标注提升候选，但不会自动写入 `AGENTS.md`、skill 文件、测试或工作流文档

---

### 12.8 `/openflow-archive <feature>`

**作用**：把一轮变更正式固化为长期知识结构。

**用法**：

```text
/openflow-archive user-coupon-filter
```

**参数**：

- `<feature>`：功能名（必填）

**执行前提**：

- 功能已有设计工作区
- verify 给出的 readiness 允许进入 archive

**执行后会发生什么**：

- 创建 `docs/archive/{YYYY-MM-DD-feature}/`
- 复制 `design.md` / `plan.md` / `prd.md` / `proposal.md` / `decisions.md`（存在才复制）
- 生成 `implementation-mapper.md`
- 按配置决定是否自动更新 `docs/current/`

**什么时候用**：

- verify 已完成，且你要把这次变更正式固化下来

---

### 12.9 `/openflow-migrate-docs`

**作用**：把外部或旧的文档体系迁移到 OpenFlow 结构。

**启动方式**：

```text
/openflow-migrate-docs --sourceDir ./legacy-docs
```

**参数详解**：

- `--sourceDir <path>`：源文档目录，启动迁移时必填
- `--targetDir <path>`：目标项目根目录
- `--dryRun`：只预演 detect → scan → classify → clarify → plan，不真正改文件
- `--answer <text>`：回答当前 migration clarification 问题

**例子**：

```text
/openflow-migrate-docs --sourceDir ./legacy-docs --dryRun
/openflow-migrate-docs --sourceDir ./.specify --targetDir .
/openflow-migrate-docs --answer "保留原文档并生成报告"
```

**执行后会发生什么**：

- detect → scan → classify → clarify → plan → apply → cleanup
- 支持中断恢复
- 默认复制优先，删除原文档必须二次确认

**什么时候用**：

- 你已经有一套旧文档，想迁移进 OpenFlow，而不是从零手工重组

---

### 12.10 `/openflow-status`

**作用**：查看 OpenFlow 当前配置启用情况与已增强的 plan 状态。

**用法**：

```text
/openflow-status
```

**参数**：无。

**典型输出**：

- 当前目录
- feature / tdd / verification / archive / writing-plan 是否启用
- 已增强的 plans

---

### 12.11 `/openflow-config`

**作用**：查看当前生效的 OpenFlow 配置快照。

**用法**：

```text
/openflow-config
```

**参数**：当前文档可确认的公开用法为只读查看。

**典型输出**：

- `feature`
- `tdd`
- `verification`
- `archive`

---

## 13. 详细示例：从零开始完成一个功能

下面给一个完整、可照抄的示例。

### 场景

你要做一个功能：

> 用户券列表新增“按渠道过滤”能力，同时不能破坏旧接口行为。

### Step 1：初始化

```text
/openflow-init
```

你会得到：

- 根目录 `AGENTS.md` 被创建或刷新
- OpenFlow docs guide 生效

### Step 2：做 feature 设计

```text
/openflow-feature user-coupon-channel-filter
```

预期结果：

- OpenFlow 逐轮问你问题
- 最终生成类似目录：

```text
docs/changes/2026-05-09-user-coupon-channel-filter/
  design.md
  proposal.md           (conditional)
  decisions.md          (conditional)
  prd.md                (conditional)
```

### Step 3：生成实现计划

```text
/openflow-writing-plan user-coupon-channel-filter
```

预期结果：

- 生成 `.sisyphus/plans/user-coupon-channel-filter.md`
- 这份计划用于后续执行

### Step 4：开始实现

这里你有两种方式。

#### 方式 A：配合 omo

- 用 Prometheus 读计划
- 用 `/startwork` 推进执行

#### 方式 B：使用 OpenCode 原生 plan / build

- 直接按 `.sisyphus/plans/user-coupon-channel-filter.md` 自己推进
- 用 OpenCode 原生 plan / build 工作流执行

### Step 4：做 quality gate

```text
openflow-quality-gate
```

预期结果：

- trivial/simple：跳过 harden，但仍做 evidence-aware verify
- complex/high-risk：自动 harden，再做 verify
- 已有新鲜证据：复用；缺失或过期证据：补跑

你应该重点看：

- `### Evidence`
- `### Readiness`
- `status`
- `reason_codes`
- `next_step`

如果输出是：

- `Ready`：可以继续 archive
- `ReadyWithDocUpdates`：先补文档或按提示处理
- `NotReady`：先修问题，再跑 verify
- `NeedsDecision`：先解决决策问题

### Step 5：archive

```text
/openflow-archive user-coupon-channel-filter
```

预期结果：

```text
docs/archive/2026-05-09-user-coupon-channel-filter/
  implementation-mapper.md
  design.md            (if exists)
  proposal.md          (conditional)
  decisions.md         (conditional)
  prd.md               (conditional)
  plan.md              (conditional)
```

同时，必要时 OpenFlow 还会把稳定事实提升到 `docs/current/`。

---

## 14. 详细示例：调查一个不确定问题

### 场景

用户反馈：

> staging 环境登录接口偶发 500，但你还不知道是代码、配置、数据还是环境问题。

### Step 1：先 issue

```text
/openflow-issue "login endpoint returns 500 intermittently" --env staging --readonly --write-doc
```

这里每个参数的含义是：

- `--env staging`：明确这是 staging 环境问题
- `--readonly`：调查期禁止写代码、改配置、改数据
- `--write-doc`：把澄清结果写入 issue workspace

### Step 2：查看 issue 输出

你应该关注：

- 用户期望是什么
- 当前约束是什么
- 证据缺什么
- 语义是否明确
- 分类是什么
- 下一步 gate 是什么

如果它告诉你：

- `bugfix`：进入实现
- `behavior_change`：升级到 `/openflow-feature`
- `doc_ambiguity`：先找用户澄清/做决策
- `cannot_determine`：继续补证据

### Step 3：如果确认是 bugfix，再回主链路

```text
openflow-quality-gate
/openflow-archive login-endpoint-stability
```

---

## 15. FAQ（常见问题）

### Q1：我是不是每次都要先 `/openflow-feature`？

不是。

- 明确的新功能、规则变更、结构改造：先 `/openflow-feature`
- 不确定问题、异常现象、怀疑是 bug 但还没证据：先 `issue`

### Q2：我不用 omo，还能正常使用 OpenFlow 吗？

可以。

OpenFlow 的核心是文档治理、约束编程、验证和归档链路，不是对某个执行框架的绑定。你完全可以使用 OpenCode 原生 `plan / build` 工作流，再把实现接回 OpenFlow 的 `verify / archive`。

### Q3：`harden` 是不是每次都必须跑？

不是。

它更适合：

- 多文件逻辑改动
- 高风险业务逻辑
- 容易有隐藏回归的实现

小而明确的改动可以直接进入 `verify`。

### Q4：`verify` 通过了是不是就代表可以结束了？

不完全是。

`verify` 代表证据和 readiness 通过；如果你希望这次变更成为项目的正式长期状态，还需要 `archive` 去完成固化和追溯。

### Q5：`archive` 会不会自动帮我决定业务规则？

不会。

涉及全局规则、决策边界、需要用户批准的事项，OpenFlow 只能提出候选，不能擅自拍板。

### Q6：我已经有很多历史文档，应该直接手改还是先迁移？

如果数量少、结构简单，手工整理也可以。

如果来源复杂、目录很多、还涉及 OpenSpec / Spec Kit / Kiro / Cursor / Trae 之类旧结构，优先先用：

```text
/openflow-migrate-docs --sourceDir <source-docs-dir> --dryRun
```

先看迁移报告，再决定是否正式执行。

### Q7：什么时候用 `--resolve`？

当你通过 issue 澄清后确认是 bugfix，想直接进入修复、验证、留档流程时使用。`--resolve` 会自动生成 `issue-resolution.md` 和 `promotion-candidate.md`，并根据风险自动判断是否需要 harden。

注意：`--resolve` 不是跳过分诊，而是在分诊完成后自动衔接修复与验证。如果分类结果是 data issue、config issue 或 behavior_change，`--resolve` 不适用。

---

## 16. 命令速查表

| 目的 | 命令 |
|---|---|
| 初始化 OpenFlow docs guide | `/openflow-init` |
| 为新功能做设计澄清 | `/openflow-feature <feature>` |
| 为已有设计生成实现计划 | `/openflow-writing-plan <feature>` |
| 处理开发中途需求变更 | `/openflow-change <feature> "<change>"` |
| 为不确定问题做调查分诊 | `/openflow-issue <issue>` |
| 代码完成后运行质量门 | `openflow-quality-gate` Skill |
| AI 自触发反思记录（内部） | `openflow-ai-reflection` Skill |
| 正式归档变更 | `/openflow-archive <feature>` |
| 迁移旧文档体系 | `/openflow-migrate-docs --sourceDir <source-docs-dir>` |
| 查看状态 | `/openflow-status` |
| 查看/修改配置 | `/openflow-config` |

---

## 17. 最后一条建议

不要把 OpenFlow 当成“命令集合”，而要把它当成一种开发纪律：

- 先澄清再实现
- 先约束再编码
- 先验证再宣称完成
- 先归档再把变更视为正式成立

这样用，OpenFlow 才真正有价值。
