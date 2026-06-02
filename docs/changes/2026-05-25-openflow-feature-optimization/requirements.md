# openflow-feature 优化需求

## 1. 背景

当前 `/openflow-feature` 已具备自然语言设计澄清与文档生成能力，但在实际使用中暴露出几个产品问题：

- 提问容易像固定问卷，不能根据用户已提供的信息动态收敛。
- 长上下文中容易丢失已确认的设计约束和取舍。
- 文档集边界不够干净，`proposal.md`、meta 文件、设计文档、行为文档之间职责容易混淆。
- 用户希望直接描述需求，而不是记住 feature 名称、slug 或参数。
- 用户既可能自己编辑 Markdown 后让 AI review，也可能用自然语言要求 AI 修改文档。

本 feature 目标是优化现有 `/openflow-feature`，不是重新定义整个 OpenFlow 工作流。

## 2. 目标用户

- 使用 OpenFlow 进行需求澄清和设计沉淀的用户。
- 在当前 session 中协助用户完成 feature 设计的 AI agent。
- 后续读取设计文档并生成计划、实现或归档结果的 OpenFlow 命令。

## 3. 范围

本 feature 是对现有 `/openflow-feature` 的增强和流程改造。

实现取向以重构为主，而不是在历史实现上继续叠加补丁。代码实现应优先清理旧规则、旧文档产物和旧状态模型。

包含：

- 动态槽位提问模型。
- Feature Brief session state。
- 强制生成 `design.md` 与 `behavior.md`。
- 按复杂度条件生成 `requirements.md`、`prd.md`、`decisions.md`。
- 不再默认使用 `proposal.md`。
- Cross-Validation 分级规则。
- 用户自行编辑 + AI review、自然语言指导 AI 修改两种文档编辑路径。
- 当前 session 单 feature 约束。
- feature 名称由 AI 根据需求自动生成。
- Candidate Global 决策在归档阶段自动提升。
- 以规则建模和设计模式组织实现，避免散落的条件判断。
- 清理历史代码和旧兼容分支。

不包含：

- 修改代码实现。
- 运行 LSP、tests、build 或 quality gate。
- 创建 `plan.md` 或 `.sisyphus/plans/*`。
- 跨 session 恢复旧 feature。
- 一个 session 中切换多个 feature。

## 4. 功能需求

### 4.0 主流程执行顺序

`/openflow-feature` 必须按以下顺序执行核心流程：

```text
Intent Gate
→ 当前 session feature 检测
→ state.md 恢复或初始化
→ Feature Brief 更新
→ 动态槽位收敛
→ 文档集选择
→ 生成前确认
→ 写入文档
→ Cross-Validation
→ 输出 complete / failed / draft_blocked
```

实现不得跳过 session 检测直接生成文档，也不得在 state 恢复/更新失败时继续生成正式文档。

### 4.0.1 命令入口不可绕过

`/openflow-feature` 必须被 command dispatch / chat hook 识别并进入正式 feature workflow。

系统不得把 `/openflow-feature ...` 当作普通聊天文本交给 AI 自由解释。

如果 command dispatch 无法识别或缺少必要上下文，必须明确失败，不得静默降级为普通对话。

### 4.1 功能始终启用

`/openflow-feature` 不再通过配置开关控制是否启用。该功能始终可用。

### 4.2 需求描述而非参数

`/openflow-feature <text>` 中的 `<text>` 必须被解释为需求描述，而不是 feature 名称、slug 或参数。

用户不需要命名 feature，也不需要记住 feature id。

### 4.3 AI 自动生成 feature 目录名

系统根据当前需求描述和上下文自动生成 feature 目录名。

要求：

- 不要求用户命名。
- 不支持用户传 feature id、目录名或 slug。
- 不使用随机数。
- 名称冲突时自动换一个语义相近的新名称。
- 语义候选都冲突时，可使用确定性后缀，例如 `-2`。
- 不提示用户“名称已存在”。

### 4.4 当前 session 只允许一个 feature

当前会话如果已经存在一个 feature，用户再次主动输入 `/openflow-feature ...` 时，系统必须拒绝开启新 feature，并提示用户在新 session 中操作。

用户在当前 session 中的自然语言输入默认视为当前 feature 的补充、回答或修正。

如果用户明显切换到另一个 feature 主题，系统必须拒绝切换，并提示开新会话。

