# OpenFlow Process Integration Implementation Plan

## 计划概述

| 项目 | 内容 |
|------|------|
| **目标** | 落地 `docs/changes/openflow-process-integration` 中定义的统一流程：brainstorm 收口 → 正式文档生成 → 实现与验证 → archive → current 提升 |
| **范围** | 仅覆盖整合 PRD / Design 中明确要求的流程能力，不扩展到额外特性 |
| **计划类型** | 严格执行计划 |
| **执行原则** | 小步提交、阶段闸门、证据先行、失败即回退 |
| **最终验收** | 完整端到端流程可运行，且每个阶段都有可重复的验证证据 |

---

## 1. 目标文档

本计划以以下文档为唯一范围依据：

- `docs/changes/openflow-process-integration/requirements/20260324-prd.md`
- `docs/changes/openflow-process-integration/design/20260324-design.md`

本计划执行时，任何新增工作如果无法映射到上述两份文档，默认判定为越界。

---

## 2. 交付目标

本计划完成时，系统必须满足以下结果：

1. brainstorm 阶段可识别收口信号，并从讨论态进入正式文档生成。
2. 文档生成遵循新职责边界：Design 必生成，PRD / Decisions 按语义裁决。
3. 实现完成态可触发非阻塞验证提示。
4. 验证失败会进入明确闭环，而不是直接 archive。
5. archive 阶段可给出 `ADD / UPDATE / REMOVE` 的 current 提升建议。
6. 用户可以覆盖 current 提升建议。
7. 从 brainstorm 到 current promotion 的完整链路可被端到端验证。

---

## 3. 严格标准

### 3.1 范围标准

1. 不新增 PRD / Design 之外的流程能力。
2. 不重写现有 OpenFlow 主架构，只在既有模块内做定向增强。
3. 不把验证改成强阻塞。
4. 不跳过 archive 直接写 `docs/current/`。

### 3.2 设计标准

1. **单一职责**：新增逻辑优先放入专用 helper / phase 模块，避免继续堆积到重型 hook。
2. **幂等性**：文档生成裁决、验证提示、archive 提升建议必须可重复执行而不产生重复副作用。
3. **可解释性**：所有自动判定必须能输出“为什么这样判定”。
4. **向后兼容**：未触发新流程时，不破坏现有 current / changes / archive 行为。

### 3.3 质量标准

1. 每个阶段完成前必须满足该阶段的二进制验收标准。
2. 每个阶段完成后必须运行对应测试，且记录实际输出。
3. 新增或修改的关键逻辑必须至少有一个自动化测试覆盖。
4. 端到端路径必须通过真实场景验证，不接受“理论上可行”。

### 3.4 失败标准

以下任一成立，当前阶段视为失败，不得进入下一阶段：

1. 验收标准中任一项不能以通过/失败直接判定。
2. 测试输出与预期不一致。
3. 出现未解释的状态漂移或重复副作用。
4. 变更影响超出计划标定模块但未更新计划。

---

## 4. 实施范围与模块映射

### 4.1 核心修改区域

| 工作域 | 主要模块 |
|------|------|
| Brainstorm 收口 | `src/hooks/brainstorm-workflow.ts`, `src/hooks/chat-message.ts`, `src/skills/brainstorm-skill.ts` |
| 文档生成裁决 | `src/phases/brainstorm/prd-generator.ts`, `src/hooks/tool-after.ts`, `src/config.ts` |
| 验证提示与闭环 | `src/hooks/tool-before.ts`, `src/hooks/acceptance.ts`, `src/plan/enhancer.ts`, `src/utils/verification-checks.ts` |
| Archive 与 current 提升 | `src/commands/archive.ts`, `src/phases/archive/`, `src/utils/acceptance-state.ts` |
| 类型与配置 | `src/types.ts`, `src/config.ts` |

### 4.2 关键新增点

