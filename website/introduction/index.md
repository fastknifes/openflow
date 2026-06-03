---
layout: doc
---

# OpenFlow 是什么

OpenFlow 是一个**文档治理工作流**（Documentation Governance Workflow），专为 AI 驱动开发设计。它运行在 [OpenCode](https://github.com/opencode-ai/opencode) 平台上，可选深度集成 oh-my-openagent / oh-my-opencode（omo）多 Agent 编排。

## 一句话说清楚

**OpenFlow 不关心 AI 怎么写代码——它关心 AI 应该改什么、不能碰什么、怎么才算做完了。**

## 为什么需要它

如果你用 AI 辅助开发，你大概率遇到过这些问题：

### 🫠 "AI 改了不该改的东西"

你让 AI 修一个按钮的颜色，它顺手重构了整个组件库。你让它加一个字段，它改了数据库 schema。

OpenFlow 的回答：**行为文档约束**。`docs/current/` 中的事实是 AI 必须遵守的契约，`docs/changes/` 中的设计定义了变更边界——越界就是违规。

### 🤷 "AI 说做完了，但我不知道能不能信"

"I think it is fixed" 不等于真的修好了。AI 的"完成"声明没有可追溯的证据。

OpenFlow 的回答：**证据门控**。质量门要求 lint、typecheck、test 全部通过，行为证据文件必须新鲜有效。高风险变更还要经过对抗性硬化审查。最后输出一个机器可读的就绪分类——Ready / NotReady / NeedsDecision。

### 🌀 "三个月后没人知道这段代码为什么存在"

AI 改了代码就走了。没有设计记录，没有变更追溯，新成员面对一堆"祖传代码"无从理解。

OpenFlow 的回答：**归档即权威**。每次归档冻结历史、更新当前事实、生成 `implementation-mapper.md`——需求到代码的精确映射。从此每一段代码都有"出生证明"。

### 🧠 "换了个 Agent，之前的知识全丢了"

AI 会话是短暂的。关掉对话窗口，之前的上下文就没了。换个 Agent，一切从零开始。

OpenFlow 的回答：**三层文档结构**。`docs/current/`（当前事实）、`docs/changes/`（活跃变更）、`docs/archive/`（冻结历史）——项目知识独立于任何 Agent 会话持续存在。

## 一条主工作流，先澄清再实施

### Feature 工作流 —— 从想法到归档

```
brainstorm → feature → writing-plan → implement → quality-gate → archive
```

适用于：新功能、需求修改、重构、技术债清理——你大致知道自己要做什么，或者可以通过对话把边界澄清出来的情况。

| 阶段 | 做什么 | 入口 |
|------|--------|------|
| 头脑风暴 | 自由对话探索想法，理清意图 | 自然语言要求 AI brainstorm，或调用 `openflow-brainstorm` skill |
| 特性设计 | 收集事实，生成设计文档和行为约束 | `/openflow-feature` |
| 开发计划 | 将设计转化为可执行的任务分解 | `/openflow-writing-plan` |
| 执行 | 在隔离环境中将计划落地为代码 | `/openflow-implement` |
| 质量门 | 证据验证、风险评估、就绪分类 | 自动调用（`openflow-quality-gate`） |
| 归档 | 冻结历史、更新事实、生成追溯映射 | `/openflow-archive` |

### 如果问题还不清楚怎么办？

不要急着运行实现命令。先让 AI 进入头脑风暴或只读调查：

```text
我们先 brainstorm 这个问题，不要写代码。请先帮我判断它是需求不清、Bug、数据异常，还是配置/环境问题。
```

当问题被分类、边界足够清晰后，再用 `/openflow-feature <描述>` 进入正式 Feature 工作流。OpenFlow 的原则是：**不确定时先调查，明确后再建档，建档后再实施**。

## 核心设计原则

### 1. 先澄清边界，再写代码

过早进入形式化流程会导致设计方向偏移。头脑风暴阶段让你在提交到正式工作流之前，把想法理清楚——不产生任何正式文档，只做低成本探索。

### 2. 证据即完成标准

完成不是一个对话中的声明，而是一个工程状态：
- `Ready` → 可以归档
- `ReadyWithDocUpdates` → 补充文档后可归档
- `NotReady` → 存在未解决的问题
- `NeedsDecision` → 需要人工决策

### 3. 归档即权威边界

归档不是把文件挪个位置：
1. `quality-gate` 产出证据和就绪判定
2. `archive` 冻结历史、更新 current 事实、生成实施映射
3. "完成"是一个明确的工程状态，不是口头声明

### 4. 文档即行为契约

文档不仅仅是给人看的，它同时约束 AI 的行为：
- `docs/current/*` 中的事实 → AI 执行时必须遵守
- `docs/changes/*` 中的设计 → AI 不能超出变更边界
- `docs/decisions/*` 中的决策 → AI 做技术选择的约束条件
- `docs/archive/*` 中的记录 → 不可变的历史权威

## 适合谁

- **独立开发者**用 AI 辅助维护棕地项目——OpenFlow 帮你保持项目知识不随会话丢失
- **团队**使用 AI Agent 协作开发——OpenFlow 提供统一的变更治理和追溯
- **开源项目维护者**——OpenFlow 让 AI 贡献者的每次变更都有设计记录和证据验证

## 下一步

- [10 分钟上手 →](/getting-started/quickstart) —— 安装、初始化、跑一遍完整工作流
- [核心概念 →](./concepts) —— 深入理解行为文档约束、目录划分、漂移检测
- [工程哲学 →](./philosophy) —— 了解这些设计决策背后的 rationale
