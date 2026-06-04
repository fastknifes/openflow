# Plan: openflow-archive-design

## Overview

将 `src/commands/archive.ts` 的 1284 行单一 `handleArchive` 函数重构为 6 个独立阶段模块（resolve → validate → collect → finalize → report），支持两种归档模式（planned / ad-hoc），保持向后兼容。

## Design Context

- 设计文档：`docs/changes/2026-06-01-openflow-archive-design/design.md`
- 行为规格：`docs/changes/2026-06-01-openflow-archive-design/behavior.md`
- 当前实现：`src/commands/archive.ts`（1284 行，handleArchive 为单一入口）
- 已有阶段模块：`src/phases/archive/`（current-promotion、implementation-mapper、code-mapper、traceability — 不修改）
- 测试框架：`bun test`（通过 `npm test` 运行）

## Mixed Strategy

### Phase 1 — Classification

| 维度 | 评估 | 理由 |
|------|------|------|
| 过程复杂度 | 高 | 6 阶段管道，resolve→validate→collect→promote→finalize→report 严格排序 |
| 架构复杂度 | 高 | 新类型契约（ArchiveContext、ValidationResult），Strategy 模式区分 planned/ad-hoc |
| 结构复用 | 有 | `src/phases/archive/` 下 4 个模块原样复用，不修改 |
| 数据流复杂度 | 中 | 类型化对象在管道中单向流动 |

**结论：Pyramid + Pattern 双适用。**

### Phase 2 — Pyramid

#### Highest-Level Goal

将 `handleArchive` 从单一 1284 行函数重构为阶段化管道，同时新增 ad-hoc 归档模式，使归档命令同时服务于计划驱动开发工作流和用户自发问题记录。

#### Task Pyramid

```
1. 基础层：管道类型与模式检测
   1.1 定义 ArchiveContext / ValidationResult / ArchiveBlocker 类型契约
   1.2 实现 resolve 阶段（feature 解析 + 模式检测 + 源路径定位）
2. 核心层：验证与产物生成
   2.1 实现 validate 阶段（Strategy: planned 完整检查 / ad-hoc 最小检查）
   2.2 提取 issue 产物生成 + 实现 collect 阶段（文档收集到 staging）
3. 收尾层：归档完成与报告
   3.1 实现 finalize 阶段（staging→final + promotion + worktree + 状态更新）
   3.2 实现 report 阶段（输出格式化）
4. 集成层：编排与验证
   4.1 重写 handleArchive 为薄编排器
   4.2 单元测试 + 集成测试 + 工作流文档更新
```

#### Core Abstractions and Boundaries

| 抽象 | 职责 | 边界（不做什么） |
|------|------|-----------------|
| **ArchiveContext** | 管道共享数据：feature、模式、acceptance state、源路径 | 不持有 mutable 状态，不执行 IO |
| **ValidationResult** | 验证输出：是否允许、阻断原因列表 | 不执行修复，不修改 acceptance state |
| **resolve** | 解析 feature + 检测模式 + 构建 ArchiveContext | 不做任何验证判断 |
| **validate** | 按模式验证前置条件，返回 ValidationResult | 不写文件，不修改状态 |
| **collect** | 将源文档复制到 staging 目录 | 不做 promotion，不修改最终目录 |
| **finalize** | staging→最终目录 + promotion + worktree + 状态更新 | 不生成产物内容，不格式化报告 |
| **report** | 格式化归档报告字符串 | 不执行任何 IO |
| **issue** | 生成 issue-clarification / issue-resolution 文档 | 只负责 issue 模式产物，不处理 feature 产物 |

### Phase 3 — Pattern

#### 识别的模式

**Pipeline Pattern（管道模式）：**
- 问题：归档是一个多步骤过程，每步有明确输入/输出
- 模式：6 个阶段顺序执行，每阶段接收上一阶段输出
- 优于替代方案的原因：比单一函数更易测试和扩展；比事件驱动更简单（归档是同步过程）

**Strategy Pattern（策略模式）：**
- 问题：planned 和 ad-hoc 模式的验证逻辑完全不同
- 模式：`validate` 阶段根据 `ArchiveContext.mode` 选择验证策略
- 优于替代方案的原因：避免在单一函数中用 if/else 区分两种模式的所有检查点

#### 组件契约

