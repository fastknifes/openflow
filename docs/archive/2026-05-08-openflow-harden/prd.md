# openflow-harden - Product Requirements Document

**Date**: 2026-05-08
**Version**: 1.1
**Priority**: P1
**Status**: Archived

---

## 1. 功能描述

### 1.1 背景与目标

OpenFlow 原有 `implement → verify → archive` 工作流中，verify 负责收集测试、类型检查、lint 和文档对齐证据，并判断 readiness。它不负责深度代码审查，也不回答实现是否存在隐藏 bug、spec 偏离或回归风险。

对于重要变更、复杂实现和多文件重构，implement 完成后如果直接进入 verify，可能出现 verify 通过但仍存在隐蔽缺陷的问题。因此需要一个位于 implement 与 verify 之间的可选对抗式质量加固阶段。

### 1.2 功能概述

新增 `/openflow-harden <feature>` 命令，通过 reviewer / executor / coordinator 三角色进行多轮审查与修复。Reviewer 只读审查实现，Executor 最小化修复阻塞问题，Coordinator 控制轮次、过滤 findings 并判断收敛。

---

## 2. 用户故事

| ID | 角色 | 需求 | 目的 |
|----|------|------|------|
| US-001 | 项目维护者 | 在复杂变更完成后运行 `/openflow-harden` | 在 verify 前发现隐藏 bug、spec 偏离和高置信回归风险 |
| US-002 | Reviewer | 审查必须锚定 plan、design、decisions 和 current | 避免提出超出设计范围的新需求 |
| US-003 | Executor | 只修复 blocking bug、spec violation 和高置信 regression risk | 保持修复最小化，避免风格偏好驱动改动 |

---

## 3. 验收标准

### 3.1 功能验收

- [x] 支持 `/openflow-harden <feature>` 命令入口
- [x] 支持 `--full`、`--mode quick|standard|deep`、`--max-rounds N` 参数
- [x] 按 trivial / simple / complex 对变更复杂度分级
- [x] Reviewer findings 按 `blocking_bug`、`spec_violation`、`regression_risk`、`test_gap`、`design_ambiguity`、`style_or_preference` 分类
- [x] 仅 blocking bug、spec violation 和高置信 regression risk 驱动自动修复
- [x] 对 design ambiguity 停止并交给用户决策

### 3.2 非功能验收

- [x] 不替代 verify，不输出 canonical readiness
- [x] 不默认强制运行，作为 implement 与 verify 之间的可选阶段
- [x] 通过最大轮次和复杂度分级控制成本
- [x] trivial 变更不进入完整对抗循环

---

## 4. 功能范围

### 4.1 In Scope

- `/openflow-harden <feature>` 命令
- reviewer / executor / coordinator 三角色流程
- finding 分类、过滤与收敛规则
- complexity grading 与 harden mode 参数
- harden result 记录与测试覆盖

### 4.2 Out of Scope

- 替代 `/openflow-verify`
- 成为所有变更的默认必跑流程
- 输出 canonical archive readiness
- 为 trivial/simple 变更强制运行完整多轮对抗循环

---

## 5. 优先级

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 命令入口 | P0 | harden 阶段的用户入口 |
| Finding 分级与过滤 | P0 | 决定哪些问题可以驱动修复 |
| 多轮对抗循环 | P1 | complex 变更的核心质量加固机制 |
| Complexity grading | P1 | 控制成本并避免 trivial 滥用 |
| 模型与 Omo 集成策略 | P2 | 提升 reviewer/executor 分工质量 |

---

## 6. 相关文档

- [设计文档](./design.md)
- [执行计划](../../.sisyphus/plans/openflow-harden.md)

---

## 7. 变更历史

| 日期 | 版本 | 变更内容 | 作者 |
|------|------|----------|------|
| 2026-05-08 | 1.0 | 初始版本（模板） | - |
| 2026-05-13 | 1.1 | 填充真实需求内容，与归档 design.md 对齐 | - |