1. `Closure Ready` 状态判定。
2. 文档生成裁决逻辑。
3. 完成态验证提示触发器。
4. 验证失败分类闭环。
5. `current-promotion` 模块与 `ADD / UPDATE / REMOVE` 建议模型。

---

## 5. 执行波次

### Wave 0：基线确认

**目标**：确认当前实现基线，冻结计划执行范围。

**任务**：

1. 读取并确认目标 PRD / Design 是最新依据。
2. 盘点现有模块职责与未实现能力。
3. 确认 `current promotion` 目前缺失，作为新增点单独跟踪。

**验收标准**：

- [ ] 所有后续任务都能映射到 PRD / Design 条目
- [ ] 所有目标模块已列入计划
- [ ] 关键缺口已明确记录

**QA**：

- 重新核对计划范围与两份目标文档的一致性

---

### Wave 1：类型、配置与状态基建

**目标**：先补齐不会破坏现有流程的底层结构。

**任务 1：扩展类型定义**

- 修改 `src/types.ts`
- 新增闭环所需类型：`ClosurePhase`、`PromotionType`、`CurrentPromotionSuggestion`、验证失败分类类型

**验收标准**：

- [ ] 新类型可表达收口、验证闭环、current promotion 三类新状态
- [ ] 无旧类型被无意删除

**QA**：运行 TypeScript 类型检查，验证新增类型可被导入

**任务 2：扩展配置结构**

- 修改 `src/config.ts`
- 增加 closure / promotion 相关配置

**验收标准**：

- [ ] 默认配置不报错
- [ ] 未配置新字段时保持兼容

**QA**：加载默认配置与含新字段配置各一次，确认都可解析

**任务 3：扩展 acceptance / workflow state**

- 修改 `src/utils/acceptance-state.ts`
- 增加完成态验证与 promotion 所需状态字段

**验收标准**：

- [ ] 状态结构可表达“待验证 / 验证失败 / 已归档 / 待提升 current”
- [ ] 旧状态读取不崩溃

**QA**：对旧状态样本与新状态样本各执行一次读写测试

**Gate 1（进入下一波前必须全部通过）**：

- [ ] `bun run typecheck` 通过
- [ ] 相关单元测试通过
- [ ] 状态兼容性测试通过

---

### Wave 2：Brainstorm 收口机制

**目标**：把 brainstorm 从开放讨论改造成可进入 `Closure Ready` 的有出口流程。

**任务 4：实现收口信号识别**

- 修改 `src/hooks/brainstorm-workflow.ts`
- 支持强收口信号 + 弱收口信号结合上下文

**验收标准**：

- [ ] 强收口信号可直接命中 `Closure Ready`
- [ ] 弱收口信号不会在信息不足时误触发

**QA**：至少 4 组输入样例：强命中、弱命中、误报防御、无关文本

**任务 5：在消息流中接入收口出口**

- 修改 `src/hooks/chat-message.ts`
- 收口后不再继续开放式追问，进入文档生成阶段

**验收标准**：

- [ ] 检测到收口时触发文档生成分支
- [ ] 未收口时仍保持现有 brainstorm 提示语义

**QA**：模拟对话流，验证两条路径都成立

**任务 6：调整 brainstorm skill 阶段语义**

- 修改 `src/skills/brainstorm-skill.ts`
- 输出必须反映“讨论结束后进入正式文档”而不是停在 brainstorm

**验收标准**：

- [ ] skill 描述与新阶段模型一致
- [ ] 不再鼓励无限延长 brainstorm

**QA**：检查生成提示文本与阶段定义一致

**Gate 2**：

- [ ] 收口识别单元测试通过
- [ ] 对话流集成测试通过
- [ ] skill 文本审查通过

---

### Wave 3：文档生成裁决与职责边界

**目标**：让文档生成遵循“Design 必选，PRD / Decisions 按语义触发”。

**任务 7：重构文档生成裁决**

- 修改 `src/phases/brainstorm/prd-generator.ts`
- 按语义判断是否生成 PRD / Decisions

