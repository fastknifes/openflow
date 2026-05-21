# quality-gate-integration-test-executor - Observable Behavior

> **Status**: Draft | **Feature**: quality-gate-integration-test-executor
> **Date**: 2026-05-21

---

## Human Consensus Summary

**Feature title**: Quality Gate Integration Test Executor  
**Internal slug**: `quality-gate-integration-test-executor`  
**Problem statement**: 当前质量门对集成测试的验证是"虚假就绪"——`behavior.md` 中的 critical scenario 在编码阶段无人实现，质量门只检查静态 Evidence Mapping 表格的填写状态，不实际执行集成验证。AI 编码代理通常只编写单元测试，导致 behavior.md 中的端到端行为场景成为"僵尸契约"。  
**Trigger**: AI 调用 `openflow-quality-gate`，且当前 feature 存在 `behavior.md` 并包含 critical scenario。  
**Expected outcome**: 质量门根据 critical scenario 自动生成并执行项目适配的集成测试，用真实执行结果判定 readiness。

---

## User Context

**Who**: 使用 OpenFlow 治理工作流的开发团队。  
**When**: 在 feature/issue 的实现阶段完成后，AI 自动调用质量门时。  
**Where**: `openflow-quality-gate` → `verify` 阶段。  
**Why**: 现有质量门对 behavior.md 的信任是基于静态表格，而非动态执行。需要让 critical behavior 得到真实的自动化验证。

---

## Trigger Rules

以下条件同时满足时，激活集成测试执行适配器：

1. `behavior.md` 存在于当前 feature 的 changes workspace（`docs/changes/{feature}/behavior.md`）。
2. `behavior.md` 中至少存在一个 `criticality: critical` 的 behavior scenario。
3. 当前项目语言被适配器支持（当前版本优先支持 TypeScript/Bun）。
4. `config.integrationTest.enabled !== false`（默认开启，可通过配置关闭）。

以下条件下，适配器**跳过**（不阻塞，不报错）：

- 无 `behavior.md` 的 feature → 现有质量门行为 100% 不变。
- `behavior.md` 中无 critical scenario（只有 optional/boundary）→ 记录 advisory，不执行。
- 项目语言不被支持 → 记录 `integration_test_unsupported_language` advisory，不阻塞 readiness。
- `config.integrationTest.enabled === false` → 完全跳过适配器。

---

## Non-Trigger Rules

以下情况**不**触发本功能：

- design-only、planning-only、metadata-only 的变更（质量门适用性判定为 `NotApplicable`）。
- issue 模式且无 `behavior.md` 的变更。
- 用户在实现阶段已手动编写并执行了集成测试，且 Evidence Mapping 已正确标注 → 适配器会执行已有测试并验证，但不会重复生成。

---

## User-Visible Scenarios

### Scenario: 质量门为 critical scenario 生成并执行集成测试

**Given:**
- feature `payment-gateway` 存在 `docs/changes/payment-gateway/behavior.md`
- behavior.md 包含 critical scenario：`SC-001 | 用户完成支付后订单状态变为已确认`
- 项目为 TypeScript/Bun 项目，存在 `package.json` 和 `tsconfig.json`
- `tests/integration/openflow-behavior/SC-001.spec.ts` **不存在**

**When:**
- AI 完成实现代码后调用 `openflow-quality-gate`

**Then (observable outcome):**
- 质量门报告 `Integration Test Executor` 章节：
  - `SC-001: 缺少集成测试文件 → 生成 tests/integration/openflow-behavior/SC-001.spec.ts`
  - 显示生成的测试代码摘要（3-5 行）
  - `执行结果: passed / failed`
- 若执行通过：
  - Evidence Mapping 中 `SC-001` 的 status 被覆盖为 `verified`，coverage = `exact`
  - readiness 不受此 scenario 阻塞
- 若执行失败：
  - readiness = `NotReady`
  - reason code = `integration_test_failed`
  - 输出包含失败的测试断言详情

### Scenario: 已有集成测试文件，质量门直接执行

**Given:**
- feature `payment-gateway` 存在 `behavior.md` 和 critical scenario `SC-001`
- `tests/integration/openflow-behavior/SC-001.spec.ts` **已存在**
- Evidence Mapping 中 `SC-001` 的 `Evidence Ref` 指向该文件

**When:**
- AI 调用 `openflow-quality-gate`

**Then:**
- 适配器跳过生成阶段，直接执行已有测试文件
- 执行结果被收集并映射到 `SC-001` 的 evidence status
- 不修改已有测试文件（除非文件包含 auto-generation marker 且 scenario 已变更）

### Scenario: 不支持的项目语言

**Given:**
- feature `payment-gateway` 存在 `behavior.md` 和 critical scenario
- 项目为 Rust 项目（当前版本未实现 Rust 策略）

**When:**
- AI 调用 `openflow-quality-gate`

**Then:**
- 质量门输出 `Integration Test Executor` 章节：
  - `Language: Rust (unsupported)`
  - `Status: skipped`
  - `Advisory: 集成测试执行适配器暂不支持此语言。请手动编写集成测试并更新 Evidence Mapping。`
- readiness **不因此阻塞**
- 现有 verify 流程继续执行

### Scenario: 无 behavior.md 的 feature（回归保护）

**Given:**
- feature `legacy-refactor` **无** `behavior.md`
- 只有 `design.md` 和 `plan.md`

**When:**
- AI 调用 `openflow-quality-gate`

**Then:**
- 质量门输出中**不出现** `Integration Test Executor` 章节
- 所有现有章节（Context, Applicability, Risk Assessment, Harden Decision, Evidence-Aware Verify, Readiness）与之前版本完全一致
- `bun test` 中的回归测试通过