```typescript
// src/phases/archive/types.ts

interface ArchiveContext {
  feature: string
  mode: 'planned' | 'ad-hoc'
  acceptanceState: AcceptanceState | null
  implementationRun: ImplementationRun | null
  issueMode: IssueMode
  sourcePaths: ArchiveSourcePaths
}

interface ValidationResult {
  allowed: boolean
  blocked: boolean
  blockers: ArchiveBlocker[]
  warnings: string[]
  skipQualityGateChecks: boolean
  postHocIssueReady: boolean
}

interface ArchiveBlocker {
  type: ArchiveBlockerType
  message: string
  feature: string
}

type ArchiveBlockerType = 'readiness' | 'harden' | 'doc_update' | 'implementation_state'
  | 'drift' | 'root_mismatch' | 'run_status' | 'applicability' | 'security'

interface ArchiveSourcePaths {
  design: string | null
  plan: string | null
  prd: string | null
  behavior: string | null
  changeWorkspace: string
  implementationMapper: string | null
  issueClarification: string | null
  promotionCandidate: string | null
  issueResolution: string | null
}
```

### Phase 4 — Cross-Consistency

- Pyramid 的 Wave 分隔尊重 Pattern 边界：validate 阶段独立于 collect/issue
- Strategy 模式仅在 validate 阶段内使用，不泄漏到其他阶段
- 管道数据流单向：resolve → validate → collect → finalize → report，无循环依赖
- 共享抽象（ArchiveContext）在 Wave 1 定义，所有后续 Wave 消费

## Execution Strategy

### Parallel Execution Waves

**Wave 1 — 基础（无依赖）**
- Task 1: 管道类型 + resolve 阶段

**Wave 2 — 验证与产物（依赖 Wave 1 类型，可并行）**
- Task 2: validate 阶段（Strategy 模式）
- Task 3: issue 模块 + collect 阶段

**Wave 3 — 收尾（依赖 Wave 2）**
- Task 4: finalize + report 阶段

**Wave 4 — 集成（依赖 Wave 3）**
- Task 5: 重写 handleArchive 编排器 + 更新 exports

**Wave 5 — 验证（依赖 Wave 4）**
- Task 6: 纯阶段单元测试
- Task 7: IO 阶段单元测试 + 集成测试 + 文档更新 + 质量门禁

### Dependency Matrix

| Task | Blocked By | Blocks |
|------|-----------|--------|
| 1. Types + resolve | — | 2, 3, 4, 5, 6, 7 |
| 2. validate | 1 | 4, 5, 6, 7 |
| 3. issue + collect | 1 | 4, 5, 7 |
| 4. finalize + report | 1, 2, 3 | 5, 7 |
| 5. Orchestrator rewrite | 1, 2, 3, 4 | 6, 7 |
| 6. Pure stage tests | 5 | 7 |
| 7. Integration + doc + QG | 5, 6 | — |

## Tasks

- [ ] 1. **Types + resolve 阶段** (Agent: fixer | Blocks: 2,3,4,5,6,7 | Blocked By: —)
  - 创建 `src/phases/archive/types.ts`：定义 `ArchiveContext`、`ValidationResult`、`ArchiveBlocker`、`ArchiveBlockerType`、`ArchiveSourcePaths`、`ArchiveMode` 类型。从 design.md 数据契约部分获取完整字段定义。
  - 创建 `src/phases/archive/resolve.ts`：导出 `resolveArchiveContext(ctx: OpenFlowContext, feature?: string): Promise<ArchiveContext>`。从 `archive.ts` 提取逻辑：
    - Feature 参数清洗（`stripOpenFlowCommandTokens`）
    - Active feature 回退（`findActiveFeature`）
    - Acceptance state 加载与匹配
    - Implementation run 解析（`resolveArchiveImplementationRun`）
    - Archive mode 检测：有匹配 acceptance state 且有 readiness → `planned`；否则 → `ad-hoc`
    - 源路径定位（design、plan、prd、behavior、implementationMapper、issueClarification、promotionCandidate、issueResolution）
  - 约束：C-004（AcceptanceState 类型只增不删）、C-007（模块 ≤ 300 行）
  - 验证：`npx tsc --noEmit`
  - Acceptance：`ArchiveContext` 类型可被后续阶段导入；`resolveArchiveContext` 在有 acceptance state 时返回 `planned`，无时返回 `ad-hoc`

