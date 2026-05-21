# Plan: stateful-quality-guardrails

## Overview
本计划把 OpenFlow 的质量治理从 advisory prompt 升级为 stateful guardrail：实现类变更会污染当前 feature/issue 的 readiness，`openflow-quality-gate` 成为清洁状态的标准路径，完成声明与 archive 都必须依赖 fresh verified state，而不是复用过期验证结果。

## Design Context
- Design workspace: `docs/changes/2026-05-18-stateful-quality-guardrails/`
- Primary design docs:
  - `docs/changes/2026-05-18-stateful-quality-guardrails/design.md`
  - `docs/changes/2026-05-18-stateful-quality-guardrails/behavior.md`
- Key constraints:
  - 不重写 `openflow-quality-gate` 的 harden/verify 核心算法。
  - 不把 OpenFlow 变成新的 orchestrator。
  - 不允许通过自动补写 `design.md` / `behavior.md` / `plan.md` / `issue-clarification.md` 来让 readiness 变绿。
  - 非实现阶段必须保留 `NotApplicable/SkippedByStage` 的轻量路径。

## Execution Strategy

### Parallel Execution Waves
- **Wave 1**: 建立状态模型与持久化基础。
- **Wave 2**: 在写入路径污染 dirty/stale 状态，并并行补上完成声明拦截。
- **Wave 3**: 将 freshness / limited-context 规则接入 quality-gate 与 archive。
- **Wave 4**: 回归测试、类型检查、质量门收口。

### Dependency Matrix
| Task | Blocked By | Blocks |
|------|------------|--------|
| 1. 扩展状态模型与持久化 | - | 2, 3, 4, 5 |
| 2. 写入路径污染 dirty/stale 状态 | 1 | 4, 5, 6 |
| 3. 完成声明拦截 | 1 | 6 |
| 4. quality-gate fresh/limited-context 集成 | 1, 2 | 5, 6 |
| 5. archive stale-readiness 门禁 | 1, 2, 4 | 6 |
| 6. 回归验证与质量门收口 | 2, 3, 4, 5 | - |

## Tasks

- [x] 1. 扩展 acceptance / readiness 状态模型与持久化层（Agent: unspecified-high | Blocks: [2, 3, 4, 5] | Blocked By: [-]）

  **What to do**
  - 在 `src/types.ts` 为 acceptance/readiness 生命周期增加显式实现状态字段，至少覆盖 dirty / verified / stale / blocked 的可持久化表达。
  - 在 `src/utils/acceptance-state.ts` 增加与该状态模型配套的读写、失效、清洁、特征匹配辅助函数，保证 freshness 不再只依赖口头语义或旧 readiness 字段。
  - 保持现有 `readiness`、`qualityGateApplicability`、`evidenceFreshness` 字段兼容，避免破坏现有 archive / verify 流程。

  **Recommended Agent Profile**
  - Category: `unspecified-high` — 该任务涉及跨类型定义、状态序列化与向后兼容。
  - Skills: `[]`

  **Parallelization**
  - Wave 1
  - Can Parallel: NO

  **References**
  - `src/types.ts:219-320` — OpenFlowConfig、OpenFlowContext、Feature/Acceptance 相关类型入口。
  - `src/utils/acceptance-state.ts:1-260` — 当前 acceptance state 字段解析与持久化格式。
  - `tests/utils/acceptance-state.test.ts:42-160` — 现有 round-trip 与 readiness 回归测试模式。

  **Acceptance Criteria**
  - [ ] `AcceptanceState` 能表达实现变更污染后的 dirty/stale 状态，并可被持久化/反序列化。
  - [ ] 新状态不会破坏现有 readiness round-trip 测试语义。
  - [ ] 存在显式 helper 供 hook / quality-gate / archive 统一读取 freshness 与状态。

  **Verification Commands**
  - `bun test tests/utils/acceptance-state.test.ts`
  - `npm run typecheck`

