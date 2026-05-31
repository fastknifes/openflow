# Plan: implementation-constraints

## Overview

在 `openflow-implement` 命令中增加 Implementation Constraint Packet 功能。在 worktree 创建后、backend handoff 前，基于 plan 中声明的受影响文件路径，从 `docs/current/**`、`docs/decisions/ADR-*`、`docs/current/workflow/ai-reflection/**` 提取跨 feature 约束，生成单文件 `constraints.md`，注入 4 个消费点（backend handoff、子任务 prompt、constraint-guard advisory、final-verify enforcement），形成"发现→传播→验证"闭环。

## Design Context

- Design workspace: `docs/changes/2026-05-27-implementation-constraints/`
- Design documents: `design.md`, `behavior.md`
- Cross-Validation: Passed (Oracle review × 2, 4 blocking + 6 major issues resolved)
- Feature dependency: `openflow-harden-quality-gate-final-verify-code-mapper`（transitional path if final-verify not available）

## Standard Planning Strategy

### Highest-Level Goal

在实现启动时自动注入跨 feature 约束知识，使 AI agent 在触碰受约束代码时感知约束存在，并在 final-verify 阶段阻断违反约束的代码合并。

### Work Breakdown

1. **共享扫描层** — 从 `contract-extractor.ts` 提取 `constraint-scanner.ts`
   1.1 提取 `walkMarkdownFiles`、`extractTargetPaths`、`detectConstraintLine` 为独立导出函数
   1.2 新增 `scanCurrentConstraints()`、`scanDecisionConstraints()` 返回 `ScannedConstraint[]`（保留 `appliesTo`）
   1.3 重构 `contract-extractor.ts` 内部调用 scanner API

2. **约束解析层** — 新建 `context-resolver.ts`
   2.1 `extractPlanPaths(planPath)` 从 plan.md 提取受影响文件路径
   2.2 `scanReflectionDocs()` 扫描 ai-reflection 目录
   2.3 `scoreRelevance()` + `deduplicateConstraints()` + top-15 截断
   2.4 `generateConstraintPacket()` 内存构建 + 原子写入

3. **集成层** — 修改现有文件
   3.1 `implement.ts` step 6b 插入约束生成
   3.2 `implementation-backend.ts` handoff 注入约束路径
   3.3 `constraint-guard.ts` + `tool-before.ts` 注册 advisory hook
   3.4 `quality-gate.ts` 增加 `verifyConstraintSatisfaction()`（transitional path）

4. **测试** — 单元测试 + 集成测试

### Core Abstractions and Boundaries

- **ConstraintScanner** (`src/contracts/constraint-scanner.ts`): 扫描 docs/ 目录提取约束。边界：不做评分、不做路径提取。
- **ContextResolver** (`src/contracts/context-resolver.ts`): 评分、去重、生成。边界：不做语义搜索。
- **ConstraintGuard** (`src/hooks/constraint-guard.ts`): advisory 提醒。边界：不阻断编辑。

## Execution Strategy

### Parallel Execution Waves

**Wave 1**（基础设施，无依赖）:
- Task 1: constraint-scanner.ts + refactor contract-extractor.ts

**Wave 2**（依赖 Wave 1 的 scanner API）:
- Task 2: context-resolver.ts（评分、去重、生成）

**Wave 3**（依赖 Wave 2 的 generateConstraintPacket）:
- Task 3: implement.ts step 6b + implementation-backend.ts handoff 注入
- Task 4: constraint-guard.ts + tool-before.ts hook 注册

**Wave 4**（依赖 Wave 3 的完整流程）:
- Task 5: quality-gate.ts verifyConstraintSatisfaction
- Task 6: 测试（constraint-scanner + context-resolver + 集成）

### Dependency Matrix

| Task | Blocked By | Blocks |
|------|-----------|--------|
| 1. constraint-scanner | — | 2, 3 |
| 2. context-resolver | 1 | 3, 4 |
| 3. implement + backend integration | 2 | 5, 6 |
| 4. constraint-guard hook | 2 | 6 |
| 5. quality-gate constraint verification | 3 | 6 |
| 6. tests | 3, 4, 5 | — |

## Tasks

