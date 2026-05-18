# OpenFlow 文档治理与工作流技术方案

**日期**: 2026-03-22
**状态**: Accepted
**适用范围**: OpenFlow 主工作流、`docs/` 目录、验收与归档链路

## 1. 背景

OpenFlow 当前已经具备较强的工作流增强能力：

- 基于 `oh-my-openagent` 提供的多代理、需求澄清、计划探索、委派执行能力运行
- 通过 `/openflow-feature` 提供设计前置与文档生成
- 在计划阶段注入 TDD 与验证要求
- 通过 Verify 阶段建立 evidence 与 readiness，判断变更是否具备进入 closure 的条件
- 在归档阶段完成 canonicalization、current promotion、实现映射、代码映射和需求归档

当前的核心问题已经不再是“有没有流程”，而是以下几个治理问题：

1. `docs/` 目录结构尚未与演进式项目形态完全对齐
2. 文档维护责任、触发时机、写入边界不清晰
3. 全局规则与 feature 级事实文档混杂，缺少清晰治理模型
4. Verify / Archive 边界需要从“校验与验收”收敛为“readiness 与 canonical authority”
5. 外部参考项目很多，但需要明确哪些该吸收，哪些不该重复建设

本方案基于前述讨论，结合 `oh-my-openagent`、`Superpowers`、`OpenSpec`、`Spec Kit`、`get-shit-done` 的优缺点，对 OpenFlow 的文档树、治理模型与后续扩展方向做统一收敛。

## 2. 设计目标

本方案希望同时满足以下目标：

- 让 OpenFlow 成为 `oh-my-openagent` 上层的工作流增强层，而不是重复造一个 orchestrator
- 让 `docs/` 能承载演进式项目的“当前事实 + 变更过程 + 历史归档”
- 让事实类文档和规则类文档职责清晰
- 让 AI 与用户在人机协作中各自承担合适责任
- 让 Verify 从“代码级检查”升级为 Evidence + Readiness 的单一完成前入口
- 让 Archive 成为 closure 的最终 authority，负责 current promotion 与历史冻结
- 保持主流程轻量，避免引入过重的 phase/milestone 体系

## 3. 对外部系统的评估结论

### 3.1 oh-my-openagent / OMO

`oh-my-openagent` 已经提供：

- Intent Gate
- 多代理调度
- 子代理执行
- 探索、调研、规划、审阅
- hooks、commands、skills、MCP、LSP、AST 工具链

因此 OpenFlow 不应重复建设：

- 新的总控 orchestrator
- 与 OMO 平行的规划/执行/调度系统
- 与 OMO 重叠的需求澄清或代理编排框架

OpenFlow 的正确定位应为：

> 在 OMO 已有执行能力之上，增加文档治理、设计沉淀、验收引导、归档与 traceability 能力。

### 3.2 Superpowers

`Superpowers` 的有效启发主要在于：

- 在实现前先做设计探索
- 设计批准后再进入写计划与子代理执行
- 强调 TDD、验证与 evidence-driven workflow

这些原则对 OpenFlow 有价值，但 OpenFlow 不需要完整复制其 skills 编排体系。原因是 OMO 已经提供更强的宿主能力，OpenFlow 只需在宿主之上补充流程节点与文档产物即可。

### 3.3 OpenSpec

`OpenSpec` 最值得吸收的是其思想，而不是目录名称本身：

- 区分“当前有效事实”和“变更中的提案”
- 明确存在 `current/source of truth` 与 `changes/archive` 的边界
- 适合持续演进的项目，而不是一次性 feature 工作区

OpenFlow 的文档体系应整体偏向 `OpenSpec-lite`：

- 思想上偏 `OpenSpec`
- 结构上保留 `design`、`requirements` 等现有术语，并将归档产物从 `SRS` 收敛为 `implementation-mapper`
- 不强行将全部术语改造成纯 `spec`

### 3.4 Spec Kit

`Spec Kit` 的优点在于：

- 按 feature 聚合文档
- 在单个 feature 内串起 spec、plan、tasks、research
- 非常适合单 feature 的规格驱动工作区

但它更像 feature workspace，而不完全适合 OpenFlow 这种持续演进、重视归档和全局规则沉淀的系统。因此适合作为局部参考，不适合作为 OpenFlow 的总体结构原型。

### 3.5 get-shit-done / GSD

对 GSD 的结论分两部分：

不建议吸收的部分：

- 整套 phase/milestone 体系
- 大量 `.planning/` 工件与命令面
- 自建状态与执行引擎