- [ ] 2. **validate 阶段** (Agent: fixer | Blocks: 4,5,6 | Blocked By: 1)
  - 创建 `src/phases/archive/validate.ts`：导出 `validateArchive(ctx: OpenFlowContext, archiveContext: ArchiveContext): Promise<ValidationResult>`。
  - **Strategy 模式**：根据 `archiveContext.mode` 选择验证路径：
    - `planned`：提取 `archive.ts` 中所有阻断检查（readiness NotReady/NeedsDecision、harden unresolved、doc update 未确认、implementation state、drift、root mismatch、run status、applicability、security）。每个检查产生 `ArchiveBlocker`。
    - `ad-hoc`：最小验证 — 仅检查 feature 名有效、无其他 feature 的阻断状态。跳过 readiness/harden/drift/doc update 检查。
  - 提取辅助函数：`getArchiveDocUpdateConfirmationState`、`formatReadinessBlock`、`formatHardenSummaryBlock` 等阻断消息生成逻辑移到 report 阶段（Task 4），此处只返回 blocker 结构。
  - 约束：C-002（planned 模式所有阻断条件不变）、C-005（ad-hoc 不修改 readiness）、C-007
  - 验证：`npx tsc --noEmit`
  - Acceptance：planned 模式覆盖所有现有阻断条件；ad-hoc 模式不检查 readiness/harden

- [ ] 3. **issue 模块 + collect 阶段** (Agent: fixer | Blocks: 4,5,7 | Blocked By: 1)
  - 创建 `src/phases/archive/issue.ts`：从 `archive.ts` 提取：
    - `writeIssueResolution()` 函数（~110 行，当前 977-1111 行）
    - `writePostHocIssueArtifacts()` 函数（~45 行，当前 916-961 行）
    - 辅助函数：`parseMarkdownSections`、`findSectionContent`、`buildPostHocVerificationEvidence`、`shouldGeneratePostHocPromotionCandidate`
    - 新增：`generateAdHocIssueArtifacts()` — 为 ad-hoc 模式生成简化的 issue-clarification 和 issue-resolution，内容从会话/构建数据推断
  - 创建 `src/phases/archive/collect.ts`：导出 `collectArchiveArtifacts(ctx: OpenFlowContext, archiveContext: ArchiveContext, validationResult: ValidationResult, stagingDir: string): Promise<Set<string>>`（返回已归档的源路径集合）。从 `archive.ts` 提取：
    - 创建 staging 目录
    - 复制 design.md / plan.md / prd.md / behavior.md / proposal.md / decisions.md
    - 复制 implementation-mapper.md
    - 调用 issue 模块生成 issue 产物（按 archiveMode 和 postHocIssueReady）
    - 跟踪已归档的源路径（`trackArchivedChangeWorkspaceSource`）
  - 约束：C-003（staging 原子化，此处创建 staging，finalize 负责 rename）、C-006（ad-hoc 必须生成 issue-resolution.md）、C-007
  - 验证：`npx tsc --noEmit`
  - Acceptance：collect 将所有源文档复制到 staging 目录；ad-hoc 模式下调用 `generateAdHocIssueArtifacts` 生成 issue 产物

- [ ] 4. **finalize + report 阶段** (Agent: fixer | Blocks: 5,7 | Blocked By: 1,2,3)
  - 创建 `src/phases/archive/finalize.ts`：导出 `finalizeArchive(ctx, archiveContext, validationResult, stagingDir, promotionResult): Promise<{archiveDir: string, archiveCommitHash?: string, worktreeCleanedUp: boolean}>`。从 `archive.ts` 提取：
    - Current promotion 构建（`buildPromotionSuggestions`）和应用（`applyPromotionSuggestions`）— 调用已有 `src/phases/archive/current-promotion.ts`
    - staging → 最终目录 rename（原子操作）
    - Derived worktree commit / merge / cleanup
    - Acceptance state 更新（`markArchivedIfNeeded`）
    - Implementation run 状态更新（`recordArchiveRunEvent`）
    - Build data 清理（`cleanupBuildData`）
    - Change workspace source 清理（`cleanupArchivedChangeWorkspaceSources`）
    - 错误时清理 staging 目录
  - 创建 `src/phases/archive/report.ts`：导出 `formatArchiveReport(options): string`。从 `archive.ts` 提取：
    - `formatArchiveResult()`（~75 行，当前 1146-1240 行）
    - `formatPromotionSuggestions()`
    - 所有阻断消息格式化函数（`formatReadinessBlock`、`formatHardenSummaryBlock`、`formatDocUpdateConfirmationRequired` 等 13 个 `format*` 函数）
  - 约束：C-003（staging 原子化，finalize 负责 rename）、C-004（AcceptanceState 只增字段）、C-007
  - 验证：`npx tsc --noEmit`
  - Acceptance：finalize 在 staging 成功后 rename 到最终目录，失败时删除 staging；report 生成与现有格式一致的报告

