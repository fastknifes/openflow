---
layout: doc
---

# 配置项参考

OpenFlow 支持通过项目配置调整文档目录、Feature 工作流、验证、归档、加固审查、漂移守护和日志行为。

## 配置源优先级

配置加载优先级从高到低如下：

1. 项目根目录的 `openflow.json`
2. 项目根目录的 `openflow.jsonc`
3. `opencode.json` 中的顶层 `openflow` 键

第一个找到的配置源生效，不会在多个来源之间做深度合并。因此，如果你已经使用 `openflow.json`，`openflow.jsonc` 中的默认配置不会再自动补充到运行配置中。

## `locale` — 语言设置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `locale` | `"zh-CN" \| "en"` | `"zh-CN"` | 控制 OpenFlow 默认使用的语言。中文项目通常保持 `"zh-CN"`。 |

## `paths` — 路径配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `paths.changes` | `string` | `"docs/changes"` | 活跃 Feature 或变更的工作区目录。 |
| `paths.archive` | `string` | `"docs/archive"` | 已完成 Feature、历史记录和归档材料目录。 |
| `paths.current_requirements` | `string` | `"docs/current/requirements"` | 当前有效需求文档目录。 |
| `paths.current_design` | `string` | `"docs/current/design"` | 当前有效设计文档目录。 |
| `paths.current_spec` | `string` | `"docs/current/spec"` | 当前有效规格说明目录。 |
| `paths.current_workflow` | `string` | `"docs/current/workflow"` | 当前工作流约定、AI 反思和协作规则目录。 |
| `paths.builds` | `string` | `".openflow/builds"` | 构建或实现过程输出目录。 |
| `paths.plans` | `string` | `".openflow/plans"` | 生成的计划文件目录。 |
| `paths.acceptance_state` | `string` | `".openflow/acceptance.local.md"` | 本地验收状态记录文件。 |
| `paths.feature_state` | `string` | `".openflow/feature"` | Feature 状态目录。 |
| `paths.change_units` | `string` | `".openflow/change-units.json"` | 变更单元索引文件。 |
| `paths.guardian_state` | `string` | `".openflow/guardian"` | Guardian 漂移守护状态目录。 |
| `paths.boulder_state` | `string` | `".sisyphus/boulder.json"` | OMO 集成使用的 Boulder 状态文件。 |
| `paths.evidence_dir` | `string` | `".openflow/evidence"` | 验证证据、质量门证据等材料目录。 |
| `paths.implementation_runs` | `string` | `".openflow/runs"` | 实现运行记录目录。 |
| `paths.worktree_dir` | `string` | `".openflow/worktree"` | Worktree 隔离执行目录。 |

## `feature` — Feature 管理

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `feature.enabled` | `boolean` | `true` | 是否启用 Feature 工作流。 |
| `feature.trigger_mode` | `"smart" \| "always" \| "never"` | `"smart"` | Feature 触发模式：智能判断、总是触发或禁用。 |
| `feature.generate_prd` | `boolean` | `true` | 创建 Feature 时是否生成 PRD 类文档。 |
| `feature.closure.enabled` | `boolean` | `true` | 是否启用 Feature 闭环判断。 |
| `feature.closure.auto_transition` | `boolean` | `true` | 是否在满足闭环信号后自动进入正式文档或下一阶段。 |
| `feature.closure.strong_signals` | `string[]` | `["按这个做", "按这个方案推进", "生成正式文档", "就按这个方向", "go with this", "proceed with this", "generate formal docs"]` | 直接触发闭环的强信号短语。 |
| `feature.closure.weak_signals` | `string[]` | `["可以", "好", "确认", "没问题", "done", "looks good", "approved"]` | 可累计的弱信号短语。 |
| `feature.closure.weak_signal_threshold` | `number` | `2` | 弱信号累计达到该阈值后触发闭环。 |

## `tdd` — TDD 配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `tdd.enabled` | `boolean` | `true` | 是否启用 TDD 指导。启用后，AI 可在计划或实现阶段注入测试优先、失败用例和验证要求。 |

