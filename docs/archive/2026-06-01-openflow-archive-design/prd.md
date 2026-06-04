# openflow-archive-design - Product Requirements Document

**Date**: 2026-06-01
**Version**: 1.0
**Priority**: P1
**Status**: Draft

---

## 1. 功能描述

### 1.1 背景与目标

TBD: 此功能要解决什么问题？为什么需要这个功能？

### 1.2 功能概述

将 `handleArchive` 从单一巨型函数重构为阶段化的管道。管道由一个薄命令处理器驱动，根据归档模式（planned / ad-hoc）选择不同的验证和产物生成策略。 ### 归档模式 | 模式 | 触发条件 | 验证要求 | 产物 | |------|----------|----------|------| | **planned** | 匹配的 acceptance state 存在且 readiness 有效 | 完整 readiness/harden/drift 检查 | design, plan, prd, behavior, implementation-mapper, issue artifacts, promotion | | **ad-hoc** | 无匹配的 acceptance state，或有代码变更但无 feature 工作流 | 最小验证（feature 名有效、无阻断状态） | issue-resolution, issue-clarification, 变更记录 | ## Problem ### 当前痛点 1. **单一巨型函数**: `ha

---

## 2. 用户故事

TBD: 暂无用户故事

---

## 3. 验收标准

### 3.1 功能验收

- TBD: 验收标准待补充

### 3.2 非功能验收

- [ ] TBD: 性能要求
- [ ] TBD: 安全要求
- [ ] TBD: 兼容性要求

---

## 4. 功能范围

### 4.1 In Scope

- 关键假设
- 归档模式
- 当前痛点
- 期望状态
- G-001: 阶段化架构
- G-002: ad-hoc 归档模式
- G-003: 向后兼容
- G-004: 职责解耦
- 与现有 archive-workflow.md 的对齐
- 必须约束
- 数据契约
- 故障语义
- 集成边界
- Unit Tests
- Integration Tests
- Regression Tests
- Findings
- Constraint Coverage Matrix

### 4.2 Out of Scope

- TBD: 非功能点待补充

---

## 5. 优先级

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 核心功能 | P0 | 必须实现 |
| 重要功能 | P1 | 应该实现 |
| 增强功能 | P2 | 可以实现 |
| 未来功能 | P3 | 暂不实现 |

---

## 6. 相关文档

- [设计文档](./design.md)
- [执行计划](../../.openflow/plans/openflow-archive-design.md)

---

## 7. 变更历史

| 日期 | 版本 | 变更内容 | 作者 |
|------|------|----------|------|
| 2026-06-01 | 1.0 | 初始版本 | - |
