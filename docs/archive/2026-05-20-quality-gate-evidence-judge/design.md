# BDD-Guided Integration Evidence in Quality Gate - Design

## Human Consensus Summary

Feature title: BDD-Guided Integration Evidence in Quality Gate  
Internal slug: `quality-gate-evidence-judge`

本变更建立在一个已达成并已实现的前提上：Quality Gate 不再执行代码级通用验证命令（lint/typecheck/unit test/build/format）。这些常规验证由 OMO/实现节点和 QA/review 节点根据项目语言与框架智能完成。

本变更新增的设计重点是：**用 BDD 行为文档指导集成测试，并把集成测试证据纳入 Quality Gate readiness 判断。**

## Problem

删除硬编码代码级测试命令后，Quality Gate 不能只停留在“文档存在”或“代码检查已交给实现节点”。它还需要回答一个更接近验收的问题：

> 行为文档中声明的关键业务行为，是否已经通过合适的集成测试或集成验证证据证明？

当前缺口是：

1. `behavior.md` 已描述行为场景，但没有明确转化为集成测试覆盖要求。
2. 实现节点可能运行了测试，但 Quality Gate 没有稳定判断这些证据是否覆盖关键行为。
3. 缺少证据时，系统容易混淆为工具链失败或泛化的 quality failure，而不是明确的 integration evidence gap。

## Goals

- 将 `behavior.md` 中的 critical behavior scenario 转化为集成测试/集成验证证据要求。
- 在 Quality Gate 中检查每个关键行为是否有对应 integration evidence。
- 允许 AI/OMO 根据项目语言、框架、运行环境智能选择集成测试方式。
- 缺少集成证据时，Quality Gate 报告 `missing_integration_evidence`，而不是执行或失败某个固定命令。
- Archive 时保留 `behavior → integration evidence → implementation` 的 traceability。

## Non-Goals

- 不恢复通用代码级验证命令执行。
- 不在 OpenFlow 中硬编码任何集成测试命令。
- 不要求所有场景都必须有自动化集成测试；允许 API smoke test、QA 记录、人工可复现验证等证据形式，但 critical scenario 必须有明确证据。
- 不替代 OMO/实现节点选择、编写、执行测试的职责。

## Design Constraints

1. **BDD is the source of integration scope**
   - `behavior.md` 的场景定义集成测试应覆盖什么。
   - issue 模式可使用 `issue-clarification.md` 中的关键语义作为临时行为约束。

2. **Quality Gate checks evidence, not commands**
   - Quality Gate 不执行固定命令。
   - 如果 evidence 缺失，Quality Gate 阻塞 readiness 并说明缺哪个行为证据。

3. **AI/OMO chooses integration method**
   - AI/OMO 根据项目语言、框架、数据库、服务依赖、测试环境智能选择集成验证方式。
   - 示例：Laravel 可用 feature test/API smoke；Go 可用 integration package；服务型项目可用 docker compose + HTTP smoke。

4. **Evidence must be scenario-linked**
   - 集成证据必须能回链到 `behavior.md` 的 scenario 或 issue clarification 的关键行为。
   - 证据只说“测试通过”不够；必须说明覆盖了哪个行为。

5. **Critical behavior blocks readiness**
   - critical scenario 缺少集成证据时，readiness 为 NotReady。
   - optional/boundary scenario 可以记录为 advisory 或 not_applicable。

6. **Critical scenarios require one-by-one mapping**
   - 每个 critical scenario 都必须有独立的 evidence mapping。
   - 允许一个集成测试覆盖多个 scenario，但 evidence 必须逐一列出覆盖关系。
   - 不接受“整体大致一致”“测试都通过了”这类泛化证据。

7. **Equivalent coverage is acceptable, vague coverage is not**
   - evidence 不必逐字复刻 `Given/When/Then`，但必须语义等价覆盖关键前置条件、触发动作和可观察结果。
   - 如果只覆盖部分条件或只验证内部实现细节，标记为 `partial` 或 `insufficient`。

