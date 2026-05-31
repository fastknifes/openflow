# Plan: quality-gate-harden-workflow-redesign

## Overview
为 OpenFlow 的 `openflow-quality-gate` / harden 流程实施一次受控的架构级 workflow 改造：用 evidence ledger 和 finding disposition 取代自由文本对抗循环，用单一可见 harden child session 取代每轮 task 子会话，并把非收敛、设计分歧、known issue acceptance 与 archive readiness 做成明确、可测试、可审计的状态机。

## Design Context
- 规范设计工作区：`docs/changes/2026-05-18-quality-gate-harden-workflow-redesign/`
- 规范设计文档：`docs/changes/2026-05-18-quality-gate-harden-workflow-redesign/design.md`
- 规范行为文档：`docs/changes/2026-05-18-quality-gate-harden-workflow-redesign/behavior.md`
- 非规范草稿：`docs/changes/2026-05-18-future-future-56b45231/`（不要作为实现依据）

### Fixed Decisions For This Plan
- 保持公开 readiness 枚举兼容：**MVP 不新增 `ReadyWithKnownIssues`**；已知问题通过 `ReadyWithDocUpdates` + `Known Issues` 报告区块表达。
- MVP 持久化边界：**仅在 acceptance state 中写入最小 harden terminal summary 与 accepted-known-issues 摘要**，不持久化全量 per-round ledger。
- `material change` 的定义：**feature-scoped diff hash 或 scoped changed-files 集合发生变化**；处于 feature scope 内的测试/文档变更也计入。
- `design_divergence` 默认**不等于 must-fix**；verify 通过且有明确 rationale/evidence 时可接受为 known issue，否则进入 `NeedsDecision`。
- session API 假设先验证：若同一 child session 无法安全切换 `body.agent`，**fallback 为同一可见 harden child session 内固定使用 `deep` agent，并通过显式 ROLE 指令区分 reviewer/executor**；禁止退回每轮 task 子代理模式。

## Execution Strategy

### Parallel Execution Waves
- **Wave 1**: 锁定失败用例与能力前置验证
  - Task 1 会话/trace/无嵌套 task 回归测试
  - Task 2 readiness / archive / acceptance-state 回归测试
- **Wave 2**: 基础模型与编排重构
  - Task 3 ledger/types/disposition 数据层
  - Task 4 harden session orchestration 重写
- **Wave 3**: 收敛与语义分类能力
  - Task 5 material-change / fresh diff / stop reason 实现
  - Task 6 finding classification / disposition / repeat normalization 实现
- **Wave 4**: 入口与归档整合
  - Task 7 quality-gate readiness/report/acceptance-state integration
  - Task 8 archive consumption + final regression + quality gate handoff

### Dependency Matrix
| Task | Blocked By | Blocks |
|---|---|---|
| 1. 会话与 trace 回归测试 | None | 4, 5 |
| 2. readiness / archive 回归测试 | None | 7, 8 |
| 3. ledger/types 数据层 | None | 4, 5, 6, 7 |
| 4. harden 单子会话编排 | 1, 3 | 5, 7 |
| 5. fresh diff + material-change + stop reason | 1, 3, 4 | 7, 8 |
| 6. finding disposition 分类 | 3 | 7, 8 |
| 7. quality-gate/readiness/acceptance-state integration | 2, 4, 5, 6 | 8 |
| 8. archive consumption + full regression + quality gate handoff | 2, 5, 6, 7 | Final Verification Wave |

## Tasks