**验收标准**：

- [ ] 未指定范围时一定生成 Design
- [ ] 明确产品目标时生成 PRD
- [ ] 存在关键取舍时生成 Decisions
- [ ] 不确定时可补齐整包

**QA**：至少 4 个文档生成场景测试

**任务 8：接通收口后的生成流程**

- 修改 `src/hooks/tool-after.ts`
- 保证收口出口能驱动文档生成，而不是只在单一路径下生成 PRD

**验收标准**：

- [ ] 收口后的生成路径可执行
- [ ] 不会重复生成同一文档

**QA**：连续触发两次生成，验证幂等

**任务 9：路径与落盘策略确认**

- 修改 `src/config.ts`（如需要）
- 确保新生成文档进入 `docs/changes/{feature}/`

**验收标准**：

- [ ] 文档写入路径符合整合设计
- [ ] 不破坏 current 路径读取兼容

**QA**：实际生成一次文档并检查目标路径

**Gate 3**：

- [ ] 文档生成规则测试通过
- [ ] 幂等测试通过
- [ ] 真实落盘路径验证通过

---

### Wave 4：完成态验证提示与失败闭环

**目标**：在不阻塞用户的前提下，把验证变成明确的完成态关卡。

**任务 10：完成态验证触发器**

- 修改 `src/hooks/tool-before.ts`
- 在任务完成态与 archive 前触发验证提示

**验收标准**：

- [ ] 任务完成态能触发提示
- [ ] archive 前能再次触发提示
- [ ] 默认行为是提示，不是强制执行

**QA**：模拟完成态与 archive 前两种入口

**任务 11：接入 acceptance 提示层**

- 修改 `src/hooks/acceptance.ts`
- 统一完成态、验收态与验证提示语义

**验收标准**：

- [ ] acceptance 中能识别需要验证的状态
- [ ] 不会把普通对话误判为完成态

**QA**：完成态 / 非完成态对照测试

**任务 12：实现失败分类闭环**

- 修改 `src/plan/enhancer.ts` 及相关验证辅助逻辑
- 明确质量类、安全类、一致性类失败路径

**验收标准**：

- [ ] 三类失败路径都有明确回退动作
- [ ] 安全类失败会阻断 archive

**QA**：分别模拟三类失败并验证状态转移

**Gate 4**：

- [ ] 完成态提示测试通过
- [ ] 失败分类测试通过
- [ ] 非阻塞行为人工验证通过

---

### Wave 5：Archive 与 Current Promotion

**目标**：把 current 更新收敛到 archive 阶段，并保留用户覆盖权。

**任务 13：新增 current promotion 模块**

- 新建 `src/phases/archive/current-promotion.ts`
- 负责生成 `ADD / UPDATE / REMOVE` 建议

**验收标准**：

- [ ] 三类建议都可表达
- [ ] 每条建议都包含原因与目标路径

**QA**：构造 ADD / UPDATE / REMOVE 三组样本输入

**任务 14：把 current promotion 接入 archive 命令**

- 修改 `src/commands/archive.ts`
- 在 archive 完成后生成建议并允许用户覆盖

**验收标准**：

- [ ] archive 之后才触发 current promotion
- [ ] 不会在 archive 前写入 current
- [ ] 用户可覆盖建议

**QA**：实际 archive 流程演练 1 次，验证覆盖路径

**任务 15：扩展 archive phase 与 acceptance state**

- 修改 `src/phases/archive/` 与 `src/utils/acceptance-state.ts`
- 记录 promotion 状态与结果

**验收标准**：

- [ ] archived 后状态可进入 promotion
- [ ] promotion 完成后状态正确收束

**QA**：检查状态转移轨迹

**Gate 5**：

- [ ] current promotion 单元测试通过
- [ ] archive 集成测试通过
- [ ] current 未提前写入验证通过

---

### Wave 6：端到端测试与最终验证