### 4.5 不支持跨 session 续 feature

系统不得通过 feature 名称、active feature、未完成 feature session 或其他 session state 恢复旧 feature。

新 session 中输入 `/openflow-feature ...` 必须视为新的 feature。

### 4.6 动态槽位收敛

系统必须维护以下槽位：

- `problem`：这个功能解决什么问题。
- `target-users`：主要使用者是谁。
- `scope`：这是新功能、增强、重构还是流程改造。
- `priority`：最重要的优先级是什么。
- `constraints`：最关键的约束是什么。

每个槽位记录：

- `value`
- `confidence`: `high | medium | low`
- `source`: `explicit | inferred | assumed | missing`

系统不得固定顺序询问所有问题，而应根据阻塞程度、歧义风险和置信度选择下一个最重要问题。每次只问一个问题。

### 4.7 Feature Brief 与 state.md

系统必须维护 Feature Brief，作为生成文档时的结构化输入。

Feature Brief 的持久化载体为：

```text
docs/changes/{feature}/state.md
```

规则：

- `state.md` 是 AI 管理的 feature 工作状态，不是正式设计文档。
- 用户每回答一个 openflow-feature 澄清问题，AI 都应更新一次 `state.md`。
- `state.md` 用于防止长上下文丢失，并为生成文档提供结构化输入。
- `state.md` 只记录结构化 brief、状态、待问问题、已生成路径和稳定决策，不记录完整聊天流水。
- 生成前以 `state.md` 作为工作记忆；正式文档生成后，以正式文档正文作为事实来源。
- review 时如果 `state.md` 与正式文档冲突，不自动改正式文档，只更新或重建 `state.md`。
- `state.md` 更新必须采用原子写入。写入失败时不得继续生成正式文档。
- 如果 `state.md` 损坏或不可解析，系统不得静默重建错误状态；必须提示恢复失败，并要求用户重新描述当前需求或重新初始化当前 feature。
- 不额外考虑 compact 机制；compact 后能否恢复不作为本 feature 的设计目标。
- 当前 session 重启但不是新会话时，系统应从 `state.md` 恢复 Feature Brief。
- 恢复时必须结合当前会话上下文校验，确认用户仍在处理同一 feature，避免误把旧 state 当作当前意图。
- 如果 `state.md` 与当前上下文明显不一致，系统不得静默恢复；应提示上下文不匹配并要求用户重新描述当前需求或开启新 session。
- Brainstorm context packet 只作为启动时辅助输入；一旦当前 feature 已有 `state.md` / Feature Brief，则以 Feature Brief 为准。
- `state.md` / FeatureSession 是设计阶段令牌。正式生成、修改或 review feature 文档时，必须绑定当前 feature state。没有当前 feature state 时，不允许直接写入 `design.md` / `behavior.md`。

系统不得生成 `design.meta.json` 或 `behavior.meta.json`。

Feature 目录名使用本地环境日期 `Asia/Shanghai`，格式为 `YYYY-MM-DD-语义名`；语义名使用英文 kebab-case，不使用随机数。

Feature 目录名一旦创建即固定。即使同一 session 跨过日期边界，也不得因为日期变化而重命名当前 feature 目录。

### 4.8 当前 session 已有 feature 的检测

只要当前 session state 中存在以下任一信息，即视为当前 session 已有 feature：

- feature identity；
- Feature Brief；
- generated document path；
- feature state；
- pending openflow-feature question。

系统不得只依赖文件目录判断当前 session 是否已有 feature。

### 4.9 生成前确认

正式写入文档前，系统必须展示轻量 Feature Brief 确认，包括：

- 当前槽位理解。
- 将生成的文档及原因。
- 本次相关但判断不需要的条件文档及原因。

不应反复列出 `proposal.md`。

### 4.10 强制生成设计与行为文档

每个 `/openflow-feature` 输出必须包含：

- `design.md`
- `behavior.md`

这两个文档是最小文档集，必须强制生成。需求再简单也不能省略。

### 4.11 条件文档

系统根据当前 feature 的复杂度和主导类型条件生成：

- `requirements.md`
- `prd.md`
- `decisions.md`

`requirements.md` 用于工程执行型需求。`prd.md` 用于产品价值型需求。两者可以同时生成，但只在同时存在复杂产品场景和复杂工程验收时生成。