- [x] 1. 锁定 harden 单子会话 / trace / 无嵌套 task 的失败用例（Agent: unspecified-high | Blocks: [4,5] | Blocked By: [None]）

  **What to do**
  - 在 `tests/harden/command.test.ts` 新增或重写用例，锁定以下目标行为：
    - 一个 harden run 只调用一次 `session.create`。
    - reviewer/executor 多轮都复用同一个 harden session ID。
    - prompt payload 中不再出现 `task(`、`prompt="See detailed prompt below."` 之类的 wrapper 文本。
    - harden trace 至少能提取 round、agent、tokens、stop reason。
  - 如当前文件承载过重，新建 `tests/harden/orchestration.test.ts` 承载 session reuse / trace 相关断言。
  - 在测试中保留一个 fallback 场景：同一 session 不支持切 agent 时，仍然必须保持一个可见 harden child session，且不能退回每轮 task 子会话。

  **Must NOT do**
  - 不要在此任务里改 `src/commands/quality-gate.ts` 的 readiness 映射。
  - 不要引入真实网络依赖或人工验证步骤。

  **Agent Profile**
  - Category: `unspecified-high`
  - Skills: `[]`
  - Reason: 这是架构回归测试切片，需要先把 session 行为钉死。

  **Parallelization**
  - Wave: 1
  - Can run in parallel with: Task 2

  **References**
  - `src/commands/harden.ts:39-153` — `handleHarden` 当前入口与 complexity 分支
  - `src/commands/harden.ts:156-305` — `runAdversarialLoop` 当前 reviewer/executor 循环
  - `src/commands/harden.ts:453-519` — `runAgentTask` / `buildPromptPayload` / `buildTaskInvocation`
  - `tests/harden/command.test.ts:218-447` — 现有 token / prompt / scoped diff 测试模式

  **Acceptance Criteria**
  - [ ] `node scripts/run-tests.mjs tests/harden/command.test.ts` 新增失败用例，明确暴露当前“每轮 create session / prompt 内含 task wrapper”的问题。
  - [ ] 如果新增 `tests/harden/orchestration.test.ts`，则 `node scripts/run-tests.mjs tests/harden/orchestration.test.ts` 在实现前失败、实现后通过。

  **QA Scenarios**
  - Happy path
    - Tool: Bash
    - Steps: 运行 `node scripts/run-tests.mjs tests/harden/command.test.ts`
    - Expected: 新测试在改造前失败，失败信息明确指向 session.create 次数或 prompt wrapper 残留
  - Failure / edge
    - Tool: Bash
    - Steps: 运行 session fallback 场景测试
    - Expected: 测试断言“即使 agent 切换不支持，也不能退回每轮 task 子会话”

  **Commit**
  - YES — `test(harden): lock single-session orchestration behavior`

- [x] 2. 锁定 readiness / archive / acceptance-state 的失败用例（Agent: unspecified-high | Blocks: [7,8] | Blocked By: [None]）

  **What to do**
  - 在 `tests/quality-gate/quality-gate.test.ts` 增加针对以下组合态的失败用例：
    - `budget_exhausted + unresolved must_fix` => `NotReady`
    - `budget_exhausted + all findings disposed + verify pass` => `ReadyWithDocUpdates`
    - `max_rounds_reached + design_divergence unresolved` => `NeedsDecision`
    - `accepted_known_issue + verify pass` => `ReadyWithDocUpdates` 且报告包含 `Known Issues`
  - 在 `tests/commands/archive.test.ts` 增加归档消费 acceptance-state/harden summary 的失败用例。
  - 在 `tests/utils/acceptance-state.test.ts` 增加最小 harden summary 序列化/反序列化失败用例。

  **Must NOT do**
  - 不要在此任务直接改实现文件。
  - 不要新增公开 readiness 枚举值。

  **Agent Profile**
  - Category: `unspecified-high`
  - Skills: `[]`
  - Reason: 这是入口兼容与 readiness 治理边界的关键回归层。

  **Parallelization**
  - Wave: 1
  - Can run in parallel with: Task 1

  **References**
  - `src/commands/quality-gate.ts:55-182` — `handleQualityGate`
  - `src/commands/quality-gate.ts:432-471` — `extractHardenStatus` / `getHardenReadinessBlocker` / `applyHardenReadinessGate`
  - `src/utils/acceptance-state.ts` — acceptance-state 读写
  - `tests/quality-gate/quality-gate.test.ts:49-104` — mock harden / verify seam
  - `tests/commands/archive.test.ts` — archive readiness 断言入口
  - `tests/utils/acceptance-state.test.ts` — acceptance-state round-trip 模式

  **Acceptance Criteria**
  - [ ] `node scripts/run-tests.mjs tests/quality-gate/quality-gate.test.ts` 新增的 readiness 组合态测试在实现前失败。
  - [ ] `node scripts/run-tests.mjs tests/commands/archive.test.ts` 新增 archive 测试在实现前失败。
  - [ ] `node scripts/run-tests.mjs tests/utils/acceptance-state.test.ts` 新增 acceptance-state 测试在实现前失败。

  **QA Scenarios**
  - Happy path
    - Tool: Bash
    - Steps: 运行 `node scripts/run-tests.mjs tests/quality-gate/quality-gate.test.ts`
    - Expected: 新用例准确显示当前状态映射过粗的问题
  - Failure / edge
    - Tool: Bash
    - Steps: 运行 `node scripts/run-tests.mjs tests/commands/archive.test.ts`
    - Expected: 测试能复现“verify 全绿但 harden non-convergence 仍硬阻塞 archive”的当前缺陷

  **Commit**
  - YES — `test(quality-gate): lock readiness and archive mapping cases`

