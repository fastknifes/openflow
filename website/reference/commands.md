---
layout: doc
---

# 命令速查

本文档提供 OpenFlow 所有核心命令与高级命令的快速参考。

## 核心命令

| 命令 | 说明 |
|------|------|
| `/openflow-init` | 初始化项目，写入 `AGENTS.md` 文档导航指南 |
| `/openflow-feature <feature>` | 设计一个功能（模式一：明确边界的工作） |
| `/openflow-writing-plan <feature>` | 从设计生成结构化实施计划 |
| `/openflow-implement <feature>` | 创建实施运行并委托执行 |
| `/openflow-issue <problem>` | 调查一个问题（模式二：边界不明确的工作） |
| `openflow-quality-gate` | AI 自动调用的质量门（非用户命令） |
| `/openflow-archive <feature>` | 归档已完成的功能，生成追溯映射 |

## 高级命令

| 命令 | 说明 |
|------|------|
| `/openflow-change <feature> "<变更描述>"` | 开发过程中的需求变更 |
| `/openflow-status` | 查看所有活跃功能会话的状态 |
| `/openflow-config` | 查看或更新 OpenFlow 配置 |
| `/openflow-migrate-docs` | 从其他工作流迁移文档到 OpenFlow 结构 |

## Issue 子命令标志

| 标志 | 说明 |
|------|------|
| `--readonly` | 只读调查，不修改文件 |
| `--write-doc` | 将调查文档输出到 `docs/changes/` |
| `--resolve` | 确认修复并生成解决方案产物 |
| `--continue` | 继续之前的调查 |

> 本文档正在建设中，更多详细用法和示例将持续补充。
