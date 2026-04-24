# 文档迁移命令设计方案

**日期**: 2026-04-22
**Feature**: docs-migration-command
**状态**: Design

---

## 背景

OpenFlow 已经建立了清晰的文档治理体系（`docs/current/`、`docs/changes/`、`docs/archive/`、`docs/decisions/`、`docs/references/`），但许多存量项目或外部引入的文档仍然使用非标准结构。这些文档可能来自其他 AI IDE（Cursor、Trae、Kiro）、其他工作流框架（OpenSpec、Spec Kit、Superpowers）或传统文档目录。

当前缺少一个系统化的迁移工具，能够：

1. 识别并解析多种来源的文档结构
2. 按语义分类并映射到 OpenFlow 的目标结构
3. 在迁移过程中保持文档的语义完整性与可追溯性
4. 处理冲突、过期、低置信度内容的合理归属
5. 在删除原始文档时提供安全确认机制

本方案设计 `/openflow/migrate-docs <source-docs-dir>` 命令，用于将外部文档体系迁移至 OpenFlow 标准结构。

## 目标

文档迁移命令需要满足以下目标：

1. **支持多源适配**：识别 OpenSpec、Spec Kit、Kiro、Trae、Cursor 等已知来源，以及通用文档结构
2. **语义优先分类**：基于内容语义而非仅文件名判断文档归属（workflow/design/spec/requirements/ADR candidates/references）
3. **澄清驱动流程**：默认先输出报告并澄清，而非直接执行迁移；按主题/冲突批次澄清，而非逐文件询问
4. **安全处置源文档**：提供复制后询问模式，删除操作永不自动，需要二次确认
5. **生成标准结构**：最终输出符合 ADR-001 的 OpenFlow 文档结构（index.md、current/、changes/、archive/、decisions/、references/）
6. **支持状态持久化**：支持长时间运行的迁移任务中断后恢复
7. **项目上下文感知**：可读取项目上下文以辅助分类和命名，但不修改代码或推断过度

## 非目标

以下内容不属于本次设计范围：

1. 不将本命令作为 `openflow/init` 的升级或替代
2. 不自动删除任何源文档，删除必须显式确认
3. 不自动将低置信度内容提升为 current/decisions/archive 级别
4. 不替代用户做全局决策，ADRs 仍需用户确认
5. 不要求源项目必须先完成 OpenFlow 初始化
6. 不自动推断新的业务事实或需求（仅从现有文档迁移）

## 命令定位

`/openflow/migrate-docs <source-docs-dir>` 是一个独立的显式命令，不是 init 升级，也不是自动触发的流程。

### 产品形态

- **命令格式**: `/openflow/migrate-docs <source-docs-dir> [--target <target-dir>] [--dry-run]`
- **默认行为**: 先输出报告与澄清，再执行实际迁移（类 brainstorm 向导模式）
- **目标位置**: 默认为源项目的根目录（而非当前 OpenFlow 仓库）

### 与 init 的关系

- 若源项目未初始化 OpenFlow 结构，命令会询问是否初始化
- 不强制要求先运行 `openflow/init`，但会提示缺失的 docs guide

### 核心设计决策

本命令是**新命令**，不是现有命令的升级：

> 这是一个新的命令，不是 init 升级；预期命令形式为 `/openflow/migrate-docs <source-docs-dir>`

## 用户体验

### 主流程

```
用户运行 /openflow/migrate-docs <source-docs-dir>
  -> 检测阶段：识别源目录结构与文档类型
  -> 扫描阶段：建立清单（inventory）
  -> 分类阶段：按语义将文档映射到目标位置
  -> 澄清阶段：按主题/冲突批次询问用户确认
  -> 计划阶段：生成迁移计划
  -> 应用阶段：执行实际文件操作
  -> 清理阶段：处置源文档、生成报告
```

### 默认行为：报告先行

默认行为是**报告/澄清优先**：

> 默认行为是先输出报告并澄清；命令表现为 brainstorm 风格的迁移向导