## `verification` — 验证配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `verification.in_plan` | `boolean` | `true` | 是否在计划阶段嵌入验证步骤。 |
| `verification.security` | `Array<"secret" \| "vuln" \| "dependency">` | `["secret", "vuln"]` | 安全检查类别。 |
| `verification.quality` | `Array<"lint" \| "typecheck" \| "test" \| "format">` | `["lint", "typecheck", "test"]` | 质量检查类别。 |
| `verification.auto_fix` | `boolean` | `false` | 验证失败时是否允许自动修复。 |
| `verification.completion_prompt` | `boolean` | `true` | 完成时是否提示验证和收尾信息。 |
| `verification.allow_accept_failures` | `boolean` | `true` | 是否允许在验收环节记录并接受失败项。 |

## `acceptance` — 验收配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `acceptance.enabled` | `boolean` | `true` | 是否启用验收辅助。 |
| `acceptance.trigger_words_zh` | `string[]` | `["调整", "改一下", "测试发现", "验收", "检查", "问题", "还有问题", "需要改"]` | 中文验收或返工触发词。 |
| `acceptance.trigger_words_en` | `string[]` | `["adjust", "fix", "test found", "acceptance", "check", "issue", "tweak", "modify"]` | 英文验收或返工触发词。 |
| `acceptance.doc_sync_prompt` | `boolean` | `true` | 验收发现需求或行为变化时，是否提示同步文档。 |
| `acceptance.drift_detection` | `boolean` | `true` | 是否检测实现、验收反馈和文档之间的漂移。 |

## `archive` — 归档配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `archive.enabled` | `boolean` | `true` | 是否启用归档能力。 |
| `archive.drift_check` | `boolean` | `true` | 归档前是否检查文档和实现之间的漂移。 |
| `archive.auto_promote_current` | `boolean` | `true` | 归档时是否自动把仍然有效的事实提升到 `docs/current/`。 |

## `writingPlan` — 写计划配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `writingPlan.mode` | `"pyramid" \| "pattern" \| "mixed" \| false` | `"pyramid"` | 写计划模式：`pyramid` 强调金字塔结构，`pattern` 强调模式化任务，`mixed` 混合两者，`false` 表示禁用。 |

## `harden` — 加固审查配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `harden.enabled` | `boolean` | `true` | 是否启用加固审查能力。 |
| `harden.maxRounds` | `number` | `1` | 最大审查轮次。 |
| `harden.maxArgumentRoundsPerFinding` | `number` | `2` | 每个发现允许的最大辩论或反驳轮次。 |
| `harden.reviewerModel` | `string` | 未配置 | 审查者使用的模型，格式为 `providerID/modelID`。不配置时使用 opencode 默认模型。 |
| `harden.executorModel` | `string` | 未配置 | 执行者使用的模型，格式为 `providerID/modelID`。不配置时使用 opencode 默认模型。 |

## `guardian` — 漂移守护配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `guardian.enabled` | `boolean` | `true` | 是否启用 Guardian 漂移守护。 |
| `guardian.auto_start` | `boolean` | `true` | 是否自动启动漂移守护。 |
| `guardian.auto_fix` | `boolean` | `true` | 是否允许自动修复可处理的漂移。 |
| `guardian.max_retries` | `number` | `3` | 自动修复或重试的最大次数。 |
| `guardian.contract_cache` | `boolean` | `true` | 是否缓存契约信息以辅助漂移检测。 |

## `logging` — 日志配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `logging.level` | `"debug" \| "info" \| "warn" \| "error"` | `"info"` | 日志级别。 |
| `logging.output` | `"console" \| "file" \| "both"` | `"console"` | 日志输出目标。 |
| `logging.path` | `string` | `".openflow/logs"` | 日志文件目录。 |
| `logging.maxFiles` | `number` | `7` | 保留的最大日志文件数。 |
| `logging.categories` | `"all" \| string[]` | `"all"` | 日志分类过滤。可指定 `harden`、`session`、`quality_gate`、`config`、`drift`、`orchestrator`、`feature`、`archive`、`default` 等分类。 |
| `logging.format` | `"text" \| "json"` | `"text"` | 日志格式。 |

## `executionQualityPolicy` — 执行质量策略

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `executionQualityPolicy.enabled` | `boolean` | `true` | 是否启用执行质量策略。 |
| `executionQualityPolicy.defaultMode` | `"fast" \| "balanced" \| "strict"` | `"balanced"` | 默认质量模式：快速、均衡或严格。 |

## 相关页面

- [快速开始](/介绍/quickstart)
- [命令速查](/使用指南/reference/commands)
- [TDD 亮点](/使用指南/highlights/tdd)