`decisions.md` 只在存在值得保留的取舍时生成。

### 4.12 不默认使用 proposal.md

`proposal.md` 不属于当前默认 `/openflow-feature` 流程。

系统不得默认生成、验证或依赖 `proposal.md`。

### 4.13 Cross-Validation

系统必须对实际生成或参与的文档执行 Cross-Validation。

Cross-Validation 输入顺序固定为：

```text
requirements.md
prd.md
design.md
behavior.md
decisions.md
```

不存在的条件文档跳过，但 `design.md` 和 `behavior.md` 永远必检。

必检：

- `design.md`
- `behavior.md`

存在或本次生成时条件检查：

- `requirements.md`
- `prd.md`
- `decisions.md`

不检查：

- `proposal.md`
- `plan.md`

Cross-Validation 至少包含两层：

1. 结构性检查：mandatory 文档存在、Summary 区块唯一、checked documents 列表一致、status 合法、没有 `design.meta.json` / `behavior.meta.json`、没有默认生成 `proposal.md` 的新规则。
2. 语义检查：约束是否足够、设计与行为是否一致、条件文档是否被 design/behavior 覆盖。

涉及安全、权限、数据删除、自动执行、跨 session、全局制度提升的冲突，默认归为 Critical Blocking Gap。

### 4.14 Blocking Gap 分级

Cross-Validation 必须区分：

- Non-blocking Gap：允许通过，但给出建议。
- Blocking Gap：阻止 complete，但允许用户显式生成 `Draft with Blocking Gaps`。
- Critical Blocking Gap：阻止 complete，且不允许草稿。

`design.md` 或 `behavior.md` 缺失、不可解析，永远是 Critical Blocking Gap。

### 4.15 Cross-Validation Summary

AI 必须在所有参与验证的文档中维护 AI 管理区块：

```md
<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:BEGIN (example) -->
## Cross-Validation Summary

Status: Passed | Failed | Draft with Blocking Gaps

Checked documents:
- design.md
- behavior.md

Issues:
- None
<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:END (example) -->
```

用户不需要维护该区块。Summary 缺失或损坏时，AI 在下一次 review 或修改后自动重建。

### 4.16 草稿

用户可以显式要求“先生成草稿”。草稿仍必须执行 Cross-Validation。

- 只有普通 Blocking Gap 时，允许生成 `Draft with Blocking Gaps`。
- 存在 Critical Blocking Gap 时，不允许生成草稿。
- Cross-Validation 通过时，应生成正式文档，不标记草稿。

### 4.17 文档编辑方式

系统支持两种编辑路径：

1. 用户自行编辑 Markdown，然后显式要求 AI review。
2. 用户用自然语言指导 AI 修改文档。

用户自行编辑后，AI 不自动 review。用户显式要求 review 后，AI 检查约束是否足够、文档是否一致，并输出建议，不自动修改。

用户要求 AI 修改时，AI 必须先复述理解，用户确认后才修改。修改后必须自动运行 Cross-Validation。如果失败，AI 输出问题和建议，不自动继续修。

AI 修改范围限制为：

```text
docs/changes/{feature}/*
```

AI 可以修改该 feature 文件夹内的任意文档以保持一致性，但不得越过当前 feature 文件夹修改其他文档，除非用户明确进入归档或全局治理流程。

一次用户确认只覆盖一次修改事务。用户说“按建议修”时，只授权本轮报告中明确列出的建议；如果发现新问题或额外同步修改，AI 必须重新确认。

### 4.18 已有文档处理

如果用户要求 review，系统读取已有文档并执行 Cross-Validation，不覆盖。

如果用户要求重新生成且已有文档存在，必须确认覆盖。

如果文档不完整，用户要求 review 时只报告缺失；用户要求补齐时优先只生成缺失文档。

已有条件文档必须纳入 Cross-Validation，但不得自动删除。

覆盖与补齐规则：

- 只补齐缺失文档时，不覆盖已有文档。
- 重新生成全部文档时，必须确认覆盖。
- AI 自然语言修改时，只修改确认范围内的文档。
- `state.md` 是工作状态，可由 AI 自动更新，不需要用户确认。

### 4.19 Candidate Global 决策

`decisions.md` 可以标记：

```text
Scope: Candidate Global
```

