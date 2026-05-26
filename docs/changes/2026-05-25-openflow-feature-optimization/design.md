# openflow-feature 优化设计

## 1. 设计目标

本设计优化现有 `/openflow-feature`，让它从固定问卷式命令演进为自然语言驱动的 feature 设计助手。

目标：

- 减少重复提问。
- 避免长上下文导致的设计信息丢失。
- 让 feature 身份完全来自当前 session 和需求描述。
- 强制生成稳定的 `design.md` 与 `behavior.md`。
- 根据复杂度生成条件文档，而不是固定生成一套文档。
- 用 Cross-Validation 保证设计约束、行为契约、需求和决策一致。
- 保持 `/openflow-feature` 与 planning、implementation、archive 的阶段边界清晰。
- 实现以重构为主，通过规则模型和清晰设计模式替代历史分支堆叠。

## 2. 核心设计约束

### 2.0 主流程顺序

`/openflow-feature` 的主流程必须稳定为：

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

该顺序是实现约束，不只是推荐流程。尤其是 session feature 检测必须早于文档生成，`state.md` 恢复或初始化必须早于 Feature Brief 更新。

### 2.0.1 命令入口不可绕过

`/openflow-feature` 是设计阶段唯一合法入口。命令必须由 command dispatch / chat hook 识别并进入正式 feature workflow。

AI 不得把 `/openflow-feature ...` 当作普通自然语言请求自行解释，也不得绕过 Feature Brief、state、生成前确认和 Cross-Validation 直接写文档。

如果 command dispatch 无法识别命令或无法构造必要上下文，系统必须明确失败。

### 2.1 功能始终启用

`/openflow-feature` 不再受配置开关控制。该命令始终可用。

### 2.2 需求描述不是参数

命令后的文本始终作为需求描述处理。

```text
/openflow-feature 优化提问流程，让它减少重复问题
```

这里的文本不是 slug，也不是 feature id。

### 2.3 单 session 单 feature

一个当前 session 只能承载一个 feature。

如果当前 session 已经存在 feature，用户再次主动输入 `/openflow-feature ...`，系统必须拒绝开启新 feature。

该约束用于防止上下文污染。

### 2.4 不跨 session 续 feature

系统不从其他 session、active feature、未完成 feature session 或历史上下文中恢复 feature 身份。

新 session 中的 `/openflow-feature ...` 必须创建新 feature。

### 2.5 文档阶段不碰实现阶段

`/openflow-feature` 只负责设计澄清和文档生成。

它不做：

- 代码修改。
- LSP。
- tests。
- build。
- quality gate。
- plan 文件生成。
- 调用 `/openflow-writing-plan`。

### 2.6 实现取向：重构优先

后续代码实现应以重构为主，而不是在旧实现上继续叠加兼容补丁。

设计约束：

- 用规则对象、策略模式、验证器、状态机等清晰结构表达 feature identity、文档集选择、Cross-Validation、状态流转和编辑授权。
- 避免将新行为写成散落在命令入口中的条件判断。
- 清理旧的默认 `proposal.md`、meta JSON、固定问卷、跨 session 查找、active feature 查找等历史逻辑。
- 历史代码清理优先级高于保留旧 fallback。宁可清理过多导致实现阶段出现显式错误，再通过测试修复，也不可残留隐式旧行为污染新规则。

## 3. Feature Identity 设计

### 3.1 自动命名

系统根据需求描述生成 feature 目录名。目录名应优先使用现有约定：

```text
YYYY-MM-DD-语义名称
```

这里的语义名称不是用户传入的参数，而是 AI 根据需求描述生成的目录名组成部分。

示例：

```text
输入：优化 openflow-feature 的提问流程
directory: 2026-05-25-openflow-feature-question-flow
```

### 3.2 冲突处理

由于 feature 目录包含日期，重复概率较低。如果目录名冲突，系统自动生成另一个语义名称。

示例：

```text
openflow-feature-question-flow
improve-feature-question-guidance
reduce-feature-question-repetition
```

语义候选都冲突时，可使用确定性后缀：

```text
openflow-feature-question-flow-2
```

不得使用随机数。不得要求用户命名。

同一需求描述在同一 session 内应生成稳定目录名；系统不得在同一 session 中反复重算出不同目录。

日期使用本地环境日期 `Asia/Shanghai`，格式为 `YYYY-MM-DD-语义名`。语义名使用英文 kebab-case。