首次运行后，用户会看到：

1. 源文档结构概览
2. 检测到的文档类型统计
3. 分类映射草案
4. 需要澄清的主题/冲突列表
5. 下一步选项（继续/调整/取消）

### 源文档处置策略

默认采用**复制优先**模式：

> 默认源文档处理方式：先复制，然后询问是否删除、保留或保存原文到 references/raw；删除永不自动

处置选项：

- **删除**: 需要二次确认，生成无报告模式
- **保留**: 源文档保持原位，生成 Markdown + JSON 双格式报告
- **保存到 references/raw**: 将原文移至 references/raw，然后可选择是否删除原位置

### 删除确认机制

删除原始文档需要严格的二次确认：

> 删除原始文档需要二次确认，显示路径、文件数量，并要求显式短语如 DELETE ORIGINAL DOCS

确认信息包括：
- 待删除的完整路径列表
- 文件总数
- 要求用户输入确认短语（如 "DELETE ORIGINAL DOCS"）

### 无报告删除模式的风险说明

当用户选择删除源文档时，系统**不生成**报告或清单：

> 如果用户保留原始文档，生成双格式报告（Markdown + JSON 清单）；如果用户删除原始文档，不生成报告/清单，也不保留每份文档的源元数据

**风险**: 删除模式下，迁移完成后无法追溯原始文档的来源与分类依据。这是一个产品层面的权衡决策：

- 保留模式：完整可追溯，但源文档冗余
- 删除模式：清洁无冗余，但失去源文档溯源能力

用户必须在确认时明确知晓这一取舍。

## 阶段流程

迁移命令分为七个明确阶段：

> 七个阶段：detect、scan、classify、clarify、plan、apply、cleanup

### Stage 1: Detect（检测）

识别源文档目录的整体结构：

- 检测已知来源类型（OpenSpec、Spec Kit、Kiro、Trae、Cursor）
- 识别通用文档结构（按文件名/目录名模式）
- 输出源类型检测结果

### Stage 2: Scan（扫描）

建立完整清单：

- 遍历所有文档文件
- 记录文件路径、大小、修改时间
- 提取文件名、扩展名、目录上下文
- 生成 inventory 数据结构

### Stage 3: Classify（分类）

按语义将文档映射到目标类别：

- 高置信度当前事实 -> `docs/current/*`
- 过期/历史文档 -> `docs/archive/*`
- 未知/低置信度 -> `docs/references/raw/` 或 `docs/references/notes/`
- 全局决策候选 -> `docs/decisions/`（待确认）
- 待确认列表（pending confirmation）

分类优先级：

> 已知来源适配器优先于通用 AI 分类：OpenSpec、Spec Kit、Kiro、Trae、Cursor、通用文档

### Stage 4: Clarify（澄清）

按主题/冲突批次与用户确认：

> 澄清按主题/冲突批次进行，不是逐文件

澄清内容包括：
- 低置信度分类的确认
- 冲突文档的归属决策
- 全局决策候选（ADR）的确认
- 源文档处置方式（删除/保留/保存）

### Stage 5: Plan（计划）

生成详细迁移计划：

- 源路径到目标路径的映射表
- 文件创建/修改/删除操作清单
- 目录创建清单
- 预期冲突与处理方式

### Stage 6: Apply（应用）

执行实际迁移：

- 创建目标目录结构
- 复制/移动文件
- 内容转换（如需要）
- 生成 index.md

### Stage 7: Cleanup（清理）

源文档处置与收尾：

- 根据用户选择处置源文档
- 生成报告（如适用）
- 更新状态文件
- 输出完成摘要

## 来源适配器

### 已知来源优先级

适配器按优先级顺序尝试匹配：

> 已知来源适配器优先于通用 AI 分类：OpenSpec、Spec Kit、Kiro、Trae、Cursor、通用文档

### OpenSpec 适配器

识别特征：
- `openspec/specs/`、`openspec/changes/`、`openspec/changes/archive/` 目录结构
- `spec.md`、`design.md`、`proposal.md`、`tasks.md` 等标准文件
- `project.md`、`AGENTS.md` 等治理文件

