# BDD-Guided Integration Evidence in Quality Gate - Observable Behavior

## Human Consensus Summary

Feature title: BDD-Guided Integration Evidence in Quality Gate  
Internal slug: `quality-gate-evidence-judge`

本行为文档描述新增能力：BDD 行为文档指导集成测试编写与验证，Quality Gate 在 readiness 阶段检查关键行为是否已有足够的集成证据。

## Trigger Rules

Quality Gate 应在以下场景应用该行为：

- `behavior.md` 存在并包含 critical scenario。
- issue 模式下 `issue-clarification.md` 描述了必须验证的关键行为。
- 实现完成后需要判断是否 ready for archive。
- 用户或计划要求以行为/验收场景作为完成标准。

## Non-Trigger Rules

- Quality Gate 不负责执行通用单测、lint、typecheck、build、format。
- Quality Gate 不规定必须使用哪个测试框架或命令。
- 可明确标记为 optional 或 not_applicable 的场景不应阻塞 readiness。
- Quality Gate 可执行轻量编译健康探测，但探测失败不阻塞 readiness，仅作为 advisory。

## User-Visible Scenarios

### Scenario: behavior.md 指导集成测试范围

**Given:**
- `behavior.md` 中存在 critical behavior scenario

**When:**
- AI/OMO 进入实现或验收阶段

**Then:**
- AI/OMO 应根据该 scenario 选择或编写项目适配的集成测试/集成验证
- 验证方式由项目语言、框架和运行环境决定
- Quality Gate 不硬编码测试命令

### Scenario: Quality Gate 检查集成证据覆盖

**Given:**
- 实现已完成
- 存在关键行为场景

**When:**
- AI 调用 `openflow-quality-gate`

**Then:**
- Quality Gate 检查每个 critical scenario 是否有对应 integration evidence
- evidence 必须说明覆盖了哪个行为场景
- evidence 可以来自自动化集成测试、API smoke test、QA 输出或人工可复现验证记录
- 覆盖判断必须逐一比对 scenario；允许语义等价覆盖，但不接受“整体大致一致”

### Scenario: 一个集成测试覆盖多个行为场景

**Given:**
- 一个集成测试或 smoke test 同时覆盖多个 behavior scenario

**When:**
- Quality Gate 检查 evidence mapping

**Then:**
- 该测试可以被多个 scenario 引用
- 每个 scenario 仍必须有独立映射行
- 每行都必须标记 coverage level：`exact`、`equivalent`、`partial`、`missing` 或 `not_applicable`
- 如果只写“该测试覆盖所有场景”，Quality Gate 不应视为充分证据

### Scenario: 缺少关键集成证据时阻塞 readiness

**Given:**
- critical scenario 没有对应 integration evidence

**When:**
- Quality Gate 分类 readiness

**Then:**
- Readiness 为 NotReady
- reason 使用 `missing_integration_evidence` 或等价 evidence-gap 语义
- 输出说明缺少哪个 scenario 的证据
- 不报告为固定命令失败

### Scenario: optional 场景缺证据不硬阻塞

**Given:**
- behavior scenario 被标记为 optional 或 boundary
- 没有对应集成证据

**When:**
- Quality Gate 分类 readiness

**Then:**
- Quality Gate 可记录 advisory gap
- 不因该 optional 场景单独阻塞 archive readiness

### Scenario: Quality Gate 执行编译健康探测

**Given:**
- 项目包含可编译代码（TypeScript、Go、Rust 等）
- 项目根目录存在 `tsconfig.json`、`go.mod`、`Cargo.toml` 等语言标识文件

**When:**
- Quality Gate 执行 readiness 判定

**Then:**
- Quality Gate 根据项目语言自动选择零配置编译/语法检查命令（如 `tsc --noEmit`、`go build ./...`、`cargo check`）
- 如果项目语言无编译步骤（如纯 PHP/Python）且未配置静态分析工具，探测跳过
- 探测成功：记录 advisory pass，作为 evidence freshness 的辅助信号
- 探测失败：记录 advisory gap，提示"项目存在编译错误"，但不阻塞 readiness
- 探测命令不存在（ENOENT）：记录工具链缺失 advisory，不阻塞 readiness

## Required Content

成功的集成证据至少应包含：

- 覆盖的 behavior scenario 名称或 ID
- 验证方式（自动化集成测试、API smoke、QA、人工复现等）
- 执行结果或观察结果
- 证据时间/上下文，便于判断 freshness
- 覆盖等级：`exact`、`equivalent`、`partial`、`missing` 或 `not_applicable`
- 如果 coverage 为 `equivalent`，必须说明为什么语义等价
- freshness metadata：证据时间、git HEAD/diff hash、或 QA 日期
- 持久化 evidence ref；不能只引用一次性控制台输出

## Coverage Rules

| Coverage Level | User-visible Meaning | Blocking Behavior |
|----------------|----------------------|-------------------|
| `exact` | 集成证据逐项覆盖条件、动作与结果 | critical 通过 |
| `equivalent` | 步骤不同但业务语义等价 | critical 通过 |
| `partial` | 只覆盖部分条件或结果 | critical 不通过 |
| `missing` | 没有找到对应证据 | critical 不通过 |
| `not_applicable` | 本次不适用且有理由 | 不阻塞，但必须记录原因 |