- [x] 3. 引入 harden ledger / disposition / trace 数据层（Agent: unspecified-high | Blocks: [4,5,6,7] | Blocked By: [None]）

  **What to do**
  - 扩展 `src/types.ts`：
    - `HardenFinding` 增加 `id`、`normalizedKey`、`confidence`、`status`、`disposition`、`repeatCount`。
    - `HardenStatus` 增加 `review_inconclusive`、`executor_blocked`、`known_issues_accepted` 等 MVP 终态。
    - `HardenResult` 增加 `stopReason`、`trace`、`acceptedFindingsSummary`。
  - 新建 `src/utils/harden-ledger.ts`：
    - finding normalization
    - repeat counter
    - disposition update
    - trace entry builder
    - minimal harden summary builder（供 acceptance-state 使用）
  - 新建 `tests/harden/ledger.test.ts` 覆盖上述纯函数。

  **Must NOT do**
  - 不要在此任务引入完整 acceptance-state 持久化逻辑。
  - 不要直接修改 archive 行为。

  **Agent Profile**
  - Category: `unspecified-high`
  - Skills: `[]`
  - Reason: 这是后续 orchestrator/readiness 的共享模型层。

  **Parallelization**
  - Wave: 2
  - Blocked By: None
  - Can begin after Task 1/2 started，但不依赖其完成

  **References**
  - `src/types.ts:88-112` — 当前 harden 类型定义
  - `src/commands/harden.ts:164-305` — 当前 rounds / findingCounts / summary 结构
  - `tests/harden/findings.test.ts:20-166` — 当前 finding 分类测试风格

  **Acceptance Criteria**
  - [ ] `node scripts/run-tests.mjs tests/harden/ledger.test.ts` 通过。
  - [ ] `npm run typecheck` 通过，且所有新类型在 `src/commands/harden.ts` / `src/commands/quality-gate.ts` 可消费。

  **QA Scenarios**
  - Happy path
    - Tool: Bash
    - Steps: 运行 `node scripts/run-tests.mjs tests/harden/ledger.test.ts`
    - Expected: normalized finding、repeat counter、disposition update 行为稳定
  - Failure / edge
    - Tool: Bash
    - Steps: 覆盖“同一 finding 文案轻微变化但 normalizedKey 相同”的测试
    - Expected: 仍被识别为同一 finding，不会漏掉 repeat detection

  **Commit**
  - YES — `refactor(harden): add ledger types and utilities`