- [ ] 1. Extract constraint-scanner and refactor contract-extractor (Agent: fixer | Blocks: [2,3] | Blocked By: [])
  - **Files**:
    - CREATE `src/contracts/constraint-scanner.ts`
    - MODIFY `src/contracts/contract-extractor.ts`
    - CREATE `tests/contracts/constraint-scanner.test.ts`
  - **What**:
    - Extract from `contract-extractor.ts`: `walkMarkdownFiles`, `extractTargetPaths`, `detectConstraintLine` as exported functions in `constraint-scanner.ts`
    - Add `ScannedConstraint` interface (source, file, rule, severity, appliesTo: string[])
    - Add `scanCurrentConstraints(projectDir): Promise<ScannedConstraint[]>` — reuses `extractCurrentConstraintsFromSections` logic but returns `appliesTo` paths
    - Add `scanDecisionConstraints(projectDir): Promise<ScannedConstraint[]>` — reuses `extractDecisionRules` logic but preserves code patterns in `appliesTo`
    - Refactor `contract-extractor.ts` to import and call scanner functions; existing `parseCurrentConstraints()` and `parseDecisionConstraints()` become thin wrappers
    - Add `scanReflectionDocs(projectDir): Promise<ScannedConstraint[]>` — scans `docs/current/workflow/ai-reflection/**`, appliesTo defaults to `['*']`, severity always `warning`
  - **Constraint D4**: refactor contract-extractor, preserve existing behavior (all existing tests must pass)
  - **Constraint D8**: scanner must preserve raw rule text for downstream 300-char truncation
  - **Verification**: `npx vitest run tests/contracts/contract-extractor.test.ts` — all existing tests pass unchanged. `npx vitest run tests/contracts/constraint-scanner.test.ts` — new tests for scanCurrentConstraints, scanDecisionConstraints, scanReflectionDocs with appliesTo preservation.

- [ ] 2. Implement context-resolver with scoring, dedup, and packet generation (Agent: fixer | Blocks: [3,4] | Blocked By: [1])
  - **Files**:
    - CREATE `src/contracts/context-resolver.ts`
    - CREATE `tests/contracts/context-resolver.test.ts`
  - **What**:
    - `extractPlanPaths(planPath: string): Promise<string[]>` — regex-extract file paths (backtick-wrapped `src/...`, `tests/...`) from plan.md content
    - `scoreRelevance(constraint, planPaths): ScoreResult` — exact(1.0) > prefix(0.8) > glob(0.6) > keyword(0.3), threshold >= 0.3
    - `deduplicateConstraints(constraints): ResolvedConstraint[]` — key: `{normalizedRule}:{normalizedAppliesTo}` (no sourceFile), merge sources[], keep highest score
    - `generateConstraintPacket(ctx, run, feature): Promise<ConstraintPacketResult>` — call scanner, score, dedup, truncate to 15, render markdown, atomic write (tmp + rename)
    - `renderConstraintPacket(constraints, metadata): string` — render constraints.md in design.md Output Format
    - Runtime types: `ConstraintPacketStatus`, `ConstraintPacketResult`, `ScoreResult`, `ResolvedConstraint`
  - **Constraint D1**: path via `resolveChangeUnitDir(executionRoot, run.feature)`
  - **Constraint D2**: on failure return `ConstraintPacketResult { status: 'failed' }`, no partial file on disk
  - **Constraint D7**: no vector DB, path + keyword matching only
  - **Constraint D8**: max 15 entries, rule text truncated to 300 chars, tie-breaking decision > current > reflection
  - **Verification**: `npx vitest run tests/contracts/context-resolver.test.ts` — tests for extractPlanPaths, scoreRelevance (exact/prefix/glob/keyword/none), deduplication (cross-source, same-rule diff-source), top-15 truncation, 300-char truncation, atomic write (tmp+rename), graceful failure.

- [ ] 3. Integrate constraint generation into implement command and backend handoff (Agent: fixer | Blocks: [5,6] | Blocked By: [2])
  - **Files**:
    - MODIFY `src/commands/implement.ts`
    - MODIFY `src/utils/implementation-backend.ts`
    - MODIFY `tests/commands/implement.test.ts`
  - **What**:
    - In `implement.ts`, insert step 6b between step 6 (setActiveRun) and step 7 (handoffToBackend):
      ```
      // Step 6b: Generate constraint packet
      const constraintResult = await generateConstraintPacket(ctx, run, sanitizedFeature)
      await recordObservation(ctx, observationsPath, `Constraint packet: ${constraintResult.status}, ${constraintResult.constraintCount} constraints`)
      ```
    - Pass `constraintResult` to `handoffToBackend(ctx, run, toolContext, constraintResult)`
    - In `implementation-backend.ts`:
      - Add optional `constraintResult` param to `handoffToBackend`
      - omo path: append constraint section to handoff prompt (path, status, advisory/enforcement note)
      - opencode path: append constraint info to `recordObservation`
      - Fix planPath: use `resolveChangeUnitDir(executionRoot, run.feature)` instead of `docs/changes/${run.feature}/plan.md`
    - Handle resumed runs: check if constraints.md exists, reuse if present, generate if missing
  - **Constraint D1**: all paths via resolveChangeUnitDir
  - **Constraint D2**: generation failure does not block handoff
  - **Constraint D5**: evidence source is command output (relevant for downstream)
  - **Constraint D6**: resumed runs reuse existing constraints.md
  - **Verification**: `npx vitest run tests/commands/implement.test.ts` — existing tests pass + new test for step 6b constraint generation. `npx vitest run tests/utils/implementation-backend.test.ts` — existing tests pass + new tests for constraint injection in omo prompt and opencode observation.