Feature 目录名一旦创建即固定。即使同一 session 跨过日期边界，也不得因为日期变化而重命名当前 feature 目录。

## 4. Feature Brief 与 state.md 设计

### 4.1 目的

Feature Brief 是当前 feature 的结构化工作记忆，用于替代长聊天上下文作为文档生成输入。

### 4.2 数据结构

Feature Brief 包含：

```text
problem
target-users
scope
priority
constraints
inferred assumptions
open questions
stable decisions
explicit constraints
```

每个核心槽位包含：

```text
value
confidence: high | medium | low
source: explicit | inferred | assumed | missing
```

### 4.3 存储位置

Feature Brief 持久化到：

```text
docs/changes/{feature}/state.md
```

`state.md` 是 AI 管理的工作状态文件，不是正式设计文档，也不参与 Cross-Validation 的语义一致性检查。

`state.md` 只记录结构化 brief、状态、待问问题、已生成路径和稳定决策，不记录完整聊天流水。

生成前以 `state.md` 为 working memory；正式文档生成后，以 `requirements.md`、`prd.md`、`design.md`、`behavior.md`、`decisions.md` 正文作为事实来源。

review 时如果 `state.md` 与正式文档冲突，系统不自动修改正式文档，只更新或重建 `state.md`。

`state.md` 更新必须采用原子写入。写入失败时，系统不得继续生成正式文档。

如果 `state.md` 损坏或不可解析，系统不得静默重建错误状态。系统必须提示恢复失败，并要求用户重新描述当前需求或重新初始化当前 feature。

`state.md` / FeatureSession 是设计阶段令牌。正式生成、修改或 review feature 文档时，必须绑定当前 feature state。

没有当前 feature state 时，系统不得直接写入 `design.md` / `behavior.md`；必须先初始化或恢复 feature state。

不得生成：

- `feature-brief.md`
- `design.meta.json`
- `behavior.meta.json`
- 其他 feature meta 文件

### 4.4 更新规则

每轮用户回答 openflow-feature 澄清问题后，系统应更新 `state.md` 中的 Feature Brief。

只有用户回答包含 feature 信息时才更新。用户如果只是讨论系统流程或评价提问方式，不应污染 Feature Brief。

不要求为了 compact 额外设计恢复机制。当前 session 重启但不是新会话时，系统应从 `state.md` 恢复 Feature Brief。

恢复必须结合当前会话上下文校验：

- 如果当前上下文仍指向同一 feature，恢复 `state.md`。
- 如果 `state.md` 与当前上下文明显不一致，不得静默恢复。
- 不一致时提示用户重新描述当前需求，或在新 session 中启动新的 `/openflow-feature`。

### 4.5 推断升级

当用户说“按你理解继续”时，当前 inferred 内容升级为 assumed，但不得伪装成 explicit。

关键约束类 assumed 内容必须在生成前确认中展示。

### 4.6 与 brainstorm context packet 的优先级

Brainstorm context packet 只作为 `/openflow-feature` 启动时的辅助输入。

一旦当前 feature 已经存在 Feature Brief / `state.md`，则以 Feature Brief 为 authoritative working memory。Brainstorm packet 不得覆盖已存在的 Feature Brief。

## 5. 当前 session 已有 feature 检测

只要当前 session state 中存在以下任一信息，即视为当前 session 已有 feature：

- feature identity；
- Feature Brief；
- generated document path；
- feature state；
- pending openflow-feature question。

检测不得只依赖 `docs/changes` 文件夹是否存在。文件夹只能说明文档存在，不能证明当前 session 正在处理该 feature。

如果用户自然语言输入明显切换到新主题，只有同时满足以下条件才拒绝：

- 用户明确提出另一个独立目标；
- 与当前 Feature Brief 的 problem/scope 无共享上下文；
- 无法解释为补充、约束、反例或文档修改。

模糊输入一律按当前 feature 补充处理。

## 6. 动态槽位提问设计

### 6.1 槽位

系统使用五个核心槽位：

| 槽位 | 含义 |
|---|---|
| problem | 这个功能解决什么问题 |
| target-users | 主要使用者是谁 |
| scope | 新功能、增强、重构还是流程改造 |
| priority | 最重要的优先级是什么 |
| constraints | 最关键的约束是什么 |