- [x] 2. 在 write/edit 路径污染实现状态并使旧 readiness 失效（Agent: unspecified-high | Blocks: [4, 5, 6] | Blocked By: [1]）

  **What to do**
  - 在 `src/hooks/tool-after.ts` 与必要的策略文件（优先检查 `src/hooks/tool-after-policy.ts` 是否已有合适分类器）中识别实现类变更：`src/` runtime code、tests、commands、hooks、public API 等。
  - 对实现类变更调用 Task 1 的状态 helper，把 matching feature/issue state 标记为 dirty 或 stale，并失效旧 readiness freshness。
  - 保留 docs/design/plan-only 轻量路径，不要把所有 write/edit 都当成实现完成。

  **Recommended Agent Profile**
  - Category: `unspecified-high` — hook 行为、状态污染与已有 prompt side-effect 需要谨慎兼容。
  - Skills: `[]`

  **Parallelization**
  - Wave 2
  - Can Parallel: YES（可与 Task 3 并行）

  **References**
  - `src/hooks/tool-after.ts:28-157` — 当前 plan enhancement、file change tracking、acceptance doc prompt 入口。
  - `tests/hooks/tool-after.test.ts:21-180` — tool-after 的测试夹具与现有 acceptance prompt 断言方式。
  - `docs/changes/2026-05-18-stateful-quality-guardrails/behavior.md:36-48` — Scenario 1: 实现变更污染 readiness。

  **Acceptance Criteria**
  - [ ] 实现类 write/edit 后，matching acceptance state 变为 dirty 或 stale。
  - [ ] docs-only / design-only / planning-only write/edit 不会误触发 implementation dirty hard path。
  - [ ] 若已有 verified readiness，再次修改实现类文件会明确失效旧 readiness。

  **Verification Commands**
  - `bun test tests/hooks/tool-after.test.ts tests/utils/acceptance-state.test.ts`
  - `npm run typecheck`

- [x] 3. 拦截未验证完成声明（Agent: unspecified-high | Blocks: [6] | Blocked By: [1]）

  **What to do**
  - 在 `src/hooks/chat-message.ts` 中，把当前 non-blocking completion suggestion 升级为基于状态的 completion guard。
  - 当存在 dirty/stale implementation state 且没有 fresh verified readiness 时，输出 `Completion Blocked Until Quality Gate` 或等价强约束提示。
  - 明确要求执行者先调用 `openflow-quality-gate`，并避免影响 design-only / planning-only / docs-only 场景。

  **Recommended Agent Profile**
  - Category: `unspecified-high` — 需要在对话钩子中平衡 UX、误报和强约束语义。
  - Skills: `[]`

  **Parallelization**
  - Wave 2
  - Can Parallel: YES（可与 Task 2 并行）

  **References**
  - `src/hooks/chat-message.ts:23-29` — completion phrase 检测。
  - `src/hooks/chat-message.ts:116-128` — 当前 non-blocking verification suggestion。
  - `tests/hooks/chat-message.test.ts:72-160` — chat hook 测试模式与 output 断言方式。
  - `docs/changes/2026-05-18-stateful-quality-guardrails/behavior.md:50-63` — Scenario 2: 未验证完成声明被拦截。

  **Acceptance Criteria**
  - [ ] dirty/stale 状态下的完成语义不会再只收到非阻断提示。
  - [ ] completion guard 明确指向 `openflow-quality-gate`。
  - [ ] 非实现阶段不会被误拦截为必须先跑 implementation quality gate。

  **Verification Commands**
  - `bun test tests/hooks/chat-message.test.ts`
  - `npm run typecheck`

- [x] 4. 将 fresh readiness 与 limited-context 规则接入 quality-gate（Agent: unspecified-high | Blocks: [5, 6] | Blocked By: [1, 2]）

  **What to do**
  - 在 `src/commands/quality-gate.ts` 中，把 Task 1/2 的状态模型接入 applicability 与 freshness 判定。
  - 保证 `openflow-quality-gate` 在 dirty/stale 状态下负责“清洁”状态：成功 verify 后写回 fresh verified state；limited-context 只能给技术验证，不得产出 archive-ready 结论。
  - 保持 design-only / planning-only / metadata-only / docs-only 的 `NotApplicable/SkippedByStage` 路径，不让其成为真实实现工作的绕过通道。

  **Recommended Agent Profile**
  - Category: `unspecified-high` — 该任务需要处理风险评估、freshness、applicability 与 readiness 兼容。
  - Skills: `[]`

  **Parallelization**
  - Wave 3
  - Can Parallel: YES（可与 Task 5 的前置准备并行，但本任务先完成）

  **References**
  - `src/commands/quality-gate.ts:74-245` — 当前 quality gate 主流程。
  - `src/commands/quality-gate.ts:254-307` — applicability 分类器。
  - `tests/quality-gate/quality-gate.test.ts:194-220` — 当前 quality gate 基础测试结构。
  - `docs/changes/2026-05-18-stateful-quality-guardrails/behavior.md:64-101` — Scenario 3, 4, 5。

  **Acceptance Criteria**
  - [ ] dirty/stale 状态在 successful quality gate 后转为 fresh verified。
  - [ ] post-verify 的实现类再次变更会导致旧 readiness 不再可复用。
  - [ ] limited-context 技术检查不得产出 archive-ready 语义结论。
  - [ ] NotApplicable/SkippedByStage 只适用于非实现阶段 allowlist。

  **Verification Commands**
  - `bun test tests/quality-gate/quality-gate.test.ts`
  - `npm run typecheck`

