# quality-gate-integration-test-executor - Design

> **Status**: Draft | **Feature**: quality-gate-integration-test-executor
> **Date**: 2026-05-21

---

## Human Consensus Summary

**Feature title**: Quality Gate Integration Test Executor  
**Internal slug**: `quality-gate-integration-test-executor`  
**Problem**: 当前质量门对集成测试的验证是"虚假就绪"——`behavior.md` 中的 critical scenario 在编码阶段无人实现，质量门只检查静态 Evidence Mapping 表格的填写状态，不实际执行集成验证。  
**Expected result**: 质量门增加可插拔的集成测试执行适配器，根据 `behavior.md` 的 critical scenario 自动生成并执行集成验证，用真实执行结果判定 readiness。

---

## Overview

在现有的 `openflow-quality-gate` 质量门中，插入一个 **Integration Test Executor Adapter** 节点。

该适配器位于 `handleVerify` → `collectEvidence` 阶段，职责边界如下：
- **不替代**实现阶段的单元测试编写
- **不替代**安全扫描、一致性检查、漂移检测
- **只补充** behavior.md 中 critical scenario 的**动态验证执行**

质量门的主流程（适用性判定 → 风险判定 → harden → verify → readiness → archive）保持不变。

---

## Problem

当前质量门的 verify 阶段对集成测试的处理分为三层假象：

1. **编码阶段假象**：AI/OMO 实现代理在编码时主要编写单元测试（`*.test.ts` 中的函数级测试），`behavior.md` 中描述的端到端行为场景（如"用户完成支付后订单状态变为已确认"）**没有任何自动化验证覆盖**。
2. **Evidence Mapping 假象**：`behavior.md` 末尾的 Evidence Mapping 表格允许人工标注 `Status: verified`、`Coverage Level: exact`。质量门只解析这张表格并信任其内容。表格中的 `verified` 状态**从未经过实际执行验证**。
3. **Readiness 假象**：当所有 critical scenario 的表格状态都是 `verified` 时，质量门报告 `Ready`。但系统的实际行为可能从未被集成测试验证过。

这导致 `behavior.md` 从设计意图上是一份"用户主行为契约"，但在工程实践中沦为一份**无人执行的静态文档**。

---

## Goals

1. **动态验证**：质量门能够根据 `behavior.md` 中的 critical scenario，实际生成并执行项目适配的集成测试。
2. **真实证据**：Evidence Mapping 中的 `Status` 和 `Coverage Level` 必须来自**真实执行结果**，而非人工标注或假设。
3. **可插拔兼容**：适配器作为可选组件插入现有 verify 流程。无 `behavior.md` 或无副作用场景时，现有行为 100% 不变。
4. **多语言适配**：根据项目语言/框架（TypeScript/Bun、Go、Python、PHP 等）选择对应的集成测试生成与执行策略，不硬编码单一工具链。
5. **可追溯产出**：生成的集成测试文件应作为常规代码落入项目测试目录，被 git 跟踪，而非一次性临时文件。

---

## Non-Goals

1. **不替换单元测试**：实现阶段的单元测试仍由 AI/OMO 编码代理负责。本功能只补充**集成/行为级验证**。
2. **不强制 BDD 框架**：不引入 Cucumber/Gherkin/step definitions。集成测试采用项目原生的测试框架编写。
3. **不自动修复失败**：集成测试失败时，适配器报告失败证据并阻塞 readiness，但不自动修改实现代码来让测试通过。
4. **不覆盖非 critical 场景**：`optional` / `boundary` 场景的集成测试缺失不阻塞 readiness，仅记录 advisory gap。
5. **不改变 archive 流程**：archive 对 readiness 的消费逻辑不变。

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    openflow-quality-gate                        │
│                                                                 │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────┐  │
│  │ Applicability│ → │  Risk Assess │ → │   Harden (opt)      │  │
│  └─────────────┘   └─────────────┘   └─────────────────────┘  │
│                              ↓                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                      Verify Phase                            ││
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ ││
│  │  │ Context Align│ │ Security/Cons│ │ Compilation Probe    │ ││
│  │  └──────────────┘ └──────────────┘ └──────────────────────┘ ││
│  │                              ↓                               ││
│  │  ┌────────────────────────────────────────────────────────┐ ││
│  │  │   Integration Test Executor Adapter (NEW)              │ ││
│  │  │   - parseBehaviorScenarios()                           │ ││
│  │  │   - generateIntegrationTest()                          │ ││
│  │  │   - executeIntegrationTest()                           │ ││
│  │  │   - collectTestResults()                               │ ││
│  │  └────────────────────────────────────────────────────────┘ ││
│  │                              ↓                               ││
│  │  ┌────────────────────────────────────────────────────────┐ ││
│  │  │   Evidence Freshness Check                             │ ││
│  │  └────────────────────────────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
│                              ↓                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │   Readiness Classification (Ready / NotReady / NeedsDecision)││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 适配器位置

