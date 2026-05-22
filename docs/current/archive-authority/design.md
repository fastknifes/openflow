# implementation-mapper 追溯化改造设计文档

- 日期：2026-05-08
- Feature：implementation-mapper-traceability
- 状态：Draft
- 涉及文件：`src/commands/archive.ts`、`src/phases/archive/implementation-mapper.ts`、`src/phases/archive/code-mapper.ts`、`src/phases/archive/traceability.ts`

## 1. 背景

当前 `generateImplementationMapper`（位于 `src/phases/archive/implementation-mapper.ts`）生成的 `implementation-mapper.md` 存在以下问题：

1. **噪音过多**：修改文件清单直接透传 `FileChangeRecord[]`，混入系统临时目录路径（`AppData/Local/Temp`）、外部工作区文件、测试运行缓存，导致文档信息密度低。
2. **映射粒度粗**：当前实现映射表（`generateImplementationMappingSection`）以 `changed files` 为主键聚合，每一行塞入多个文件路径和符号，难以回答"哪段代码对应哪条需求"。
3. **验证证据弱**：`formatVerificationEvidence` 在无 `acceptanceState.verificationCompletedAt` 时回退到 `archived file-change evidence recorded` 这种不可复核的描述。
4. **名实不符**：文档名为 implementation mapper，但核心内容是一份变更快照，与 README 中承诺的"requirements → files/functions/symbols"追溯能力存在落差。

本次改造的实质不是"删掉临时文件"，而是重新定义 implementation mapper 的职责边界：它首先服务追溯，其次才服务归档审计。

## 2. 设计目标

- **排除噪音**：路径过滤器拒绝临时目录、外部绝对路径、`..` 遍历路径、缓存目录，确保只收录仓库内可复核文件。
- **需求驱动映射**：以需求项 / 设计决策项为主键构建映射表，而不是以变更文件汇总。
- **符号优先**：对源码文件优先提取函数、类、方法等符号；无法提取时显式标记为 `file-level fallback`。
- **证据可复核**：验证证据字段包含具体命令、测试文件或用例名；无证据时使用明确占位文本 `no verification evidence recorded`，不再使用 `pending` 或变更计数。
- **稳定排序**：相同输入多次生成时输出顺序不变，避免无意义 diff。
- **按需输出章节**：无全局依赖时不输出"全局依赖与例外证据"章节，无偏差时不制造空表格，服务阅读而不服务模板对称。

## 3. 非目标

- 不构建完整静态分析平台或 AST 级需求追踪引擎。
- 不把所有 git diff 行级细节塞进归档文档。
- 不记录每一次临时实验、缓存产物或 E2E 沙箱文件。
- 不把 Git 已经能提供的变更文件清单作为文档主体重复输出。
- 不在输出中包含"排除项"章节；过滤规则仅存在于生成逻辑中，不对读者暴露。
- 不重复罗列同一 feature 工作区内天然相邻的文档（`proposal.md`、`design.md`、`requirements.md`）。
- 不新增超出 proposal 范围的功能。

## 4. 输出模型

最终的 `implementation-mapper.md` 仅包含以下 4 个章节，按序排列：

### 4.1 概述

固定输出，包含：
- 本次变更解决的问题摘要
- 归档时间（ISO 8601 日期）
- 追溯范围说明

### 4.2 全局依赖与例外证据（条件输出）

仅在以下任一条件为真时输出此章节：
- 存在跨 feature / 全局决策依赖（如 `docs/decisions/` 下的 ADR）
- 存在被当前实现依赖的 `docs/current/` 文档
- 存在独立 verify evidence
- 存在少数被显式保留的外部证据文件

当所有条件均为假时，整章省略，不输出空表格或占位文本。

此章节不列出同 feature 工作区内天然可见的 `proposal.md`、`design.md`、`requirements.md`。

### 4.3 需求到实现映射

映射表，每行包含以下字段：

| 追溯来源 | 需求/决策 | 代码文件 | 关键符号 | 关联说明 | 验证证据 |
|----------|-----------|----------|----------|----------|----------|

每行对应一条需求项或设计决策项，回答四个问题：
1. 对应哪条需求或设计约束？
2. 落到了哪些文件和符号？
3. 为什么这些代码与该项相关？
4. 用什么证据验证过？

符号提取优先级：函数 → 类 → 方法 → 命令入口 → 测试用例名。无法提取时填写 `file-level fallback`。

当需求/设计文档中的某个项没有任何变更代码可以关联时，在代码文件列填写 `(no changed code matched)`，符号列留空（不写 `-`）。

### 4.4 验证与结论

包含：
- 执行过的验证命令列表
- 验证结果摘要
- 尚存已知偏差（仅在存在时）

## 5. 生成流程

实现位于以下模块之间的协作：

- `src/commands/archive.ts`：入口，负责收集文件变更、构建 `ImplementationMapperOptions` 并调用 `generateAndSaveImplementationMapper`。
- `src/phases/archive/implementation-mapper.ts`：文档渲染层，负责组装 Markdown 输出，不再包含文件清单表格。
- `src/phases/archive/code-mapper.ts`：路径过滤与符号提取层，负责筛选有效文件、提取代码符号、构建映射条目。
- `src/phases/archive/traceability.ts`：追溯项收集层，负责从需求/设计/提案文档中提取追溯项。

整体生成顺序：

