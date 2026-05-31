# stateful-quality-guardrails - Design

## Human Consensus Summary

Feature title: 状态化质量护栏
Internal slug: stateful-quality-guardrails
Source intent: 优化 OpenFlow 工作流，把 quality-gate、readiness freshness、实现期状态从提示型建议升级为状态化硬约束，防止 AI 在未完成验证前声称完成。
Problem or improvement target: 当前 OpenFlow 的文档治理模型清晰，但实现阶段仍主要依赖 prompt 自律；AI 可以跳过设计、计划或 quality-gate，并在没有 fresh readiness 的情况下口头宣布完成。
Expected result: 代码变更会污染实现状态，quality-gate 会清洁状态，archive 与完成声明只能基于 fresh verified state 继续。

## Identity And Assumptions

- Feature slug: stateful-quality-guardrails
- Feature title: 状态化质量护栏
- Scope: workflow
- Source intent: 优化工作流，而不是新增独立业务能力。
- Assumptions:
  - OpenFlow 继续定位为 OpenCode/OMO 之上的治理层，不重复实现完整 orchestrator。
  - Archive 仍是最终 authority，但不能再是唯一真正硬门禁。
  - Quality gate 本身的风险评估、harden、verify 能力继续复用现有实现。
  - 初版以状态污染、完成声明拦截、freshness 判定为主，不要求完全禁止所有无 feature 的编辑。
- Pending confirmations:
  - 是否允许提供 explicit no-feature exception 以支持 trivial 或 emergency 修改。

## Overview

本 feature 将 OpenFlow 的质量治理从“建议 AI 应该怎么做”推进到“状态决定 AI 能否声称完成”。核心模型是：实现类文件变更会把当前 feature/issue session 标记为 dirty；只有 `openflow-quality-gate` 产生 fresh readiness 后，状态才能转为 verified；如果 verified 后继续修改代码，readiness 立即失效。聊天完成声明、archive readiness、implementation handoff 都必须读取这个状态，而不是只依赖 prompt 文案。

## Problem

当前 OpenFlow 已经具备文档分层、issue packet、quality-gate、archive readiness gate，但生产级审查发现执行约束落点过晚：

- `/openflow-feature` 与 `/openflow-writing-plan` 可以生成设计和计划提示，但无法阻止 AI 不走设计直接写代码。
- `openflow-quality-gate` 内部能力完整，但触发依赖 AI 自觉调用。
- `chat-message` 对完成语义只输出 non-blocking verification suggestion。
- `acceptance-state` 记录 readiness，却没有在后续代码变更后自动污染或失效。
- `archive` 是强门禁，但如果 AI 不进入 archive，用户仍可能得到未验证的“完成”声明。

这导致 OpenFlow 的文档能提高可追溯性，却还不能可靠约束 AI 一次性交付。

## Goals

- 将实现期状态显式化：clean、dirty、verification_pending、verified、stale、blocked。
- 在 runtime/test/public API 等实现类文件写入后，自动标记当前 feature/issue 为 dirty，并使旧 readiness 失效。
- 在 AI 准备输出完成声明时，如果存在 dirty/stale implementation state，则阻止或强烈拦截完成声明，要求先运行 `openflow-quality-gate`。
- 保持 archive 的最终 authority，同时让 archive 只接受 fresh verified state。
- 对缺少设计/计划/issue 上下文的实现变更，降级为 limited-context，并禁止产生 archive-ready 结论。
- 不让 AI 为了通过门禁而自动补写 `design.md`、`behavior.md`、`plan.md` 或 `issue-clarification.md`。

## Non-Goals

- 不重写 `openflow-quality-gate` 的 harden/verify 核心算法。
- 不把 OpenFlow 变成独立任务编排器或替代 OMO/OpenCode 的执行系统。
- 不禁止所有无 feature 的文件编辑；trivial、配置、文档类改动可以按适用性分类降级处理。
- 不依赖 Drift Guardian 作为唯一强制门；Guardian 仍作为 drift evidence 来源。
- 不自动生成缺失工作流文档来让 readiness 变绿。

## Proposed Workflow

```text
feature / issue context
  → implementation write/edit detected
    → implementation_state = dirty
    → previous readiness = stale
  → AI attempts completion claim
    → if dirty/stale: Completion Blocked Until Quality Gate
    → run openflow-quality-gate
      → fresh readiness saved
      → implementation_state = verified | blocked
  → archive
    → requires matching fresh verified state
```

## Components

### Implementation State Tracker

**Purpose**: 在 `tool-after` 中识别实现类写入，并把 acceptance/session 状态从记录型升级为约束型。

**Responsibilities**:
- 分类变更文件：runtime code、test、public API、workflow docs、metadata、docs-only。
- 对实现类变更设置 `implementationDirty = true` 或等价状态。
- 记录 dirty timestamp、changed files、sessionID、feature/issue slug。
- 如果已有 readiness，则标记 evidence freshness 为 stale。

### Completion Claim Guard