8. **Quality Gate performs compilation health probe, not test execution**
   - Quality Gate 不执行单元测试、lint、format 等代码级验证命令。
   - 但 Quality Gate 应执行轻量的**编译健康探测**（compilation health probe）：根据项目语言自动探测并运行零配置的编译/语法检查。
   - 探测逻辑不硬编码命令，而是基于项目文件（如 `tsconfig.json`、`go.mod`、`composer.json`）智能推断。
   - 探测失败或工具链缺失时，不阻塞 readiness，仅记录 advisory gap；探测成功则作为 freshness 证据的一部分。

## Evidence Coverage Levels

Quality Gate 使用以下覆盖等级判断 behavior scenario 与 integration evidence 的关系：

| Coverage Level | Meaning | Readiness Effect |
|----------------|---------|------------------|
| `exact` | Evidence 明确覆盖 scenario 的 Given / When / Then，且结果匹配。 | critical 通过 |
| `equivalent` | Evidence 的步骤不同，但语义等价覆盖关键业务行为和可观察结果。 | critical 通过 |
| `partial` | Evidence 只覆盖部分前置条件、触发动作或结果。 | critical 不通过；optional 可 advisory |
| `missing` | 找不到对应 evidence。 | critical 不通过 |
| `not_applicable` | scenario 明确不适用于本次实现或被业务确认排除。 | 不阻塞，但必须记录原因 |

## Scenario-to-Evidence Mapping Rules

1. **Critical scenario: one row required**
   - 每个 critical scenario 必须在 evidence mapping 中有一行。

2. **One test may cover many scenarios**
   - 一个集成测试可以覆盖多个 scenario，但不能只写“覆盖所有场景”；必须逐一列出：`scenario_id → evidence_ref → coverage_level`。

3. **Given / When / Then comparison is semantic**
   - 不要求逐字一致。
   - 必须证明：关键前置条件成立、关键动作被触发、用户/系统可观察结果符合预期。

4. **Implementation-only assertions are insufficient**
   - 只断言内部函数、数据库字段或 mock 调用，不足以覆盖用户可观察行为，除非该 scenario 本身就是内部协议/数据一致性场景。

5. **Ambiguous evidence requires clarification**
   - 如果 evidence 与 scenario 关系不清，Quality Gate 应标记 `partial` 或 `needs_decision`，而不是自动当作通过。

## Evidence Mapping Format

`behavior.md` 必须使用固定 evidence mapping 表格，供 Quality Gate 解析或人工审查：

```md
| Scenario ID | Criticality | Evidence Ref | Evidence Type | Coverage Level | Equivalence Rationale | Freshness | Status |
|-------------|-------------|--------------|---------------|----------------|-----------------------|-----------|--------|
| SC-001 | critical | .sisyphus/evidence/SC-001-api-smoke.md | api_smoke | exact | N/A | fresh | verified |
```

字段约束：

| Field | Required | Meaning |
|-------|----------|---------|
| `Scenario ID` | yes | behavior scenario 的稳定 ID；如果旧文档没有 ID，Quality Gate 应使用标题 slug 作为临时 ID。 |
| `Criticality` | yes | `critical`、`boundary`、`optional`。 |
| `Evidence Ref` | critical 必填 | 证据文件路径、测试报告路径、QA 记录路径或可复现验证记录。 |
| `Evidence Type` | yes | `integration_test`、`api_smoke`、`e2e`、`qa_record`、`manual_repro`、`not_applicable`。 |
| `Coverage Level` | yes | `exact`、`equivalent`、`partial`、`missing`、`not_applicable`。 |
| `Equivalence Rationale` | equivalent 必填 | 解释为什么 evidence 与 scenario 语义等价。 |
| `Freshness` | yes | `fresh`、`stale`、`unknown`。 |
| `Status` | yes | `verified`、`failed`、`missing_evidence`、`needs_decision`、`not_applicable`。 |

## Criticality Defaults

- `behavior.md` 中未显式标记的 scenario 默认 `critical`。
- `Boundary:` 标题或明确标记 `boundary` 的场景为 `boundary`。
- 只有明确标记为 `optional` 或 `not_applicable` 的场景才不默认阻塞 readiness。
- issue 模式下，`issue-clarification.md` 的 confirmed root cause、known requirements、expected behavior、regression signature 默认视为 critical evidence targets。

