# Feature: Implementation Constraint Packet

## Overview

在 `openflow-implement` 命令中增加 **Implementation Constraint Packet** 功能——在 worktree 创建后、backend handoff 前，基于 plan 中声明的受影响文件路径，从 `docs/current/**` 约束规则、`docs/decisions/ADR-*` 决策、`docs/current/workflow/ai-reflection/**` 纠正规则中，提取与当前改动相关的跨 feature 外部约束，生成单文件 `constraints.md`，注入到 4 个消费点，形成"发现→传播→验证"的完整约束闭环。

## Problem Statement

AI agent 在执行 `openflow-implement` 时，只知道当前 feature 的 plan/design/behavior 文档，不知道其他 feature 留下的 ADR 决策、`docs/current` 中的约束规则、AI 反思纠正规则等跨 feature 知识。如果 AI 触碰了受约束的代码路径，可能引入违反已知约束的代码而不自知。

现有的 `contract-extractor` 已经能提取 `docs/current` 和 `docs/decisions` 的约束，但仅在 quality-gate / verify 阶段运行，不在实现启动时注入。`context-harvest` 只处理 brainstorm packet，不处理归档文档约束。omo explore agent 是 reactive 的，AI 不知道自己不知道什么。

## Design Decisions（用户确认）

| # | 决策点 | 决策 |
|---|---|---|
| D1 | 文件位置 | `docs/changes/{YYYY-MM-DD}-{feature}/constraints.md`；worktree 模式下，在 worktree 工作目录的 `docs/changes/` 下生成 |
| D2 | 生成失败行为 | 降级到无约束模式，记录 warning observation，不阻断实现 |
| D3 | blocking 语义 | edit/write 时 **advisory（只提醒）**，final-verify 时 **enforcement（阻断）**（quality-gate 消费判定结果） |
| D4 | 代码复用 | 重构 `contract-extractor.ts`，提取共享扫描 API |
| D5 | 证据来源 | 命令输出（grep、测试结果） |
| D6 | resumed runs | 已存在则复用，不存在则生成 |
| D7 | 不引入向量数据库 | 路径匹配 + 关键词匹配 |
| D8 | 单条目限制 | 最多 15 条，单条 ≤300 字 |

## Architecture

### 模块结构

```
src/contracts/constraint-scanner.ts       (NEW — 从 contract-extractor 提取共享 API)
  ├── scanCurrentConstraints(projectDir)  // docs/current/** → Constraint[]
  ├── scanDecisionConstraints(projectDir) // docs/decisions/ADR-* → Constraint[]
  ├── walkMarkdownFiles(dir)              // 递归遍历 .md 文件
  ├── extractTargetPaths(line)            // 提取行内路径引用
  ├── detectConstraintLine(line)          // 检测约束关键词
  └── type ScannedConstraint              // 扩展：保留 appliesTo 路径

src/contracts/contract-extractor.ts       (REFACTOR — 调用 constraint-scanner)
  └── 保留现有行为不变，内部改为调用 constraint-scanner API

src/contracts/context-resolver.ts         (NEW — 约束解析与评分)
  ├── extractPlanPaths(planPath)          // 从 plan.md 提取受影响文件路径
  ├── resolveConstraints(ctx, paths)      // 匹配约束来源
  │   ├── scanCurrentDocs()               // 调用 constraint-scanner
  │   ├── scanDecisionDocs()              // 调用 constraint-scanner
  │   └── scanReflectionDocs()            // docs/current/workflow/ai-reflection/**
  ├── scoreRelevance(constraint, paths)   // 路径相关性评分
  ├── deduplicateConstraints()            // 去重
  ├── generateConstraintPacket()          // 生成 constraints.md（内存构建）
  └── type ResolvedConstraint             // 约束条目类型

src/hooks/constraint-guard.ts             (NEW — 在 tool-before.ts 中注册)
  ├── checkConstraintGuard(options)       // 在 createToolBeforeHook 中调用，紧跟 checkImplementationGuard 之后
  └── getActiveConstraintsForPath()       // 读取活跃 constraints.md

src/commands/implement.ts                 (MODIFY — 插入约束生成步骤)
  └── step 6b: generateConstraintPacket()

src/utils/implementation-backend.ts       (MODIFY — handoff prompt 注入约束路径)

src/commands/quality-gate.ts              (MODIFY — 增加约束验证步骤)
  └── verifyConstraintSatisfaction()
```