- [x] 4. 重写 harden 编排为单 child session + inline trace（Agent: unspecified-high | Blocks: [5,7] | Blocked By: [1,3]）

  **What to do**
  - 重构 `src/commands/harden.ts`：
    - 将 child session 创建提升为每个 harden run 一次。
    - 删除或停用 `buildTaskInvocation()` 产生的 prompt wrapper 路径。
    - 在同一 harden session 中连续 prompt reviewer/executor。
    - 优先实现同一 session 下按轮次切换 `body.agent = 'oracle' | 'deep'`。
    - 如果 API 不支持，按既定 fallback：同一可见 harden child session 内固定使用 `deep`，通过 prompt ROLE 区分 reviewer/executor。
  - 为 trace 记录每轮 `round / agent / tokens / result / stop reason candidate`。
  - 保持 `handleHarden` 对外签名兼容，避免破坏 `handleQualityGate` 调用点。

  **Must NOT do**
  - 不要回退到每轮 `session.create()`。
  - 不要在 prompt 中再嵌入 `task(...)`。
  - 不要在此任务处理 readiness 映射。

  **Agent Profile**
  - Category: `unspecified-high`
  - Skills: `[]`
  - Reason: 需要重写 orchestration，同时保护现有入口兼容。

  **Parallelization**
  - Wave: 2
  - Blocked By: Tasks 1, 3

  **References**
  - `src/commands/harden.ts:39-153` — `handleHarden`
  - `src/commands/harden.ts:156-305` — `runAdversarialLoop`
  - `src/commands/harden.ts:453-519` — `runAgentTask` / `buildPromptPayload` / `buildTaskInvocation`
  - `tests/harden/command.test.ts:286-327` — 当前 prompt wrapper 测试

  **Acceptance Criteria**
  - [ ] `node scripts/run-tests.mjs tests/harden/command.test.ts` 通过，证明单 run 单 child session 生效。
  - [ ] `npm run typecheck` 通过，且 `handleHarden` 调用签名未破坏 quality-gate 编排。

  **QA Scenarios**
  - Happy path
    - Tool: Bash
    - Steps: 运行 `node scripts/run-tests.mjs tests/harden/command.test.ts`
    - Expected: `session.create` 次数为 1；多轮 prompt 复用同一 session；prompt 中无 `task(`
  - Failure / edge
    - Tool: Bash
    - Steps: 运行 capability fallback 场景测试
    - Expected: 若切 agent 不支持，测试仍确认只有一个可见 harden child session，且未创建每轮 task 子会话

  **Commit**
  - YES — `refactor(harden): reuse one child session per run`

- [x] 5. 实现 fresh scoped diff、material-change 检测与 non-convergence stop reason（Agent: unspecified-high | Blocks: [7,8] | Blocked By: [1,3,4]）

  **What to do**
  - 在 `src/commands/harden.ts` 中增加 executor 前后 scoped diff 快照：
    - `beforeDiffHash`
    - `afterDiffHash`
    - scoped changed-files set
  - 定义 `no_material_fix`：两者都未变化。
  - 每轮 reviewer 前都重新读取最新 scoped diff，不再依赖旧 `rollingDiff + fixReport`。
  - 新增并触发 stop reasons：
    - `repeated_finding_no_material_fix`
    - `review_inconclusive`
    - `executor_blocked`
  - 若相同 normalized finding 连续重复且 executor 无 material change，立即停止 loop，不再烧完整预算。
  - 如需要提取纯函数，可新建 `src/utils/harden-diff.ts` 存放 diff snapshot / compare helper。

  **Must NOT do**
  - 不要将 acceptance-state 写入逻辑放进本任务。
  - 不要让 reviewer 继续读取过期 diff。

  **Agent Profile**
  - Category: `unspecified-high`
  - Skills: `[]`
  - Reason: 这是解决“fixer 无法自动修复 / 无限不收敛”的核心切片。

  **Parallelization**
  - Wave: 3
  - Blocked By: Tasks 1, 3, 4

  **References**
  - `src/commands/harden.ts:170-298` — 当前 `rollingDiff` / `fixReport` / `findingCounts` 逻辑
  - `src/utils/evidence-freshness.ts:83-161` — 可复用的 hash / changed-files freshness 思路
  - `tests/harden/command.test.ts:179-284` — 当前 budget / rounds 场景

  **Acceptance Criteria**
  - [ ] `node scripts/run-tests.mjs tests/harden/command.test.ts` 通过，并新增断言：executor no-op 会被识别为 `no_material_fix`。
  - [ ] 如新增 `tests/harden/material-change.test.ts`，则其通过并覆盖 scoped diff hash 与 changed-files 两个维度。

  **QA Scenarios**
  - Happy path
    - Tool: Bash
    - Steps: 运行 material-change 正向场景测试
    - Expected: executor 改动 feature-scoped 代码或测试文件后，下一轮 reviewer 读取到刷新后的 diff
  - Failure / edge
    - Tool: Bash
    - Steps: 运行 no-op executor 场景测试
    - Expected: harden 进入 `repeated_finding_no_material_fix` 或 `executor_blocked`，而不是继续烧预算

  **Commit**
  - YES — `fix(harden): refresh scoped diff and detect no-op executor`