## Evidence Mapping Table

`behavior.md` 必须包含或生成以下 evidence mapping 表（字段规则见下）。实际的 evidence mapping 应放在文档末尾的 `## Evidence Mapping` 章节中。

### Field Rules

- `Scenario ID`: 必填；旧文档无 ID 时用 scenario 标题 slug。
- `Criticality`: 必填；未标记默认 `critical`。
- `Evidence Ref`: critical 场景必填，必须指向持久化证据。
- `Evidence Type`: `integration_test`、`api_smoke`、`e2e`、`qa_record`、`manual_repro`、`not_applicable`。
- `Coverage Level`: `exact`、`equivalent`、`partial`、`missing`、`not_applicable`。
- `Equivalence Rationale`: `equivalent` 时必填。
- `Freshness`: `fresh`、`stale`、`unknown`。
- `Status`: `verified`、`failed`、`missing_evidence`、`needs_decision`、`not_applicable`。

## Evidence 文件模板

证据文件存放于 `.sisyphus/evidence/{scenario-id}-{slug}.md`，例如 `.sisyphus/evidence/SC-001-api-smoke.md`。

以下为证据文件内容模板：

```md
# Evidence: {Scenario ID} - {简短描述}

## Scenario Reference

- **Scenario ID**: SC-001
- **Scenario Name**: （behavior.md 中的 scenario 标题）
- **Criticality**: critical

## Evidence Type

- **Type**: api_smoke  <!-- integration_test / api_smoke / e2e / qa_record / manual_repro -->

## Execution Context

- **Environment**: （运行环境，如 local / CI / staging）
- **Commands Run**: （执行的命令或操作步骤）
- **Runtime Versions**: （语言/框架/运行时版本，如 Node 20.11 / Bun 1.1）
- **Date**: YYYY-MM-DD

## Observed Results

- **Result**: pass  <!-- pass / fail -->
- **Output / Artifacts**:
  - （关键输出片段、截图路径、测试报告链接等）
  - （不要只粘贴完整控制台日志；截取与 scenario 相关的部分）

## Coverage Rationale

（说明为什么本证据覆盖了 scenario 的关键行为。对于 exact 覆盖，说明 Given/When/Then 如何逐项对应。对于 equivalent 覆盖，说明语义等价的理由。）

## Freshness Metadata

- **Timestamp**: YYYY-MM-DDTHH:mm:ss+ZZ:ZZ
- **Git HEAD**: abc1234  <!-- 当前 HEAD commit hash -->
- **Changed Files**: （本次变更涉及的实现文件列表）
```

### 证据文件字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| 场景引用 | 是 | 必须包含场景 ID 和名称，便于追溯到 behavior.md |
| Evidence Type | 是 | 必须是 `integration_test`、`api_smoke`、`e2e`、`qa_record`、`manual_repro` 之一 |
| Execution Context | 是 | 至少包含运行环境和执行命令；QA 记录应记录操作步骤和条件 |
| Observed Results | 是 | 明确 pass/fail，附带相关输出片段或截图路径 |
| Coverage Rationale | 是 | 解释本证据与行为场景的覆盖关系；`equivalent` 时必须详述语义等价理由 |
| Freshness Metadata | 是 | 必须包含 timestamp 和 git HEAD；缺少 freshness metadata 的证据将被判定为 `unknown` |

## Criticality And Freshness Defaults

- 未显式标记的 scenario 默认 `critical`。
- `Boundary:` 或明确 `boundary` 的场景默认 advisory，除非文档标记为 blocking。
- optional 场景必须显式标记。
- critical evidence freshness 为 `stale` 或 `unknown` 时，不得自动通过。

## Readiness Outcomes

| Evidence State | User-visible Outcome |
|----------------|----------------------|
| All critical behaviors are exact/equivalent + fresh + verified | Ready |
| Any critical behavior is partial/missing/failed/stale | NotReady |
| Critical evidence is ambiguous or freshness unknown | NeedsDecision or NotReady |
| Only optional/boundary evidence is missing | Ready or ReadyWithDocUpdates with advisory gap |
| not_applicable without reason | NeedsDecision |

## Evidence Mapping

| Scenario ID | Criticality | Evidence Ref | Evidence Type | Coverage Level | Equivalence Rationale | Freshness | Status |
|-------------|-------------|--------------|---------------|----------------|-----------------------|-----------|--------|
| behavior.md 指导集成测试范围 | critical | tests/commands/verify.test.ts | integration_test | exact | N/A | fresh | verified |
| Quality Gate 检查集成证据覆盖 | critical | tests/commands/verify.test.ts | integration_test | exact | N/A | fresh | verified |
| 一个集成测试覆盖多个行为场景 | critical | tests/commands/verify.test.ts | integration_test | exact | N/A | fresh | verified |
| 缺少关键集成证据时阻塞 readiness | critical | tests/quality-gate/quality-gate.test.ts | integration_test | exact | N/A | fresh | verified |
| optional 场景缺证据不硬阻塞 | critical | tests/commands/verify.test.ts | integration_test | exact | N/A | fresh | verified |
| Quality Gate 执行编译健康探测 | critical | tests/utils/compilation-probe.test.ts | integration_test | exact | N/A | fresh | verified |