映射策略：
- `openspec/specs/*` -> `docs/current/spec/`
- `openspec/changes/*` -> `docs/changes/*`
- `openspec/changes/archive/*` -> `docs/archive/*`
- `project.md` + `AGENTS.md` -> `docs/decisions/` 或 `docs/references/`

### Spec Kit 适配器

识别特征：
- `.specify/` 目录
- `.specify/memory/constitution.md`
- `.specify/specs/<feature>/spec.md`、`plan.md`、`tasks.md`
- `.specify/scripts/`、`.specify/templates/`

映射策略：
- `.specify/specs/<feature>/spec.md` -> `docs/current/` 或 `docs/changes/`
- `.specify/specs/<feature>/plan.md` -> `docs/decisions/`（ADR 候选）
- `.specify/specs/<feature>/tasks.md` -> `docs/changes/` 任务跟踪
- `.specify/memory/constitution.md` -> `docs/decisions/` 或 `docs/current/workflow/`
- `.specify/research/` -> `docs/references/research/`

### Kiro 适配器

识别特征：
- `.kiro/` 目录
- `.kiro/specs/<feature>/requirements.md`、`design.md`、`tasks.md`
- `.kiro/specs/<feature>/bugfix.md`、`spec.json`
- `.kiro/steering/`、`.kiro/hooks/`

映射策略：
- `.kiro/specs/<feature>/requirements.md` -> `docs/current/requirements/` 或 `docs/changes/`
- `.kiro/specs/<feature>/design.md` -> `docs/current/design/` 或 `docs/decisions/`
- `.kiro/specs/<feature>/tasks.md` -> `docs/changes/`
- `.kiro/steering/*` -> `docs/decisions/` 或 `docs/current/workflow/`
- `.kiro/hooks/*` -> `docs/current/workflow/`

### Cursor 适配器

识别特征：
- `.cursor/rules`
- `cursor.md`、`cursor-rules.md` 等文件
- 对话历史文件

映射策略：
- `.cursor/rules` -> `docs/current/workflow/cursor-rules.md`（需语义确认）
- 对话历史 -> `references/raw/cursor-conversations/`

### Trae 适配器

识别特征：
- `.trae/` 目录
- Trae 特定配置文件

映射策略：
- 类似 Cursor 的处理逻辑

### 通用文档适配器

当无已知来源匹配时，使用通用分类：

> Cursor/Trae/AI IDE 文档按语义分类：workflow/design/spec/requirements/ADR candidates/references

分类维度：
- 文件名关键词（README、DESIGN、SPEC、TODO 等）
- 内容语义分析（使用 LLM 辅助）
- 文件位置上下文

## 分类与映射规则

### 目标结构

最终输出必须符合 ADR-001 定义的 OpenFlow 结构：

> 最终输出生成 ADR-001 OpenFlow 文档结构：index.md、current/requirements design spec workflow、changes、archive、decisions、references/raw notes research

```
docs/
├── index.md
├── current/
│   ├── requirements/
│   ├── design/
│   ├── spec/
│   └── workflow/
├── changes/
│   └── {YYYY-MM-DD-feature}/
├── archive/
│   └── {YYYY-MM-DD-feature}/
├── decisions/
│   └── ADR-*.md
└── references/
    ├── raw/
    ├── notes/
    └── research/
```

### 分类映射表

| 源内容类型 | 置信度 | 目标位置 | 备注 |
|---|---|---|---|
| 当前有效需求 | 高 | `docs/current/requirements/` | 经确认的当前事实 |
| 当前有效设计 | 高 | `docs/current/design/` | 经确认的当前事实 |
| 当前有效规格 | 高 | `docs/current/spec/` | 经确认的当前事实 |
| 当前有效流程 | 高 | `docs/current/workflow/` | 经确认的规则 |
| 已过期需求/设计 | 高 | `docs/archive/{topic}/` | 历史归档 |
| 全局决策候选 | 中 | `docs/decisions/`（待确认）| 需用户确认后生效 |
| 低置信度/非标准 | 低 | `references/raw/` 或 `references/notes/` | 待确认列表 |
| 原始调研材料 | - | `references/raw/` | 保持原样 |
| 整理后的笔记 | - | `references/notes/` | AI 整理 |
| 专题研究 | - | `references/research/` | 结构化调研 |

