# openflow-feature 优化工作状态

> AI-managed working state. This file records the current Feature Brief for this feature workspace. It is not a formal design document and does not participate in Cross-Validation.

## Feature Identity

- Directory: `2026-05-25-openflow-feature-optimization`
- Semantic name: `openflow-feature-optimization`
- Status: `complete`
- State authority: `state.md` is working memory before generation; formal documents are the factual source after generation.

## Feature Brief

### problem

- value: 现有 `/openflow-feature` 在自然语言澄清、文档生成、上下文管理和文档治理边界上存在重复提问、长上下文丢失、文档职责不清、feature 身份解析不自然等问题。
- confidence: high
- source: explicit

### target-users

- value: 使用 OpenFlow 进行 feature 设计的用户、当前 session 中协助设计的 AI agent、后续读取 feature 文档的 plan / implement / archive 命令。
- confidence: high
- source: explicit

### scope

- value: 对现有 `/openflow-feature` 的增强和流程改造，不涉及代码实现阶段、不运行质量门、不生成 planning 产物。
- confidence: high
- source: explicit

### priority

- value: 优先保证自然语言体验、上下文不污染、文档集干净、设计与行为文档强制生成、Cross-Validation 可作为完成条件。
- confidence: high
- source: explicit

### constraints

- value:
  - 功能始终启用，不用配置控制。
  - 一个 session 只能有一个 feature。
  - `/openflow-feature <text>` 中的文本是需求描述，不是 feature id。
  - Feature 目录名由 AI 根据日期和语义自动生成。
  - Feature 目录名一旦创建即固定，跨日不重命名。
  - Feature Brief 持久化到 `docs/changes/{feature}/state.md`。
  - 不生成 `design.meta.json` / `behavior.meta.json`。
  - `design.md` 和 `behavior.md` 强制生成。
  - `proposal.md` 不属于默认流程。
  - Cross-Validation 包含结构性检查与语义检查。
  - AI 自然语言修改不得超出 `docs/changes/{feature}/*`。
  - Candidate Global 决策在设计阶段告知，归档阶段自动提升。
  - 实现以重构为主，优先使用规则模型、策略、验证器和状态机表达规则。
  - 历史代码清理优先于保留旧 fallback；不得残留会污染新语义的旧逻辑。
  - `state.md` 不记录聊天流水，只记录结构化工作状态。
  - 当前 session 重启但不是新会话时，从 `state.md` 恢复 Feature Brief，并结合当前上下文校验。
  - Cross-Validation Summary 是缓存，不是唯一事实来源。
  - complete 后修改正式文档会退出 complete，直到重新验证通过。
  - 语义名解析歧义时拒绝，要求使用完整日期目录名。
  - 主流程顺序固定：session 检测 → state 恢复/初始化 → brief 更新 → 槽位收敛 → 文档集选择 → 确认 → 写入 → Cross-Validation → 输出。
  - `state.md` 必须原子写入，写入或恢复失败阻止正式文档生成。
  - Cross-Validation 输入顺序固定为 requirements/prd/design/behavior/decisions。
  - `/openflow-feature` 必须走 command dispatch / chat hook，不得由 AI 当普通聊天自由解释。
  - `state.md` / FeatureSession 是设计阶段令牌；无当前 state 不得写正式文档。
  - `/openflow-writing-plan` 只能接收 complete + Cross-Validation Passed 的 feature。
- confidence: high
- source: explicit

## Stable Decisions

- Feature Brief 使用 `state.md`，不使用 meta JSON。
- `state.md` 恢复必须校验当前上下文；不一致时不得静默恢复。
- 当前 session 已有 feature 的检测基于 session state，而不是目录存在性。
- 日期前缀 feature 目录名是现有命名约定；语义名仅作为目录名的一部分和后续命令兼容输入。
- `/openflow-writing-plan` 应同时兼容完整日期目录名和不带日期的语义名。
- ADR-001 中已确认冲突的默认文档治理规则可以直接更新。
- 已直接更新 ADR-001 的 Candidate Global 决策在 `decisions.md` 中标记 `Promotion status: already reflected in ADR-001 update`。
- 条件文档必须有明确生成原因，不得为完整而生成。
- Critical Blocking Gap 采用保守原则，涉及安全、权限、数据删除、自动执行、跨 session、全局制度提升时默认 Critical。
- 实现阶段应清理旧的 `proposal.md` 默认逻辑、meta JSON、固定问卷、跨 session 查找和 active feature 查找。
- `decisions.md` 写入需要去重；决策反转时更新原 Decision，不追加冲突项。
- 失败引导按严重级别输出：Non-blocking 给建议，Blocking 给选项，Critical 给风险和解决方案并等待确认。
- 同一 session、同一 feature 重复触发生成时幂等返回现有状态；只有显式重新生成才覆盖。

## Open Questions

- None.
