# Plan: quality-gate-evidence-judge

## Overview

实现 BDD 驱动的集成证据质量门：`behavior.md` / issue clarification 定义关键行为，AI/OMO 负责生成并运行项目适配的集成验证，Quality Gate 只判断 scenario-to-evidence 映射、coverage、freshness 与 readiness，不执行固定测试命令。

## Design Context

- Design workspace: `docs/changes/2026-05-20-quality-gate-evidence-judge/`
- Primary constraints:
  - `behavior.md` 是集成测试范围来源。
  - critical scenario 必须逐一映射 evidence。
  - 允许 `exact` / `equivalent` 通过；`partial` / `missing` / `stale` 阻塞 critical readiness。
  - evidence 详情持久化到 `.sisyphus/evidence/`，`behavior.md` 保存映射摘要。
  - Quality Gate 不执行 lint/typecheck/unit test/build/format/集成测试命令。

## Execution Strategy

### Parallel Execution Waves

Wave 1: 类型/解析基础与文档模板更新，可并行。
- Task 1: 扩展 behavior evidence 类型与解析结构。
- Task 2: 定义 evidence 存储与映射文档模板。

Wave 2: Verify readiness 判定实现，依赖 Wave 1。
- Task 3: 实现 scenario-to-evidence coverage/freshness 判定。
- Task 4: 将判定结果接入 `collectEvidence` / `classifyReadiness`。

Wave 3: Archive traceability 与测试覆盖，依赖 Wave 2。
- Task 5: archive / implementation-mapper 纳入 behavior → evidence trace。
- Task 6: 补充 verify 与 archive 回归测试。

Wave 4: 最终验证与质量门，依赖 Wave 3。
- Task 7: 全量验证并调用 `openflow-quality-gate`。

### Dependency Matrix

| Task | Blocked By | Blocks |
|------|------------|--------|
| 1. 扩展 behavior evidence 类型与解析结构 | none | 3, 4, 6 |
| 2. 定义 evidence 存储与映射文档模板 | none | 3, 5, 6 |
| 3. 实现 coverage/freshness 判定 | 1, 2 | 4, 6 |
| 4. 接入 verify readiness | 1, 3 | 5, 6, 7 |
| 5. 接入 archive traceability | 2, 4 | 6, 7 |
| 6. 补充回归测试 | 1, 2, 3, 4, 5 | 7 |
| 7. 最终验证与质量门 | 4, 5, 6 | none |

## Tasks

- [ ] 1. 扩展 behavior evidence 类型与解析结构 (Agent: quick | Blocks: [3, 4, 6] | Blocked By: [])

  **Agent Profile**: `quick`; skills: []。单模块类型与 parser 修改，边界清晰。

  **Parallelization**: Wave 1，可与 Task 2 并行。

  **Implementation**:
  - 修改 `src/types.ts`，扩展/新增 behavior evidence 类型字段：`scenarioId`、`criticality`、`coverageLevel`、`equivalenceRationale`、`freshness`、`status`、`evidenceReference`。
  - 修改 `src/commands/verify.ts` 中 `parseBehaviorEvidenceMappings`，从固定表格解析：`Scenario ID | Criticality | Evidence Ref | Evidence Type | Coverage Level | Equivalence Rationale | Freshness | Status`。
  - 保持旧表格格式的兼容读取；旧格式缺少字段时按默认规则补齐：未标记 scenario 默认 `critical`，freshness 默认为 `unknown`。

  **Acceptance Criteria**:
  - `rtk npm typecheck` 通过。
  - `tests/commands/verify.test.ts` 可新增/更新 parser 单测，覆盖新表格字段解析。

  **QA Scenarios**:
  - Scenario: 新 evidence mapping 表完整解析；Expected: 每个字段进入 `BehaviorScenarioEvidence`。
  - Scenario: 旧表格仍可解析；Expected: 不破坏现有 behavior tests。

- [ ] 2. 定义 evidence 存储与映射文档模板 (Agent: writing | Blocks: [3, 5, 6] | Blocked By: [])

  **Agent Profile**: `writing`; skills: []。文档模板与行为规范补强。

  **Parallelization**: Wave 1，可与 Task 1 并行。

  **Implementation**:
  - 更新 `docs/changes/2026-05-20-quality-gate-evidence-judge/behavior.md`，加入可复制的 Evidence Mapping 表格模板和 `.sisyphus/evidence/{scenario-id}-{slug}.md` 证据模板。
  - 更新 `docs/changes/2026-05-20-quality-gate-evidence-judge/design.md`，明确 evidence ref 必须可持久追溯，不能只写“见控制台输出”。

  **Acceptance Criteria**:
  - 文档包含固定表格模板与 evidence 文件模板。
  - 表格字段与 Task 1 parser 字段一致。

  **QA Scenarios**:
  - Scenario: 文档模板可被实现者直接复制；Expected: 字段完整且无歧义。
  - Scenario: evidence ref 指向 `.sisyphus/evidence/`；Expected: archive 可追溯。