**目标**：证明完整流程可重复执行。

**任务 16：端到端 Happy Path**

- 场景：brainstorm 收口 → 文档生成 → 实现完成态 → 验证提示 → archive → current promotion

**验收标准**：

- [ ] 全链路一次成功跑通
- [ ] 各阶段输出与目标文档一致

**QA**：保留完整日志与实际输出

**任务 17：关键失败路径回归**

- 场景 A：质量类失败
- 场景 B：安全类失败
- 场景 C：一致性类失败

**验收标准**：

- [ ] 三条失败路径都能正确回退
- [ ] 安全类失败不会进入 archive

**QA**：展示每条失败路径的状态与输出

**任务 18：兼容性回归**

- 场景：未触发新流程的旧项目执行常规 OpenFlow 工作流

**验收标准**：

- [ ] 旧流程不被破坏
- [ ] 旧路径候选读取仍正常

**QA**：执行最小兼容场景并记录输出

**Final Gate（只有全部通过才允许宣告完成）**：

- [ ] `bun run typecheck` 通过
- [ ] 自动化测试全部通过
- [ ] 端到端 Happy Path 通过
- [ ] 失败路径回归通过
- [ ] 兼容性回归通过
- [ ] 手动 QA 输出已保存

---

## 6. 测试策略

### 6.1 单元测试

覆盖以下逻辑：

1. 收口信号匹配与误报防御。
2. 文档生成裁决函数。
3. 验证失败分类函数。
4. `current promotion` 建议生成函数。

### 6.2 集成测试

覆盖以下链路：

1. brainstorm → 文档生成。
2. 完成态 → 验证提示。
3. archive → current promotion。
4. 用户覆盖 current suggestion。

### 6.3 手动 QA

必须执行以下真实场景：

1. 输入强收口语句，观察是否进入文档生成。
2. 构造仅需 Design 的简单场景，验证不会错误生成整包。
3. 构造复杂场景，验证 PRD / Decisions 按规则生成。
4. 在完成态观察验证提示是否为非阻塞。
5. 执行 archive，确认 current promotion 在 archive 之后发生。

### 6.4 证据要求

每项测试都必须保留：

1. 执行命令。
2. 实际输出。
3. 结果判定（PASS / FAIL）。
4. 若失败，记录回退动作。

---

## 7. 风险与控制

| 风险 | 影响 | 控制措施 |
|------|------|----------|
| 收口误判 | 提前结束 brainstorm | 强/弱信号分层 + 误报测试 |
| 文档重复生成 | 产生脏文档 | 幂等检查 + 双次触发测试 |
| 验证提示过度打断 | 用户体验下降 | 非阻塞默认 + 手动 QA |
| archive 逻辑回归 | 破坏现有归档 | promotion 独立模块 + archive 集成测试 |
| current 污染 | 未完成内容进入 current | 只允许 archive 后 promotion |

---

## 8. 回退规则

1. 任一 Gate 未通过，不得进入下一波。
2. 若某阶段引入状态污染，必须先回退该阶段变更，再重新实施。
3. 若 archive / current promotion 出现错误写入，必须先恢复到 archive 前状态，再修复逻辑。
4. 若端到端测试失败但单元测试通过，优先检查状态衔接与副作用顺序，不得直接放宽验收标准。

---

## 9. Definition of Done

只有以下全部满足时，本计划才算完成：

1. 所有 Wave 的 Gate 全部通过。
2. 目标 PRD / Design 中的要求均已有对应实现与测试。
3. 完整链路从 brainstorm 到 current promotion 可重复跑通。
4. 所有验证均有实际证据，不存在“理论通过”。
5. 未触发新流程的旧路径仍兼容。

---

## 10. 执行备注

这是一份严格执行计划，不是建议清单。执行时必须按波次推进，并在每个 Gate 处显式停下来验证；任何试图跳过测试、合并阶段、或先做 current promotion 再补验证的做法，都视为偏离计划。