### 6.2 生成门槛

正式文档生成前，所有核心槽位至少达到 medium。

其中 `problem`、`scope`、`constraints` 是强关键槽位。如果任一为 low 或 missing，系统不得生成正式文档。

### 6.3 下一问选择

系统按以下优先级选择下一问：

1. 阻塞生成的问题。
2. 会导致设计方向分叉的高风险歧义。
3. 低置信度槽位。
4. 补充优化问题。

每次只问一个问题。

### 6.4 用户回答后的引导

系统采用三段式引导：

```text
1. 复述吸收：我已更新理解为...
2. 判断状态：现在还缺/还不确定的是...
3. 只问一个下一问题：为了确认 X，请问...
```

系统不得在槽位足够时继续问空泛问题。

## 7. 文档生成设计

### 7.1 强制文档

每个 feature 必须生成：

- `design.md`
- `behavior.md`

这两个文档是 Cross-Validation 的最小闭环，不能省略。

### 7.2 条件文档

系统根据 feature 类型和复杂度生成：

- `requirements.md`
- `prd.md`
- `decisions.md`

条件文档必须有明确生成原因。不得为了“看起来完整”而生成 `requirements.md`、`prd.md` 或 `decisions.md`。

### 7.3 requirements.md

当需求偏工程执行、验收、约束时生成。

内容关注：

- 功能需求。
- 非功能需求。
- 约束。
- 验收标准。
- 不做什么。

### 7.4 prd.md

当需求偏产品价值、目标用户、使用场景或成功指标时生成。

内容关注：

- 目标用户。
- 用户问题。
- 使用场景。
- 产品目标。
- 成功指标。
- 范围边界。

### 7.5 decisions.md

仅当存在有价值取舍时生成。

内容格式：

```md
## Decision: <title>

Scope: Local | Candidate Global

Alternatives considered:
- ...

Reason:
...

Impact:
...

Promotion note:
...
```

### 7.6 proposal.md

`proposal.md` 不属于默认流程。系统不默认生成、验证或依赖它。

### 7.7 plan.md

`plan.md` 属于 planning 阶段，不由 `/openflow-feature` 创建。

## 8. 生成前确认设计

系统写入文件前展示轻量确认：

```text
准备生成文档。我当前理解如下：

- problem: ...
- target-users: ...
- scope: ...
- priority: ...
- constraints: ...

将生成：
- design.md
- behavior.md
- requirements.md（原因：...）
- decisions.md（原因：...）

请确认：
1. 确认生成
2. 修改某一项
3. 先生成草稿
```

该确认只用于防止误生成，不进入复杂编辑模式。

## 9. Cross-Validation 设计

### 9.1 检查输入

Cross-Validation 输入顺序固定为：

```text
requirements.md
prd.md
design.md
behavior.md
decisions.md
```

不存在的条件文档跳过。

必检：

- `design.md`
- `behavior.md`

存在或本次生成时检查：

- `requirements.md`
- `prd.md`
- `decisions.md`

不检查：

- `proposal.md`
- `plan.md`

### 9.2 检查逻辑

系统检查：

- `design.md` 的设计约束是否支撑 `behavior.md` 的行为承诺。
- `behavior.md` 的关键行为是否都能在 `design.md` 中找到设计依据。
- `requirements.md` 的需求、验收和约束是否被 design/behavior 覆盖。
- `prd.md` 的用户目标、范围和成功指标是否没有被设计违背。
- `decisions.md` 的 chosen decisions 是否在 design/behavior 中落实。

Cross-Validation 至少包含两层：

1. 结构性检查：mandatory 文档存在、Summary 区块唯一、checked documents 列表一致、status 合法、没有 `design.meta.json` / `behavior.meta.json`、没有默认生成 `proposal.md` 的新规则。
2. 语义检查：设计约束、行为契约、需求、PRD、决策之间是否一致。

### 9.3 结果分级

#### Non-blocking Gap

允许通过，但给出建议。

用户引导：不打断完成流程，只在 Suggestions 中列出可优化项。

#### Blocking Gap

阻止 complete，但允许用户显式生成 `Draft with Blocking Gaps`。

用户引导：给出具体建议，并提示用户可以选择自行修改后 review、让 AI 按建议修改，或显式生成草稿。

#### Critical Blocking Gap

阻止 complete，且不允许草稿。