- [x] 6. 升级 finding 分类与 disposition 规则（Agent: unspecified-high | Blocks: [7,8] | Blocked By: [3]）

  **What to do**
  - 在 `src/utils/harden-utils.ts` 中实现或扩展：
    - finding normalization
    - `design_divergence` / `false_positive` / `accepted_known_issue` 候选分类
    - evidence 缺失时从 `spec_violation` 降级到 `design_ambiguity` / `needs_evidence`
    - style/preference 丢弃规则继续保留
  - 重写 `tests/harden/findings.test.ts` 覆盖：
    - 目录结构偏好差异
    - 指令层步骤增加
    - 测试覆盖范围超出 design 但符合实现
    - 同义文案归一化为同一 finding

  **Must NOT do**
  - 不要在此任务直接改 quality-gate readiness。
  - 不要把所有 design divergence 都自动接受。

  **Agent Profile**
  - Category: `unspecified-high`
  - Skills: `[]`
  - Reason: 这是“spec_violation 误报”问题的主修复切片。

  **Parallelization**
  - Wave: 3
  - Blocked By: Task 3
  - Can run in parallel with: Task 5

  **References**
  - `src/utils/harden-utils.ts:109-164` — 当前 `classifyFindings`
  - `src/utils/harden-utils.ts:177-260` — 当前 parse / extract / level mapping
  - `tests/harden/findings.test.ts:33-166` — 当前 `spec_violation` / `design_ambiguity` / `test_gap` 测试
  - `docs/changes/2026-05-18-quality-gate-harden-workflow-redesign/design.md` — design divergence 与 known issue acceptance 约束

  **Acceptance Criteria**
  - [ ] `node scripts/run-tests.mjs tests/harden/findings.test.ts` 通过，且新增误报场景被正确降级或转 disposition。
  - [ ] `npm run typecheck` 通过，新增 disposition 字段与 `src/types.ts` 一致。

  **QA Scenarios**
  - Happy path
    - Tool: Bash
    - Steps: 运行 `node scripts/run-tests.mjs tests/harden/findings.test.ts`
    - Expected: 真正有明确 design 证据的 `spec_violation` 仍可进入 actionable / must-fix
  - Failure / edge
    - Tool: Bash
    - Steps: 运行文档结构偏好、测试覆盖范围争议等场景
    - Expected: 输出 `design_divergence` / `false_positive` / `needs_decision` 候选，而不是继续 must-fix

  **Commit**
  - YES — `fix(harden): classify findings with dispositions`