原因：这些能力与 OMO 宿主已有能力重叠，会导致 OpenFlow 变成“第二层 orchestrator”。

值得吸收的部分只有一个重点：

> 完成前不只运行代码级检查，还要通过 Verify 生成 evidence packet 与 readiness 结论，明确“知道了什么、是否可进入 Archive、还缺什么”。

这部分与 OpenFlow 当前能力高度兼容，适合作为后续增强点。

## 4. OpenFlow 的最终定位

OpenFlow 应被定义为：

> 一个建立在 `oh-my-openagent` 宿主能力之上的文档优先工作流插件，负责把 设计探索、设计、需求、验收、归档和追溯关系沉淀为可持续维护的知识结构。

简化表达：

- OMO 负责执行能力与代理编排
- OpenFlow 负责文档治理、工作流增强、归档与追溯

## 5. 推荐的 `docs/` 目录结构

基于 OpenSpec 的演进式思想、结合 OpenFlow 现有文档类型，推荐使用以下目录结构：

```text
docs/
├── index.md
├── current/
│   ├── requirements/          # lifecycle-stable current facts area
│   ├── design/                # lifecycle-stable current design area
│   ├── spec/                  # lifecycle-stable current spec area
│   └── workflow/              # lifecycle-stable current workflow area
├── changes/
│   └── {YYYY-MM-DD-feature}/  # dated workspace per feature
│       ├── design.md          # stable primary design document
│       ├── proposal.md        # conditional: created when problem framing is needed
│       ├── decisions.md       # conditional: created when trade-off logging is needed
│       ├── prd.md             # conditional: created when a real PRD exists
│       └── plan.md            # conditional: workspace mirror of the active execution plan
├── archive/
│   └── {YYYY-MM-DD-feature}/  # dated snapshot per feature
│       ├── implementation-mapper.md   # mandatory
│       ├── design.md          # conditional: copied if source exists
│       ├── proposal.md        # conditional: copied if source exists
│       ├── decisions.md       # conditional: copied if source exists
│       ├── prd.md             # conditional: copied if source exists
│       └── plan.md            # conditional: copied if source exists
├── decisions/
│   └── ADR-*.md
└── references/
    ├── raw/
    ├── notes/
    └── research/
```

### 5.1 目录语义

- `docs/current/`
  - 当前有效事实
  - 用于描述"系统现在是什么样"
  - `requirements/`、`design/`、`spec/`、`workflow/` 为生命周期级稳定目录
- `docs/changes/`
  - 进行中的变更工作区
  - 用于承接某个 feature/change 的需求、设计与计划演进
  - `design.md` 是稳定的 brainstorm 主文档
  - `proposal.md`、`decisions.md`、`prd.md`、`plan.md` 是按需出现的工作区文件，仅在存在真实内容时出现
- `docs/archive/`
  - 已归档的历史快照
  - 冻结，不作为日常编辑对象
  - `implementation-mapper.md` 是强制生成的实现映射与追溯主文档
  - `design.md`、`proposal.md`、`decisions.md`、`prd.md`、`plan.md` 是条件性归档文件，仅在源文件存在时复制归档
- `docs/decisions/`
  - 跨 feature 的正式全局决策
  - 必须经过用户确认
- `docs/references/`
  - 参考资料与调研
  - 包含原始材料、整理笔记与专题研究

### 5.2 为什么 `changes/` 不包含 `SRS`

`changes/` 是进行中的工作区，应该主要放会持续演化的文档：

- `design.md`（稳定的 brainstorm 主文档）
- `proposal.md`、`decisions.md`、`prd.md`、`plan.md`（按需出现）

不建议在 `changes/` 中放 `SRS` 或 `implementation-mapper`，原因是：

- 它们依赖最终实现结果与验收结果
- 在开发中期通常是不稳定的半成品
- 它们更适合作为归档时冻结的结果文档，而不是进行中的工作文档

### 5.3 为什么不用纯 `features/`

纯 `features/` 结构更像 `Spec Kit`，对单功能工作区很清晰；但 OpenFlow 更适合区分：

- 当前系统事实
- 变更中的工作区
- 已归档的历史

因此 `current + changes + archive` 更符合 OpenFlow 的演进式定位。

## 6. 文档治理模型

文档治理的关键不是“谁维护全部文档”，而是区分：

- 事实类文档
- 规则类文档
- 来源类文档
- 冻结类文档

### 6.1 治理原则