用户引导：必须展示风险、说明为什么阻塞、给出解决方案，并等待用户确认后才执行修改或重新生成。

典型条件：

- `design.md` 或 `behavior.md` 缺失。
- mandatory 文档不可解析。
- 安全、权限、数据丢失、破坏性操作规则冲突。
- 涉及自动执行、跨 session、全局制度提升的冲突。
- 多文档对范围、身份或完成条件有相反承诺。
- `decisions.md` 明确不采用某方案，但 `design.md` 采用该方案。

涉及安全、权限、数据删除、自动执行、跨 session、全局制度提升的冲突，默认归为 Critical Blocking Gap。除非用户明确降级，否则不得作为普通 Blocking 处理。

## 10. Cross-Validation Summary 设计

Summary 是 AI 管理区块，写入所有参与验证的文档。

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

规则：

- 用户不需要维护。
- AI 在生成、review、自然语言修改和草稿生成后更新。
- 用户手动编辑后不自动标记 stale。
- 下一次 review 时重新计算并更新。
- Summary 缺失或损坏时自动重建。
- Summary 只是最近验证结果缓存，不是唯一事实来源。review、plan、archive 关键路径必须重新读取正文，不得只根据 Summary 判断通过。

## 11. 草稿设计

用户可以显式要求先生成草稿。

草稿仍执行 Cross-Validation。

结果：

- Passed：生成正式文档，不写草稿标记。
- Blocking Gap：允许生成 `Draft with Blocking Gaps`。
- Critical Blocking Gap：不允许生成草稿，状态为 Failed。

## 12. 文档编辑设计

### 11.1 用户自行编辑 + AI Review

用户自行修改 Markdown。用户显式要求 review 后，AI 才检查。

AI 输出：

- 约束是否足够。
- 文档是否一致。
- Blocking / Critical Blocking 问题。
- 修正建议。

AI 不自动修改。

### 11.2 自然语言指导 AI 修改

用户明确要求 AI 修改文档时：

1. AI 复述理解。
2. 用户确认。
3. AI 修改相关文档。
4. AI 自动运行 Cross-Validation。
5. AI 输出结果。

如果某个修改会影响多个文档，AI 必须同步修改相关文档，或在确认中说明需要同步。

如果验证失败，AI 不自动继续修，只报告问题和建议。

AI 的自然语言修改授权范围限制在当前 feature 文件夹内：

```text
docs/changes/{feature}/*
```

AI 可以修改该文件夹内任意文档以保持一致性，但不得越过当前 feature 文件夹修改 ADR、current workflow 或其他 feature 文档。

一次用户确认只覆盖一次修改事务。如果 AI 发现需要额外改动，必须重新确认。

用户说“按建议修”时，只授权本轮报告中明确列出的建议，不授权新发现问题或范围外改动。

## 13. 已有文档设计

### 13.1 Review

用户要求 review 时，系统读取已有文档并 Cross-Validation，不覆盖。

### 13.2 重新生成

已有文档存在且用户要求重新生成时，系统必须确认覆盖。

重新生成全部文档时，确认覆盖是强制步骤。

### 13.3 补齐缺失

如果 mandatory 文档不完整，review 时报告缺失；生成/补齐时优先只生成缺失文档，并保留已有内容。

只补齐缺失文档时，不覆盖已有文档。

如需修改已有文档以保持一致，必须先说明并确认。

AI 自然语言修改时，只修改确认范围内的文档。`state.md` 作为工作状态，可由 AI 自动更新，不需要用户确认。

### 13.4 条件文档

已有 `requirements.md`、`prd.md`、`decisions.md` 时，系统纳入 Cross-Validation，不自动删除。

## 14. 状态模型

系统只保留五个状态：

```text
collecting
ready_to_generate
failed
draft_blocked
complete
```

含义：

- `collecting`：正在收集 Feature Brief。
- `ready_to_generate`：Feature Brief 达到生成门槛，等待确认。
- `failed`：生成或验证发生阻塞失败。
- `draft_blocked`：用户显式要求草稿，且只有普通 Blocking Gap。
- `complete`：文档已生成且 Cross-Validation Passed。

不引入：

- `paused_at_design`
- `review_mode`
- `editing_mode`
- `cross_validation_passed`
- `ready_for_plan`

## 15. 完成条件

`/openflow-feature` 完成条件：