### 数据流

```
plan.md
  ↓ extractPlanPaths()
[src/auth/token.ts, src/middleware/auth.ts, ...]
  ↓ resolveConstraints()
constraint-scanner.scanCurrentConstraints()   → ScannedConstraint[] (含 appliesTo)
constraint-scanner.scanDecisionConstraints()   → ScannedConstraint[] (含 appliesTo)
context-resolver.scanReflectionDocs()          → ScannedConstraint[] (含 appliesTo)
  ↓ scoreRelevance() + deduplicate() + top-15 截断
[ResolvedConstraint × max 15]
  ↓ generateConstraintPacket()
constraints.md (写入 execution root 的 docs/changes/)
  ↓ 4 个消费点
```

### 文件位置（D1）

**规则**：约束文件始终写入**当前工作分支**的 `docs/changes/` 目录。

```
# 非 worktree 模式
{ctx.directory}/docs/changes/{YYYY-MM-DD}-{feature}/constraints.md

# worktree 模式
{run.worktree}/docs/changes/{YYYY-MM-DD}-{feature}/constraints.md
```

即使用 worktree 时，约束文件在 worktree 工作目录下生成，与 plan/design/behavior 同级。

### 生成时机

约束文件分两阶段：

1. **计划阶段（`writing-plan` 命令）**：在 `plan.md` 中增加 `## Implementation Constraints` section，产出路径→约束来源的声明式映射。此时只做**约束索引**（source → appliesTo 范围），不生成最终文件。
2. **执行阶段（`openflow-implement` 命令）**：在 step 6（createRun）和 step 7（handoffToBackend）之间，基于 `plan.md` 和实际 worktree 路径，生成最终的 `constraints.md`。

### 失败处理（D2）

约束生成采用**内存构建 + 原子写入**：

```typescript
// 1. 在内存中构建全部内容
const content = renderConstraintPacket(resolvedConstraints)
// 2. 写入临时文件
const tmpPath = constraintsPath + '.tmp'
await fs.writeFile(tmpPath, content)
// 3. 原子 rename
await fs.rename(tmpPath, constraintsPath)
```

如果任何步骤失败：
- 记录 warning observation 到 `observations.jsonl`
- 不阻断 backend handoff
- handoff prompt 中注明 "constraint generation failed, no constraints injected"
- final-verify 将检测到无约束文件，跳过约束验证步骤

### Resumed Runs（D6）

在 `handleImplement()` 的 "resume active run" 分支中：

```typescript
// 检查 constraints.md 是否已存在
const constraintsPath = getConstraintsPath(run)
if (await fileExists(constraintsPath)) {
  // 复用，记录 observation
  await recordObservation(ctx, observationsPath, 'Reusing existing constraints.md')
} else {
  // 生成新的
  await generateConstraintPacket(ctx, run, resolvedConstraints)
}
```

## Core Abstractions and Boundaries

### ConstraintScanner（`src/contracts/constraint-scanner.ts`）

**职责**：从 `contract-extractor.ts` 中提取的共享约束扫描 API。

**核心变更**：现有 `contract-extractor` 的 `parseCurrentConstraints()` 和 `parseDecisionConstraints()` 方法在提取约束时会丢弃目标路径（`appliesTo`）。新 scanner 必须在 `ScannedConstraint` 类型中保留这些路径。

```typescript
export interface ScannedConstraint {
  source: 'current' | 'decision' | 'reflection'
  file: string          // 来源文件相对路径
  rule: string          // 约束规则文本
  severity: 'blocking' | 'warning'
  appliesTo: string[]   // 受影响的文件/目录路径（从行内反引号和代码模式提取）
}
```

**边界**：
- IN：扫描 `docs/current/**`、`docs/decisions/ADR-*`、`docs/current/workflow/ai-reflection/**`
- OUT：不做评分，不做 plan 路径提取，不做文件生成