适配器在 `src/commands/verify.ts` 的 `collectEvidence` 函数中，位于**一致性检查之后、编译探测之后**。

```typescript
// src/commands/verify.ts (conceptual)
const qualityResults = await runQualityChecks(ctx)          // skipped
const securityResults = await runSecurityChecks(ctx, cache)
const consistencyResults = await runConsistencyChecks(...)
const compilationProbeResult = await runCompilationProbe(ctx.directory)

// NEW: Integration Test Executor Adapter
const integrationTestResults = await runIntegrationTestExecutor(ctx, feature, contract, behaviorEvidence)

const checkResults = [...qualityResults, ...securityResults, ...consistencyResults]
// compilation probe and integration test results are handled separately
```

### 关键模块

| 模块 | 路径 | 职责 |
|---|---|---|
| Integration Test Executor | `src/adapters/verification/integration-test-executor.ts` | 主入口：编排解析、生成、执行、收集 |
| Scenario Parser | `src/adapters/verification/scenario-parser.ts` | 从 `behavior.md` 提取 Given/When/Then + criticality |
| Test Generator | `src/adapters/verification/test-generator.ts` | 根据语言和 scenario 生成测试代码 |
| Test Runner | `src/adapters/verification/test-runner.ts` | 执行生成的测试，捕获 stdout/stderr/exit code |
| Language Detector | `src/adapters/verification/language-detector.ts` | 根据项目文件推断语言和框架 |
| Result Mapper | `src/adapters/verification/result-mapper.ts` | 将测试结果映射为 `BehaviorScenarioEvidence` |

---

## Design Decisions

### Decision 1: 生成 vs 执行 的职责分离

**问题**：适配器应该只执行已有的集成测试，还是应该也负责生成缺失的测试？

**决策**：**生成 + 执行**。
- 若 critical scenario 已有对应的集成测试文件（通过 `evidenceReference` 指向一个存在的测试文件）→ 直接执行
- 若 critical scenario **无对应测试文件** → 调用 `Test Generator` 生成测试代码，写入项目测试目录，然后执行
- 生成行为必须被记录：在 verify 输出中标注 `generated: true`，提示用户审查生成的测试

**理由**：如果不生成，则 behavior.md 的 critical scenario 永远无法被实际验证（因为实现代理不写集成测试）。如果只生成不执行，则又回到静态证据问题。

### Decision 2: 生成测试的持久化策略

**问题**：生成的集成测试文件是临时文件还是持久代码？

**决策**：**持久代码**，写入 `tests/integration/openflow-behavior/{scenario-id}.spec.ts`（或语言等效路径）。
- 文件被 git 跟踪，属于项目常规代码
- 实现代理在后续编码中可以看到并维护这些测试
- 如果测试已存在且未被手动修改（通过 hash 或 marker 判断），适配器可以在下次质量门时覆盖它

**理由**：一次性临时文件无法形成可维护的测试资产，且下次质量门需要重新生成，浪费 token。

### Decision 3: 多语言适配策略

**问题**：如何支持 TypeScript/Bun、Go、Python、PHP 等不同项目？

**决策**：**基于项目文件推断 + 策略模式**。
- 检测 `package.json` + `tsconfig.json` → TypeScript/Bun 策略（使用 `bun test` 或 `npm test`）
- 检测 `go.mod` → Go 策略（使用 `go test`）
- 检测 `requirements.txt` / `pyproject.toml` → Python 策略（使用 `pytest`）
- 检测 `composer.json` → PHP 策略（使用 `phpunit` 或 `pest`）
- 未知语言 → 跳过适配器，记录 advisory，不阻塞 readiness

每种策略实现相同的接口：
```typescript
interface IntegrationTestStrategy {
  detect(projectDir: string): boolean
  generate(scenario: BehaviorScenario, projectDir: string): Promise<{ testFilePath: string; code: string }>
  execute(testFilePath: string, projectDir: string): Promise<{ passed: boolean; output: string; durationMs: number }>
}
```

### Decision 4: 失败处理与 readiness 映射

