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
- `docs/current/workflow/ai-reflection/*`：AI 自我反思记录 —— AI 自身捕获的可重复工作流/流程错误
- `docs/decisions/*`：关键架构决策，以及"为什么系统会变成现在这样"
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
[头脑风暴 →] feature → writing-plan → implement → quality-gate → archive
      ↑  可选                       ↑
  纯对话探索               两条实现路径:
  需求不清时先用            1. OpenCode: plan → build
  再进入 feature            2. omo: Prometheus → /startwork
```

- **[头脑风暴]** *(可选)*: 需求不清时的对话探索 — 比较方案、权衡取舍、澄清范围。不生成文档。明确后衔接 `/openflow-feature`
- **feature**: 生成正式设计方案与约束
- **writing-plan**: 根据设计生成结构化实现计划
- **implement**: 在边界明确后按计划执行实现
- **quality-gate**: AI 在代码实现后调用 `openflow-quality-gate`，根据风险决定是否进行对抗性加固，然后验证证据和就绪度
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
- **边界清晰后再升级**：需要时再进入 feature / implement / verify / archive

**命令**：
```text
/openflow-issue <问题描述>              # 开始调查
/openflow-issue <问题> --readonly       # 只读调查（不修改任何文件）
/openflow-issue <问题> --write-doc      # 输出调查文档到 docs/changes/
/openflow-issue <问题> --resolve        # 修复并生成 resolution 产物（质量门自动处理 harden/verify）
```

### 📋 怎么选？

| 场景 | 用哪个工作流 |
|------|------------|
| 需求模糊，需要先探索讨论 | **`头脑风暴`** → 再 `feature` |
| 要添加新功能（边界清晰） | `feature` → `implement` → `quality-gate` → `archive` |
| 要改现有功能，但边界已经清楚 | `feature` → `implement` → `quality-gate` → `archive` |
| 发现了不确定的问题 | **`issue`** |
| 线上数据异常 | **`issue`**（可能是数据问题，不一定需要改代码）|
| 不确定是不是 bug | 先 **`issue`**，不要直接修 |
| 确认是 bug，且修复边界已清楚 | 先 **`issue`** 确认分类，再按 feature 流程修复 |
| 确认是 bug，想一步到位修复验证 | **`issue --resolve`** |

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

### 🛡️ 质量治理，而不是最后补救
OpenFlow 对代码质量的控制通过统一的质量门：
- **前置约束**：默认开启 TDD 计划增强，把测试与验证要求前置到实现计划中
- **AI 驱动质量门**：实现完成后，AI 自动调用 `openflow-quality-gate`，根据变更复杂度决定是否进行对抗性加固，然后执行证据感知验证
- **最终门禁**：输出就绪度分类（`Ready`、`ReadyWithDocUpdates`、`NotReady`、`NeedsDecision`）后，才能判断变更是否完成

这意味着质量不是在最后“顺手检查一下”，而是在实现前、实现中、实现后都被持续约束

### 🔍 基于检查点的漂移守卫（Drift Guardian）

OpenFlow 通过检查点机制防止文档与代码漂移，而非持续后台监控：

- **契约标记（Contract Markers）**：功能设计阶段，`design.md` 和 `behavior.md` 生成稳定的契约标记 — 明确断言代码必须满足的约束
- **计划内嵌检查点**：`/openflow-writing-plan` 读取契约标记，将 Drift Guardian 检查点任务嵌入实现计划
- **编写阶段轻量记录**：编码时仅做文件变更记录和可选的确定性轻量检查，不调用 LLM，不阻塞
- **里程碑语义检查**：每个计划里程碑任务完成后，异步运行语义漂移审查（使用配置的模型，回退到 omo librarian），对比代码与契约标记
- **仅作参考**：语义检查只产出 advisory evidence 和待处理发现 — 从不替代 `quality-gate`/`verify` 的最终裁决地位
- **闭环追溯**：`archive`/`implementation-mapper` 使用标记 ID 建立完整追溯链：`marker → plan task → checkpoint evidence → verify result → code`

这意味着漂移在自然检查点被发现（而非编码中途随机打断），永不阻塞 AI 执行，且始终保留 verify 的独立最终权威。

### 🧠 智能约束推导

不是简单的检查清单。OpenFlow 会从你的业务优先级自动推导技术约束：
- "快速上线" → 自动推导出最小可行范围的约束
- "易维护" → 自动推导出代码清晰度的验证要求
- "风险最小" → 自动推导出回滚路径和回归覆盖要求

### 🪞 AI 自我治理：反思机制

OpenFlow 内置了 AI 对自身的治理机制。当 AI 检测到自己犯了可重复的工作流或流程错误时，会自触发 `openflow-ai-reflection` 技能：

- **自我评估触发**：无需用户命令、无后台监听器 — AI 根据对话上下文和工具输出自行判断错误是否具有复现价值
- **规范分类**：`premature-implementation`（过早实现）、`verification-skipped`（跳过验证）、`docs-misuse`（文档误用）、`delegation-misuse`（委派不当）、`context-loss`（上下文丢失）
- **结构化记录**：每条反思记录触发原因、上下文、根因、正确行为、复现信号、纠正规则，以及是否应提升为全局规则
- **累积学习**：同类型错误累积在同一分类文档中（`docs/current/workflow/ai-reflection/`），形成持久的反模式知识库
- **提升通道**：标记为需提升的反思教训成为 `AGENTS.md`、技能更新或全局规则的候选 — 但需人工审核后生效

这让 AI 的错误从 "希望下次别再犯" 变成一个可明确检索、可持续改进的记忆层。

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
- 允许高风险改动通过 `openflow-quality-gate` 自动触发对抗性加固
- 允许文档、设计、验证、归档共同约束 AI 的行为
- 更适合已有历史、已有约束、已有运行中的系统

---

## ✨ See it in action

### 功能开发工作流

```
You: /openflow-feature 添加深色模式
AI:  ✓ 已澄清变更边界: 主题切换、localStorage 持久化、组件兼容性
     ✓ 已生成 design.md, requirements.md
     设计已保存至 docs/changes/2026-05-10-dark-mode/

