---
layout: doc
---

# 合约与约束扫描

从设计文档、架构决策和反思记录中提取约束规则，并在实现阶段自动扫描代码是否违反这些约束。

## 它是什么

合约与约束扫描（Contract Scanning）是 OpenFlow 的设计-实现桥接层。它由四个核心模块组成：

- **Contract Extractor（合约提取器）** — 从 `behavior.md` 提取行为场景（Given/When/Then），从 `design.meta.json` 提取对齐项（模块、文件、期望符号），从设计文档和决策文档提取约束，汇总为 `OpenFlowContract`
- **Constraint Scanner（约束扫描器）** — 扫描 `docs/current/` 下的约束章节、`docs/decisions/` 下的 ADR 决策文档、以及 `ai-reflection/` 下的反思纠正规则，识别带有 `must`、`locked`、`@stable` 等标记的约束行
- **Context Resolver（上下文解析器）** — 根据计划中引用的文件路径，对扫描到的约束进行相关性评分（精确匹配、前缀匹配、通配符匹配、关键词匹配），过滤出最相关的约束包
- **Contract Runtime（合约运行时）** — 单例运行时管理合约的加载、缓存、文件变更事件的分发和消费者注册

## 为什么需要它

设计文档中通常会包含大量的约束声明（"必须使用 X"、"不得修改 Y"、"Z 接口稳定不可变"）。在传统工作流中，这些约束只存在于文档中，没有机制确保实现真正遵守了它们。当约束散落在多个文档中时，人工检查几乎不可能。

合约与约束扫描将这些隐性约束转化为可机器检查的显性规则，在实现阶段持续守护。

## 适用场景

- 从设计文档中提取模块对齐项和期望符号，供 [漂移检测](./drift-detection.md) 使用
- 生成约束包（constraints.md），在实现执行前注入相关约束作为上下文
- 扫描架构决策（ADR）中的强制规则，确保新代码不违反已确立的架构约束
- 将 AI 反思纠正规则纳入约束扫描范围，防止重复犯错

## 与其他功能的关系

- 提取的 `OpenFlowContract` 是 [设计漂移检测](./drift-detection.md) 的输入
- 约束包在 [Harden 对抗审查](./harden.md) 阶段作为评审依据
- [质量门](/guide/how-it-works/quality-gate) 使用约束扫描结果评估实现就绪性
- [AI 自我反思](./ai-reflection.md) 的纠正规则通过 `scanReflectionDocs` 被纳入约束扫描