### ContextResolver（`src/contracts/context-resolver.ts`）

**职责**：调用 ConstraintScanner，结合 plan 路径进行评分、去重、截断，生成最终 constraints.md。

**边界**：
- OUT：不做语义搜索，不做向量检索
- OUT：不修改 plan.md 或 design.md
- OUT：不做 docs/archive 的全量索引

### ConstraintGuard（`src/hooks/constraint-guard.ts`）

**职责**：扩展 `implementation-guard.ts` 的 hook 链，在 `edit`/`write` 前检查约束。**仅 advisory（D3）**，返回提醒信息，不阻断编辑。

**边界**：
- OUT：不阻断任何编辑操作（blocking 只在 quality gate）
- OUT：不修改代码内容
- OUT：不在没有活跃 ImplementationRun 时生效
- OUT：如果 hook 自身崩溃（异常），静默跳过，不阻断编辑

### Final-Verify 增强（constraints enforcement 归属点）

> **注意**：随着 `openflow-harden-quality-gate-final-verify-code-mapper` feature 的实现，constraints enforcement 从 quality-gate 前移到 final-verify 节点。quality-gate 只消费 final-verify 的 constraint_satisfaction 结果。

**职责**：验证 diff 中受约束路径的改动是否满足约束，要求提供命令输出作为证据（D5）。

**证据要求**：
- 必须是**实际执行的命令输出**（grep 结果、测试运行输出）
- 不接受口头陈述或 observation log 作为约束满足的证据
- 证据必须明确说明：命令 → 输出 → 约束满足的推理链

**边界**：
- OUT：不自动修复违规代码，只报告并阻断
- OUT：不检查约束文件中未命中的约束

## Constraint Scoring Algorithm

```typescript
interface ScoreResult {
  score: number        // 0.0 - 1.0
  matchType: 'exact' | 'prefix' | 'glob' | 'keyword'
  matchedPaths: string[]  // 具体匹配的 plan 路径
}

function scoreRelevance(constraint: ScannedConstraint, planPaths: string[]): ScoreResult {
  // 1. 精确路径重叠：constraint.appliesTo 中任一路径 === planPaths 中任一路径
  //    → score 1.0, matchType 'exact'

  // 2. 路径前缀匹配：constraint.appliesTo 是 planPath 的前缀（或反过来）
  //    → score 0.8, matchType 'prefix'

  // 3. glob 模式匹配：appliesTo 中含通配符（src/auth/**）匹配 planPath
  //    → score 0.6, matchType 'glob'

  // 4. 关键词匹配：constraint.rule 中的路径片段在 plan task 描述中出现
  //    → score 0.3, matchType 'keyword'

  // 无匹配 → score 0（不注入）
  // 多条 planPath 命中同一条 constraint → 取最高 score，matchedPaths 合并
}

// 阈值：score >= 0.3 才注入
// 截断：最多 15 条，按 score 降序
// 同分 tie-breaking：source 优先级 decision > current > reflection
```

### 去重规则

去重 key：`{sourceFile}:{normalizedRule}:{normalizedAppliesTo}`

```typescript
function deduplicateKey(c: ResolvedConstraint): string {
  const normalizedRule = c.rule.trim().toLowerCase().replace(/\s+/g, ' ')
  const normalizedAppliesTo = [...c.appliesTo].sort().join(',')
  return `${c.sourceFile}:${normalizedRule}:${normalizedAppliesTo}`
}
```

如果同一约束适用于多个路径，合并为一条（`appliesTo` 取并集），取最高 score。

## Output Format（constraints.md）