You: [implement 按照计划执行...]
AI:  [自动调用 openflow-quality-gate]
     漂移检测: ✓ 通过
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
     ✓ 发现相似历史 Issue: 2026-04-28-api-data-format
     ✓ 分类结果: bugfix
     ✓ 建议下一步: 使用 --resolve 直接进入修复与验证

You: /openflow-issue "API 返回了奇怪的数据" --resolve
AI:  ✓ 已生成 issue-resolution.md（根因、修复摘要、复现特征）
     ✓ 已生成 promotion-candidate.md
     ✓ 复杂度: trivial — 质量门跳过了 harden
     ✓ 质量门: Ready
```

---

## 🛠️ 使用手册

如果你需要的不是命令清单，而是一份真正按步骤走的教程，请先看：[`docs/current/workflow/openflow-usage-tutorial.md`](./docs/current/workflow/openflow-usage-tutorial.md)

### 🎯 你只需要五条核心命令

```text
/openflow-brainstorm                  # 需求不清时先探索讨论（可选）
/openflow-feature <功能名>             # 设计一个功能（模式一）
/openflow-writing-plan <功能名>        # 生成实现计划
/openflow-issue <问题描述>              # 调查一个问题（模式二）
openflow-quality-gate                  # AI 自动调用的实现后质量门
```

---

### 核心流程命令

#### 头脑风暴（可选）：`/openflow-brainstorm <主题>`
需求还不清楚、需要先探索讨论时使用：
- **作用**：对话式探索 — 比较方案、权衡取舍、澄清范围。纯对话，不生成任何文档。
- **使用时机**：在 `/openflow-feature` 之前，需求还很模糊、范围不确定、或者想先讨论不同方案时。
- **衔接**：探索清楚后，总结关键决策并建议运行 `/openflow-feature` 正式化。
- **不需要时**：UI 改动、bug 修复、边界清晰的明确需求 — 直接走 `/openflow-feature`。

#### 1. 初始化：`/openflow-init`
任何新项目的起点。它会设置 `AGENTS.md` 指导，并为受控开发准备工作区。

#### 2. 设计阶段：`/openflow-feature <功能名>`
- **作用**：探索意图，询问澄清问题，并提出 2-3 种方案。
- **智能化产出**：根据需求的复杂度，在 `docs/changes/YYYY-MM-DD-feature/` 下生成定制化的文档集，可能包括：
  - `design.md`：核心架构与技术方案（主文档）。
  - `prd.md`：产品需求文档（针对高复杂度功能自动生成）。
  - `requirements.md`：显式的需求定义与约束说明。
  - `proposal.md`：问题定义与初步方案探索。
  - `decisions.md`：关键架构决策与权衡记录。

#### 3. 计划生成：`/openflow-writing-plan <功能名>`
设计明确后，生成结构化的实现计划：
- **作用**：读取设计上下文，生成 parser 兼容的开发计划，同时保存到 `docs/changes/{YYYY-MM-DD-feature}/plan.md` 和 `.sisyphus/plans/{feature}.md`（双路径保存）。
- **典型场景**：`/openflow-feature` 完成后，需要一份结构化计划再进行实现。计划采用 bounded work packages 策略（不是无限制并行分解），对超大计划会给出预算警告。
- **重要**：保存计划后即停止 —— 不会自动开始实现。

#### 4. 计划与执行
设计定稿后，可以用不止一种方式把设计转化为代码：
- **配合 omo**：调用 **Prometheus** 生成开发计划，再通过 `/startwork` 进入 omo 的执行流程。
- **使用 OpenCode 原生流程**：先用 `/openflow-writing-plan` 生成结构化计划，再依赖 OpenCode 原生的 **plan** 与 **build** 工作方式。无论采用哪种执行路径，OpenFlow 的核心职责都不变：把设计、需求、决策、验证与归档约束持续绑定到实现过程。

#### 5. 中途需求变更：`/openflow-change <功能名> "<变更描述>"`
当功能已经在开发中（设计完成后、归档之前），但需求发生了变化：
- **作用**：先更新活跃设计文档与约束，再执行关联代码变更。变更完成后仍需重新验证。
- **典型场景**：功能开发中，需求方提出新要求，你不想重新开一个完整的 feature 设计周期。

#### 6. Issue 澄清：`/openflow-issue <问题名或问题描述>`
当问题本身还不明确、还不能直接判断是不是 bug 时，先使用这个命令。
- **作用**：在动手实现前先澄清用户期望、修复边界、证据和当前语义。
- **典型场景**：数据异常、行为异常、业务规则不清、配置/环境问题，或者你需要先判断下一步是修复、继续调查还是升级到 feature 设计。
- **常用参数**(可选)：`--readonly`、`--write-doc`、`--continue`、`--resolve`。
- `--resolve`：确认 bugfix 后自动生成 issue-resolution.md 和 promotion-candidate.md，并通过质量门自动判断是否需要对抗性加固。

#### 7. 质量门：`openflow-quality-gate`（AI 自动调用）
实现完成后，AI 会自动调用 `openflow-quality-gate` 技能。详见[质量治理 ↓](#-质量治理而不是最后补救)。
- **作用**：根据风险自动判断是否进行对抗性加固，然后执行证据感知验证。
- **典型场景**：任何代码改动后自动触发。用户只需查看输出的就绪度分类。
- **不是用户命令**：这是 AI 调用的 Skill，不是用户手动输入的斜杠命令。

> **底层能力**：对抗性加固和证据验证的能力现在由 `openflow-quality-gate` 统一协调。`/openflow-harden` 和 `/openflow-verify` 不再作为正常用户流程入口。参见 ADR-004。

#### 8. AI 反思：`openflow-ai-reflection`（AI 自触发，内部能力）
当 AI 检测到自己犯了或差点犯了一个可重复的工作流/流程错误时，会自动触发 `openflow-ai-reflection` 技能记录反思条目。用户通常不需要手动运行任何命令。
- **作用**：在 `docs/current/workflow/ai-reflection/` 下记录结构化反思，让后续会话不再犯同一类错误。
- **规范分类**：`premature-implementation`（过早实现）、`verification-skipped`（跳过验证）、`docs-misuse`（文档误用）、`delegation-misuse`（委派不当）、`context-loss`（上下文丢失）。
- **不是用户命令**：这是 AI 内部自触发的 Skill。

#### 9. 归档阶段：`/openflow-archive <功能名>`
最终权威。
- **规范化**：将工作文档移动到 `docs/archive/`。
- **晋升**：更新 `docs/current/` 以反映最新的系统状态。
- **映射**：生成 `implementation-mapper.md` 以实现永久溯源。

---

### 进阶命令

#### 10. 文档迁移：`/openflow-migrate-docs --sourceDir <source-docs-dir> [--targetDir <target-dir>] [--dryRun]`
当你要把其他工作流或旧项目里的文档体系迁移到 OpenFlow 结构时，使用这个命令。
- **作用**：检测源文档结构，扫描文件，把内容分类到 `docs/current/`、`docs/changes/`、`docs/archive/`、`docs/decisions/`、`docs/references/`，并在真正落盘前先进行澄清。
- **典型场景**：从 OpenSpec、Spec Kit、Kiro、Cursor/Trae 约定，或手工维护的旧 `docs/` 目录迁移到 OpenFlow。
- **重要行为**：默认是"先报告、先澄清"；删除原文档永远不会自动发生。

#### 11. 维护与管理：`/openflow-status` & `/openflow-config`
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

### 🤖 给 LLM Agent（推荐）

复制这段提示词到你的 LLM Agent（Claude Code、AmpCode、Cursor、Trae、Qoder 等）：

```
Install and configure OpenFlow by following the instructions here:
https://raw.githubusercontent.com/fastknifes/openflow/main/docs/guide/installation.md
```

> **给 LLM Agent**：获取安装指南并照做：
> ```bash
> curl -fsSL https://raw.githubusercontent.com/fastknifes/openflow/main/docs/guide/installation.md
> ```

---

### 手动安装

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

OpenFlow 支持三种配置来源，优先级从高到低：

1. 项目根目录的 **`openflow.json`**
2. 项目根目录的 **`openflow.jsonc`**（支持注释）
3. `opencode.json` 中顶层 **`openflow`** 字段

找到的第一个来源生效，不会跨来源深度合并。

### 独立配置文件（`openflow.json` 或 `openflow.jsonc`）

在项目根目录创建 `openflow.json`（或 `openflow.jsonc`）。文件直接包含 OpenFlow 配置对象：

```json
{
  "paths": {
    "changes": "docs/changes",
    "archive": "docs/archive",
    "current_requirements": "docs/current/requirements",
    "current_design": "docs/current/design",
    "current_spec": "docs/current/spec",
    "current_workflow": "docs/current/workflow",
    "builds": ".sisyphus/builds",
    "plans": ".sisyphus/plans",
    "acceptance_state": ".sisyphus/acceptance.local.md",
    "feature_state": ".sisyphus/feature",
    "change_units": ".sisyphus/change-units.json",
    "guardian_state": ".sisyphus/openflow/guardian"
  },
  "feature": {
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
  },
  "writingPlan": {
    "enabled": true
  },
  "guardian": {
    "enabled": true,
    "auto_fix": true
  }
}
```

### 嵌入 `opencode.json`

如果你希望把所有配置放在 `opencode.json` 中，使用顶层 `openflow` 对象。这是最低优先级的来源：

```json
{
  "plugins": ["@fastknife/openflow"],
  "openflow": {
    "paths": {
      "plans": ".custom/plans"
    },
    "feature": {
      "trigger_mode": "always"
    }
  }
}
```

---

## 📈 OpenFlow 能带来什么

| 指标 | 没有 OpenFlow | 有 OpenFlow |
|------|--------------|-------------|
| 需求追溯耗时 | 手动搜索 + 猜测 | 打开 implementation-mapper.md，5 秒定位 |
| 偏离发现时机 | 上线后用户投诉 | 计划里程碑检查点检测，质量门验证 |
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
│  │  - 上下文注入   │  │  - 契约标记 (Contract Markers) │  │
│  │  - 任务执行     │  │  - 漂移守卫 (Drift Guardian)   │  │
│  │  - 工具链       │  │  - 证据收集 (Evidence)         │  │
│  │                 │  │  - AI 反思 (AI Reflection)      │  │
│  │                 │  │  - 实现映射 (Mapping)           │  │
│  └─────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📄 开源协议

MIT License. 由 [fastknife](https://github.com/fastknifes) 开发。