## Evidence Storage

- `behavior.md` 保存 scenario-to-evidence mapping 摘要。
- `.sisyphus/evidence/{scenario-id}-{short-description}.md` 保存详细证据。
- 若证据来自外部测试报告或日志，`Evidence Ref` 应指向稳定路径或记录摘要，不能只写"见控制台输出"。
- Verify output 可生成临时 evidence summary，但 archive 前必须能追溯到持久化 evidence ref。

### Evidence Ref 可追溯性要求

Evidence Ref 必须指向可持久追溯的证据源。以下引用方式**明确禁止**：

| 禁止的引用方式 | 原因 |
|----------------|------|
| "见控制台输出" | 控制台输出是一次性的，无法在后续会话或 review 中追溯 |
| "测试已跑过" | 没有具体指向任何文件或记录，无法验证 |
| "本地已验证" | 缺乏执行上下文和可复现性 |
| 无 git hash / 无时间戳的引用 | 无法判定 freshness，会被判定为 `unknown` |

合规的 Evidence Ref 示例：

- `.sisyphus/evidence/SC-001-api-smoke.md`（项目内持久化证据文件）
- `test-results/integration-2026-05-20.html`（稳定路径的测试报告）
- `docs/changes/2026-05-20-feature/qa-checklist.md`（项目文档中的 QA 记录）

### Evidence 文件模板字段与 Parser 映射

证据文件 `.sisyphus/evidence/{scenario-id}-{slug}.md` 的字段对应 `BehaviorScenarioEvidence` 类型定义：

| 证据文件字段 | 对应 Parser 字段 | 对应 Mapping 表列 | 必填 |
|-------------|-----------------|------------------|------|
| Scenario Reference → Scenario ID | `scenarioId` | Scenario ID | 是 |
| Scenario Reference → Scenario Name | `scenarioName` | （用于 readability） | 是 |
| Evidence Type | `evidenceType` | Evidence Type | 是 |
| Execution Context | （辅助 freshness 判定） | （辅助字段） | 是 |
| Observed Results → Result | `status` | Status | 是 |
| Coverage Rationale | `equivalenceRationale` | Equivalence Rationale | equivalent 时必填 |
| Freshness Metadata → Timestamp / Git HEAD | `freshness` | Freshness | 是 |
| （从 mapping 表读入） | `criticality` | Criticality | 是 |
| （从 mapping 表读入） | `coverageLevel` | Coverage Level | 是 |
| （从 mapping 表读入） | `evidenceReference` | Evidence Ref | critical 必填 |

## Freshness Rules

Evidence freshness 判定规则：

1. `fresh`: evidence 生成时间晚于最后一次相关实现文件变更，或 evidence 明确绑定当前 git HEAD/diff hash/change set。
2. `stale`: evidence 早于相关实现文件变更，或绑定的是旧 git HEAD/diff hash。
3. `unknown`: evidence 没有时间、git hash、命令输出时间、QA 日期或其他 freshness metadata。

Quality Gate 不应把 `unknown` 当作通过。critical scenario 的 `unknown` freshness 应进入 `needs_decision` 或 `NotReady`。

## Readiness Decision Matrix

| Condition | Readiness |
|-----------|-----------|
| 所有 critical scenario 均为 `exact`/`equivalent` + `fresh` + `verified` | `Ready` |
| critical scenario 存在 `partial`、`missing`、`failed` 或 `stale` | `NotReady` |
| critical scenario evidence 语义不清或 freshness 为 `unknown` | `NeedsDecision` 或 `NotReady` |
| 仅 optional/boundary 缺 evidence | `Ready` 或 `ReadyWithDocUpdates`，并记录 advisory gap |
| scenario 标记 `not_applicable` 但无理由 | `NeedsDecision` |
| evidence ref 缺失或无法读取 | `NotReady` |

## Quality Gate Flow

```text
behavior.md / issue-clarification.md
  → derive integration evidence requirements
  → AI/OMO runs or records project-appropriate integration validation
  → evidence is persisted under .sisyphus/evidence and mapped in behavior.md
  → Quality Gate performs compilation health probe (adaptive, non-blocking)
  → Quality Gate checks coverage and freshness
  → readiness classification
  → archive maps behavior → evidence → implementation
```