### 低置信度处理

> 低置信度/非标准文档进入 references/raw 或 references/notes 和待确认列表；不自动提升为 current/decisions/archive

低置信度内容包括：
- 语义模糊的文档
- 明显过时的草稿
- 与现有 current/decisions 冲突的内容
- 无法确定生命周期的内容

这些内容进入 `references/` 层级，并加入待确认列表供后续处理。

## current/archive/decisions/references 规则

### current 写入规则

> 高置信度的当前事实可以生成到 docs/current；decisions/ADRs 需要用户确认

进入 `docs/current/` 的条件：
- 内容明确描述当前系统状态
- 无过期标记或版本冲突
- 不与现有 `current/` 内容冲突
- 高置信度分类

### archive 写入规则

> current、未过期文档进入 current；过期/历史文档进入 archive；未知进入 references/待确认

进入 `docs/archive/` 的条件：
- 内容明确标记为历史/过期
- 版本号明显落后于当前
- 包含 "deprecated"、"legacy"、"old" 等标记
- 历史变更记录

### decisions 写入规则

进入 `docs/decisions/` 的条件：
- 内容涉及跨 feature 的全局规则
- 架构决策记录格式
- **必须经用户确认**

### references 写入规则

进入 `docs/references/` 的条件：
- 外部原始资料
- AI 整理的摘要
- 低置信度待确认内容
- 通用参考资料

## 自动合并与冲突处理

### 自动合并规则

> 现有 OpenFlow 文档默认自动合并，但仅适用于高置信度、无冲突的同类型内容；冲突按主题批次澄清

自动合并适用于：
- 新内容与现有 `current/` 文档无冲突
- 相同类型（design 与 design，spec 与 spec）
- 高置信度分类
- 生命周期一致（均为当前或均为历史）

### 冲突处理策略

冲突检测：
- 同名文件冲突
- 内容语义冲突
- 生命周期冲突（current vs archive）
- 全局决策冲突

冲突解决：
- 按主题/冲突批次询问用户
- 提供冲突对比摘要
- 支持合并、替换、重命名、跳过等选项

### current 合并规则

> current 文档按生命周期类型 + 主题合并，不是一对一源文件到目标文件

合并策略：
- 同主题的多个源文档合并为单个目标文档
- 按章节组织（如多个需求文档合并为 `current/requirements/index.md`）
- 来源追溯信息仅在保留模式下保留

## 源文档处置策略

### 三选一模式

复制完成后，用户需选择源文档处置方式：

1. **保留**: 源文档保持原位不动
2. **保存到 references/raw**: 移动原文到 `references/raw/original-docs/`
3. **删除**: 永久删除源文档（需二次确认）

### 保留模式

当用户选择保留：

> 如果用户保留原始文档，生成双格式报告：Markdown + JSON 清单

生成：
- `migration-report.md`: 人工可读的迁移摘要
- `migration-manifest.json`: 机器可读的映射清单

报告内容包括：
- 源路径到目标路径的完整映射
- 分类决策依据
- 待确认事项列表
- 时间戳与迁移 ID

### 删除模式

当用户选择删除：

> 如果用户删除原始文档，不生成报告/清单，也不保留每份文档的源元数据

删除前确认信息：
- 完整路径列表
- 文件总数
- 总大小
- 要求输入确认短语 "DELETE ORIGINAL DOCS"

**注意**: 删除模式下无追溯报告，用户需自行承担无法回溯的风险。

## 报告与 provenance 策略

### 保留模式的报告

生成双格式报告：