- 事实类文档：AI 主维护，用户校正关键误解
- 规则类文档：AI 只能提议和起草，用户确认后生效
- 来源类文档：用户主导提供，AI 负责整理和索引
- 冻结类文档：由归档流程自动维护，不作为日常编辑对象

### 6.2 文档治理矩阵

| 文档类型 | 建议位置 | 文档性质 | AI职责 | 用户职责 | 主触发流程 |
|---|---|---|---|---|---|
| 原始需求输入 | `docs/changes/{YYYY-MM-DD-feature}/prd.md` (conditional) | 工作态事实类 | 摘录原始输入、保留来源 | 提供上下文、纠正遗漏 | `brainstorm` |
| 需求整理文档 | `docs/changes/{YYYY-MM-DD-feature}/prd.md` (conditional) | 工作态事实类 | 提炼目标、范围、约束、验收条件 | 确认意图 | `brainstorm` |
| 当前轮设计文档 | `docs/changes/{YYYY-MM-DD-feature}/design.md` | 工作态事实类 | 起草、同步设计演进 | 确认关键 trade-off | `brainstorm`、`design` |
| 当前系统规格 | `docs/current/spec/` | 事实类 | 根据 Verify readiness 与 Archive 结果同步更新 | 审阅重大偏差 | `design`、`archive` |
| 当前工作流规则 | `docs/current/workflow/` | 规则类 | 提议、代写、检查一致性 | 决策与批准 | `brainstorm`、`archive` |
| 全局决策 | `docs/decisions/` | 规则类 | 识别候选、提问、起草 | 批准后生效 | `brainstorm` 主、`archive` 补 |
| 参考原文 | `docs/references/raw/` | 来源类 | 建索引，不改原意 | 放入外部资料 | 任意 |
| 参考笔记/调研 | `docs/references/notes/`、`docs/references/research/` | 整理类 | 摘要、对比、提炼结论 | 选择是否采纳 | `brainstorm`、`design` |
| Verify evidence packet | Verify 运行输出 / acceptance state（轻量留痕） | 工作态证据类 | 生成检查结果、行为摘要、intent vs actual delta、文档对齐、冲突与缺失证据 | 审阅关键风险与缺失证据 | `verify` |
| Verify readiness | Verify 运行输出 / acceptance state（轻量留痕） | 工作态判断类 | 输出 `ready` / `ready_with_doc_updates` / `not_ready` / `needs_decision` | 确认是否进入 Archive 或先补决策/修复 | `verify` |
| 归档实现映射 | `docs/archive/{YYYY-MM-DD-feature}/implementation-mapper.md` (mandatory) | 冻结类 | 生成业务-代码-测试-验收映射 | 确认归档成立 | `archive` |
| 归档快照 | `docs/archive/` subdirs (conditional) | 冻结类 | 在 Archive authority 下复制、整理、冻结 | 确认归档成立 | `archive` |

## 7. 全局决策机制

全局决策不适合完全由 AI 自动维护，也不适合全部由用户手工维护。推荐模式为：

> AI 提案，用户裁决，AI 执笔，决策生效。

### 7.1 角色分工

- 用户拥有决策权与批准权
- AI 拥有候选识别、提问、整理和落文权
- 未经用户确认的内容，不进入正式全局决策

### 7.2 触发时机

全局决策主要嵌入以下流程：

1. `brainstorm`
   - 用于讨论原则性问题
   - 例如：需求是否必须先整理、归档最小集合是什么
2. `design`
   - 仅发现候选，不建议直接写入正式决策
3. `archive`
   - 用于补录和升格已经稳定的实践

推荐规则：

- `brainstorm` 是主触发点
- `archive` 是补录与升格点
- `implement` 阶段不应频繁触发全局决策提问

### 7.3 为什么不先做成独立 skill

在当前阶段，全局决策更像流程能力，而不是独立工具能力。

原因：

- 高度依赖当前 feature 与当前阶段上下文
- 触发规则尚在探索期
- 过早抽象为 skill 会把未成熟机制固化

因此当前建议是：

- 先把全局决策嵌入 `brainstorm` 和 `archive` 主流程
- 等触发规则稳定后，再考虑抽象为内部治理 skill

## 8. 工作流设计

### 8.1 当前工作流定位

OpenFlow 当前已经形成以下骨架：

1. `brainstorm`
2. Prometheus 计划生成与 OpenFlow 计划增强
3. 实现执行
4. verify
5. archive

该骨架不需要被 GSD 或 Superpowers 替换。

### 8.2 推荐演进后的工作流

