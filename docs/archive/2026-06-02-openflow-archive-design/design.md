# openflow-archive-design - Design

## Human Consensus Summary

重新设计 `/openflow-archive` 命令，使其：
1. 支持两种使用模式：计划驱动归档（Mode 1）和 ad-hoc 问题归档（Mode 2）
2. 将当前 1284 行的单一 `handleArchive` 函数拆分为独立阶段模块
3. 保持向后兼容（目录结构、命令接口、acceptance state 格式不变）

## Identity And Assumptions

- **Feature slug**: `openflow-archive-design`
- **影响范围**: `src/commands/archive.ts`（重写）+ `src/phases/archive/`（新增模块）
- **向后兼容假设**: 现有 `docs/archive/` 目录中的已归档内容不需要迁移；新归档的产物结构与现有一致。

### 关键假设

1. Mode 2（ad-hoc）不需要 quality-gate 作为前置条件。用户直接调用归档，系统从会话中收集变更。
2. Mode 2 的触发条件是：无匹配的 acceptance state，或用户显式指定 ad-hoc 模式。
3. 现有 `src/phases/archive/` 下的模块（current-promotion、implementation-mapper、code-mapper、traceability）保持不变，新模块与它们并列。
4. `src/hooks/chat-command-dispatch.ts` 中的命令分发逻辑不变。

## Overview

将 `handleArchive` 从单一巨型函数重构为阶段化的管道。管道由一个薄命令处理器驱动，根据归档模式（planned / ad-hoc）选择不同的验证和产物生成策略。

### 归档模式

| 模式 | 触发条件 | 验证要求 | 产物 |
|------|----------|----------|------|
| **planned** | 匹配的 acceptance state 存在 | 完整 readiness/harden/drift 检查（除非 `skipQualityGateChecks`） | design, plan, prd, behavior, implementation-mapper, issue artifacts, promotion |
| **planned (post-hoc)** | acceptance state 存在且 `postHocIssue=true` + readiness 有效 | 同 planned（需 quality-gate 已通过） | 合成 issue-clarification, issue-resolution, promotion-candidate |
| **ad-hoc** | 无匹配的 acceptance state | 最小验证（feature 名有效、无阻断状态） | issue-resolution, issue-clarification, 变更记录 |

> **post-hoc 与 ad-hoc 并存**：post-hoc 是 planned 模式的子路径（需 quality-gate），ad-hoc 是独立模式（无需 quality-gate、无 acceptance state）。

## Problem

### 当前痛点

1. **单一巨型函数**: `handleArchive` 文件 1344 行（函数体约 439 行 + 辅助函数），混合了验证、文件操作、issue 处理、promotion、worktree 管理等多种职责。
2. **条件分支复杂**: 16 个阻断检查点（readiness、harden、doc update、implementation state、drift、root mismatch、security、applicability 等），难以理解和测试。
3. **ad-hoc 路径不存在**: 当前 post-hoc issue 路径仍需要 quality-gate 先运行，没有"无 acceptance state 直接归档"的路径。
4. **模块边界模糊**: 文件复制、issue 产物生成、状态更新等操作散落在函数各处，无法独立测试或复用。

### 期望状态

- 清晰的阶段划分，每个阶段有明确的输入/输出契约
- 两种归档模式有独立的验证路径，不互相干扰
- 各阶段可独立测试
- 命令处理器只负责管道编排

## Goals

### G-001: 阶段化架构

将 `handleArchive` 拆分为 6 个独立阶段：

| 阶段 | 职责 | 输入 | 输出 |
|------|------|------|------|
| resolve | 解析 feature、检测模式（planned/planned-posthoc/ad-hoc） | ctx, feature? | `ArchiveContext` |
| validate | 按模式验证前置条件（planned: 完整检查或 skipQG；ad-hoc: 最小检查） | `ArchiveContext` | `ValidationResult` |
| collect | 收集/生成产物到 staging | `ArchiveContext`, `ValidationResult` | staging 目录 |
| promote | 构建/应用 current promotion | staging 目录 | `PromotionResult` |
| finalize | staging→最终目录、状态更新、清理 | staging + promotion 结果 | 最终 archive 目录 |
| report | 格式化归档报告 | 所有阶段结果 | 用户可见文本 |

### G-002: ad-hoc 归档模式

支持用户在未经 feature 工作流的情况下直接归档：
- 无需 quality-gate 前置
- 从会话/构建数据中自动收集变更文件
- 生成简化的 issue-resolution 文档（记录问题描述、解决方案、涉及文件）
- 仍支持 current promotion

### G-003: 向后兼容

- `/openflow-archive <feature>` 命令接口不变
- `docs/archive/{date-feature}/` 目录结构不变
- `AcceptanceState` 类型不删除任何字段
- `ImplementationRun` 状态流转不变
- `archive-workflow.md` 的规则继续有效

### G-004: 职责解耦

每个阶段是一个独立模块，拥有：
- 明确的类型签名（输入/输出）
- 可独立调用的函数
- 独立的测试文件

## Non-Goals

