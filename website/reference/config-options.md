---
layout: doc
---

# 配置项参考

本文档提供 OpenFlow 所有配置项的详细参考。配置支持三个来源，优先级从高到低：

1. 项目根目录的 `openflow.json`
2. 项目根目录的 `openflow.jsonc`（支持注释）
3. `opencode.json` 中的顶层 `openflow` 键

> 第一个找到的来源生效，不存在跨来源的深度合并。

## paths — 路径配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `paths.changes` | `docs/changes` | 活跃变更工作区目录 |
| `paths.archive` | `docs/archive` | 归档目录 |
| `paths.current_requirements` | `docs/current/requirements` | 当前有效需求 |
| `paths.current_design` | `docs/current/design` | 当前有效设计 |
| `paths.current_spec` | `docs/current/spec` | 当前有效规格 |
| `paths.current_workflow` | `docs/current/workflow` | 当前工作流约定 |
| `paths.builds` | `.sisyphus/builds` | 构建产物目录 |
| `paths.plans` | `.sisyphus/plans` | 计划文件目录 |
| `paths.acceptance_state` | `.sisyphus/acceptance.local.md` | 验收状态文件 |
| `paths.feature_state` | `.sisyphus/feature` | 功能状态目录 |
| `paths.change_units` | `.sisyphus/change-units.json` | 变更单元文件 |
| `paths.guardian_state` | `.sisyphus/openflow/guardian` | Guardian 状态目录 |

## feature — 功能工作流

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `feature.enabled` | `true` | 是否启用功能工作流 |
| `feature.auto_trigger` | `true` | 是否自动触发 |
| `feature.trigger_mode` | `"smart"` | 触发模式：`"smart"` 或 `"always"` |

## tdd — 测试驱动开发

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `tdd.enabled` | `true` | 是否在计划中自动注入 TDD 要求 |
| `tdd.expand_threshold` | `3` | 触发 TDD 展开的复杂度阈值 |

## verification — 验证

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `verification.in_plan` | `true` | 是否在计划中嵌入验证步骤 |
| `verification.security` | `["secret", "vuln"]` | 安全检查项 |
| `verification.quality` | `["lint", "typecheck", "test"]` | 质量检查项 |

## archive — 归档

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `archive.enabled` | `true` | 是否启用归档功能 |
| `archive.auto_promote_current` | `true` | 归档时是否自动提升 current 事实 |

## writingPlan — 编写计划

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `writingPlan.enabled` | `true` | 是否启用计划编写 |

## guardian — 漂移检测

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `guardian.enabled` | `true` | 是否启用漂移检测 |
| `guardian.auto_fix` | `true` | 是否自动修复检测到的漂移 |

> 本文档正在建设中，更多配置示例和最佳实践将持续补充。