- [ ] 4. Implement constraint-guard advisory hook (Agent: fixer | Blocks: [6] | Blocked By: [2])
  - **Files**:
    - CREATE `src/hooks/constraint-guard.ts`
    - MODIFY `src/hooks/tool-before.ts`
    - CREATE `tests/hooks/constraint-guard.test.ts`
  - **What**:
    - `src/hooks/constraint-guard.ts`:
      - `checkConstraintGuard(options): Promise<{ advisory: boolean; message?: string }>`
      - `getActiveConstraintsForPath(ctx): Promise<ScannedConstraint[] | null>`
      - Reads active run's constraints.md, parses it, checks if tool's target file matches any constraint's appliesTo
      - Returns advisory message with source, rule, severity, appliesTo
      - Wraps everything in try/catch — never throws (silent failure)
    - `src/hooks/tool-before.ts`:
      - Import `checkConstraintGuard` from constraint-guard
      - Call it after `checkImplementationGuard` in `createToolBeforeHook`
      - For `task` tool: inject advisory text into prompt
      - For `write`/`edit` tool: record advisory as observation via `recordObservation`
  - **Constraint D3**: advisory only, never blocks
  - **Constraint D4**: extends tool-before.ts hook chain (same registration point as implementation-guard)
  - **Verification**: `npx vitest run tests/hooks/constraint-guard.test.ts` — advisory returned when file matches, no advisory when no match, silent failure on malformed constraints.md, no active run → no advisory. `npx vitest run tests/hooks/implementation-guard.test.ts` — existing tests still pass.

- [ ] 5. Add constraint verification to quality-gate (transitional path) (Agent: fixer | Blocks: [6] | Blocked By: [3])
  - **Files**:
    - MODIFY `src/commands/quality-gate.ts`
    - CREATE `tests/commands/quality-gate-constraints.test.ts`
  - **What**:
    - Add `verifyConstraintSatisfaction(ctx, run): Promise<ConstraintVerificationResult>`:
      - Read constraints.md from resolved path (via resolveChangeUnitDir)
      - Read git diff changed files
      - Compute `changedFiles ∩ constrainedPaths`
      - For blocking constraints: require `ConstraintEvidence` (command, output, exitCode, reasoning)
      - For warning constraints: list in warnings array
      - Return `ConstraintVerificationResult { status, checked, warnings }`
    - Runtime types: `ConstraintEvidence`, `ConstraintVerificationResult`
    - Integrate into quality-gate flow: after existing checks, call verifyConstraintSatisfaction if constraints.md exists
    - Skip if constraints.md does not exist (degraded/failed generation)
    - Transitional: this is the direct path; will migrate to final-verify when that feature is implemented
  - **Constraint D3**: enforcement at this point — blocks readiness if evidence insufficient
  - **Constraint D5**: only command output evidence accepted
  - **Constraint D8**: only verify constraints whose appliesTo appears in diff
  - **Verification**: `npx vitest run tests/commands/quality-gate-constraints.test.ts` — satisfied when evidence provided, blocked when evidence missing, skipped when no constraints.md, warning constraints listed but not blocking.

- [ ] 6. Write comprehensive tests and verify integration (Agent: fixer | Blocks: [] | Blocked By: [3,4,5])
  - **Files**:
    - MODIFY `tests/contracts/constraint-scanner.test.ts` (from Task 1, add edge cases)
    - MODIFY `tests/contracts/context-resolver.test.ts` (from Task 2, add integration scenarios)
    - CREATE `tests/contracts/constraint-integration.test.ts`
  - **What**:
    - Integration test: full flow from plan.md → constraint generation → constraints.md on disk
    - Edge cases: empty plan paths, no constraints in docs, malformed markdown, worktree mode path resolution
    - Cross-source dedup: same rule from ADR + current → single entry with merged sources
    - Atomic write: verify no .tmp file remains after failure
    - Resumed run: constraints.md exists → reused, not exists → generated
    - 15-entry limit: 30 constraints → top 15 by score
    - 300-char rule truncation: long rule text → truncated
  - **Verification**: `npx vitest run` — all tests pass. `npx tsc --noEmit` — zero type errors.

- [ ] 7. Quality gate (Agent: quick | Blocks: [] | Blocked By: [6])
  - After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.


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
- **Estimated execution units**: 15 (recommended max: 20)

**Suggestion**: Split large waves across multiple `/openflow-implement` invocations
or reduce per-wave task count to keep execution feedback loops short.