1. **不改变 quality-gate**: quality-gate 的验证逻辑和状态管理不在本次范围内。
2. **不改变 archive 目录命名规则**: 仍使用 `{date-feature}` 格式。
3. **不改变命令注册方式**: 仍通过 `src/commands/manifest.ts` 注册。
4. **不引入新的用户交互步骤**: 保留现有确认机制，不增加新的确认流程。
5. **不重构 `src/phases/archive/` 下已有的模块**: current-promotion、implementation-mapper、code-mapper、traceability 保持不变。

## Behavior Alignment

### 与现有 archive-workflow.md 的对齐

| 现有规则 | 新设计对应 | 变化 |
|----------|-----------|------|
| archive 不重新运行 harden | validate 阶段只消费 harden summary | 无变化 |
| archive 不重新运行 verify | validate 阶段只消费 readiness | 无变化 |
| staging 原子化 | finalize 阶段仍用 staging + rename | 无变化 |
| current promotion 受 auto_promote_current 控制 | promote 阶段保留此逻辑 | 无变化 |
| worktree commit/merge/cleanup | finalize 阶段保留此逻辑 | 无变化 |
| ready_for_archive 跳过 QG 检查 | validate 阶段通过 skipQualityGateChecks 处理 | 无变化（显式约束 C-008） |
| rename 后验证归档产物 | finalize 阶段 assertArchiveMaterialized | 无变化（显式约束 C-009） |
| post-hoc issue 路径 | planned 模式子路径（需 quality-gate） | 无变化 |
| 新增：ad-hoc 模式跳过 readiness 检查 | validate 阶段按模式选择验证策略 | 新增 |

## Design Constraints

### 必须约束

- **C-001**: `handleArchive(ctx, feature?)` 函数签名不变
- **C-002**: 所有现有阻断条件在 planned 模式下保持不变（readiness、harden、doc update、implementation state、drift、root mismatch、security、applicability）
- **C-003**: staging 目录必须原子化（先 staging 再 rename），失败时 staging 被清理
- **C-004**: `AcceptanceState` 类型只增不删
- **C-005**: ad-hoc 模式不修改 acceptance state 的 readiness 字段
- **C-006**: ad-hoc 模式的产物必须包含 issue-resolution.md
- **C-007**: 每个阶段模块不超过 300 行
- **C-008**: 当 `implementationRun.status === 'ready_for_archive'` 时，validate 阶段跳过所有 quality gate 检查（applicability、readiness、harden、doc update、implementation state、drift、security），直接返回 `allowed=true`
- **C-009**: finalize 阶段在 staging rename 后必须验证归档产物（`assertArchiveMaterialized`：产物存在且非零大小）；只有验证通过时才清理源 workspace 文件和 build data；验证失败时源文件保留并记录 warning

### 数据契约

#### ArchiveContext
```typescript
interface ArchiveContext {
  feature: string                           // 已清洗的 feature slug
  mode: 'planned' | 'ad-hoc'               // 归档模式
  acceptanceState: AcceptanceState | null   // 匹配的 acceptance state
  implementationRun: ImplementationRun | null
  issueMode: IssueMode                     // feature/issue/mixed (planned) 或 'ad-hoc'
  sourcePaths: {
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
}
```

#### ValidationResult
```typescript
interface ValidationResult {
  allowed: boolean
  blocked: boolean
  blockers: ArchiveBlocker[]         // 阻断原因列表
  warnings: string[]                 // 非阻断警告
  skipQualityGateChecks: boolean     // planned 模式下 implementation run 可跳过
  postHocIssueReady: boolean         // ad-hoc 模式标记
}

interface ArchiveBlocker {
  type: 'readiness' | 'harden' | 'doc_update' | 'implementation_state' 
      | 'drift' | 'root_mismatch' | 'run_status' | 'applicability' | 'security'
  message: string
  feature: string
}
```

#### PromotionResult
```typescript
interface PromotionResult {
  applied: CurrentPromotionSuggestion[]
  skipped: CurrentPromotionSuggestion[]
}
```

### 故障语义

| 场景 | 行为 |
|------|------|
| staging 中任何文件操作失败 | 删除 staging 目录，抛出错误，源 workspace 不受影响 |
| rename staging → final 失败 | 保留 staging，抛出错误 |
| rename 后 assertArchiveMaterialized 失败 | 归档目录保留，**源 workspace 文件保留**，记录 warning；不执行 cleanupArchivedChangeWorkspaceSources 和 cleanBuild |
| promotion 失败 | 记录 warning，不阻断归档；promotion 报告为 skipped |
| worktree commit 失败 | 记录 warning，不阻断归档；报告 cleanup 状态 |
| worktree merge 失败 | 记录 warning，不阻断归档；报告 merge 失败 |
| ad-hoc 模式无代码变更 | 仍然允许归档，issue-resolution 中标注无变更 |
| acceptance state 读写失败 | 阻断归档，返回错误 |

### 集成边界