```text
用户提出变更
  -> brainstorm（澄清需求、方案比较、生成设计/需求）
  -> 计划生成与增强（OMO + OpenFlow）
  -> 实现执行（OMO 子代理）
  -> verify（Evidence + Readiness，判断是否具备进入 closure 的条件）
  -> archive（canonicalization、current promotion、生成 `implementation-mapper`、冻结快照）
  -> 必要时将稳定实践提升到 decisions / current workflow
```

### 8.3 OpenFlow 在各阶段的职责

- `brainstorm`
  - 前置设计、需求整理、在 `changes` 工作区沉淀文档，并默认以 `design.md` 作为主入口
- `plan enhancement`
  - 注入 TDD、验证和质量要求
- `verify`
  - 作为单一完成前入口，生成 evidence packet 并输出 readiness 状态
  - readiness 状态包括 `ready`、`ready_with_doc_updates`、`not_ready`、`needs_decision`
- `archive`
  - 作为 closure 最终 authority，读取 Verify 结果，执行 canonicalization、current promotion、生成 `implementation-mapper`、复制扁平工作区文档快照、完成冻结与追溯

## 9. Verify 阶段增强方案

这是本轮评估后最值得新增的能力：将原先分散在 verification injection、acceptance 提示、漂移检测中的职责，收敛到单一 Verify 入口中。

### 9.1 当前状态

OpenFlow 已具备：

- verification 注入
- acceptance 状态持久化（可作为 Verify 轻量留痕位置）
- 文档同步提示
- 漂移检测
- `test-mapping.md` 模板

但当前仍缺少：

- 面向用户的单一 Verify 入口
- Evidence packet：检查结果、行为摘要、intent vs actual delta、文档对齐、冲突与缺失证据
- Readiness 状态：`ready`、`ready_with_doc_updates`、`not_ready`、`needs_decision`
- 与 Archive 的准入边界：只有 `ready` / `ready_with_doc_updates` 可以进入 Archive

### 9.2 外部启发

GSD 在这件事上的有效做法是：

- 从已实现内容中提炼 testable deliverables
- 按 yes/no 检查点方式带用户一步步验收
- 失败后再进入修复

### 9.3 推荐方案

将 `/openflow/verify <feature>` 设计为完成前单一入口，内部包含两个阶段。

#### Evidence 阶段

生成 evidence packet，包括：

- checks run / result
- observed behavior summary
- intent vs actual delta
- doc alignment summary
- `current` / `decisions` conflict summary
- known risks / missing evidence

#### Readiness 阶段

输出以下四态之一：

- `ready`
- `ready_with_doc_updates`
- `not_ready`
- `needs_decision`

其中 `needs_decision` 仅用于 rule 级变化、`current` 级冲突或需要显式业务裁决的事项，不用于一般 bug 或普通证据缺失。

### 9.4 Archive 准入规则

只有以下状态可以进入 Archive：

- `ready`
- `ready_with_doc_updates`

以下状态不得进入 Archive：

- `not_ready`
- `needs_decision`

`ready_with_doc_updates` 进入 Archive 时，应采用半自动确认流：Archive 先展示拟更新文档与内容范围，用户确认后再执行文档更新、current promotion 与 archive freeze。

### 9.5 为什么不建议只做瞬时输出

如果完全不留痕，会带来以下问题：

- 缺少可追溯性
- 无法复用验收口径
- 归档链路断裂
- 后续 agent 难以理解“上次到底测了什么”

因此推荐模型是：

> Verify 作为交互入口，系统保留轻量 evidence / readiness 留痕。

### 9.6 轻量留痕建议

不需要为每次 Verify 生成正式 `docs` 文档，但应至少保留以下轻量信息：

- 本次 Verify 针对哪些能力点生成
- Evidence packet 摘要
- Readiness 状态
- 是否需要文档更新或显式决策

轻量留痕可以进入：

- acceptance state
- archive 输入上下文
- 或 `current/spec` / `implementation-mapper` 中的验收变更区

不建议新增厚重的长期文档类型。

## 10. `current/workflow` 与 `references` 的维护原则

### 10.1 `docs/current/workflow/`

`docs/current/workflow/` 不是日志目录，而是：

- 当前生效的工作规则
- 面向未来默认做法的运行手册

它不应在每次实现时都改，而应只在以下时机更新：

- `brainstorm` 中用户确认新的全局流程规则后
- `archive` 中某个实践被提升为长期规则后
- 用户主动发起流程治理整理时

### 10.2 `docs/references/`

`docs/references/` 不应只是“用户资料堆放区”，推荐分层维护：

