# OpenFlow 命令命名约定：中划线分隔符

**日期**: 2026-05-08
**状态**: Accepted
**适用范围**: OpenFlow 所有命令的命名与文档引用；不适用于 AI-callable Skill 名称

## 1. 背景

OpenCode 命令系统使用中划线 (`-`) 作为命令分隔符，而不是斜杠 (`/`)。但在不同的 OpenFlow 文档与实现中，命令名称反复在两种格式之间横跳：

- 正确格式: `/openflow-feature`、`/openflow-archive`
- 错误格式: `/openflow/feature`、`/openflow/verify`、`/openflow/archive`

使用斜杠 (`/`) 作为分隔符会导致 OpenCode 命令系统无法正确识别，产生报错。

## 2. 决策

**OpenFlow 所有命令统一使用中划线 (`-`) 作为分隔符。**

### 2.1 命令命名规范

| 命令功能 | 正确格式 |
|----------|----------|
| 初始化 | `/openflow-init` |
| 头脑风暴 | `/openflow-feature <feature>` |
| 迁移文档 | `/openflow-migrate-docs <source-dir>` |
| 变更管理 | `/openflow-change <feature>` |
| 编写计划 | `/openflow-writing-plan <feature>` |
| 归档 | `/openflow-archive <feature>` |
| 状态查询 | `/openflow-status` |
| 配置管理 | `/openflow-config` |

### 2.2 禁止格式

以下格式 **禁止** 出现在任何文档、代码、提示词或配置中：

- `/openflow/feature` (应为 `/openflow-feature`)
- `/openflow/init` (应为 `/openflow-init`)
- `/openflow/archive` (应为 `/openflow-archive`)
- `/openflow/status` (应为 `/openflow-status`)
- `/openflow/config` (应为 `/openflow-config`)
- `/openflow/migrate-docs` (应为 `/openflow-migrate-docs`)
- `/openflow/change` (应为 `/openflow-change`)
- `/openflow/writing-plan` (应为 `/openflow-writing-plan`)

## 3. 理由

1. **OpenCode 命令系统要求**: OpenCode 使用中划线 (`-`) 作为命令结构的分隔符，斜杠 (`/`) 不被支持，会导致命令无法识别
2. **一致性**: 所有命令遵循同一命名约定，避免 AI Agent 在生成文档或执行命令时混淆
3. **可维护性**: 统一的命名约定降低文档维护成本，避免反复修正

## 4. 执行

以下文件必须在引用 OpenFlow 命令时使用中划线格式：

1. `README.md` / `README_CN.md` — 用户手册
2. `docs/decisions/*.md` — 架构决策记录
3. `docs/current/**/*.md` — 当前有效事实文档
4. `docs/changes/**/*.md` — 进行中的变更文档
5. `.sisyphus/plans/*.md` — 开发计划
6. 所有 Agent 提示词和系统配置

## 5. 不适用范围

- Skill 文件路径（如 `openflow/brainstorm` 指代 skill 文件路径）不受此规定约束，因为那是文件系统路径，不是 OpenCode 命令
- AI-callable Skill 名称（如 `openflow-quality-gate`）不受 slash-command 命名表约束；该 Skill 是代码完成后的质量门，不是 `/openflow-*` 手动命令
- 第三方或外部系统引用 OpenFlow 命令时仍可能出现斜杠格式，但这属于该系统的实现细节，不改变 OpenFlow 自身的命名约定