```markdown
# Implementation Constraints: {feature}

Generated at: {ISO timestamp}
Plan: docs/changes/{date}-{feature}/plan.md
Run: {runID}
Generation status: success | degraded (no constraints resolved)

## Blocking Constraints

- [1] Source: docs/decisions/ADR-003-auth.md
  Source type: decision
  Applies to: `src/auth/token.ts`
  Rule: Must use RS256. HS256 is forbidden.
  Severity: blocking
  Score: 1.0 (exact match)
  Verification required: grep confirms no HS256 usage; RS256 tests pass.

- [2] Source: docs/current/design/auth-boundaries.md
  Source type: current
  Applies to: `src/middleware/auth.ts`, `src/middleware/rate-limit.ts`
  Rule: Rate limiter must check before token validation.
  Severity: blocking
  Score: 0.8 (prefix match)
  Verification required: rate-limit middleware test passes.

## Warning Constraints

- [3] Source: docs/current/requirements/api-compat.md
  Source type: current
  Applies to: `src/api/routes/`
  Rule: API response shape must not change for existing endpoints.
  Severity: warning
  Score: 0.6 (glob match)

## Reflection Rules

- [4] Source: docs/current/workflow/ai-reflection/premature-implementation/index.md
  Source type: reflection
  Applies to: (all paths)
  Rule: Do not start implementation before plan is fully written.
  Score: 0.3 (keyword match)

## Required Reads

- docs/decisions/ADR-003-auth.md
- docs/current/design/auth-boundaries.md

## Summary

4 constraints resolved. 2 blocking, 1 warning, 1 reflection rule.
Quality gate MUST verify constraints [1] [2] if their appliesTo paths appear in git diff.
Evidence must be command output (grep, test results). Observation logs are not accepted.
```

## Consumption Points

### 1. Backend Handoff（`implementation-backend.ts`）

在 `handoffToBackend` prompt 中追加约束路径和摘要：

```
OpenFlow Implementation Constraints:
- Constraint packet: docs/changes/{date}-{feature}/constraints.md
- Generation status: {status}
- You MUST read this file before creating or executing implementation tasks.
- Every child task prompt MUST include applicable constraints from this packet.
- Blocking constraints are advisory during implementation; enforcement is performed during final-verify, consumed by quality-gate readiness judgment.
- If constraint conflicts with plan, stop and report drift.
```

### 2. 子任务 Prompt（omo `/start-work` 或 opencode task agent）

在 `/start-work` 命令的 `OpenFlow Implementation Context` section 中追加约束文件路径引用。要求子 agent 在拆任务时：
- 读取 constraints.md
- 将每个任务涉及的 applicable constraints 注入对应 task prompt

### 3. 工具前 Hook（`constraint-guard.ts`）

扩展 `implementation-guard.ts` 的 hook 注册（共享 hook 链，不创建竞争性 guard 系统）。

行为：
- 读取活跃 run 的 `constraints.md`（parse 上述格式）
- 检查即将 edit/write 的文件路径
- 命中任何约束 → 返回 advisory 提醒（**不阻断**）
- hook 自身异常 → 静默跳过，不阻断编辑

### 4. Final-Verify（quality-gate 编排器中的 constraints enforcement 节点）

> 约束验证在 final-verify 节点执行，quality-gate 只消费结果。

final-verify 执行的约束验证步骤：
- 读取 `constraints.md`
- 读取 git diff（changed files）
- 计算 `changedFiles ∩ constrainedPaths`
- 如果有 blocking 约束命中 → **要求提供命令输出证据**（grep 结果、测试运行输出）
- 如果有 warning 约束命中 → 列出但不阻断
- 证据不足 → constraint_satisfaction = blocked，列出缺失的证据要求
- quality-gate 读取 final-verify 的 constraint_satisfaction 结果，作为 readiness 判定输入

## Non-Goals

- 不做语义搜索或 RAG（不需要向量数据库）
- 不替代 omo explore agent 的代码探索能力
- 不自动修复违规代码
- 不做 `docs/archive` 的全量索引（只在约束来源中按需扫描）

## Cross-Validation Summary

- Status: Passed (conditional — Oracle review findings incorporated)
- Reviewer: Oracle (architecture review)
- Design documents: design.md, behavior.md
- Critical issues addressed: 5/5 (contract-extractor refactor, ResolvedConstraint fields, worktree paths, atomic write, blocking semantics)
- Major concerns addressed: 7/7 (module location, guard integration, scoring precision, dedup, evidence source, edge cases, resume behavior)