设计完成输出必须告知用户这些决策会在 `/openflow-archive` 阶段自动提升到全局制度文件。

归档阶段不再二次确认。

`decisions.md` 必须去重：

- 同一决策不得重复生成多个 Decision。
- 按 Decision title 和语义相似度识别重复。
- 新信息合并到已有 Decision。
- 如果决策反转，更新原 Decision，并保留 alternatives/reason，不新增相互冲突的 Decision。

## 5. 非功能需求

- 文档体系必须保持干净，避免重复事实来源。
- 生成文档时不得依赖整段长聊天上下文，而应使用 Feature Brief、stable decisions 和 explicit constraints。
- 对话输出不默认贴完整 Markdown 正文，只输出路径、验证结果和下一步。
- `.md` 文件不需要 LSP 验证。
- `/openflow-feature` 不运行 tests、build 或 quality gate。
- 实现阶段应以重构为主，优先抽象规则对象、策略或状态机，而不是继续堆叠 if/else。
- 历史代码清理优先级高于兼容旧行为。宁可因为清理过多导致显式报错并在实现阶段修复，也不可残留会污染新规则的历史代码。

## 6. 验收标准

- `/openflow-feature <text>` 将 `<text>` 视为需求描述，而非 feature id。
- 同一 session 已存在 feature 时，再次输入 `/openflow-feature ...` 被拒绝。
- Feature Brief 能记录槽位值、置信度和来源。
- 系统能根据槽位状态动态选择下一个问题。
- `design.md` 和 `behavior.md` 总是生成。
- `requirements.md`、`prd.md`、`decisions.md` 按条件生成。
- 默认不生成、不验证、不依赖 `proposal.md`。
- Cross-Validation 能区分 Non-blocking、Blocking、Critical Blocking。
- Critical Blocking Gap 不允许草稿。
- Cross-Validation Summary 写入所有参与验证文档。
- 用户自行编辑后，只有显式 review 才检查。
- AI 修改文档后自动 Cross-Validation。
- Candidate Global 决策在完成输出中展示，并声明归档时自动提升。
- Feature Brief 持久化到 `docs/changes/{feature}/state.md`，并在每次用户回答澄清问题后更新。
- 当前 session 重启但不是新会话时，系统从 `state.md` 恢复 Feature Brief，并结合当前上下文校验一致性。
- 当前 session 已有 feature 的检测基于 session state，不基于文件目录。
- Cross-Validation 同时包含结构性检查和语义检查。
- AI 自然语言修改范围不得超出 `docs/changes/{feature}/*`。
- `/openflow-writing-plan` 同时兼容带日期 feature 目录名与不带日期的语义名。
- 如果不带日期的语义名匹配多个 feature 目录，系统必须拒绝并提示用户使用完整目录名，不能自动选择最新目录。
- `/openflow-writing-plan` 必须要求目标 feature 已 `complete` 且 Cross-Validation Passed；`failed`、`draft_blocked`、mandatory 文档缺失或 Summary 非 Passed 时必须阻断 planning。
- Cross-Validation Summary 只是最近验证结果缓存；review、plan、archive 关键路径必须重新读取正文，不得只依赖 Summary。
- `requirements.md`、`prd.md`、`decisions.md` 必须有明确生成原因，不得为了“看起来完整”而生成。
- 失败引导必须按严重级别输出：Non-blocking 只给 Suggestions；Blocking 给建议并提示用户可自行编辑后 review、让 AI 修改或显式生成草稿；Critical 必须展示风险和解决方案，等待用户确认。
- 实现时必须清理旧的默认 `proposal.md`、meta JSON、固定问卷、跨 session 查找、active feature 查找等历史逻辑，不得保留为隐式 fallback。
- 新规则应通过明确的规则模型、策略对象、验证器或状态机表达，便于测试和后续维护。
- 同一 session、同一 feature 重复触发生成时，如果当前状态已 `complete` 且文档仍通过验证，默认返回当前文档路径和状态，不重复生成；只有用户明确要求“重新生成”才进入覆盖确认。
- `failed` 或 `draft_blocked` 状态重复触发时，系统返回恢复建议，而不是重新开始或静默覆盖。

<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:BEGIN -->
## Cross-Validation Summary

Status: Passed

Checked documents:
- requirements.md
- design.md
- behavior.md
- decisions.md

Issues:
- None
<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:END -->
