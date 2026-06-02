---
layout: doc
---

# 命令速查

## 用户命令

| 命令 | 作用 |
|---|---|
| `/openflow-init` | 初始化或刷新 `AGENTS.md` 的 OpenFlow 文档导航规则。 |
| `/openflow-feature <feature>` | 进行自然语言设计澄清，生成 feature 工作区。 |
| `/openflow-writing-plan <feature>` | 从设计上下文生成实施计划；保存后停止。 |
| `/openflow-implement <feature>` | 创建 ImplementationRun，并委托 OMO 或 OpenCode 原生执行。 |
| `/openflow-change <feature> "<变更描述>"` | 处理归档前的开发中需求变更。 |
| `/openflow-archive <feature>` | 归档 completed feature/issue，生成追溯映射并提升 current。 |
| `/openflow-migrate-docs --sourceDir <dir>` | 迁移已有文档到 OpenFlow 结构。 |
| `/openflow-status` | 查看 OpenFlow 状态。 |
| `/openflow-config` | 查看当前配置快照。 |

## AI-callable Skill

| Skill | 作用 |
|---|---|
| `openflow-brainstorm` | 需求不清时进行对话式探索，不生成文件。 |
| `openflow-quality-gate` | 实现完成后由 AI 调用，统一 harden / verify 并输出 readiness。 |
| `openflow-ai-reflection` | AI 发现可复现流程错误时记录反思。 |
| `openflow-tdd` | 面向核心业务逻辑的 TDD 指导。 |

## 已废弃的正常入口

| 旧入口 | 当前替代 |
|---|---|
| `/openflow-harden` | `openflow-quality-gate` 内部按风险决定是否 harden。 |
| `/openflow-verify` | `openflow-quality-gate` 内部执行 evidence-aware verify。 |
| `openflow-issue` 作为独立主流程 | Issue 上下文由质量门与归档消费。 |
