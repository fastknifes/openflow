---
layout: doc
---

# 功能亮点

## 1. 证据门控，而不是“AI 说完成了”

`openflow-quality-gate` 是实现后的最终质量入口。AI 完成代码或 bug 修复后必须调用它，由它统一处理：

![质量门执行原理](/diagrams/quality-gate.svg)

- 是否需要对抗性 harden；
- 现有 lint / typecheck / test / build 证据是否新鲜且覆盖到变更；
- 是否存在设计漂移或上下文不足；
- readiness 是 `Ready`、`ReadyWithDocUpdates`、`NotReady` 还是 `NeedsDecision`。

`/openflow-harden` 和 `/openflow-verify` 不再是正常手动流程入口，它们的能力已经合并到质量门中。

## 2. 归档是权威边界

![归档工作原理](/diagrams/archive.svg)

`/openflow-archive` 不只是移动文件。它会把完成的 feature/issue 固化为可追溯记录：

- 冻结 `docs/changes/*` 到 `docs/archive/*`；
- 按需要提升 `docs/current/*` 当前事实；
- 生成 `implementation-mapper.md`，回答“为什么这些代码存在”。

## 3. implementation-mapper 让代码有来历

归档产物不是简单的 changed files 清单，而是需求/设计约束到代码符号和验证证据的映射：

| 追溯问题 | implementation-mapper 回答 |
|---|---|
| 哪条需求导致了这段代码？ | 追溯来源与需求/决策 |
| 改到了哪里？ | 文件和关键符号 |
| 为什么相关？ | 关联说明 |
| 怎么验证？ | 验证证据 |

## 4. 可选集成，但不强绑生态

OpenFlow 的核心能力只要求 OpenCode 插件可用。OMO 和 GitNexus 都是可选增强：

- **OMO**：增强多 Agent 计划与执行编排。
- **GitNexus**：提供代码图谱、影响分析和调用链导航。

如果它们已经安装，安装流程应该复用现有配置；如果没有安装，用户可以选择跳过。

## 5. BDD 指导集成测试证据

OpenFlow 会把 `behavior.md` 里的关键用户行为场景转化为质量门可检查的证据要求。集成测试不只是“跑过测试”，还要能对应到具体行为场景。

![BDD 指导集成测试](/diagrams/bdd-integration.svg)

## 6. 适合棕地项目的长期记忆

OpenFlow 通过 `current / decisions / changes / archive` 把项目知识从聊天记录里拿出来，变成可以被团队和后续 Agent 持续使用的长期记忆。
