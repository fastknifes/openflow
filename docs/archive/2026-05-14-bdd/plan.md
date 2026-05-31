# BDD: Behavior-first SDD for OpenFlow

---
## Design Context

> Auto-injected from the active OpenFlow design workspace for `bdd`.
> Refer to the original design documents for full details.

#### Design
### design.md

### 1. 问题陈述
OpenFlow 当前采用 markdown 文档约束 AI 开发，核心流程是：

```text
brainstorm → implement → harden → verify → archive
```

该模式已经能通过 `design.md`、`requirements.md`、`docs/current/*`、`docs/decisions/*` 建立 SDD 风格的文档治理。但当前仍存在一个关键问题：

> 文档主要是写给 AI 和工程治理看的，用户很难只通过阅读一份文档确认“系统最终应该表现成什么样”。

现有 SDD 文档常见问题包括：

1. **用户阅读负担高**：设计、需求、决策、验证、归档文档各自有价值，但用户不应被要求阅读全部文档才能确认行为。
2. **行为契约不集中**：用户真正关心的是可感知行为、边界行为和禁止行为，但这些内容分散在不同文档中。
3. **设计文档偏 AI 内部语境**：`design.md` 适合描述实现方案、模块边界和工程约束，不适合作为唯一的人类确认入口。
4. **verify 缺少行为逐条对齐目标**：当前 verify 可以生成 evidence/readiness，但缺少一份用户确认过的行为场景清单作为逐条验收对象。
5. **archive 追溯链仍偏工程实现**：归档可以映射 requirements/design 到代码，但还不能稳定表达“用户确认的行为 → 验证证据 → 实现”的链路。

本功能的目标不是引入完整 BDD 框架，而是将 BDD 的“行为先行、场景可验证”思想落入 OpenFlow 的 markdown 文档治理体系，并成为 **Contract Runtime** 的主要契约来源之一。

从全局架构看，BDD 不只是新增一个文件，而是回答 OpenFlow 治理链路里的第一性问题：**什么是正确的用户可感知行为？** 这个答案必须被统一解析为 `OpenFlowContract`，再被 Drift Guardian、verify adapters 和 archive mapper 复用。

---

### 2. 设计目标


### 2.1 核心目标
1. **引入 behavior-first 主契约**
   - 在 feature/change 工作区中生成 `behavior.md`。
   - `behavior.md` 是用户主要阅读和确认的行为契约。
   - 其他 AI 面向文档必须与 `behavior.md` 对齐。

2. **保持 OpenFlow 轻量**
   - 不强制引入 Cucumber、Gherkin、step definitions 或其他 BDD 测试框架。
   - 采用 BDD-style markdown 行为场景表达。
   - 未来允许项目自行接入标准 BDD 框架，但 OpenFlow 本体不依赖它。

3. **明确文档分层**
   - `behavior.md`：人类可读行为契约，描述系统外显行为。
   - `design.md`：AI/工程面向设计，解释如何实现行为契约。
   - `requirements.md` / `prd.md`：需求来源与需求整理。
   - `verify evidence`：逐条证明行为是否被验证。
   - `implementation-mapper.md`：归档时建立 behavior → evidence → code 的追溯链。

4. **verify 逐条对齐 behavior**
   - `/openflow-verify` 需要识别 `behavior.md`。
   - 对每个行为场景输出证据状态：verified / missing_evidence / failed / not_applicable。
   - readiness 需要考虑行为场景是否有足够证据。

5. **archive 归档并提升稳定行为**
   - `behavior.md` 必须复制到 archive 快照。
   - 已验证且稳定的行为应 promotion 到 `docs/current/spec/*` 或 `docs/current/requirements/*`。
   - promotion 不能自动覆盖冲突的 current/decisions，冲突时进入 `needs_decision`。

6. **建立 Contract Runtime 契约层**
   - BDD 负责定义用户行为契约和 Behavior Alignment 表。
   - `OpenFlowContract` 负责把 `behavior.md`、`design.md`、`docs/current/*`、`docs/decisions/*` 解析为统一中间格式。
   - Contract Runtime 负责缓存、失效、变更命中、evidence 引用和消费方传递。
   - Drift Guardian、verify evidence adapters、archive mapper 都消费 Contract Runtime，而不是各自重复解释文档。

### 2.2 非目标
1. 不引入强制 BDD 测试框架。
2. 不要求用户阅读 `design.md`、`requirements.md`、`implementation-mapper.md` 才能确认行为。
3. 不把所有内部设计细节写入 `behavior.md`。
4. 不让 `behavior.md` 替代 ADR、架构设计或实现计划。
5. 不把每个低价值分支都写成行为场景。
6. 不在未经用户确认时自动改变已生效的 `docs/current/*` 或 `docs/decisions/*`。

---