| 测试结果 | readiness 影响 | reason code |
|---|---|---|
| 全部 critical scenario 通过 | 无额外阻塞 | — |
| 任意 critical scenario 失败 | `NotReady` | `integration_test_failed` |
| 生成测试成功但执行抛出异常 | `NotReady` | `integration_test_execution_error` |
| 不支持的语言/框架 | advisory only，不阻塞 | `integration_test_unsupported_language` |
| 生成测试代码但用户未审查 | `NeedsDecision` 或 `ReadyWithDocUpdates`（可配置）| `integration_test_generated_unchecked` |

### Decision 5: 与现有 behavior evidence 的融合

**问题**：适配器执行结果如何与 `behavior.md` 的 Evidence Mapping 表格交互？

**决策**：**运行时覆盖**。
- 适配器先读取 `behavior.md` 中的 Evidence Mapping 表格（作为用户期望的初始状态）
- 执行测试后，用真实结果**覆盖**内存中的 evidence 状态
- 不自动重写 `behavior.md` 文件本身（避免在 verify 阶段修改源文档）
- 真实结果通过 `VerifyEvidencePacket.behaviorScenarios` 传递给 readiness 分类器
- 可选：质量门报告 readiness 后，提示用户运行 `/openflow-change` 或手动更新 `behavior.md` 表格以同步真实状态

---

## Behavior Alignment

| Behavior Scenario | Design Response | Files / Modules | Risk |
|---|---|---|---|
| 质量门检测到无 behavior.md 的 feature | 适配器跳过，现有流程 100% 不变 | `src/commands/verify.ts` | Low |
| 质量门检测到 critical scenario 缺少集成测试 | 调用 Test Generator 生成测试代码，写入测试目录 | `src/adapters/verification/test-generator.ts` | High |
| 质量门执行生成的集成测试 | 调用 Test Runner，捕获结果 | `src/adapters/verification/test-runner.ts` | High |
| 集成测试失败 | 阻塞 readiness，reason code = `integration_test_failed` | `src/commands/verify.ts:classifyReadiness` | Medium |
| 项目语言不支持 | 记录 advisory gap，不阻塞 readiness | `src/adapters/verification/language-detector.ts` | Low |
| 集成测试执行成功 | behavior scenario 状态变为 `verified`，coverage = `exact` | `src/adapters/verification/result-mapper.ts` | Medium |

---

## Design Constraints

1. **向后兼容**：`src/commands/quality-gate.ts` 的主流程不得修改。适配器通过 `verify.ts` 的 `collectEvidence` 内部调用。
2. **无 side effect 原则**：适配器不得修改 `src/` 生产代码。只读写 `tests/integration/` 和 `.sisyphus/evidence/`。
3. **超时控制**：单个 scenario 的集成测试执行超时默认 60 秒，总适配器超时默认 5 分钟。
4. **幂等性**：同一 scenario 多次运行质量门，结果应一致（除非实现代码变更）。

---

## Success Criteria

- [ ] 有 `behavior.md` + critical scenario 的 feature，质量门实际执行集成测试
- [ ] 无 `behavior.md` 的 feature，质量门行为与之前完全一致（回归测试通过）
- [ ] critical scenario 的集成测试失败 → readiness = `NotReady`
- [ ] 不支持的语言 → 记录 advisory，不阻塞 readiness
- [ ] 生成的集成测试文件持久化到项目测试目录，可被 git 跟踪
- [ ] `bun test` 全量通过，包括新增适配器测试和回归测试

---

## Risks And Mitigations

| Risk | 影响 | 缓解措施 |
|---|---|---|
| 生成的集成测试质量低，误报/漏报 | High | 生成代码包含明确注释 `# Auto-generated by openflow-quality-gate integration test executor. Review required.`；首次生成后映射为 `NeedsDecision` |
| 执行集成测试耗时过长，阻塞质量门 | Medium | 默认 60s/scenario 超时；支持 `OPENFLOW_INTEGRATION_TEST_TIMEOUT` 环境变量覆盖 |
| 多语言策略维护成本高 | Medium | 先实现 TypeScript/Bun（当前项目自用），其他语言策略标记为 `contrib-welcome` |
| 破坏现有 verify 输出格式 | High | 适配器结果作为独立字段加入 `VerifyEvidencePacket`，不修改现有 checkResults 格式 |

---

## Testing Strategy

- **单元测试**：每种策略（TS、Go、Python）的 `generate()` 和 `execute()` 独立测试
- **集成测试**：mock `behavior.md` + mock 项目结构 → 运行适配器 → 验证生成的测试文件存在且可执行
- **回归测试**：无 `behavior.md` 的 fixture → 运行完整质量门 → 验证输出与之前一致
- **E2E 测试**：完整流程：brainstorm 生成 behavior.md → 实现代码 → 质量门 → 验证集成测试被生成并执行
