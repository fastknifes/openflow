# openflow-json-openflow-jsonc-config-5f332d29 - Implementation Mapper

**Date**: 2026-05-19
**Status**: Archived

## 1. 概述

本次变更重构 OpenFlow 配置系统，统一路径配置到扁平 `paths` 对象，新增 `openflow.json`/`openflow.jsonc` 独立配置文件支持，并移除未正式发布前的旧路径字段。

**归档时间**: 2026-05-19
**追溯范围**: 配置加载、路径解析、运行时调用、测试覆盖、文档更新。

## 2. 需求到实现映射

### Schema 与类型 (`src/types.ts`, `src/config.ts`)

- **需求**: 所有路径统一收敛到扁平 `paths` 对象，移除旧字段。
- **实现**:
  - 新增 `PathsConfig` 接口，包含 12 个必需路径键：`changes`、`archive`、`current_requirements`、`current_design`、`current_spec`、`current_workflow`、`builds`、`plans`、`acceptance_state`、`feature_state`、`change_units`、`guardian_state`。
  - 从 `FeatureConfig`、`ArchiveConfig`、`GuardianConfig` 中移除旧路径字段（`output_dir`、`prd_output_dir`、`state_dir`）。
  - 将默认路径全部迁移到 `defaultConfig.paths`。
  - `configPathSchema` 启用 `.strict()`，拒绝任何旧字段。

### 配置源发现 (`src/utils/config-loader.ts`)

- **需求**: 支持 `openflow.json` 和 `openflow.jsonc` 作为独立配置源，按优先级加载。
- **实现**:
  - 新增 `discoverConfig()` 函数，加载优先级：`openflow.json` > `openflow.jsonc` > `opencode.json` 的 `openflow` 字段。
  - 实现基于最小状态机的 JSONC 注释剥离器（`stripJsoncComments`），不引入外部依赖。
  - 无效独立配置文件会 warn 并返回 null，不会降级到下一级源。

### 运行时集成 (`src/index.ts`)

- **需求**: 启动和配置重载时使用新的配置发现逻辑。
- **实现**:
  - `src/index.ts` 更新为在启动和重载时调用 `discoverConfig()`。
  - 增加 `ctx.directory` 缺失时的保护。

### 路径助手重构 (`src/config.ts`, `src/utils/change-units.ts`)

- **需求**: 所有路径读取必须从 `config.paths` 获取，禁止硬编码。
- **实现**:
  - 从 `src/config.ts` 移除所有硬编码路径常量（`CHANGE_WORKSPACE_DIR`、`CURRENT_SPEC_DIR` 等）。
  - 更新所有路径助手函数为接收 `config` 参数并从 `config.paths` 读取。
  - 移除旧版 design/requirements 候选路径回退逻辑。
  - `src/utils/change-units.ts` 更新为接受可配置的 `changesDir` 和 `changeUnitsPath`。

### 调用方迁移

- **需求**: 所有调用旧路径常量和字段的代码必须迁移到 `config.paths`。
- **实现**:
  - `src/commands/quality-gate.ts`
  - `src/commands/feature.ts`
  - `src/hooks/chat-message.ts`
  - `src/utils/feature-resolver.ts`
  - `src/utils/issue-utils.ts`
  - `src/commands/issue.ts`
  - `src/commands/harden.ts`
  - `src/phases/feature/prd-generator.ts`
  - `src/utils/diff-scope.ts`

### 测试 (`tests/utils/config.test.ts`, `tests/config-guardian.test.ts`, `tests/utils/config-loader.test.ts`, `tests/commands/archive.test.ts`)

- **需求**: 测试必须覆盖新 schema、配置源优先级、JSONC 解析、路径助手行为。
- **实现**:
  - 重写 `tests/utils/config.test.ts` 验证新 schema 和 strict 模式。
  - 重写 `tests/config-guardian.test.ts` 使用 `paths.guardian_state`。
  - 新增 `tests/utils/config-loader.test.ts` 覆盖 JSONC 和源优先级。
  - 更新 `tests/commands/archive.test.ts` 使用新路径。

### 文档 (`README.md`, `README_CN.md`)

- **需求**: 用户文档必须反映新的配置模型和源优先级。
- **实现**:
  - 更新中英文 README 的 Configuration 章节，展示 `paths` 对象、独立配置文件、`openflow.jsonc` 注释支持、源优先级。

## 3. 验证与结论

**验证证据**:
- TypeScript 类型检查：0 errors
- 测试套件：`1482 passed, 0 failed`
- 旧字段在生产代码中残留：无
- 旧常量在生成代码中残留：无
- 遗留测试修复：`tests/commands/feature.test.ts` 中 3 个预先存在的失败测试已通过补充实现修复（continuation request 识别、deep verification）。

**归档备注**:
- 本次归档通过 legacy readiness fallback 路径完成（acceptance state 中未设置 readiness 字段）。
- 无 harden findings、无 drift、无 security failure。