## TL;DR
> **Summary**: 在 OpenFlow 中引入 `behavior.md` 作为用户可读的行为主契约，集成到 brainstorm/verify/archive 三个阶段，并新增行为追溯链到 implementation-mapper。
> **Deliverables**: behavior artifact 类型、behavior renderer、brainstorm 双文档生成、verify 行为证据检查、archive 行为归档/promotion、implementation-mapper 行为追溯
> **Effort**: Large
> **Parallel**: YES - 4 waves
> **Critical Path**: Task 1 (Types) → Task 2 (Renderer) → Task 3 (Brainstorm) → Task 8 (E2E Tests)

## Context
### Original Request
`docs/changes/2026-05-11-bdd/design.md` 和 `behavior.md` 定义了 Behavior-first SDD 的完整设计。用户要求基于这些设计文档生成开发计划。

### Interview Summary
- 核心目标：`behavior.md` 作为用户主契约，其他 AI 面向文档必须与之对齐
- 集成点：brainstorm（生成）→ verify（证据检查）→ archive（归档/promotion/追溯）
- 不强制引入 Cucumber/Gherkin，保持 markdown 轻量表达
- 渐进迁移：旧 workspace 无 behavior.md 时 fallback，新 feature 有 behavior.md 时强制行为证据

### Metis Review (gaps addressed)
1. **ChangeArtifactKind 影响面极小** — 仅 `src/config.ts` 内部使用，添加 `behavior` 安全
2. **generatedDocs[0] 硬编码假设** — brainstorm 命令多处只取 `[0]`，需审计所有访问点并更新
3. **archive 显式文件复制** — 硬编码复制 design/prd/plan/proposal/decisions，必须新增 behavior.md
4. **CurrentPromotionSuggestion.targetArea** — 当前仅 `'design' | 'requirements'`，需扩展
5. **TraceabilityItem.sourceType** — 需新增 `'behavior'`
6. **implementation-mapper 中文 section 编号** — 使用动态 `sectionNum()`，需验证编号正确
7. **渐进迁移** — 所有行为检查必须以 `behavior.md` 存在性为前提
8. **原子生成风险** — brainstorm 需同时生成 behavior.md + design.md，部分失败需清理

### Design Decisions (auto-resolved)
- **Config flag**: 不新增配置项。`behavior.md` 存在性决定 verify/archive 行为。brainstorm 默认生成。
- **Session version bump**: 不升级。`generatedDocs: string[]` 已支持多文档。
- **Critical vs non-critical**: Behavior Scenarios + Must Not Behaviors = critical；Boundary Scenarios = should-pass。
- **Contract Runtime**: 本次不实现。verify/archive 直接解析 `behavior.md`。
- **Promotion target**: `docs/current/spec/{feature}/behavior.md`，与现有模式一致。

## Work Objectives
### Core Objective
实现 `behavior.md` 在 brainstorm → verify → archive 全链路的集成，使其成为 OpenFlow 文档治理体系中的用户主行为契约。

### Deliverables
1. `behavior` artifact 类型和 path helper
2. `behavior-renderer.ts` — 从 RequirementModel 渲染 `behavior.md`
3. `design-renderer.ts` 新增 Behavior Alignment 章节
4. brainstorm 命令同时生成 `behavior.md` + `design.md`
5. verify 命令读取 `behavior.md` 并输出逐条行为证据状态
6. archive 命令归档 `behavior.md` 并 promotion 到 `docs/current/spec/`
7. implementation-mapper 新增行为追溯链 section
8. 全量测试覆盖 + 渐进迁移验证

### Definition of Done (verifiable conditions with commands)
```bash
bun run typecheck          # 类型编译通过
bun test                   # 全量测试通过
# brainstorm 生成双文档：docs/changes/{feature}/behavior.md + design.md
# verify 识别 behavior：evidence 包含 behavior_exists 检查项
# archive 归档 behavior：archive 目录包含 behavior.md
# 旧 workspace 不受影响：无 behavior.md 的 feature 正常 verify/archive
```

### Must Have
- `behavior.md` 固定结构（Scope, Behavior Scenarios, Must Not Behaviors, Boundary Scenarios, Verification Mapping）
- `design.md` 包含 Behavior Alignment 表
- verify 逐条行为证据状态（verified/missing_evidence/failed/not_applicable）
- readiness 规则：关键行为 failed/missing → not_ready；冲突 → needs_decision
- archive 归档 behavior.md + promotion 到 docs/current/spec/
- implementation-mapper 行为追溯链