1. `archive.ts` 收集文件变更（Session API 优先，build 记录兜底），构建 `ImplementationMapperOptions`。
2. `traceability.ts` 读取 feature 下的 requirements / proposal / design 文档，提取需求项与关键决策项作为追溯主键。
3. `code-mapper.ts` 对变更文件执行路径过滤（见第 6 节），对通过的源码文件提取符号，按追溯项匹配关联。
4. `implementation-mapper.ts` 按输出模型（第 4 节）组装四个章节：
   - 始终输出"概述"
   - 条件输出"全局依赖与例外证据"
   - 按固定排序（第 8 节）输出"需求到实现映射"
   - 输出"验证与结论"（偏差部分仅在存在时出现）
5. 空章节省略：无全局依赖则不生成 4.2，无已知偏差则"验证与结论"中不包含偏差子节，无内容则不生成空表格。

### 需要删除的遗留代码

两个已不再使用的函数需在此次改造中移除：

- `generateCodeMappingMarkdown`（`code-mapper.ts:141`）：被新的文档渲染逻辑替代。
- `saveCodeMapping`（`code-mapper.ts:178`）：其调用方已不再使用。

## 6. 路径过滤规则

路径过滤实现在 `code-mapper.ts` 的文件处理管线中，规则如下：

### 6.1 硬拒绝（无条件排除）

以下路径模式直接拒绝，不进入映射：

- 包含 `AppData/Local/Temp` 的路径
- 绝对路径不在 `projectDir` 子树内的文件
- 包含 `..` 遍历的路径
- 匹配 `**/tmp/**`、`**/.tmp/**`、`**/.cache/**` 的路径

### 6.2 显式保留（白名单）

如果某个路径本应被排除，但确实属于必须保留的验收证据，则必须显式标注保留原因（如"人工指定的验收证据目录"），且仅允许通过"全局依赖与例外证据"章节以最小化引用形式出现，不进入主映射表。

### 6.3 不生成排除项清单

过滤规则仅存在于生成逻辑中。无论实际排除了多少文件，都不会在输出文档中生成"已排除文件"清单或任何形式的排除项汇总。

## 7. 证据策略

### 7.1 验证证据优先级

`formatVerificationEvidence`（`code-mapper.ts:228`）按以下优先级生成验证证据文本：

1. 存在 `acceptanceState.verificationCompletedAt` → `verification completed at {timestamp}`
2. 存在 `acceptanceState.verificationFailureCategory` → `verification failed: {category}`
3. 存在 `phasedChanges.acceptance` 非空 → 列出验收阶段文件变更（含具体命令）
4. 存在 `acceptanceState.pendingDocUpdates` 非空 → `pending acceptance/doc updates recorded ({count})`
5. 以上全无 → `no verification evidence recorded`（新行为，替换原 `archived file-change evidence recorded`）

### 7.2 不再使用的弱证据

以下形式的证据文本不再出现：
- `pending`
- 单纯的变更计数（如 `3 files changed`）
- `archived file-change evidence recorded`
- "已记录"但没有对应验证动作的描述

## 8. 排序规则

映射表行必须稳定排序，消除相同输入下的顺序漂移。排序优先级：

1. 按追溯项在 requirements / design / proposal 文档中的原始出现顺序排列。
2. 同一追溯项下，按文件类别排序：product code → tests → docs → config。
3. 同类文件内，按文件路径（ASCII 序）排列。
4. 同文件内，按符号名字典序排列。

这样保证相同输入多次生成后 diff 仅反映内容变化，不受顺序抖动干扰。

## 9. 模块影响

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/commands/archive.ts` | 不改动 | 入口仅透传数据，不参与映射逻辑变更 |
| `src/phases/archive/implementation-mapper.ts` | 重写渲染 | 移除文件清单表格，按新输出模型组装四章节 |
| `src/phases/archive/code-mapper.ts` | 新增过滤 + 重构符号提取 | 新增路径过滤管线；重构 `generateCodeMappingTable` 输出单行单映射；移除 `generateCodeMappingMarkdown` 和 `saveCodeMapping` |
| `src/phases/archive/traceability.ts` | 不改动 | 追溯项收集逻辑复用现有实现 |

## 10. 验收标准

- [ ] 生成的 `implementation-mapper.md` 不再包含 `AppData/Local/Temp` 或任何系统临时目录路径。
- [ ] 主映射表按需求项或设计决策项逐行拆分，不再使用单行汇总所有变更。
- [ ] 对源码变更优先输出符号名；无法提取时显式标记 `file-level fallback`，不使用 `-` 空置。
- [ ] 验证证据包含具体命令或测试引用；无证据时输出 `no verification evidence recorded`。
- [ ] 文档不包含"修改文件清单"表格（原第 4 节）。
- [ ] 文档不包含"排除项"章节。
- [ ] 文档不包含同 feature 工作区的 proposal / design / requirements 文档链接。
- [ ] 无全局依赖时，"全局依赖与例外证据"章节完全不出现。
- [ ] 无已知偏差时，"验证与结论"不包含偏差子节或空表格。
- [ ] 相同输入多次生成时，映射行顺序保持一致。
- [ ] `generateCodeMappingMarkdown` 和 `saveCodeMapping` 已从 `code-mapper.ts` 中移除。
- [ ] 已有测试 `tests/phases/code-mapper.test.ts` 通过。

## 11. 结论

本次改造的核心是职责重新定义：implementation mapper 从"归档附带清单"变为"可复核的追溯文档"。它不再回答"改了哪些文件"，而是回答"为什么这些实现存在、由什么验证"。输出模型精简为四个章节，过滤规则内化于生成逻辑，排序规则保证稳定性，证据策略要求具体可复核。
