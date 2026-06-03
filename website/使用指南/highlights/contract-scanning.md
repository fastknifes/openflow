---
layout: doc
---

# 契约扫描

## 是什么

契约扫描用于在执行新 Feature 前识别已有约束。它由 ContractExtractor、ConstraintScanner、ContextResolver 和 ContractRuntime 组成。

ContractExtractor 提取文档和历史记录中的约束，ConstraintScanner 根据当前任务匹配相关内容，ContextResolver 解析约束适用范围，ContractRuntime 将结果注入执行上下文。

## 为什么需要它

AI 如果只看当前任务，很容易忽略已有设计决策、历史反思和长期约束。例如旧功能的兼容要求、某些路径的命名规则、已知不能重复犯的流程错误，都可能不在当前需求中重复出现。

契约扫描让 AI 在开始实现前看到这些约束。没有它，新功能可能与既有架构冲突，或者重复触发已经记录过的问题。

## 如何使用

在 Feature 阶段，OpenFlow 会自动扫描以下来源：

- `docs/current/`
- `docs/decisions/`
- `docs/current/workflow/ai-reflection/`
- 已归档功能中的关键映射和约束记录

扫描会结合多种匹配方式：

- 精确路径匹配
- 前缀路径匹配
- glob 匹配
- 关键词匹配

匹配到的约束会被整理成约束包，并注入到 Implement 阶段的执行上下文中，帮助实现者避免违反已有契约。

## 与其他机制的关系

契约扫描与 [漂移检测](./drift-detection) 协作。契约扫描负责发现“应该遵守什么”，漂移检测负责检查“现在是否仍然遵守”。

它也与 Implement 阶段的约束包注入相关，并会读取 [AI 反思](./ai-reflection) 产生的流程约束，形成防止重复错误的机制。