- [ ] 3. 实现 scenario coverage 与 freshness 判定 (Agent: quick | Blocks: [4, 6] | Blocked By: [1, 2])

  **Agent Profile**: `quick`; skills: []。纯判定逻辑，可用单测驱动。

  **Parallelization**: Wave 2，依赖 Task 1/2。

  **Implementation**:
  - 修改 `src/commands/verify.ts` 的 `evaluateBehaviorScenarios` 或抽出 helper，按 coverage matrix 判定：
    - critical + `exact/equivalent` + `fresh` + `verified` → pass。
    - critical + `partial/missing/failed/stale` → blocking gap。
    - critical + `unknown` freshness 或 ambiguous rationale → needs decision / not ready。
    - optional/boundary missing → advisory 或 `not_applicable`。
  - `equivalent` 必须有 `equivalenceRationale`，否则降级为 `partial` 或 `needs_decision`。

  **Acceptance Criteria**:
  - `rtk npm test tests/commands/verify.test.ts` 通过。
  - 新增覆盖 exact/equivalent/partial/missing/not_applicable/fresh/stale/unknown 的单测。

  **QA Scenarios**:
  - Scenario: critical exact fresh verified；Expected: 不产生 blocking gap。
  - Scenario: critical equivalent 但 rationale 缺失；Expected: needs_decision 或 NotReady。
  - Scenario: optional missing；Expected: advisory，不硬阻塞。

- [ ] 4. 将集成证据判定接入 verify readiness (Agent: quick | Blocks: [5, 6, 7] | Blocked By: [1, 3])

  **Agent Profile**: `quick`; skills: []。接入已有 verify readiness 流程。

  **Parallelization**: Wave 2，依赖 Task 1/3。

  **Implementation**:
  - 修改 `src/commands/verify.ts`：
    - `collectEvidence` 输出中包含 integration evidence coverage summary。
    - `classifyReadiness` 将 critical integration evidence gap 映射为 `missing_integration_evidence`、`stale_integration_evidence` 或 `integration_evidence_needs_decision`。
    - Verify 输出不使用 `quality_checks_failed` 表达集成证据缺失。
  - 保留 security / consistency adapter 行为不变。

  **Acceptance Criteria**:
  - `rtk npm test tests/commands/verify.test.ts tests/quality-gate/quality-gate.test.ts` 通过。
  - Verify 输出能显示缺失 scenario ID 与 evidence reason。

  **QA Scenarios**:
  - Scenario: critical missing evidence；Expected: readiness `not_ready` + reason `missing_integration_evidence`。
  - Scenario: critical unknown freshness；Expected: `needs_decision` 或 `not_ready`，输出 freshness reason。

- [ ] 5. Archive / implementation-mapper 纳入 behavior → evidence trace (Agent: unspecified-high | Blocks: [6, 7] | Blocked By: [2, 4])

  **Agent Profile**: `unspecified-high`; skills: []。涉及 archive traceability，需谨慎检查现有 mapper。

  **Parallelization**: Wave 3，依赖 Task 2/4。

  **Implementation**:
  - 检查并修改 `src/commands/archive.ts`、`src/phases/code-mapper.ts` 或相关 implementation mapper 生成逻辑（以实际符号为准）。
  - 在 archive 输出中保留 behavior scenario → evidence ref → implementation file/symbol 的映射。
  - 若 mapper 已读取 behavior evidence，则扩展字段；若没有，则新增读取 `.sisyphus/evidence/` 与 `behavior.md` mapping 的入口。

  **Acceptance Criteria**:
  - `rtk npm test tests/commands/archive.test.ts tests/phases/implementation-mapper.test.ts` 通过（若文件存在）。
  - 生成的 mapper 包含 evidence ref，不只包含 changed files。

  **QA Scenarios**:
  - Scenario: archive 带有 behavior evidence mapping；Expected: implementation-mapper 包含 behavior → evidence → code trace。
  - Scenario: optional evidence missing；Expected: mapper 记录 advisory，不阻塞 archive。