**Purpose**: 在 `chat.message` 中识别 AI 完成声明，并在状态未验证时阻断或注入强约束提示。

**Responsibilities**:
- 检测 “完成了 / done / finished / ready to archive / 可以收尾” 等完成语义。
- 如果当前状态 dirty/stale 且没有 fresh readiness，输出 `Completion Blocked Until Quality Gate`。
- 明确要求 AI 调用 `openflow-quality-gate`，不得声称完成。
- 对 docs-only/design-only/planning-only 任务按 quality-gate applicability 允许非实现收口。

### Freshness Gate

**Purpose**: 统一判定 readiness 是否仍然能代表当前工作区。

**Responsibilities**:
- 比较 readiness 生成时的 workspace state 与当前 changed files。
- 如果 verified 后又发生实现类修改，自动失效。
- 为 `archive`、`quality-gate`、completion guard 提供同一判定结果。

### Workflow Context Guard

**Purpose**: 防止没有设计/计划/issue 语义上下文的实现变更被误认为完整就绪。

**Responsibilities**:
- 发现实现类变更但缺少 design/behavior/issue context 时，标记为 limited-context。
- limited-context 可以运行技术检查，但不得产生 archive-ready 语义结论。
- 提示用户显式进入 `/openflow-feature`、`/openflow-issue` 或接受 limited-context 风险。

## Behavior Alignment

| Behavior Scenario | Design Response | Risk |
|------------------|-----------------|------|
| AI 修改源码后直接说完成 | Completion guard 阻断完成声明，要求先运行 quality-gate。 | High |
| quality-gate 通过后又改代码 | Freshness gate 标记 readiness stale，archive 和完成声明不再接受旧结果。 | High |
| 没有 feature/issue 上下文但发生实现类变更 | 允许技术 verify，但标记 limited-context，禁止 archive-ready。 | High |
| 纯设计或计划文档变更 | 不强行要求 implementation quality-gate，按 NotApplicable/SkippedByStage 收口。 | Medium |
| AI 为了通过门禁补写最小设计文档 | 明确禁止，缺失上下文只能提示显式命令或 limited-context 风险。 | High |

## Design Constraints

- [must] 代码变更后的 readiness freshness 必须由状态和 workspace snapshot 判定，不能只靠 AI 自述。
- [must] runtime/test/public API 变更后，旧 readiness 必须失效。
- [must] AI 在 dirty/stale 状态下不得声称实现完成。
- [must] `openflow-quality-gate` 是清洁 dirty/stale 实现状态的标准路径。
- [must] Archive 只能接受 matching feature/issue 且 fresh 的 verified readiness。
- [must] 缺失 workflow artifact 不授权 AI 自动创建文档。
- [should] 完成声明拦截优先使用强提示；如果 OpenCode hook 支持硬阻断，可升级为阻断。
- [should] 保持对 docs-only、design-only、planning-only 的轻量路径，避免把治理成本扩散到所有操作。

## Success Criteria

- [ ] 源码或测试文件变更后，acceptance/session state 进入 dirty 或 stale 状态。
- [ ] AI 输出完成语义时，如果存在 dirty/stale 状态，会看到 `Completion Blocked Until Quality Gate` 或等价强约束提示。
- [ ] `openflow-quality-gate` 通过后，状态转为 verified，并保存 freshness metadata。
- [ ] verified 后再次修改实现类文件，旧 readiness 被标记 stale。
- [ ] `/openflow-archive` 对 stale readiness 返回阻断提示。
- [ ] 缺少 design/behavior/issue context 的实现变更不会被判定为 archive-ready。
- [ ] design-only/planning-only/docs-only 变更不会被误判为实现完成。

## Risks And Mitigations

- **Risk**: 完成声明拦截误伤纯文档任务。  
  **Mitigation**: 使用 change applicability 分类，只有 runtime/test/public API 等实现类变更触发 dirty hard path。
- **Risk**: 用户需要快速修 trivial bug，流程成本变高。  
  **Mitigation**: 支持 low-risk technical verify 路径，但 readiness 仍需 fresh；可记录 explicit no-feature exception。
- **Risk**: Hook 只能注入提示，无法真正阻止模型输出。  
  **Mitigation**: 初版使用强约束提示和状态门禁；archive 继续硬阻断，未来根据 OpenCode 能力升级为硬阻断。
- **Risk**: 状态污染与现有 acceptance-state 字段兼容复杂。  
  **Mitigation**: 先扩展 metadata 字段，不破坏现有 readiness 枚举；保持旧 archive gate 兼容。

## Testing Strategy

- Unit tests for implementation change classification.
- Hook tests for `tool-after` marking dirty/stale after runtime/test edits.
- Hook tests for completion phrase producing blocked quality-gate prompt when dirty/stale.
- Quality-gate tests proving successful verify clears dirty state and records freshness.
- Archive tests proving stale readiness blocks archive.
- Regression tests proving design-only/planning-only/docs-only changes remain NotApplicable/SkippedByStage.
