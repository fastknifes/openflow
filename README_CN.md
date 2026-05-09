# OpenFlow: AI 驱动开发的工业级治理层

[English](./README.md) | [架构设计](./docs/decisions/ADR-001-docs-governance-and-workflow.md)

## 📍 文档门户

| 你想做什么？ | 从这里开始 |
|---|---|
| 🚀 **快速上手** — 10 分钟实操教程 | [中文教程](./docs/current/workflow/openflow-usage-tutorial.md) · [English Tutorial](./docs/current/workflow/openflow-usage-tutorial.en.md) |
| 📋 **查命令** — 语法、参数、示例 | [使用手册 ↓](#-使用手册) |
| 🏗️ **理解架构** — 文档模型、治理模型、工作流设计 | [ADR-001: 文档治理方案](./docs/decisions/ADR-001-docs-governance-and-workflow.md) · [配置说明](#%EF%B8%8F-配置说明) |
| ❓ **避免踩坑** — 常见误区和 FAQ | [教程 §10（常见坑）](./docs/current/workflow/openflow-usage-tutorial.md#10-最容易踩的坑) · [教程 §15（FAQ）](./docs/current/workflow/openflow-usage-tutorial.md#15-faq常见问题) |

---

## 💎 为什么选择 OpenFlow？

OpenFlow 不是最轻的 AI 工作流，也不是最快启动的那一个。

它适合的问题是：

- 你面对的是**存量系统**，不是从零开始的小 demo
- 你真正想解决的是**问题边界不清**，而不是单纯“把代码写出来”
- 你不能接受 AI 改完代码后，只留下“看起来差不多”的结果
- 你需要需求、实现、验证、归档之间有**可追溯的治理链路**
- 你希望项目知识能跨人员、跨会话、跨 Agent 持续存在，而不是依赖口头交接

一句话定义：

> OpenFlow 不是先问“怎么写”，而是先问“问题边界是什么、哪些约束不能破、什么证据才算完成”。

这也是它和 OpenSpec、GSD、Superpowers 的核心差异。

---

## 🧭 适合谁，不适合谁

### 更适合

- 有存量代码、线上环境、历史包袱的项目
- 需要把“需求澄清、问题调查、验证证据、归档追溯”串成一个闭环的团队
- 对 AI 输出有审计、治理、交接要求的架构师、Tech Lead、平台团队
- 经常遇到“这到底是 bug、数据问题、配置问题，还是语义变化”的真实工程场景

### 不一定适合

- 追求最快启动、最快生成的个人原型项目
- 只是想先有一个轻量 spec，再快速让 AI 开干
- 不准备维护 `docs/current`、`docs/changes`、`docs/archive` 这套治理结构的团队
- 对“验证证据”和“归档权威”没有要求，只关心代码先跑起来

如果你的核心目标是“更快开始”，OpenSpec 或 GSD 往往更轻。
如果你的核心目标是“先把问题边界问清楚，再让 AI 安全落地”，OpenFlow 更合适。

---

## 🧠 OpenFlow 的工程哲学

OpenFlow 更像一种“苏格拉底式工程方法”：

- 不急着让 AI 写代码
- 先澄清问题定义
- 先划清变更边界
- 先确认哪些事实、语义和约束不能被悄悄改掉
- 先定义什么证据才足以声明完成

很多工具默认用户已经知道“要做什么”。
OpenFlow 额外处理一个更真实的问题：

> 用户描述的是一个现象，但这个现象究竟意味着 bug、数据异常、配置问题、环境问题，还是需求本身不清楚？

在这个问题没有边界之前，直接写代码，往往只是把不确定性更快地写进系统里。

---

## 🧬 项目级长期记忆

OpenFlow 不只是维护文档，它维护一套**项目级长期记忆**：

- `docs/current/*`：当前仍然生效的事实、设计和工作流约定
- `docs/decisions/*`：关键架构决策，以及“为什么系统会变成现在这样”
- `docs/changes/*`：某次变更如何被提出、澄清、实现和验证
- `docs/archive/*`：已经冻结的历史上下文和正式记录

这意味着：

- 新成员加入时，不必先依赖口头交接才能理解系统
- 老成员离开后，关键设计意图不会随人一起流失
- AI 换会话、换模型、换执行上下文时，项目知识不会被一起清空
- 团队协作依赖的是共享记忆，而不是“某个最懂系统的人”

对团队来说，这不只是“有文档”，而是系统拥有了**可持续维护的外部记忆层**。

---

## ⚖️ 为什么不是直接选 OpenSpec / GSD？

这几个项目并不是同一类工具，只是表面上都和 AI 开发工作流有关。

| 维度 | OpenSpec / GSD 更强 | OpenFlow 更强 |
|------|---------------------|---------------|
| 启动速度 | 更快，更轻，更容易 5 分钟上手 | 需要理解治理模型，启动成本更高 |
| 适合场景 | 已知要做什么的功能开发 | 边界不清的问题调查 + 受控实现 |
| 用户心智 | “先定义要构建什么” | “先定义问题边界，再决定怎么改” |
| 完成定义 | 以计划、执行、实现为中心 | 以证据、readiness、archive authority 为中心 |
| 存量系统治理 | 有帮助，但不是主卖点 | 是核心定位之一 |
| 团队连续性 | 更偏单次变更流程 | 通过 `current` / `decisions` / `archive` 建立长期共享记忆 |

所以更准确的说法不是“OpenFlow 替代 OpenSpec / GSD”，而是：

- OpenSpec / GSD 更像“把已知需求组织成实现流程”
- OpenFlow 更像“把不清晰的问题边界、验证证据、归档追溯组织成治理流程”

---

## 🎯 两种工作流模式

OpenFlow 之所以有两套工作流，不是为了复杂，而是因为现实里有两类完全不同的问题：

1. 你已经知道要做什么
2. 你只知道“哪里不对”，但还不知道那究竟是什么问题

如果把这两类问题混在同一条流程里，AI 往往会过早开始编码。

### 🛠️ 模式一：功能/变更工作流（类似 OpenSpec）

用于**边界已经清晰**的新功能、需求变更、重构等。

```
brainstorm → implement → [harden] → verify → archive
              ↑
        两条实现路径:
        1. OpenCode: plan → build
        2. omo: Prometheus → /startwork
```

- **brainstorm**: 探索意图，生成设计方案
- **implement**: 在边界明确后按计划执行实现
- **harden**: 可选，对高风险改动追加对抗性审查（`[harden]` 表示可选）
- **verify**: 不是“看起来完成了”，而是生成 evidence 和 readiness
- **archive**: 让本次变更进入可追溯、可交接、可回看的正式历史

### 🔍 模式二：问题调查工作流（OpenFlow 独有）

用于**边界还不清楚**的场景。此时用户给你的不是一个明确需求，而是一个现象：

- “数据不对”
- “行为不符合预期”
- “线上好像坏了”
- “和文档说的不一样”

这类输入不能默认当成 bugfix，也不能立刻改代码。

```
issue → 调查 → 分类 → 决策 → 下一步
          ↑
     read-only 证据收集
     不修改代码/数据
```

**典型场景**：
- "API 返回了奇怪的数据" → 先调查，不默认它是 bug
- "用户看不到预期信息" → 先对齐语义，再判断是否修复
- "线上数据好像有问题" → 先分类是代码 bug 还是数据问题
- "这个行为和文档描述不一致" → 先判断是文档问题还是实现问题

**核心原则**：
- **不预设问题类型**：收到 issue，不默认它就是 bugfix
- **调查只读化**：在分类前，Agent 只能读不能改
- **语义先于修复**：先判断“当前系统到底承诺了什么”
- **分类先于实施**：先判断它属于什么问题，再决定是否写代码
- **边界清晰后再升级**：需要时再进入 brainstorm / implement / verify / archive

**命令**：
```text
/openflow-issue <问题描述>              # 开始调查
/openflow-issue <问题> --readonly       # 只读调查（不修改任何文件）
/openflow-issue <问题> --write-doc      # 输出调查文档到 docs/changes/
```

### 📋 怎么选？

| 场景 | 用哪个工作流 |
|------|------------|
| 要添加新功能 | `brainstorm` → `implement` → `verify` → `archive` |
| 要改现有功能，但边界已经清楚 | `brainstorm` → `implement` → `verify` → `archive` |
| 发现了不确定的问题 | **`issue`** |
| 线上数据异常 | **`issue`**（可能是数据问题，不一定需要改代码）|
| 不确定是不是 bug | 先 **`issue`**，不要直接修 |
| 确认是 bug，且修复边界已清楚 | 先 **`issue`** 确认分类，再按 feature 流程修复 |

---

## 🚀 核心差异化亮点

### 🗺️ 需求→代码溯源
每一个归档的功能都会生成 `implementation-mapper.md`，这是你代码库的实现索引：
- 需求精确映射到特定文件、函数、符号
- 从此不再疑惑"这段代码为什么存在？"

### 🧠 当前事实 + 全局决策 = 团队共享记忆
OpenFlow 维护的不只是 feature 文档，还有持续更新的全局事实与架构决策：
- `current` 记录当前仍然成立的系统事实
- `decisions` 记录关键架构判断及其理由
- 人员变更、会话丢失、上下文切换时，知识不会直接蒸发

### 🔍 实时漂移检测
OpenFlow 实时监控工作区。如果 AI 修改的方式偏离了已批准的 `design.md`：
- Verify 阶段立即标记偏离
- 不会让问题溜进归档

### 🧠 智能约束推导
不是简单的检查清单。OpenFlow 会从你的业务优先级自动推导技术约束：
- "快速上线" → 自动推导出最小可行范围的约束
- "易维护" → 自动推导出代码清晰度的验证要求
- "风险最小" → 自动推导出回滚路径和回归覆盖要求

### 🧪 证据门禁，而不是口头完成
OpenFlow 把 verify 定义成一个正式门禁：
- 不是“我觉得改好了”
- 不是“AI 说它跑过了”
- 而是有 evidence、有 readiness、能判断是否允许进入 archive

### 📦 Archive 是正式收口点，而不是顺手归档
OpenFlow 把 archive 设计成一个权威阶段：
- `verify` 负责给出证据和 readiness
- `archive` 负责冻结历史、更新 current、生成实现映射
- 这让“完成”不只是一个口头状态，而是一个正式可回看的工程节点

### 🏗️ 更适合存量系统，而不是只适合 demo
OpenFlow 的结构天然偏向长期维护：
- 允许问题先澄清、再分类、再决定是否实施
- 允许高风险改动追加 `harden`
- 允许文档、设计、验证、归档共同约束 AI 的行为
- 更适合已有历史、已有约束、已有运行中的系统

---

## ✨ See it in action

### 功能开发工作流

```
You: /openflow-brainstorm 添加深色模式
AI:  ✓ 已澄清变更边界: 主题切换、localStorage 持久化、组件兼容性
     ✓ 已生成 design.md, requirements.md
     设计已保存至 docs/changes/2026-05-10-dark-mode/

You: [implement 按照计划执行...]
You: /openflow-verify 深色模式
AI:  漂移检测: ✓ 通过
     证据收集: ✓ lint ✓ typecheck ✓ test
     就绪度: Ready

You: /openflow-archive 深色模式
AI:  ✓ 已归档至 docs/archive/2026-05-10-dark-mode/
     ✓ 已生成 implementation-mapper.md (需求→代码溯源)
```

### 问题调查工作流

```
You: /openflow-issue "API 返回了奇怪的数据"
AI:  ✓ 正在调查...
     ✓ 语义对齐: 当前系统语义是 "X"，你描述的现象是 "Y"
     ✓ 当前边界仍不清晰，先保持只读
     ✓ 分类结果: data_issue (非代码 bug)
     ✓ 下一步建议: 检查数据源，而不是改代码
You: /openflow-issue "用户看不到支付按钮" --write-doc
AI:  ✓ 已写入 docs/changes/2026-05-10-payment-button/issue-clarification.md
     ✓ 分类结果: cannot_determine
     ✓ 建议: 需要更多证据（截图、操作步骤、环境信息）
     ✓ 建议: 需要更多证据（截图、操作步骤、环境信息）
```

---

## 🛠️ 使用手册

如果你需要的不是命令清单，而是一份真正按步骤走的教程，请先看：[`docs/current/workflow/openflow-usage-tutorial.md`](./docs/current/workflow/openflow-usage-tutorial.md)

### 🎯 你只需要三条核心命令

```text
/openflow-brainstorm <功能名>    # 设计一个功能（模式一）
/openflow-issue <问题描述>       # 调查一个问题（模式二）
/openflow-verify <功能名>        # 生成证据与就绪度判断
```

---

### 核心流程命令

#### 1. 初始化：`/openflow-init`
任何新项目的起点。它会设置 `AGENTS.md` 指导，并为受控开发准备工作区。

#### 2. 设计阶段：`/openflow-brainstorm <功能名>`
- **作用**：探索意图，询问澄清问题，并提出 2-3 种方案。
- **智能化产出**：根据需求的复杂度，在 `docs/changes/YYYY-MM-DD-feature/` 下生成定制化的文档集，可能包括：
  - `design.md`：核心架构与技术方案（主文档）。
  - `prd.md`：产品需求文档（针对高复杂度功能自动生成）。
  - `requirements.md`：显式的需求定义与约束说明。
  - `proposal.md`：问题定义与初步方案探索。
  - `decisions.md`：关键架构决策与权衡记录。

#### 3. 计划与执行：`Prometheus` 与 `/startwork`
设计定稿后，可以用不止一种方式把设计转化为代码：
- **配合 omo**：调用 **Prometheus** 生成开发计划，再通过 `/startwork` 进入 omo 的执行流程。
- **使用 OpenCode 原生流程**：也可以直接依赖 OpenCode 原生的 **plan** 与 **build** 工作方式，而不依赖 omo。无论采用哪种执行路径，OpenFlow 的核心职责都不变：把设计、需求、决策、验证与归档约束持续绑定到实现过程。

#### 4. Issue 澄清：`/openflow-issue <问题名或问题描述>`
当问题本身还不明确、还不能直接判断是不是 bug 时，先使用这个命令。
- **作用**：在动手实现前先澄清用户期望、修复边界、证据和当前语义。
- **典型场景**：数据异常、行为异常、业务规则不清、配置/环境问题，或者你需要先判断下一步是修复、继续调查还是升级到 brainstorm。
- **常用参数**(可选)：`--readonly`、`--write-doc`、`--continue`。

#### 5. 加固阶段：`/openflow-harden <功能名>`
当改动复杂、风险高或跨多个文件/路径时，在实现完成后、verify 之前运行。
- **作用**：通过 reviewer / executor 风格的对抗审查循环，对实现做质量加固。
- **典型场景**：多文件逻辑修改、状态/权限/数据流变更、公共接口调整，或者"测试可能过了，但仍担心隐藏回归"的实现。
- **常用参数**：`--full`、`--mode quick|standard|deep`、`--max-rounds N`。

#### 6. 验证阶段：`/openflow-verify <功能名>`
看门人。在声明成功之前，必须运行 verify。
- **漂移检测 (Drift Detection)**：自动校验代码实现是否偏离了已批准的设计和需求文档。
- **证据阶段**：运行测试、安全扫描（密钥/漏洞）和 Lint。
- **就绪阶段**：将状态分类为 `Ready`（就绪）、`ReadyWithDocUpdates`（文档待更新）、`NotReady`（未就绪）或 `NeedsDecision`（需决策）。
- **铁律**：没有新鲜的验证证据，不得声明任务完成。

#### 7. 归档阶段：`/openflow-archive <功能名>`
最终权威。
- **规范化**：将工作文档移动到 `docs/archive/`。
- **晋升**：更新 `docs/current/` 以反映最新的系统状态。
- **映射**：生成 `implementation-mapper.md` 以实现永久溯源。

---

### 进阶命令

#### 8. 文档迁移：`/openflow-migrate-docs --sourceDir <source-docs-dir> [--targetDir <target-dir>] [--dryRun]`
当你要把其他工作流或旧项目里的文档体系迁移到 OpenFlow 结构时，使用这个命令。
- **作用**：检测源文档结构，扫描文件，把内容分类到 `docs/current/`、`docs/changes/`、`docs/archive/`、`docs/decisions/`、`docs/references/`，并在真正落盘前先进行澄清。
- **典型场景**：从 OpenSpec、Spec Kit、Kiro、Cursor/Trae 约定，或手工维护的旧 `docs/` 目录迁移到 OpenFlow。
- **重要行为**：默认是"先报告、先澄清"；删除原文档永远不会自动发生。

#### 9. 维护与管理：`/openflow-status` & `/openflow-config`
- **状态查询 (Status)**：查看当前所有活跃功能开发会话的状态和就绪度。
- **配置管理 (Config)**：实时查看或更新 OpenFlow 的运行配置。

---

## 🔌 深度集成 OpenCode + omo

OpenFlow 运行在 **OpenCode** 中，可选深度集成 **oh-my-openagent (omo)**：

| 组件 | 职责 |
|------|------|
| **omo** | 多代理编排、任务执行、工具链 |
| **OpenFlow** | 文档治理、漂移检测、验收约束、归档溯源 |

没有 omo？OpenFlow 的核心约束模型仍然独立工作。

---

## 📦 安装

```bash
npm install @fastknife/openflow
```

然后在你的 `opencode.json` 中启用插件：

```json
{
  "plugins": ["@fastknife/openflow"]
}
```

---

## ⚙️ 配置说明

进一步自定义行为，在 `opencode.json` 中设置：

```json
{
  "openflow": {
    "brainstorming": {
      "enabled": true,
      "auto_trigger": true,
      "trigger_mode": "smart"
    },
    "tdd": {
      "enabled": true,
      "expand_threshold": 3
    },
    "verification": {
      "in_plan": true,
      "security": ["secret", "vuln"],
      "quality": ["lint", "typecheck", "test"]
    },
    "archive": {
      "enabled": true,
      "auto_promote_current": true
    }
  }
}
```

---

## 📈 OpenFlow 能带来什么

| 指标 | 没有 OpenFlow | 有 OpenFlow |
|------|--------------|-------------|
| 需求追溯耗时 | 手动搜索 + 猜测 | 打开 implementation-mapper.md，5 秒定位 |
| 偏离发现时机 | 上线后用户投诉 | Verify 阶段实时捕获 |
| TDD 执行率 | 靠开发者自觉 | 自动注入为执行计划的一部分 |
| Issue 处理 | 默认修 bug，可能误判 | 分类分诊，不预设问题类型 |

---

## 🏗️ 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenCode IDE                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │ oh-my-openagent │  │         OpenFlow Plugin         │  │
│  │    (运行时)     │◄─┤        (治理层/管控层)          │  │
│  │                 │  │                                 │  │
│  │  - 上下文注入   │  │  - 偏离检测 (Drift Detection)   │  │
│  │  - 任务执行     │  │  - 证据收集 (Evidence)          │  │
│  │  - 工具链       │  │  - 实现映射 (Mapping)           │  │
│  └─────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📄 开源协议

MIT License. 由 [fastknife](https://github.com/fastknifes) 开发。