### Scenario: 集成测试生成后用户未审查

**Given:**
- 适配器为 `SC-001` 生成了新的集成测试文件
- 该文件是**首次生成**（文件 hash 不在历史记录中）

**When:**
- 质量门计算 readiness

**Then (可配置):**
- **严格模式**（默认）：readiness = `NeedsDecision`，reason = `integration_test_generated_unchecked`
- **宽松模式**：readiness 不受影响，但报告 `ReadyWithDocUpdates`，提醒用户审查生成的测试
- 质量门输出明确标注：`⚠️ 以下集成测试为自动生成，建议人工审查后再归档`

---

## Required Content

成功的集成测试执行结果至少应包含：

- **Scenario ID**：关联的 behavior scenario 标识
- **Test File Path**：生成的或已有的测试文件路径
- **Generated**：是否由适配器自动生成（`true` / `false`）
- **Passed**：执行结果（`true` / `false`）
- **Output**：测试运行器的 stdout/stderr 摘要（失败时包含断言详情）
- **Duration Ms**：执行耗时
- **Coverage Level**：`exact`（测试直接对应 scenario）或 `equivalent`（语义等价但步骤不同）
- **Status**：`verified`（通过）/ `failed`（失败）/ `not_applicable`（跳过）/ `missing_evidence`（无法生成或执行）

---

## Coverage Rules

| Coverage Level | User-visible Meaning | Blocking Behavior |
|----------------|----------------------|-------------------|
| `exact` | 集成测试逐项覆盖 Given/When/Then 条件 | critical 通过 |
| `equivalent` | 测试步骤不同但业务语义等价 | critical 通过 |
| `partial` | 只覆盖部分条件或结果 | critical 不通过 |
| `missing` | 无法生成或执行测试 | critical 不通过 |
| `not_applicable` | 本次不适用 | 不阻塞 |

---

## Readiness Outcomes

| Evidence State | User-visible Outcome |
|----------------|----------------------|
| All critical scenarios have exact/equivalent tests + all passed | Ready（无额外阻塞） |
| Any critical scenario test failed | NotReady，reason = `integration_test_failed` |
| Critical scenario 无法生成测试（不支持语言/框架） | advisory only，不阻塞 |
| Critical scenario 测试生成成功但用户未审查 | NeedsDecision 或 ReadyWithDocUpdates（依配置） |
| Optional/boundary scenario 测试缺失 | advisory gap，不阻塞 archive readiness |

---

## Evidence Mapping

| Scenario ID | Criticality | Evidence Ref | Evidence Type | Coverage Level | Freshness | Status |
|-------------|-------------|--------------|---------------|----------------|-----------|--------|
| 质量门为 critical scenario 生成并执行集成测试 | critical | tests/integration/openflow-behavior/*.spec.ts | integration_test | exact | fresh | verified |
| 已有集成测试文件，质量门直接执行 | critical | tests/integration/openflow-behavior/*.spec.ts | integration_test | exact | fresh | verified |
| 不支持的项目语言 | optional | N/A | not_applicable | not_applicable | N/A | not_applicable |
| 无 behavior.md 的 feature（回归保护） | critical | N/A | not_applicable | not_applicable | N/A | not_applicable |
| 集成测试生成后用户未审查 | critical | N/A | manual_review | exact | fresh | needs_decision |

---

## Must Not Behavior

1. **不得修改生产代码**：适配器只生成 `tests/integration/` 下的测试文件，不得修改 `src/` 或实现代码。
2. **不得在无 behavior.md 时引入新行为**：无 behavior.md 的 feature，质量门输出格式和 readiness 语义必须与之前 100% 一致。
3. **不得自动覆盖人工编写的测试**：若已有测试文件且无 auto-generation marker，适配器不得覆盖。
4. **不得因 optional scenario 阻塞 readiness**：只有 `criticality: critical` 的测试失败才能阻塞。
5. **不得在 unsupported language 时报错或阻塞**：必须优雅降级为 advisory。

---

## Failure Modes

| Failure | User-visible Behavior | Recovery |
|---|---|---|
| 测试生成成功但执行超时 | `NotReady`，reason = `integration_test_execution_timeout` | 优化测试或增加超时配置 |
| 测试生成代码语法错误 | `NotReady`，reason = `integration_test_generation_error` | 修复生成器模板或手动编写测试 |
| 测试依赖缺失（如数据库未启动） | `NotReady`，reason = `integration_test_dependency_missing` | 配置测试环境或使用 mock |
| 多次质量门运行结果不一致 | `NeedsDecision`，提示环境或实现代码不稳定 | 排查 flaky test |

---

## Acceptance / Verification Mapping

| Acceptance Criterion | Scenario | Evidence Type | Expected Evidence | Status |
|---|---|---|---|---|
| 有 behavior.md + critical scenario 时质量门生成并执行集成测试 | 质量门为 critical scenario 生成并执行集成测试 | integration_test | 生成的测试文件存在于 `tests/integration/openflow-behavior/` 且被执行 | pending |
| 已有集成测试时质量门直接执行 | 已有集成测试文件，质量门直接执行 | integration_test | 不生成新文件，直接执行已有文件 | pending |
| 不支持语言时优雅降级 | 不支持的项目语言 | advisory | 输出 advisory gap，readiness 不阻塞 | pending |
| 无 behavior.md 时现有行为不变 | 无 behavior.md 的 feature（回归保护） | regression_test | 质量门输出与之前版本完全一致 | pending |
| 未审查的生成测试阻塞或警告 | 集成测试生成后用户未审查 | manual_review | readiness = NeedsDecision 或 ReadyWithDocUpdates | pending |