- [ ] 5. **重写 handleArchive 编排器 + 更新 exports** (Agent: fixer | Blocks: 6,7 | Blocked By: 1,2,3,4)
  - 重写 `src/commands/archive.ts`：将 `handleArchive` 简化为薄编排器（≤ 60 行），按顺序调用 6 个阶段：
    ```
    resolveArchiveContext → validateArchive → [如果阻断: 返回 blocker 报告]
    → collectArchiveArtifacts → finalizeArchive → formatArchiveReport
    ```
  - 删除所有已提取到阶段模块中的代码（resolve、validate、collect、finalize、report、issue 生成、所有 format* 函数、所有辅助函数）
  - 保留必要的顶层 import（`fs`、`path` 等如果仍有使用）
  - 更新 `src/phases/archive/index.ts`：增加新模块的导出（resolve、validate、collect、finalize、report、issue、types）
  - 约束：C-001（`handleArchive(ctx, feature?)` 签名不变）、C-007（handleArchive ≤ 60 行）
  - 验证：`npx tsc --noEmit && npm test`
  - Acceptance：`handleArchive` 函数体 ≤ 60 行；所有现有测试通过（向后兼容）；planned 和 ad-hoc 模式均可执行

- [ ] 6. **纯阶段单元测试** (Agent: fixer | Blocks: 7 | Blocked By: 5)
  - 创建 `tests/phases/archive/resolve.test.ts`：
    - 有显式 feature + matching acceptance state → mode=planned
    - 有显式 feature + 无 matching acceptance state → mode=ad-hoc
    - 无 feature + active feature 回退
    - 无 feature + 无 active feature + 有代码变更 → 回退到 quality-gate-first 提示
    - Feature slug 清洗
  - 创建 `tests/phases/archive/validate.test.ts`：
    - Planned 模式：readiness=NotReady → blocked
    - Planned 模式：harden unresolved must-fix → blocked
    - Planned 模式：readiness=Ready + 无其他问题 → allowed
    - Planned 模式：doc update 未确认 → blocked
    - Ad-hoc 模式：无 readiness → allowed
    - Ad-hoc 模式：不检查 harden/drift
  - 创建 `tests/phases/archive/report.test.ts`：
    - Planned 成功报告包含所有产物字段
    - Ad-hoc 成功报告包含 issue 产物且模式标记为 ad-hoc
    - 阻断报告包含 feature 名和原因
  - 验证：`npm test -- tests/phases/archive/resolve.test.ts tests/phases/archive/validate.test.ts tests/phases/archive/report.test.ts`
  - Acceptance：3 个测试文件全部通过

- [ ] 7. **IO 阶段测试 + 集成测试 + 文档更新 + 质量门禁** (Agent: fixer | Blocks: — | Blocked By: 5,6)
  - 创建 `tests/phases/archive/collect.test.ts`：
    - 有 design + plan → 复制到 staging
    - 无 design → staging 中无 design.md
    - Issue mode → 生成 issue 产物
    - Ad-hoc mode → 调用 generateAdHocIssueArtifacts
  - 创建 `tests/phases/archive/finalize.test.ts`：
    - Staging → final rename 成功
    - Staging 操作失败 → staging 被清理，final 不存在
    - auto_promote_current=true → promotion applied
    - auto_promote_current=false → promotion skipped
  - 创建 `tests/commands/archive.test.ts`（集成测试）：
    - 端到端 planned 归档（有 acceptance state + readiness=Ready）
    - 端到端 ad-hoc 归档（无 acceptance state + 有代码变更）
    - Planned 阻断场景（NotReady、harden must-fix）
    - 验证归档目录结构与现有一致
  - 更新 `docs/current/workflow/archive-workflow.md`：
    - 在 §3 流程说明中增加 ad-hoc 模式分支
    - 更新 §9 代码对照清单（新增模块路径）
    - 更新 §10 漂移风险提示（新增模块列表）
  - After formal implementation is complete and Full Quality Gate admission criteria are met, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness. For casual coding or low-risk edits, use lightweight verification instead.
  - 验证：`npm test`
  - Acceptance：所有测试通过；集成测试覆盖 planned 和 ad-hoc 两条主路径；archive-workflow.md 反映新的模块结构


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

- **Same-wave tasks**: 7 (recommended max: 4)
- **Estimated execution units**: 7 (recommended max: 20)

**Suggestion**: Split large waves across multiple `/openflow-implement` invocations
or reduce per-wave task count to keep execution feedback loops short.