| 组件 | 变更权限 | 说明 |
|------|----------|------|
| `src/commands/archive.ts` | **允许重写** | 主要改造目标 |
| `src/phases/archive/resolve.ts` | **允许新增** | 阶段模块 |
| `src/phases/archive/validate.ts` | **允许新增** | 阶段模块 |
| `src/phases/archive/collect.ts` | **允许新增** | 阶段模块 |
| `src/phases/archive/issue.ts` | **允许新增** | issue 产物生成 |
| `src/phases/archive/finalize.ts` | **允许新增** | 阶段模块 |
| `src/phases/archive/report.ts` | **允许新增** | 阶段模块 |
| `src/phases/archive/index.ts` | **允许修改** | 增加新模块导出 |
| `src/phases/archive/current-promotion.ts` | **禁止修改** | 保持现有 API |
| `src/phases/archive/implementation-mapper.ts` | **禁止修改** | 保持现有 API |
| `src/phases/archive/code-mapper.ts` | **禁止修改** | 保持现有 API |
| `src/phases/archive/traceability.ts` | **禁止修改** | 保持现有 API |
| `src/utils/acceptance-state.ts` | **禁止修改公共 API** | 可新增字段，不删不改现有 |
| `src/utils/implementation-run.ts` | **禁止修改** | 保持现有 API |
| `src/utils/implementation-worktree.ts` | **禁止修改** | 保持现有 API |
| `src/commands/manifest.ts` | **禁止修改** | 命令注册不变 |
| `src/hooks/chat-command-dispatch.ts` | **禁止修改** | 分发逻辑不变 |
| `AcceptanceState` 类型 | **禁止删字段** | 可新增可选字段 |

## Success Criteria

- [ ] **SC-001**: `handleArchive` 函数体不超过 60 行（仅编排管道）
- [ ] **SC-002**: 6 个阶段模块各自不超过 300 行
- [ ] **SC-003**: 现有测试全部通过（向后兼容）
- [ ] **SC-004**: planned 模式的所有现有阻断条件不变
- [ ] **SC-005**: ad-hoc 模式可在无 acceptance state 的情况下归档
- [ ] **SC-006**: ad-hoc 模式生成 issue-resolution.md
- [ ] **SC-007**: 每个阶段有独立的单元测试
- [ ] **SC-008**: `docs/archive/` 目录结构不变

## Risks And Mitigations

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 重构导致 planned 模式回归 | 中 | 高 | 保留所有现有测试，重构前确保绿色；新增回归测试 |
| ad-hoc 模式与 post-hoc 路径混淆 | 中 | 中 | 在 resolve 阶段明确区分两种模式，独立验证路径 |
| 阶段间数据传递遗漏 | 低 | 高 | 使用强类型 ArchiveContext，编译期检查 |
| 新模块导出遗漏导致循环依赖 | 低 | 中 | 遵循现有 phases/archive 的扁平导出模式 |

## Testing Strategy

### Unit Tests

- **resolve 阶段**: 测试 feature 解析、模式检测（有/无 acceptance state、有/无 implementation run）
- **validate 阶段**: 测试每种阻断条件的返回（NotReady、harden、drift、root mismatch 等）
- **validate (ad-hoc)**: 测试最小验证通过、无阻断条件
- **collect 阶段**: 测试产物复制（有/无 design、plan、prd、behavior）
- **issue 模块**: 测试 issue-resolution 生成、post-hoc 产物生成
- **finalize 阶段**: 测试 staging rename、状态更新
- **report 阶段**: 测试报告格式

### Integration Tests

- 端到端 planned 模式归档（有 acceptance state + readiness = Ready）
- 端到端 ad-hoc 模式归档（无 acceptance state + 有代码变更）
- planned 模式各阻断条件的阻断测试
- worktree commit/merge/cleanup 集成测试

### Regression Tests

- 现有 `tests/commands/` 下的 archive 相关测试全部保留并通过
- archive 目录结构与现有归档结果一致

<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:BEGIN -->
## Cross-Validation Summary

- Status: Passed
- Documents checked in order:
- design.md: present
- behavior.md: present
- Non-blocking gaps: 0
<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:END -->

<!-- OPENFLOW:DESIGN_REVIEW_SUMMARY:BEGIN -->
## Design Sufficiency Review

- Status: Ready
- Structural Completeness: complete
- Design Readiness: ready
- Blocking findings: 0
- Warnings: 0
- Summary: Design covers two archive modes with phased architecture, clear data contracts, failure semantics, and integration boundaries.

### Findings

(none)

### Constraint Coverage Matrix

| Constraint | Goals | Scenarios | Criteria | Architecture | Sufficiency |
|------------|-------|-----------|----------|--------------|-------------|
| 两种归档模式 | 1 | 2 | 2 | 1 | complete |
| 职责解耦 | 1 | 1 | 3 | 1 | complete |
| 向后兼容 | 1 | 2 | 3 | 1 | complete |
| ad-hoc 路径 | 1 | 2 | 2 | 1 | complete |

<!-- OPENFLOW:DESIGN_REVIEW_SUMMARY:END -->