**Markdown 报告 (`migration-report.md`)**:
- 迁移概览（源目录、目标目录、时间、ID）
- 文档统计（总数、分类分布）
- 映射表（源路径 -> 目标路径）
- 待确认事项
- 建议的后续步骤

**JSON 清单 (`migration-manifest.json`)**:
```json
{
  "migrationId": "uuid",
  "timestamp": "ISO8601",
  "sourceDir": "path",
  "targetDir": "path",
  "files": [
    {
      "sourcePath": "...",
      "targetPath": "...",
      "classification": "current/requirements",
      "confidence": "high",
      "action": "copied"
    }
  ],
  "pendingConfirmations": [...]
}
```

### 删除模式的零报告

删除模式下：
- 不生成 migration-report.md
- 不生成 migration-manifest.json
- 不在目标文档中保留源元数据

**产品决策**: 这是确认后的产品设计，用于满足"清洁迁移"场景。用户明确选择删除以换取无冗余的干净结构，同时接受失去溯源能力的风险。

## 命名与语言规则

### 路径命名规则

> AI 必须将输出文件/目录语义重命名为英文 kebab-case；文档内容保持中文含义

路径命名规范：
- 目录名：英文 kebab-case（如 `user-management`、`api-design`）
- 文件名：英文 kebab-case（如 `design.md`、`requirements.md`）
- feature 目录：`{YYYY-MM-DD}-{feature-name}`

### 内容语言规则

> 内容语言保留源主要语言；路径保持英文 kebab-case

- 中文源文档 -> 中文内容 + 英文路径
- 英文源文档 -> 英文内容 + 英文路径
- 混合语言 -> 以主要语言为准

### 示例

| 原文档名 | 目标路径 | 说明 |
|---|---|---|
| `用户管理设计.md` | `docs/current/design/user-management.md` | 中文内容，英文路径 |
| `API Specifications.md` | `docs/current/spec/api-specifications.md` | 英文内容，kebab-case 路径 |
| `旧版需求/` | `docs/archive/legacy-requirements/` | 按主题归档，kebab-case |

## 项目上下文读取边界

### 允许的上下文读取

命令可以读取项目上下文以辅助决策：

> 命令可以读取项目上下文（只读）以辅助分类、检测漂移/时效性、命名输出；不得修改代码或从代码推断过度的新事实

允许的操作：
- 读取项目结构（目录、文件列表）
- 读取 `package.json`、`README.md` 等元数据文件
- 读取现有 `docs/` 结构
- 分析代码目录结构（用于命名辅助）
- 检测文档与代码的明显不一致（漂移检测）

### 禁止的推断行为

禁止的操作：
- 修改任何源代码
- 基于代码生成新的需求或设计文档
- 推断超出源文档范围的新事实
- 自动修复代码或文档

### 用途边界

项目上下文仅用于：
1. **分类辅助**: 理解项目类型以改进分类准确性
2. **命名辅助**: 基于项目结构生成有意义的目录名
3. **漂移检测**: 检测文档与代码的明显不一致
4. **时效性判断**: 基于代码修改时间推断文档时效

## OpenFlow 初始化策略

### 未初始化项目的处理

> 如果源项目未初始化 OpenFlow，询问是否初始化 docs guide/结构

当检测到目标项目缺少 OpenFlow 结构时：

1. 询问用户是否初始化 OpenFlow 文档结构
2. 解释初始化将创建的内容（AGENTS.md 导航区块、docs/ 骨架）
3. 用户确认后，先执行初始化再执行迁移
4. 用户拒绝后，仍可继续迁移，但提示缺少 docs guide

### 已初始化项目的处理

当检测到已有 OpenFlow 结构时：
- 检查现有 `current/` 和 `decisions/` 内容
- 检测潜在冲突
- 询问是否合并或隔离

## 状态持久化

### 状态文件位置

> 状态持久化要求保存到 `.sisyphus/docs-migration/{migration-id}.json`