```text
已生成本次所需文档 + Cross-Validation Passed
```

完成输出示例：

```text
Feature design complete.

Generated documents:
- docs/changes/<feature>/design.md
- docs/changes/<feature>/behavior.md
- docs/changes/<feature>/requirements.md

Cross-Validation: Passed

Next:
Run /openflow-writing-plan <feature> when ready.
```

`/openflow-writing-plan` 应兼容两种 feature 引用方式：

```text
/openflow-writing-plan 2026-05-25-openflow-feature-optimization
/openflow-writing-plan openflow-feature-optimization
```

第一种是完整 feature 目录名，第二种是不带日期的语义名称。系统应能解析到同一 feature。

如果不带日期的语义名称匹配多个 feature 目录，系统必须拒绝并提示用户使用完整目录名，不能自动选择最新目录。

### 15.1 writing-plan 准入

`/openflow-writing-plan` 读取 feature 时必须验证：

- 目标 feature 状态为 `complete`；
- `design.md` 和 `behavior.md` 存在；
- Cross-Validation 重新读取正文后仍为 Passed；
- 不存在 Critical / Blocking Gap。

以下状态必须阻断 planning：

- `failed`；
- `draft_blocked`；
- mandatory 文档缺失；
- Cross-Validation Summary 非 Passed；
- 正文重算结果不是 Passed。

### 15.2 重复触发幂等恢复

同一 session、同一 feature 重复触发生成时：

- 如果当前状态已 `complete` 且文档仍通过验证，系统返回当前文档路径和状态，不重复生成。
- 如果用户明确要求“重新生成”，系统进入覆盖确认。
- 如果状态为 `failed` 或 `draft_blocked`，系统返回恢复建议，不重新开始、不静默覆盖。
- 如果 `state.md` 损坏或与上下文不一致，系统按 state 恢复失败处理。

## 16. Candidate Global 设计

`decisions.md` 可以包含 `Scope: Candidate Global`。

设计完成输出必须列出这些决策，并说明归档时会自动提升。

用户如果不希望提升，应在设计阶段把对应决策改为 `Scope: Local`。

归档阶段不再二次确认。

`decisions.md` 必须执行去重与反转处理：

- 同一决策不得重复生成多个 Decision。
- 通过 Decision title 和语义相似度识别重复。
- 新内容合并进已有 Decision。
- 如果决策反转，更新原 Decision，并保留 alternatives/reason，不新增冲突 Decision。

归档提升安全边界：

- 能定位目标文档时自动提升。
- `Promotion note: target TBD` 时归档输出 warning，不阻塞归档，但不自动提升。
- 与现有 ADR 冲突时，归档生成冲突报告，不静默覆盖。

## 17. 长上下文控制

生成文档时不得直接依赖完整聊天历史。

只使用：

- Feature Brief。
- Stable Decisions。
- Explicit Constraints。

不带入：

- 已废弃方案。
- 被否定分支，除非作为 `decisions.md` alternatives。
- 代码实现历史。
- 重复问答流水账。

## 18. 实现结构建议

实现时建议将规则拆成独立模块，而不是集中在命令入口：

- Feature identity resolver：只处理当前 session 和需求描述，不查找旧 session。
- Feature directory namer：生成日期前缀目录名、处理语义冲突和确定性后缀。
- Feature Brief state manager：读写 `state.md`，执行上下文校验。
- Slot convergence engine：维护槽位、置信度、来源和下一问选择。
- Document set selector：决定强制文档和条件文档。
- Cross-validation engine：执行结构性检查和语义检查。
- Blocking severity classifier：区分 Non-blocking / Blocking / Critical。
- Document edit transaction：封装 AI 自然语言修改授权、同步修改和验证。

这些模块可以使用策略模式或规则对象组合，避免把规则硬编码为长条件链。

## 19. 完成后的继续修改

`complete` 只表示 feature design complete，不表示该 feature 在当前 session 中被冻结。

同一 session 内，用户仍可继续修正当前 feature 文档。修正后系统重新执行 Cross-Validation，并根据结果回到 `failed`、`draft_blocked` 或 `complete` 的结果语义。

complete 后如果用户或 AI 修改正式文档，状态必须立即退出 `complete`，直到 Cross-Validation 再次 Passed 才能回到 `complete`。

即使当前 feature 已 complete，也不得在同一 session 中开启新 feature。

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