- [x] 7. 整合 quality-gate readiness、报告输出与 acceptance-state 最小摘要（Agent: unspecified-high | Blocks: [8] | Blocked By: [2,4,5,6]）

  **What to do**
  - 修改 `src/commands/quality-gate.ts`：
    - 用 ledger/disposition 驱动 readiness，而不是仅靠 harden status。
    - 保持公开 readiness 枚举不变；已知问题以 `ReadyWithDocUpdates` + `Known Issues` 报告区块表示。
    - 在报告中加入 `Harden Trace` 和 `Known Issues` section。
  - 修改 `src/utils/acceptance-state.ts`：
    - 增加最小 harden terminal summary 与 accepted-known-issues 摘要的读写支持。
    - 不写入全量 per-round ledger。
  - 如类型需要，同步更新 `src/types.ts` 相关 acceptance/verify 结构。
  - 扩展 `tests/quality-gate/quality-gate.test.ts`、`tests/utils/acceptance-state.test.ts`。

  **Must NOT do**
  - 不要新增公开 `ReadyWithKnownIssues` 枚举。
  - 不要让 `budget_exhausted` 自动变成 Ready。

  **Agent Profile**
  - Category: `unspecified-high`
  - Skills: `[]`
  - Reason: 这是质量门最终裁决逻辑的核心整合点。

  **Parallelization**
  - Wave: 4
  - Blocked By: Tasks 2, 4, 5, 6

  **References**
  - `src/commands/quality-gate.ts:55-182` — 现有 orchestrator
  - `src/commands/quality-gate.ts:446-471` — 当前 harden readiness blocker 映射
  - `src/commands/quality-gate.ts:506-640` — 当前报告结构
  - `src/utils/acceptance-state.ts` — acceptance-state persistence
  - `tests/quality-gate/quality-gate.test.ts` — readiness / call-order / mock seam
  - `tests/utils/acceptance-state.test.ts` — persistence round-trip

  **Acceptance Criteria**
  - [ ] `node scripts/run-tests.mjs tests/quality-gate/quality-gate.test.ts` 通过，并精确断言 mixed dispositions 的 readiness 映射。
  - [ ] `node scripts/run-tests.mjs tests/utils/acceptance-state.test.ts` 通过，证明最小 harden summary 可 round-trip。
  - [ ] `npm run typecheck` 通过。

  **QA Scenarios**
  - Happy path
    - Tool: Bash
    - Steps: 运行 quality-gate readiness 场景测试
    - Expected: `accepted_known_issue + verify pass` => `ReadyWithDocUpdates`，报告带 `Known Issues`
  - Failure / edge
    - Tool: Bash
    - Steps: 运行 unresolved must-fix 场景测试
    - Expected: readiness 仍为 `NotReady`，archive 不可继续

  **Commit**
  - YES — `fix(quality-gate): map harden dispositions to readiness`