状态文件包含：
- 源路径
- 目标根目录/docs 目录
- 源类型
- 初始化状态
- 当前阶段
- 清单（inventory）
- 分类结果
- 用户回答
- 冲突记录
- 迁移计划
- 应用结果
- 清理决策
- 待确认问题
- 创建/修改/删除的文件列表

### 状态数据结构

```typescript
interface MigrationState {
  migrationId: string;
  timestamp: string;
  sourcePath: string;
  targetRoot: string;
  targetDocsDir: string;
  sourceType: 'openspec' | 'spec-kit' | 'kiro' | 'cursor' | 'trae' | 'generic';
  initialized: boolean;
  stage: 'detect' | 'scan' | 'classify' | 'clarify' | 'plan' | 'apply' | 'cleanup' | 'completed';
  inventory: FileInventory[];
  classifications: ClassificationResult[];
  answers: UserAnswer[];
  conflicts: ConflictRecord[];
  plan: MigrationPlan;
  applyResult: ApplyResult;
  cleanupDecision: 'keep' | 'move-to-references' | 'delete';
  pendingQuestions: PendingQuestion[];
  createdFiles: string[];
  modifiedFiles: string[];
  deletedFiles: string[];
}
```

### 中断恢复

支持长时间迁移的中断与恢复：
- 每个阶段完成后自动保存状态
- 重新运行命令时检测未完成的状态文件
- 询问从中断点继续或重新开始

## 安全边界

### 只读检测阶段

在 `apply` 阶段之前，所有操作都是只读的：
- 不修改源文档
- 不创建目标文件
- 仅生成报告和计划

### 确认闸门

关键操作需要显式确认：
- 进入 `apply` 阶段前
- 删除源文档前
- 覆盖现有文件前
- 写入 `decisions/` 前
- 写入 `current/` 的冲突内容前

### 回滚能力

迁移计划阶段生成回滚信息：
- 记录所有计划操作的逆操作
- 应用阶段记录实际执行的操作
- 支持基于状态文件的迁移回滚

### 敏感文件保护

保护以下文件不被意外覆盖：
- `.env`、`.env.local` 等环境文件
- 包含密钥、密码的文件（通过内容扫描）
- Git 历史文件

## 后续实现建议

### 第一阶段：核心流程

1. 实现七个阶段的基础流程框架
2. 实现通用文档适配器
3. 实现状态持久化机制
4. 实现基本的分类与映射逻辑

### 第二阶段：来源适配器

1. 实现 OpenSpec 适配器
2. 实现 Spec Kit 适配器
3. 实现 Cursor/Trae 适配器
4. 实现 Kiro 适配器

### 第三阶段：高级功能

1. 实现冲突检测与解决
2. 实现自动合并逻辑
3. 实现项目上下文读取
4. 实现漂移检测

### 第四阶段： polish

1. 优化用户体验与提示文案
2. 添加详细的日志与调试信息
3. 完善错误处理与恢复机制
4. 编写测试与示例

### 验收重点

1. 多源适配器能正确识别并解析不同来源的文档结构
2. 分类逻辑能准确将文档映射到目标位置
3. 澄清流程按主题批次进行，不是逐文件询问
4. 删除操作需要二次确认，且删除模式下不生成报告
5. 状态持久化能支持中断恢复
6. 生成的目录结构符合 ADR-001 规范
7. 路径命名使用英文 kebab-case，内容语言保留源语言

## 结论

本文档迁移命令设计方案定义了一个系统化、安全、可追溯的文档迁移工具。核心设计原则包括：

1. **报告先行**: 默认先输出报告与澄清，再执行迁移
2. **语义分类**: 基于内容语义而非仅文件名进行分类
3. **安全删除**: 删除操作永不自动，需要显式二次确认
4. **分层归属**: current/archive/decisions/references 的清晰边界
5. **状态持久**: 支持长时间迁移任务的中断与恢复
6. **来源适配**: 已知来源优先，通用分类兜底

最终，该命令将帮助用户将各种存量文档体系有序迁移至 OpenFlow 标准结构，同时保持文档的语义完整性与可追溯性。