- [x] 5. 收紧 archive 对 stale readiness 的最终门禁（Agent: unspecified-high | Blocks: [6] | Blocked By: [1, 2, 4]）

  **What to do**
  - 在 `src/commands/archive.ts` 中增加 stale/fresh 检查，确保 archive 只能消费 matching feature/issue 的 fresh verified state。
  - 处理 “之前 ready，但之后又有实现类变更” 的阻断提示，避免 archive 复用过期 readiness。
  - 保持 archive 的 final authority 语义，但不要让 archive 掩盖上游 dirty-state 缺陷；阻断信息要明确回指重新运行 `openflow-quality-gate`。

  **Recommended Agent Profile**
  - Category: `unspecified-high` — 影响最终 authority，需谨慎兼容现有 readiness / harden / doc-update 逻辑。
  - Skills: `[]`

  **Parallelization**
  - Wave 3
  - Can Parallel: NO（依赖 Task 4 的 freshness 规则定稿）

  **References**
  - `src/commands/archive.ts:71-145` — 当前 readiness / applicability / harden summary 门禁。
  - `tests/commands/archive.test.ts:68-108` — readiness archive fixture。
  - `tests/commands/archive.test.ts:110-220` — archive command 回归结构。
  - `docs/changes/2026-05-18-stateful-quality-guardrails/behavior.md:77-101` — Scenario 4, 5。

  **Acceptance Criteria**
  - [ ] stale readiness 无法继续 archive。
  - [ ] archive 阻断消息会明确要求先恢复 fresh readiness。
  - [ ] matching feature/issue fresh verified state 仍可正常进入 archive。

  **Verification Commands**
  - `bun test tests/commands/archive.test.ts tests/quality-gate/quality-gate.test.ts`
  - `npm run typecheck`

- [x] 6. 完成回归验证并以质量门收口（Agent: unspecified-high | Blocks: [-] | Blocked By: [2, 3, 4, 5]）

  **What to do**
  - 补齐并整理 dirty-on-change、completion block、freshness invalidation、archive stale block、NotApplicable allowlist 的回归测试。
  - 运行聚合测试与类型检查，确认本 feature 没有让 design-only / planning-only / docs-only 流程误触发实现门禁。
  - After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.

  **Recommended Agent Profile**
  - Category: `unspecified-high` — 该任务需要综合测试、回归判断与最终质量门收口。
  - Skills: `[]`

  **Parallelization**
  - Wave 4
  - Can Parallel: NO

  **References**
  - `tests/hooks/chat-message.test.ts`
  - `tests/hooks/tool-after.test.ts`
  - `tests/utils/acceptance-state.test.ts`
  - `tests/quality-gate/quality-gate.test.ts`
  - `tests/commands/archive.test.ts`

  **Acceptance Criteria**
  - [ ] 目标回归测试全部通过。
  - [ ] `npm run typecheck` 通过。
  - [ ] `openflow-quality-gate` 报告 readiness 后才能宣称该 feature 完成。

  **Verification Commands**
  - `bun test tests/hooks/chat-message.test.ts tests/hooks/tool-after.test.ts tests/utils/acceptance-state.test.ts tests/quality-gate/quality-gate.test.ts tests/commands/archive.test.ts`
  - `npm run typecheck`


---
## Verification Phase

### Security Checks
- **Secret Scan**: Check for accidentally committed secrets
- **Vulnerability Scan**: Run dependency vulnerability check

### Quality Checks
- **Lint Check**: Run linter
- **Type Check**: Run type checker
- **Test Suite**: Run all tests

### Final Verification Authority

**After all implementation tasks are complete, invoke `openflow-quality-gate` as the final readiness authority.**

The quality gate performs:
- Adversarial hardening assessment (risk-based)
- Evidence collection and verification
- Readiness classification (`Ready`, `ReadyWithDocUpdates`, `NotReady`, `NeedsDecision`)

Do not claim completion until `openflow-quality-gate` returns `Ready` or `ReadyWithDocUpdates`.

### Failure Handling
- Quality failure: fix implementation and rerun verification.
- Security failure: block archive until fixed.
- Consistency failure: sync docs and implementation, then rerun verification.

> Auto-generated by OpenFlow. `openflow-quality-gate` is the final verification authority.

---
## Plan Budget Warning

> This plan exceeds recommended task density. The warning is non-blocking —
> implementation may proceed, but consider splitting into smaller waves.

- **Same-wave tasks**: 6 (recommended max: 4)
- **Estimated execution units**: 8 (recommended max: 20)

**Suggestion**: Split large waves across multiple `/start-work` invocations
or reduce per-wave task count to keep execution feedback loops short.