## Behavior Alignment

| Behavior Scenario | Design Response | Risk |
|------------------|-----------------|------|
| behavior.md defines critical scenario | Quality Gate requires scenario-linked integration evidence. | Medium |
| AI/OMO has run project tests | Quality Gate checks whether evidence maps to behavior, not merely whether tests passed. | Medium |
| one integration test covers multiple scenarios | Quality Gate accepts it only when each scenario has an explicit evidence mapping row. | Medium |
| evidence missing for critical behavior | Readiness becomes NotReady with missing integration evidence reason. | Medium |
| project has no standard integration test command | AI/OMO may provide API smoke, QA record, or manual reproducible evidence. | Low |
| optional scenario lacks evidence | Report advisory gap without blocking if scenario is explicitly optional. | Low |

## Compilation Health Probe

Quality Gate 在执行集成证据判定之前，应执行一次轻量的编译健康探测：

### 探测规则

| 项目标识 | 语言/框架 | 探测命令 | 说明 |
|----------|-----------|----------|------|
| `tsconfig.json` | TypeScript | `npx tsc --noEmit` 或 `tsc --noEmit` | 类型检查 |
| `go.mod` | Go | `go build ./...` | 编译检查 |
| `Cargo.toml` | Rust | `cargo check` | 编译检查 |
| `package.json` | JavaScript/Node | 检查 `scripts` 中是否有 `typecheck`，如有则运行 | 仅在有明确脚本时运行 |
| `composer.json` | PHP | 检查 `scripts` 或 `vendor/bin/phpstan`、`vendor/bin/psalm` | 仅在有明确工具时运行 |
| `*.py` | Python | `python -m py_compile`（仅语法） | 轻量语法检查 |
| `*.rb` | Ruby | `ruby -c`（仅语法） | 轻量语法检查 |

### 探测原则

1. **不硬编码**：命令由项目文件推断，不是 OpenFlow 写死的。
2. **不阻塞**：探测失败或工具链缺失时，不阻塞 readiness，只记录 advisory gap。
3. **不作为证据**：探测结果不替代集成测试证据，仅作为"项目可编译"的辅助信号。
4. ** freshness 关联**：探测通过时，记录 timestamp 和 git HEAD，作为 evidence freshness 的辅助元数据。

## Success Criteria

- [ ] Quality Gate no longer frames code-level tests as its own execution responsibility.
- [ ] Quality Gate performs adaptive compilation health probe based on project language.
- [ ] `behavior.md` scenarios can be interpreted as integration evidence requirements.
- [ ] Each critical scenario has explicit scenario-to-evidence mapping.
- [ ] Exact and equivalent coverage pass; partial and missing coverage block critical readiness.
- [ ] Missing critical behavior evidence blocks readiness as `missing_integration_evidence`.
- [ ] Evidence can identify which scenario it covers.
- [ ] Archive can preserve behavior-to-evidence traceability.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Evidence becomes vague | Require scenario-linked evidence, not generic “tests passed”. |
| AI chooses weak integration test | Mark weak or indirect evidence as advisory/insufficient for critical scenarios. |
| Projects lack automated integration tests | Allow smoke/API/QA/manual reproducible evidence with clear scope and result. |
| Quality Gate becomes too strict | Distinguish critical, boundary, and optional scenarios. |
| Implementation agent skips typecheck/compilation | Compilation health probe provides lightweight, non-blocking fallback. Probe failure is advisory, not blocking. |
| Non-compiled languages (PHP/Python) have no compile step | Probe detects language-specific tools (phpstan, mypy) if present; otherwise skips gracefully. |
| Probe tool chain missing (ENOENT) | Probe is advisory-only; missing tool does not block readiness. |

## Testing Strategy

- Verify behavior evidence parser can map scenarios to evidence rows.
- Verify missing critical scenario evidence blocks readiness.
- Verify optional scenario missing evidence does not hard-block readiness.
- Verify Quality Gate output uses evidence-gap language, not command-failure language.
