# implementation-mapper-traceability - Product Requirements Document

**Date**: 2026-05-08
**Version**: 1.1
**Priority**: P1
**Status**: Archived

---

## 1. 功能描述

### 1.1 背景与目标

`generateImplementationMapper` 生成的 `implementation-mapper.md` 存在噪音过多、映射粒度粗、验证证据弱、名实不符等问题。核心变更文件清单直接透传了系统临时路径、外部工作区文件和测试缓存，文档信息密度低。映射表以变更文件为主键，无法回答"哪段代码对应哪条需求"。

### 1.2 功能概述

重新定义 implementation mapper 的职责：首先服务需求追溯，其次才服务归档审计。实现路径过滤排除噪音、需求驱动映射表、符号级提取优先、验证证据可复核、稳定排序和按需章节输出。

---

## 2. 用户故事

| ID | 角色 | 需求 | 目的 |
|----|------|------|------|
| US-001 | 项目维护者 | archive 生成的 implementation-mapper.md 应排除临时目录、外部路径和缓存文件 | 追溯文档只包含仓库内可复核文件 |
| US-002 | 代码审查者 | 映射表应以需求项/设计决策为主键，而非变更文件列表 | 能快速找到"哪段代码对应哪条需求" |
| US-003 | 团队负责人 | 源码文件应优先提取函数/类/方法符号 | 提高追溯精度，超越文件级粒度 |

---

## 3. 验收标准

### 3.1 功能验收

- [x] 路径过滤器拒绝临时目录、外部绝对路径、`..` 遍历路径和缓存目录
- [x] 映射表以需求项/设计决策项为主键构建
- [x] 源码文件优先提取函数、类、方法等符号；无法提取时标记为 `file-level fallback`
- [x] 验证证据包含具体命令、测试文件或用例名
- [x] 相同输入多次生成时输出顺序不变

### 3.2 非功能验收

- [x] 不输出空表格或无意义章节
- [x] 不暴露过滤规则到文档中
- [x] 归档文档不含系统临时路径（如 AppData/Local/Temp）

---

## 4. 功能范围

### 4.1 In Scope

- `src/commands/archive.ts` — 归档流程集成
- `src/phases/archive/implementation-mapper.ts` — 核心映射生成
- `src/phases/archive/code-mapper.ts` — 代码符号提取
- `src/phases/archive/traceability.ts` — 需求追溯逻辑

### 4.2 Out of Scope

- 完整静态分析平台或 AST 级需求追踪引擎
- git diff 行级细节输出
- Git 已能提供的变更文件清单重复输出

---

## 5. 优先级

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 路径过滤 | P0 | 消除噪音的基础 |
| 需求驱动映射 | P0 | 核心追溯能力 |
| 符号级提取 | P1 | 精度提升 |
| 证据可复核 | P1 | 可信度提升 |

---

## 6. 相关文档

- [设计文档](./design.md)
- [执行计划](../../.sisyphus/plans/implementation-mapper-traceability.md)

---

## 7. 变更历史

| 日期 | 版本 | 变更内容 | 作者 |
|------|------|----------|------|
| 2026-05-08 | 1.0 | 初始版本（模板） | - |
| 2026-05-12 | 1.1 | 填充真实需求内容，与归档 design.md 对齐 | - |