### Must NOT Have (guardrails)
- 不引入 Cucumber/Gherkin/step definitions
- 不实现完整 Contract Runtime
- 不在 behavior.md 缺失时阻塞旧 feature 的 verify/archive
- 不自动覆盖 docs/current/* 或 docs/decisions/*（冲突时 needs_decision）
- 不让 behavior.md 承载内部实现细节
- AI slop patterns: 不添加 `// TODO: implement` 占位、不生成未使用的接口、不过度抽象

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: tests-after + regression guard
- Test framework: bun test (see `package.json` scripts.test)
- QA policy: Every task has agent-executed scenarios
- Evidence: .sisyphus/evidence/task-{N}-{slug}.{ext}

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.

**Wave 1 (Foundation)** — 1 task, 无依赖:
- Task 1: Type & Config Foundation `quick`

**Wave 2 (Rendering + Brainstorm)** — 2 tasks:
- Task 2: Behavior Renderer `deep` (depends 1)
- Task 3: Brainstorm Integration `deep` (depends 1, 2)

**Wave 3 (Consumers)** — 4 tasks, 全部可并行:
- Task 4: Verify Behavior Evidence `deep` (depends 1)
- Task 5: Archive Behavior Copy `quick` (depends 1)
- Task 6: Current Promotion for Behavior `deep` (depends 1)
- Task 7: Implementation-Mapper Traceability `deep` (depends 1)

**Wave 4 (Validation)** — 1 task:
- Task 8: E2E Tests & Regression `unspecified-high` (depends 3, 4, 5, 6, 7)

### Dependency Matrix
| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 2, 3, 4, 5, 6, 7 |
| 2 | 1 | 3 |
| 3 | 1, 2 | 8 |
| 4 | 1 | 8 |
| 5 | 1 | 8 |
| 6 | 1 | 8 |
| 7 | 1 | 8 |
| 8 | 3, 4, 5, 6, 7 | — |

### Agent Dispatch Summary
| Wave | Tasks | Categories |
|------|-------|-----------|
| 1 | 1 | quick × 1 |
| 2 | 2, 3 | deep × 2 |
| 3 | 4, 5, 6, 7 | deep × 3, quick × 1 |
| 4 | 8 | unspecified-high × 1 |

## TODOs

- [x] 1. Type & Config Foundation

  **What to do**:
  1. 在 `src/config.ts:18` 的 `ChangeArtifactKind` 联合类型中新增 `'behavior'`
  2. 在 `src/config.ts:20-26` 的 `CHANGE_ARTIFACT_FILENAMES` 中新增 `behavior: 'behavior.md'`
  3. 新增 `getChangeBehaviorPath()` 辅助函数（参照 `getChangeDesignPath` 模式）
  4. 新增 `getBehaviorCandidatePaths()` 函数（参照 `getDesignCandidatePaths` 模式）
  5. 在 `src/types.ts` 中新增：
     - `BehaviorEvidenceStatus` 类型：`'verified' | 'missing_evidence' | 'failed' | 'not_applicable'`
     - `BehaviorScenarioEvidence` 接口：`{ scenarioName, status, evidenceType, evidenceReference, reason }`
  6. 在 `VerifyEvidencePacket` 中新增可选字段 `behaviorEvidence?: BehaviorScenarioEvidence[]`
  7. 在 `CurrentPromotionSuggestion.targetArea` 类型中扩展为 `'design' | 'requirements' | 'behavior'`

  **Must NOT do**:
  - 不修改 `defaultConfig` 结构（不需要新增配置项）
  - 不修改 `BrainstormSession` 版本号
  - 不新增 `OpenFlowConfig.behavior` 配置段

  **Recommended Agent Profile**:
  - Category: `quick` - 单文件纯类型扩展，模式清晰
  - Skills: [`gitnexus-impact-analysis`] - 验证类型变更的影响面

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 2, 3, 4, 5, 6, 7 | Blocked By: —

  **References**:
  - Pattern: `src/config.ts:18` — `ChangeArtifactKind` 定义
  - Pattern: `src/config.ts:20-26` — `CHANGE_ARTIFACT_FILENAMES` 映射
  - Pattern: `src/config.ts:242-257` — `getChangeDesignPath` 和 `getChangeDocumentPath` 辅助函数
  - Pattern: `src/config.ts:268-277` — `getDesignCandidatePaths` 模式
  - Type: `src/types.ts:259-261` — `CurrentPromotionSuggestion.targetArea`
  - Type: `src/types.ts:296-304` — `VerifyEvidencePacket`
  - Test: `tests/utils/config.test.ts` — config 路径函数测试

  **Acceptance Criteria**:
  - [ ] `bun run typecheck` 通过（无类型错误）
  - [ ] `ChangeArtifactKind` 包含 `'behavior'`
  - [ ] `CHANGE_ARTIFACT_FILENAMES` 包含 `behavior: 'behavior.md'`
  - [ ] `getChangeBehaviorPath()` 和 `getBehaviorCandidatePaths()` 可被导入

  **QA Scenarios**:
  ```
  Scenario: Type compilation
    Tool: Bash
    Steps: cd project root && bun run typecheck
    Expected: exit code 0, no type errors
    Evidence: .sisyphus/evidence/task-1-typecheck.txt

  Scenario: New types are importable
    Tool: Bash
    Steps: bun -e "import { BehaviorEvidenceStatus } from './src/types.js'"
    Expected: import succeeds (or type-level check via typecheck)
    Evidence: .sisyphus/evidence/task-1-import-check.txt
  ```

  **Commit**: YES | Message: `feat(bdd): add behavior artifact types and config` | Files: `src/types.ts, src/config.ts`

- [x] 2. Behavior Renderer

  **What to do**:
  1. 创建 `src/phases/brainstorm/behavior-renderer.ts`
  2. 导出 `renderBehaviorDocument(model: RequirementModel): string`
  3. 输出固定结构：
     ```
     # Behavior Contract: {feature}
     ## 1. Scope (In Scope / Out of Scope from model.scopeBoundary)
     ## 2. Behavior Scenarios (从 model.acceptanceCriteria 和 model.constraints 生成 Given/When/Then)
     ## 3. Must Not Behaviors (从 model.nonGoals 推导)
     ## 4. Boundary Scenarios (从 model.constraints severity='must' 推导)
     ## 5. Verification Mapping (表格：Behavior | Evidence Type | Expected Evidence | Status=pending)
     ```
  4. 遵循 `design-renderer.ts` 的渲染模式：使用 `escapeInline`, `escapeParagraph`, `NOT_SPECIFIED` 常量
  5. 空/可选字段使用 `Not specified.` fallback

  **Must NOT do**:
  - 不引入新的模板引擎
  - 不在 renderer 中做文件 I/O（纯函数，输入 model 输出 string）
  - 不在 behavior.md 中写入实现细节

  **Recommended Agent Profile**:
  - Category: `deep` - 需要理解 BDD-style markdown 场景生成逻辑
  - Skills: [`gitnexus-exploring`] - 确保与 design-renderer 模式一致

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 3 | Blocked By: 1

  **References**:
  - Pattern: `src/phases/brainstorm/design-renderer.ts` — 完整的 renderer 实现模式
  - Type: `src/phases/brainstorm/requirement-model.ts` — RequirementModel schema 和类型
  - Pattern: `src/phases/brainstorm/requirement-model.ts:28-36` — ConstraintSchema 结构
  - Pattern: `src/phases/brainstorm/requirement-model.ts:44-49` — AcceptanceCriterionSchema 结构
  - Design: `docs/changes/2026-05-11-bdd/design.md:212-256` — behavior.md 固定结构定义
  - Design: `docs/changes/2026-05-11-bdd/behavior.md` — 已有的 behavior.md 示例
  - Test: `tests/brainstorm/design-renderer.test.ts` — renderer 测试模式

  **Acceptance Criteria**:
  - [ ] `bun run typecheck` 通过
  - [ ] `renderBehaviorDocument()` 返回包含 5 个 `##` 级别章节的 markdown
  - [ ] 空 model 输入生成完整骨架（所有章节标题存在）
  - [ ] Verification Mapping 表每行 status 列默认为 `pending`

  **QA Scenarios**:
  ```
  Scenario: Full structure with mock model
    Tool: Bash
    Steps: bun test tests/brainstorm/behavior-renderer.test.ts (需要先创建)
    Expected: 输出包含 Scope, Behavior Scenarios, Must Not, Boundary, Verification Mapping 五个章节
    Evidence: .sisyphus/evidence/task-2-renderer-output.txt

  Scenario: Empty model fallback
    Tool: Bash
    Steps: 使用 createMinimalRequirementModel 调用 renderBehaviorDocument
    Expected: 输出包含完整骨架，空字段显示 "Not specified."
    Evidence: .sisyphus/evidence/task-2-empty-model.txt
  ```

  **Commit**: YES | Message: `feat(bdd): add behavior.md renderer` | Files: `src/phases/brainstorm/behavior-renderer.ts`

- [x] 3. Brainstorm Integration

  **What to do**:
  1. 修改 `src/commands/brainstorm.ts` 的 `generateDesignDocument` 函数：
     - 在写入 `design.md` 后，调用 `renderBehaviorDocument(validatedModel)` 写入 `behavior.md`
     - 写入 `behavior.meta.json`（可选，记录 model 快照）
     - 将 `behavior.md` 路径追加到 `session.generatedDocs`
  2. 修改 `src/commands/brainstorm.ts` 的 `formatGenerationResult`：
     - 列出所有 `generatedDocs`（不仅仅是 `[0]`），包括 `behavior.md`
  3. 修改 `src/phases/brainstorm/design-renderer.ts`：
     - 在 `renderDesignDocument` 的 sections 数组中新增 `renderBehaviorAlignment(model)` 函数
     - Behavior Alignment 表格式：`| Behavior Scenario | Design Response | Files / Modules | Risk |`
     - 数据来源：从 `model.acceptanceCriteria` + `model.expectedModules` + `model.expectedSymbols` 生成映射
  4. 原子性保障：包裹 behavior.md + design.md 写入在 try/catch 中，部分失败时清理已写入的文件
  5. 更新 `src/skills/brainstorm-skill.ts` 描述，提及 `behavior.md` 产物

  **Must NOT do**:
  - 不升级 `BrainstormSession.version`
  - 不在 behavior.md 生成失败时阻塞 design.md 生成
  - 不改变 brainstorm 的问题流程（state-machine.ts 的 QUESTIONS 不变）

  **Recommended Agent Profile**:
  - Category: `deep` - 涉及 session 状态、文件 I/O、渲染编排
  - Skills: [`gitnexus-impact-analysis`, `gitnexus-refactoring`] - 高影响面

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 8 | Blocked By: 1, 2

  **References**:
  - Core: `src/commands/brainstorm.ts:348-382` — `generateDesignDocument` 函数
  - Core: `src/commands/brainstorm.ts:408-415` — `formatGenerationResult` 函数（仅显示 `[0]`）
  - Core: `src/commands/brainstorm.ts:140-148` — `markCompleted` 和 `generatedDocs` 追踪
  - Pattern: `src/phases/brainstorm/design-renderer.ts:5-21` — sections 数组模式
  - Session: `src/phases/brainstorm/state-machine.ts:28` — `generatedDocs: string[]`
  - Session: `src/phases/brainstorm/state-machine.ts:210-225` — `markCompleted` 函数
  - Skill: `src/skills/brainstorm-skill.ts` — brainstorm skill 描述
  - Test: `tests/commands/brainstorm.test.ts` — brainstorm 命令测试
  - Test: `tests/brainstorm/design-renderer.test.ts` — design renderer 测试

  **Acceptance Criteria**:
  - [ ] `bun test tests/commands/brainstorm.test.ts` 通过
  - [ ] brainstorm 完成后 changes 工作区同时存在 `design.md` 和 `behavior.md`
  - [ ] `design.md` 包含 `## Behavior Alignment` 章节
  - [ ] `formatGenerationResult` 列出所有生成文件（不只是 `[0]`）
  - [ ] 旧 session（无 behavior.md）仍能正常加载

  **QA Scenarios**:
  ```
  Scenario: Dual document generation
    Tool: Bash
    Steps: 运行 brainstorm 命令完成全部问题 -> 检查 workspace 目录
    Expected: design.md 和 behavior.md 均存在
    Evidence: .sisyphus/evidence/task-3-dual-gen.txt

  Scenario: Design includes Behavior Alignment
    Tool: Bash
    Steps: 读取生成的 design.md，搜索 "Behavior Alignment" 标题
    Expected: 找到该章节且包含映射表
    Evidence: .sisyphus/evidence/task-3-alignment.txt

  Scenario: Backward compatibility
    Tool: Bash
    Steps: 加载旧版 brainstorm session (version 2, generatedDocs=['design.md']) -> normalizeBrainstormSession
    Expected: session 正常加载，不抛出异常
    Evidence: .sisyphus/evidence/task-3-backward.txt
  ```

  **Commit**: YES | Message: `feat(bdd): integrate behavior.md generation into brainstorm` | Files: `src/commands/brainstorm.ts, src/phases/brainstorm/design-renderer.ts, src/skills/brainstorm-skill.ts`

- [x] 4. Verify Behavior Evidence

  **What to do**:
  1. 在 `src/commands/verify.ts` 的 `collectEvidence` 中：
     - 新增 `behavior.md` 存在性检查：`behavior_exists`
     - 当 `behavior.md` 存在时解析场景列表
     - 对每个场景检查是否有对应证据（test/command/inspection）
  2. 新增 `parseBehaviorScenarios(content: string): string[]` 工具函数（解析 `### Scenario:` 标题）
  3. 新增 `checkBehaviorEvidence()` 函数：
     - 读取 behavior.md → 解析场景 → 检查每场景证据
     - 返回 `BehaviorScenarioEvidence[]`
     - 证据来源：verify checkResults 中对应的测试结果、design.md 中的 Behavior Alignment 表
  4. 修改 `classifyReadiness` 函数：
     - 当 `behavior.md` 存在且任一关键行为 `failed` 或 `missing_evidence` → `not_ready`
     - 当 `behavior.md` 存在且行为与 current/decisions 冲突 → `needs_decision`
     - 当 `behavior.md` 不存在 → 保持现有逻辑不变
  5. 在 `formatVerifyResult` 中新增 Behavior Alignment Evidence 表格输出

  **Must NOT do**:
  - 不在 behavior.md 不存在时阻塞 verify
  - 不改变现有的 quality/security/consistency 检查流程
  - 不引入 Cucumber 或其他 BDD 测试框架

  **Recommended Agent Profile**:
  - Category: `deep` - 复杂逻辑集成，readiness 分类有大量分支
  - Skills: [`gitnexus-debugging`] - 追踪 readiness 分类边界情况

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 8 | Blocked By: 1

  **References**:
  - Core: `src/commands/verify.ts:133-229` — `collectEvidence` 函数
  - Core: `src/commands/verify.ts:396-512` — `classifyReadiness` 函数
  - Core: `src/commands/verify.ts:514-544` — `formatVerifyResult` 函数
  - Type: `src/types.ts:274-279` — `VerifyReadinessStatus` 枚举
  - Type: `src/types.ts:296-304` — `VerifyEvidencePacket` 接口
  - Config: `src/config.ts` — `getBehaviorCandidatePaths` (Task 1 新增)
  - Test: `tests/commands/verify.test.ts` — verify 命令测试

  **Acceptance Criteria**:
  - [ ] `bun test tests/commands/verify.test.ts` 通过
  - [ ] behavior.md 存在时 evidence 包含 `behavior_exists ✅`
  - [ ] 关键行为 missing_evidence → readiness `not_ready`
  - [ ] 行为与 current/decisions 冲突 → readiness `needs_decision`
  - [ ] behavior.md 不存在 → verify 行为与之前完全一致（回归测试）

  **QA Scenarios**:
  ```
  Scenario: Behavior evidence all verified
    Tool: Bash
    Steps: 准备有 behavior.md 的 workspace + 通过的 tests -> 运行 verify
    Expected: readiness = ready, evidence 包含 behavior_exists ✅
    Evidence: .sisyphus/evidence/task-4-all-verified.txt

  Scenario: Missing behavior evidence
    Tool: Bash
    Steps: 准备有 behavior.md 的 workspace + 无测试 -> 运行 verify
    Expected: readiness = not_ready, reason 包含 missing_evidence
    Evidence: .sisyphus/evidence/task-4-missing.txt

  Scenario: No behavior.md fallback
    Tool: Bash
    Steps: 准备无 behavior.md 的 workspace -> 运行 verify
    Expected: verify 行为与之前完全一致，无 behavior 相关检查
    Evidence: .sisyphus/evidence/task-4-fallback.txt

  Scenario: Behavior conflicts with current
    Tool: Bash
    Steps: behavior.md 描述与 docs/current/spec/ 冲突 -> 运行 verify
    Expected: readiness = needs_decision
    Evidence: .sisyphus/evidence/task-4-conflict.txt
  ```

  **Commit**: YES | Message: `feat(bdd): add behavior evidence checks to verify` | Files: `src/commands/verify.ts`

- [x] 5. Archive Behavior Copy

  **What to do**:
  1. 在 `src/commands/archive.ts` 的 `handleArchive` 中新增 behavior.md 复制逻辑：
     - 解析 behavior.md 源路径（使用 `getBehaviorCandidatePaths` 或从 change workspace 中直接查找）
     - 复制到 `archiveDir/behavior.md`
     - 跟踪在 `archivedChangeWorkspaceSources` 中以确保清理
  2. 在 `ImplementationMapperOptions` 中新增可选 `behaviorPath?: string | null` 字段
  3. 更新 `formatArchiveResult` 新增 behavior 文档状态行
  4. 在 `cleanupArchivedChangeWorkspaceSources` 中确保 behavior.md 被清理
  5. archive 中已有的 `fs.rm(normalizedWorkspacePath, { recursive: true, force: true })` 会处理未显式跟踪的文件

  **Must NOT do**:
  - 不在 behavior.md 不存在时阻塞 archive
  - 不改变现有 design/prd/plan 复制逻辑

  **Recommended Agent Profile**:
  - Category: `quick` - 直观的文件复制扩展
  - Skills: []

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 8 | Blocked By: 1

  **References**:
  - Core: `src/commands/archive.ts:121-158` — 现有文件复制逻辑
  - Core: `src/commands/archive.ts:160-174` — `ImplementationMapperOptions` 构建
  - Core: `src/commands/archive.ts:240-298` — `cleanupArchivedChangeWorkspaceSources`
  - Core: `src/commands/archive.ts:733-804` — `formatArchiveResult` 函数
  - Config: `src/config.ts` — `getBehaviorCandidatePaths` (Task 1 新增)
  - Test: `tests/commands/archive.test.ts` — archive 命令测试

  **Acceptance Criteria**:
  - [ ] `bun test tests/commands/archive.test.ts` 通过
  - [ ] archive 目录包含 `behavior.md`（当源 workspace 有 behavior.md 时）
  - [ ] `formatArchiveResult` 显示 behavior 文档状态
  - [ ] behavior.md 不存在时 archive 正常完成

  **QA Scenarios**:
  ```
  Scenario: Behavior.md archived
    Tool: Bash
    Steps: 准备含 behavior.md 的 workspace -> 运行 archive -> 检查 archive 目录
    Expected: archive 目录包含 behavior.md
    Evidence: .sisyphus/evidence/task-5-archive-copy.txt

  Scenario: No behavior.md
    Tool: Bash
    Steps: 准备无 behavior.md 的 workspace -> 运行 archive
    Expected: archive 正常完成，不报错
    Evidence: .sisyphus/evidence/task-5-no-behavior.txt
  ```

  **Commit**: YES | Message: `feat(bdd): archive behavior.md and copy to snapshot` | Files: `src/commands/archive.ts`

- [x] 6. Current Promotion for Behavior

  **What to do**:
  1. 在 `src/phases/archive/current-promotion.ts` 中：
     - 扩展 `PromotionAreaConfig` 类型，新增 `archiveFile` 和 `currentFileName` 支持 `'behavior.md'`
     - 新增 `PROMOTION_AREAS` 条目：
       ```typescript
       {
         area: 'behavior',
         archiveFile: 'behavior.md',
         currentBaseDir: path.join('docs', 'current', 'spec'),
         currentFileName: 'behavior.md',
         currentFilePattern: /^(?:behavior|\d{8}-behavior)\.md$/i,
       }
       ```
  2. 验证 `buildPromotionSuggestions` 和 `applyPromotionSuggestions` 对新 area 正确工作
  3. 确保 `synthesizedRefresh` 对 behavior.md 正确执行（如果 current/spec 中有历史版本）
  4. 测试冲突场景：promotion 不得自动覆盖已有 current/spec 文件

  **Must NOT do**:
  - 不修改 `buildPromotionSuggestions` 的核心算法
  - 不自动覆盖冲突的 current/spec 文件

  **Recommended Agent Profile**:
  - Category: `deep` - current promotion 有复杂的匹配/synthesis 逻辑
  - Skills: [`gitnexus-impact-analysis`] - 检查 targetArea 类型变更的影响面

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 8 | Blocked By: 1

  **References**:
  - Core: `src/phases/archive/current-promotion.ts:33-48` — `PROMOTION_AREAS` 配置
  - Core: `src/phases/archive/current-promotion.ts:77-133` — `buildPromotionSuggestions` 函数
  - Core: `src/phases/archive/current-promotion.ts:135-177` — `applyPromotionSuggestions` 函数
  - Type: `src/types.ts:259-266` — `CurrentPromotionSuggestion` 接口
  - Test: `tests/phases/current-promotion.test.ts` — promotion 测试

  **Acceptance Criteria**:
  - [ ] `bun test tests/phases/current-promotion.test.ts` 通过
  - [ ] `PROMOTION_AREAS` 包含 `area: 'behavior'` 条目
  - [ ] `buildPromotionSuggestions` 对 behavior.md 生成正确的 ADD/UPDATE suggestion
  - [ ] behavior promotion 到 `docs/current/spec/{feature}/behavior.md` 路径

  **QA Scenarios**:
  ```
  Scenario: Behavior promotion ADD
    Tool: Bash
    Steps: archive 含 behavior.md + current/spec 无历史 -> buildPromotionSuggestions
    Expected: suggestion type = ADD, targetPath = docs/current/spec/{feature}/behavior.md
    Evidence: .sisyphus/evidence/task-6-promotion-add.txt

  Scenario: Behavior promotion UPDATE with synthesis
    Tool: Bash
    Steps: archive 含 behavior.md + current/spec 有历史版本 -> buildPromotionSuggestions -> apply
    Expected: synthesized_refresh 策略，section 合并正确
    Evidence: .sisyphus/evidence/task-6-promotion-update.txt
  ```

  **Commit**: YES | Message: `feat(bdd): promote behavior.md to docs/current/spec` | Files: `src/phases/archive/current-promotion.ts`

- [x] 7. Implementation-Mapper Traceability

  **What to do**:
  1. 在 `src/phases/archive/traceability.ts` 中：
     - 扩展 `TraceabilityItem.sourceType` 联合类型新增 `'behavior'`
     - 新增 `collectBehaviorTraceabilityItems()` 函数，解析 `behavior.md` 中的场景标题
  2. 在 `src/phases/archive/implementation-mapper.ts` 中：
     - `ImplementationMapperOptions` 新增 `behaviorPath?: string | null`
     - 新增 `generateBehaviorMappingSection()` 函数，输出行为追溯表：
       `| Behavior Scenario | Evidence | Code Files | Key Symbols | Notes |`
     - 在 `generateImplementationMapper` 中条件性插入 `行为到实现映射` section（使用 `sectionNum` 动态编号）
     - 当 `behavior.md` 不存在时不输出行为 section（渐进迁移）
  3. 在 `src/commands/archive.ts` 中传递 `behaviorPath` 到 mapper options

  **Must NOT do**:
  - 不修改现有 `需求到实现映射` section 的内容
  - 不改变 section 编号逻辑（使用现有 `sectionNum` 模式）

  **Recommended Agent Profile**:
  - Category: `deep` - section 编号和表格式敏感
  - Skills: [`gitnexus-exploring`] - 理解 traceability 流程

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 8 | Blocked By: 1

  **References**:
  - Core: `src/phases/archive/traceability.ts:6-17` — `TraceabilityItem` 和 `TraceabilityResult` 类型
  - Core: `src/phases/archive/traceability.ts:19-46` — `collectTraceabilityItems` 函数
  - Core: `src/phases/archive/implementation-mapper.ts:10-24` — `ImplementationMapperOptions` 接口
  - Core: `src/phases/archive/implementation-mapper.ts:57-87` — section 编号和结构
  - Core: `src/phases/archive/implementation-mapper.ts:194-231` — `generateImplementationMappingSection`
  - Test: `tests/phases/implementation-mapper.test.ts` — mapper 测试

  **Acceptance Criteria**:
  - [ ] `bun test tests/phases/implementation-mapper.test.ts` 通过
  - [ ] `TraceabilityItem.sourceType` 包含 `'behavior'`
  - [ ] behavior.md 存在时 mapper 输出包含 `行为到实现映射` section
  - [ ] behavior.md 不存在时 mapper 输出与之前一致

  **QA Scenarios**:
  ```
  Scenario: Behavior traceability section present
    Tool: Bash
    Steps: behavior.md 含 3 个场景 -> generateImplementationMapper
    Expected: 输出包含 "行为到实现映射" section，表有 3 行
    Evidence: .sisyphus/evidence/task-7-behavior-trace.txt

  Scenario: No behavior.md fallback
    Tool: Bash
    Steps: 无 behavior.md -> generateImplementationMapper
    Expected: 输出不包含 "行为到实现映射" section，现有 section 编号不变
    Evidence: .sisyphus/evidence/task-7-no-behavior.txt
  ```

  **Commit**: YES | Message: `feat(bdd): add behavior traceability to implementation-mapper` | Files: `src/phases/archive/traceability.ts, src/phases/archive/implementation-mapper.ts, src/commands/archive.ts`

- [x] 8. E2E Tests & Regression Suite

  **What to do**:
  1. 新建 `tests/brainstorm/behavior-e2e.test.ts` 端到端测试
  2. 测试用例覆盖：
     - **新 BDD feature 全链路**：brainstorm 生成 behavior.md + design.md → verify 检查行为证据 → archive 归档 + promotion
     - **旧 workspace 回归**：无 behavior.md 的 feature 正常 verify + archive
     - **behavior evidence 链路**：verify 逐条输出状态，影响 readiness
     - **behavior promotion**：archive 后 docs/current/spec/ 包含 behavior.md
  3. 运行 `bun test` 全量测试套件，确保零回归

  **Must NOT do**:
  - 不跳过任何现有测试
  - 不修改实现代码来通过测试

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - 综合验证任务
  - Skills: [`gitnexus-debugging`] - 诊断测试回归

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: — | Blocked By: 3, 4, 5, 6, 7

  **References**:
  - Test pattern: `tests/commands/brainstorm.test.ts` — brainstorm 测试模式
  - Test pattern: `tests/commands/verify.test.ts` — verify 测试模式
  - Test pattern: `tests/commands/archive.test.ts` — archive 测试模式
  - Test pattern: `tests/brainstorm/integration.test.ts` — 集成测试模式
  - Framework: `package.json` — `"test": "bun test"`

  **Acceptance Criteria**:
  - [ ] `bun test` 全量通过（零失败）
  - [ ] 新增 ≥1 端到端测试覆盖 BDD 全链路
  - [ ] 新增 ≥1 回归测试验证旧 workspace 不受影响

  **QA Scenarios**:
  ```
  Scenario: Full BDD workflow
    Tool: Bash
    Steps: 创建 mock workspace -> brainstorm -> verify -> archive -> 检查全链路产物
    Expected: behavior.md 在 changes/verify/archive/current 全链路存在
    Evidence: .sisyphus/evidence/task-8-e2e.txt

  Scenario: Legacy workspace regression
    Tool: Bash
    Steps: 准备旧 workspace (只有 design.md) -> verify -> archive
    Expected: verify/archive 正常完成，无 behavior 相关错误
    Evidence: .sisyphus/evidence/task-8-regression.txt
  ```

  **Commit**: YES | Message: `test(bdd): add regression and integration tests` | Files: `tests/brainstorm/behavior-e2e.test.ts, tests/commands/verify.test.ts, tests/commands/archive.test.ts`

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
按 wave 原子提交，每个 phase 独立可回滚：
1. `feat(bdd): add behavior artifact types and config` (Task 1)
2. `feat(bdd): add behavior.md renderer` (Task 2)
3. `feat(bdd): integrate behavior.md generation into brainstorm` (Task 3)
4. `feat(bdd): add behavior evidence checks to verify` (Task 4)
5. `feat(bdd): archive behavior.md and copy to snapshot` (Task 5)
6. `feat(bdd): promote behavior.md to docs/current/spec` (Task 6)
7. `feat(bdd): add behavior traceability to implementation-mapper` (Task 7)
8. `test(bdd): add regression and integration tests` (Task 8)

## Success Criteria
- [ ] `/openflow-brainstorm <feature>` 生成 `behavior.md` + `design.md`（含 Behavior Alignment）
- [ ] `/openflow-verify <feature>` 读取 `behavior.md` 并输出逐条行为证据状态
- [ ] 关键行为 failed/missing 时 readiness 为 `not_ready`
- [ ] 行为与 current/decisions 冲突时 readiness 为 `needs_decision`
- [ ] `/openflow-archive <feature>` 复制 `behavior.md` 到 archive 快照
- [ ] 稳定行为 promotion 到 `docs/current/spec/`
- [ ] `implementation-mapper.md` 包含行为追溯链
- [ ] 旧 workspace（无 behavior.md）verify/archive 不受影响
- [ ] `bun test` 全量通过


---
## Verification Phase

### Security Checks
- [ ] **Secret Scan**: Check for accidentally committed secrets
- [ ] **Vulnerability Scan**: Run dependency vulnerability check

### Quality Checks
- [ ] **Lint Check**: Run linter
- [ ] **Type Check**: Run type checker
- [ ] **Test Suite**: Run all tests

### Failure Handling
- Quality failure: fix implementation and rerun verification.
- Security failure: block archive until fixed.
- Consistency failure: sync docs and implementation, then rerun verification.

> Auto-generated by OpenFlow. Complete all verification tasks before archiving.