- `raw/`
  - 外部原始资料，用户主导放入
- `notes/`
  - AI 整理后的摘要与索引
- `research/`
  - 围绕某个主题形成的结构化调研

推荐职责：

- 用户负责提供原始材料
- AI 负责生成摘要、对比和与当前项目的关联说明

## 11. 分阶段维护规则

### 11.1 brainstorm

维护：

- `changes/{feature}/design.md`
- `changes/{feature}/prd.md`（按需）
- 必要时提问并更新 `decisions`
- 必要时更新 `current/workflow`

说明：其中 `changes/{feature}/prd.md` 是按需工作区文件，仅在真实需求文档存在时出现。

### 11.2 design / planning

维护：

- `current/design`
- `changes/{feature}/plan.md`（按需）
- `references/research`

### 11.3 implement

原则：

- 不主动维护规则类文档
- 只在实现明显偏离文档时提示回写

### 11.4 verify

维护：

- acceptance state
- evidence packet
- readiness 状态
- 文档更新需求
- 失败项 / 缺失证据回流到后续修正

### 11.5 archive

维护：

- `archive/{feature}`
- `current/spec`
- current promotion
- 必要时将稳定实践提升到 `decisions` 或 `current/workflow`

## 12. 实施建议

### 12.1 第一阶段：目录与治理落地

- 确认 `docs/current`、`docs/changes`、`docs/archive`、`docs/decisions`、`docs/references` 结构
- 明确 `current/` 为生命周期级稳定目录，`changes/{feature}` 采用扁平工作区文件布局，以 `design.md` 为稳定主文档，`proposal.md`、`decisions.md`、`prd.md`、`plan.md` 按需出现
- 明确 `archive/{feature}` 强制生成 `implementation-mapper.md`，其余扁平工作区文件仅在源文件存在时复制
- 明确新写入遵循扁平工作区文件规则，既有历史文档保持原位置可读，兼容性读取持续启用
- 将现有散落文档逐步迁移到对应位置
- 明确事实类/规则类文档边界

### 12.2 第二阶段：全局决策提案机制

- 在 `brainstorm` 中加入“全局决策候选识别”
- 在 `archive` 中加入“实践升格为全局规则”的补录逻辑
- 仅在用户确认后写入 `docs/decisions/`

### 12.3 第三阶段：Verify 命令重设计

- 将 `/openflow/verify <feature>` 收敛为完成前单一入口
- 引入 Evidence + Readiness 两阶段
- 输出 `ready` / `ready_with_doc_updates` / `not_ready` / `needs_decision`
- 明确 Archive 是最终 authority，负责 current promotion 与 archive freeze
- 保留轻量留痕，不新增重型文档

## 13. 非目标

以下内容不属于本方案当前目标：

- 不重建 OMO 的代理编排系统
- 不引入完整的 GSD phase/milestone 引擎
- 不将所有验收输出都沉淀为长期文档
- 不在实现阶段频繁触发全局治理对话
- 不把所有局部决策都提升为全局规则

## 14. 最终结论

本方案的最终方向是：

1. OpenFlow 保持对 OMO 的增强层定位，不重复建设执行编排能力
2. 文档体系采用偏 `OpenSpec` 的演进式结构：`current + changes + archive`
3. 目录调整遵循“顶层生命周期分区稳定、feature 工作区扁平化”的原则：`current/` 维持稳定分区，`changes/{feature}` 以 `design.md` 为稳定主文档，其余工作区文件按需出现，`archive/{feature}` 仅复制真实存在的扁平文档
4. 文档治理按"事实类由 AI 同步，规则类由用户拍板"运行
5. 新文档遵循扁平工作区文件规则，已存在历史文档保持原位置可读，通过兼容性读取消化过渡，而不要求立即做历史迁移
6. 全局决策优先嵌入 `brainstorm` 和 `archive` 流程，而非一开始就做成独立 skill
7. 对 GSD 的重点吸收项，是通过 Verify 的 Evidence + Readiness 机制提供完成前的证据与准备度判断
8. `archive` 不再产出 `SRS` 目录，而是产出单一主文档 `implementation-mapper.md`
9. `changes` 中不包含 `SRS`；计划目录统一命名为 `plans/`
10. Verify 应以命令形式提供，并配套轻量 evidence / readiness 留痕，而不是新增厚重文档类型

一句话总结：

> OpenFlow 的未来不是成为第二个 orchestrator，而是成为 OMO 之上的文档治理、Verify readiness、Archive canonicalization 与归档追溯层。
