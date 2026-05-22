---
layout: doc
---

# 智能归档与 DDD 限界上下文

本文档介绍 OpenFlow 的智能归档机制，包括 DDD 限界上下文的应用和异步归档流程。

## 归档即权威边界

OpenFlow 的归档不是简单的文件移动，而是一个正式的工程行为：

- `quality-gate` 产生证据和就绪分类
- `archive` 冻结历史、更新 current 事实、生成实施映射
- 使"完成"成为一个明确的工程状态

## DDD 限界上下文

OpenFlow 在归档过程中应用 DDD（领域驱动设计）的限界上下文理念：

- 每个功能/变更拥有明确的边界
- 归档时识别并记录限界上下文的变更
- 确保 `docs/current/` 准确反映系统的当前语义边界

## 归档流程

```
/openflow-archive <feature>
  → 规范化：将工作文档移至 docs/archive/
  → 提升：更新 docs/current/ 反映新系统状态
  → 映射：生成 implementation-mapper.md 实现永久追溯
```

## implementation-mapper.md

归档的核心产出物之一，提供需求到代码的精确映射：

- 需求精确映射到具体文件、函数、符号
- 永久追溯："这段代码为什么存在？"
- 新团队成员快速定位的关键工具

> 本文档正在建设中，更多归档策略和高级用法将持续补充。