- [x] 8. 整合 archive 消费与全量回归，并在最终 QA 任务中强制调用 quality gate（Agent: unspecified-high | Blocks: [Final Verification Wave] | Blocked By: [2,5,6,7]）

  **What to do**
  - 修改 `src/commands/archive.ts`，让 archive 消费 acceptance-state 中的最小 harden summary / accepted-known-issues 摘要，而不是要求手工篡改生成状态文件。
  - 更新 `tests/commands/archive.test.ts`，覆盖：
    - verify pass + accepted known issues => allow archive
    - unresolved must-fix => block archive
    - needs decision => block archive with explicit reason
  - 视需要更新 `src/skills/quality-gate-skill.ts` 文案，使其与新的 harden trace / known issues / readiness 行为一致。
  - 运行全量回归：
    - `node scripts/run-tests.mjs tests/harden/command.test.ts`
    - `node scripts/run-tests.mjs tests/harden/findings.test.ts`
    - `node scripts/run-tests.mjs tests/quality-gate/quality-gate.test.ts`
    - `node scripts/run-tests.mjs tests/quality-gate/evidence.test.ts`
    - `node scripts/run-tests.mjs tests/commands/archive.test.ts`
    - `node scripts/run-tests.mjs tests/utils/acceptance-state.test.ts`
    - `npm run typecheck`
  - 本任务最后必须包含以下原文说明，写入实施者交接或 QA 任务说明：
    - `After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.`

  **Must NOT do**
  - 不要建议手动运行 `/openflow-harden` 或 `/openflow-verify`。
  - 不要跳过 archive 兼容测试。

  **Agent Profile**
  - Category: `unspecified-high`
  - Skills: `[]`
  - Reason: 这是面向真实 workflow 的闭环整合任务。

  **Parallelization**
  - Wave: 4
  - Blocked By: Tasks 2, 5, 6, 7

  **References**
  - `src/commands/archive.ts` — archive readiness 消费逻辑
  - `src/skills/quality-gate-skill.ts` — quality-gate skill 文案
  - `tests/commands/archive.test.ts` — archive regression
  - `tests/quality-gate/evidence.test.ts` — evidence freshness regression
  - `scripts/run-tests.mjs:13-27` — 可接受单文件参数并转发到 `bun test`
  - `package.json:15-22` — `test` / `typecheck` 脚本

  **Acceptance Criteria**
  - [ ] `node scripts/run-tests.mjs tests/commands/archive.test.ts` 通过，archive 不再依赖手工 acceptance-state 编辑推进。
  - [ ] 所有列出的 targeted tests 与 `npm run typecheck` 全部通过。
  - [ ] 最终实施/QA 说明包含强制调用 `openflow-quality-gate` 的原文指令。

  **QA Scenarios**
  - Happy path
    - Tool: Bash
    - Steps: 逐条运行上述 targeted tests 与 `npm run typecheck`
    - Expected: 全部通过，archive 在 accepted known issue 且 verify pass 时可继续
  - Failure / edge
    - Tool: Bash
    - Steps: 构造 unresolved must-fix / needs decision 场景并运行 archive tests
    - Expected: archive 明确阻塞并给出 machine-readable 原因

  **Commit**
  - YES — `fix(archive): consume harden summary and preserve auditability`

## Final Verification Wave
- [ ] F1. Plan Compliance Audit — oracle
  - Verify every changed symbol and test file matches this plan’s scope and no manual harden/verify user workflow was reintroduced.
- [x] F2. Code Quality Review — unspecified-high
  - Re-run targeted regressions plus `npm run typecheck`; inspect for brittle mocks that fail to assert actual workspace-diff behavior.
- [ ] F3. Real Manual QA — unspecified-high
  - Exercise a synthetic high-risk feature fixture to confirm: one harden child session, refreshed diff, no-op executor stop reason, accepted known issue path, and archive readiness gating.
- [x] F4. Scope Fidelity Check — deep
  - Confirm no unrelated risk-assessment, evidence-freshness, or non-harden OpenFlow workflows were silently redesigned.

## Commit Strategy
1. `test(harden): lock single-session orchestration behavior`
2. `test(quality-gate): lock readiness and archive mapping cases`
3. `refactor(harden): add ledger types and utilities`
4. `refactor(harden): reuse one child session per run`
5. `fix(harden): refresh scoped diff and detect no-op executor`
6. `fix(harden): classify findings with dispositions`
7. `fix(quality-gate): map harden dispositions to readiness`
8. `fix(archive): consume harden summary and preserve auditability`

Each commit must be independently testable with the task-level commands listed above.

## Success Criteria
- `openflow-quality-gate` remains the only post-implementation AI-callable governance entrypoint.
- Harden creates one visible child session per run and no longer emits nested `task(...)` prompt wrappers.
- Reviewer rounds consume fresh feature-scoped diff, not stale rolling diff text.
- Executor no-op is detected as `no_material_fix` and can terminate harden with an explicit stop reason.
- Repeated findings no longer burn full budget when there is no material fix.
- Design divergence / known issue paths are auditable and do not require manual generated-state edits.
- Readiness and archive blocking are driven by finding disposition + verify evidence, not by raw harden status alone.
- Targeted regressions and `npm run typecheck` pass.


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
- **Estimated execution units**: 10 (recommended max: 20)

**Suggestion**: Split large waves across multiple `/start-work` invocations
or reduce per-wave task count to keep execution feedback loops short.