- [ ] 6. 补充回归测试与 fixture (Agent: quick | Blocks: [7] | Blocked By: [1, 2, 3, 4, 5])

  **Agent Profile**: `quick`; skills: []。测试集中在 verify/archive 现有测试目录。

  **Parallelization**: Wave 3，依赖 Task 1-5。

  **Implementation**:
  - 修改/新增 `tests/commands/verify.test.ts`，覆盖：
    - critical exact/equivalent pass。
    - critical partial/missing/stale block。
    - equivalent 无 rationale 不通过。
    - optional/boundary missing advisory。
  - 修改/新增 `tests/quality-gate/quality-gate.test.ts`，覆盖 quality gate 输出中的 integration evidence gap。
  - 修改/新增 `tests/commands/archive.test.ts` 或 mapper 测试，覆盖 evidence traceability。

  **Acceptance Criteria**:
  - `rtk npm test tests/commands/verify.test.ts tests/quality-gate/quality-gate.test.ts` 通过。
  - `rtk npm test` 全量通过。

  **QA Scenarios**:
  - Scenario: fixture behavior.md 有固定 Evidence Mapping 表；Expected: parser 与 readiness 均按表格判定。
  - Scenario: 缺失 evidence ref；Expected: NotReady。

- [ ] 7. 最终验证与 OpenFlow 质量门 (Agent: unspecified-high | Blocks: [] | Blocked By: [4, 5, 6])

  **Agent Profile**: `unspecified-high`; skills: [`openflow-quality-gate`]。最终验证与 readiness。

  **Parallelization**: Wave 4，必须最后执行。

  **Implementation**:
  - 运行：`rtk npm typecheck`。
  - 运行：`rtk npm test tests/commands/verify.test.ts tests/quality-gate/quality-gate.test.ts`。
  - 运行：`rtk npm test`。
  - After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.

  **Acceptance Criteria**:
  - 类型检查通过。
  - 目标测试与全量测试通过。
  - `openflow-quality-gate` 返回可解释 readiness；若 NotReady，按报告修复后重跑。

  **QA Scenarios**:
  - Scenario: 完整实现后运行质量门；Expected: 不出现固定测试命令失败，集成证据缺口以 evidence gap 表达。
  - Scenario: 文档与实现不一致；Expected: consistency / evidence readiness 阻塞。

- [ ] 8. 实现编译健康探测（Compilation Health Probe）(Agent: quick | Blocks: [] | Blocked By: [7])

  **Agent Profile**: `quick`; skills: []。轻量自适应编译探测，不阻塞 readiness。

  **Parallelization**: Wave 5，在 Task 7 完成后追加。

  **Implementation**:
  - 修改 `src/commands/verify.ts` 或新增 `src/utils/compilation-probe.ts`：
    - 根据项目文件（`tsconfig.json`、`go.mod`、`Cargo.toml`、`composer.json` 等）探测语言/框架。
    - 执行对应的零配置编译/语法检查命令（`tsc --noEmit`、`go build ./...`、`cargo check` 等）。
    - 对无编译步骤的语言（PHP/Python），检测是否有 phpstan/psalm/mypy，有则运行，无则跳过。
    - 探测结果作为 advisory evidence 存入 `VerifyEvidencePacket`，不影响 readiness classification。
    - 探测失败（命令返回非零）或工具链缺失（ENOENT）时，记录 `compilation_probe_failed` advisory gap，不阻塞。
  - 修改 `collectEvidence`：在收集证据时调用 compilation probe，将结果加入 `observedBehaviorSummary` 或 `knownRisksOrMissingEvidence`。
  - 新增 `tests/commands/verify.test.ts` 测试：
    - TS 项目探测 `tsc --noEmit`；Expected: 探测结果出现在 evidence 中。
    - 无工具链项目；Expected: 跳过探测，不报错。
    - 探测失败；Expected: advisory gap，不阻塞 readiness。

  **Acceptance Criteria**:
  - `rtk npm typecheck` 通过。
  - `rtk npm test tests/commands/verify.test.ts` 通过。
  - 探测逻辑不硬编码命令，基于项目文件推断。
  - 探测失败不阻塞 readiness。

  **QA Scenarios**:
  - Scenario: TypeScript 项目有 `tsconfig.json`；Expected: 质量门探测 `tsc --noEmit`，结果作为 advisory。
  - Scenario: PHP 项目无 phpstan；Expected: 探测跳过，不阻塞。
  - Scenario: Go 项目编译失败；Expected: 记录 advisory gap，`status` 仍为 `ready`（若无其他阻塞项）。

## Execution Unit Estimate

- Tasks: 8
- Estimated sub-items: 23
- Same-wave maximum concurrency: 2
- Complexity: Medium


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

- **Same-wave tasks**: 8 (recommended max: 4)
- **Estimated execution units**: 14 (recommended max: 20)

**Suggestion**: Split large waves across multiple `/start-work` invocations
or reduce per-wave task count to keep execution feedback loops short.
