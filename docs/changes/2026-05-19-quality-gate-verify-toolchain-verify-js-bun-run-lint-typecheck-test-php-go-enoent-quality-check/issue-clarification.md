## OpenFlow Issue Clarification

Case: quality gate verify step hardcodes JS toolchain commands, fails on PHP/Go projects
Slug: `quality-gate-verify-toolchain`
Environment: `local`

### 1. Issue Intake
- **raw_case_text**: 质量门 verify 步骤的 quality check 命令硬编码为 bun 工具链（bun test/bun run typecheck/bun run lint），在 PHP+Go 项目中永远失败返回 ENOENT。
- **issue_slug**: quality-gate-verify-toolchain
- **environment**: local
- **mode_flags**: investigation
- **intake_status**: root_cause_confirmed_by_code_analysis

### 2. Requirement Clarification
- **known_requirements**:
  - quality gate verify 步骤不应执行代码级验证命令（lint/typecheck/test/format）
  - 代码级验证由实现节点根据项目语言/框架智能执行并记录证据
  - quality gate 应聚焦文档漂移、行为证据、语义对齐和归档 readiness
- **implicit_requirements**:
  - TDD 模式下单元测试由实现流程负责，quality gate 不重复执行
  - BDD 行为文档应指导集成验证证据，而不是由 quality gate 硬编码测试工具
  - 工具链缺失应表现为“缺少证据”或“不适用”，而不是代码质量失败
- **requirement_gaps**: 当前 verify 仍把 quality checks 建模为可执行命令，和 evidence judge 定位不一致
- **recommended_sources**: src/commands/verify.ts L951-962 (getQualityCommandSpec), src/commands/verify.ts L448-464 (runQualityChecks), src/commands/verify.ts L964-991 (runCommand), src/types.ts L56 (QualityCheckType), src/types.ts L277 (defaultConfig)

### 3. Constraint Clarification
- **environment_constraint**: local
- **modification_constraint**: 此为独立 issue，与 quality-gate-untracked-omission 无直接关联
- **docwrite_constraint**: 创建 issue-clarification.md，后续按需创建 issue-resolution.md
- **continuation_constraint**: 先完成调查和文档记录，实现由用户决定时机

### 4. Evidence Investigation
- **available_evidence**: 完整代码分析 — src/commands/verify.ts (1283行)
- **root_cause_identified**: yes
- **root_cause**:
  `getQualityCommandSpec` 函数（verify.ts L951-962）硬编码了 bun 命令，且 `runQualityChecks` 把 quality gate 建模为代码级 test runner。根本问题不是缺少配置项，而是职责边界错误：代码级验证应由实现节点/QA 节点完成，quality gate 应作为 evidence judge 判断文档与行为证据是否充分。

  代码路径：
  1. `handleVerify()` → `collectEvidence()` (L168)
  2. `collectEvidence()` → `runQualityChecks(ctx)` (L281)
  3. `runQualityChecks()` 遍历 `ctx.config.verification.quality` 中的每个检查类型 (L451)
  4. 对每个检查类型调用 `getQualityCommandSpec(checkName)` 获取硬编码命令 (L452)
  5. `getQualityCommandSpec` 返回固定命令：
     ```typescript
     case 'test':    return { command: 'bun', args: ['test'], ... }
     case 'typecheck': return { command: 'bun', args: ['run', 'typecheck'], ... }
     case 'lint':    return { command: 'bun', args: ['run', 'lint'], ... }
     case 'format':  return { command: 'bun', args: ['run', 'format'], ... }
     ```
  6. `runCommand()` 通过 `child_process.spawn` 执行命令 (L966)
  7. 在 PHP+Go 项目中，bun 不存在 → ENOENT → 所有 quality 检查失败

- **affected_symbols**:
  - `getQualityCommandSpec` — 命令硬编码
  - `runQualityChecks` — 调用方，无 fallback
  - `ctx.config.verification.quality` — 配置只支持检查类型选择，不支持自定义命令
  - `QualityCheckType` — 类型定义（'lint' | 'typecheck' | 'test' | 'format'），不支持自定义
- **evidence_gaps**: none

### 5. Semantic Alignment
- **semantic_hypothesis**: confirmed configuration gap — 工具链命令应可配置而非硬编码
- **contradictory_signals**: none
- **disambiguation_needed**: no
- **symptom_manifestations**:
  1. PHP/Go 项目中 `bun run lint` → ENOENT
  2. Python 项目中 `bun run typecheck` → ENOENT
  3. 任何非 JS/TS 项目中所有 quality 检查全部失败
  4. verify 输出标记 `quality_checks_failed`，但实际代码质量可能完全正常
  5. 用户看到误导性"失败"报告，无法区分真正的质量问题 vs 工具链不匹配

### 6. Classification
- **primary_classification**: `bugfix` / `workflow-design`（职责边界缺陷）
- **classification_confidence**: high
- **all_classifications**: [bugfix]
- **classification_rationale**: 这不是单纯配置覆盖不足，而是 workflow 边界错误。Quality Gate 不应绑定或执行代码级测试工具；它应判断由实现节点产生的验证证据是否覆盖文档/行为约束。

### 7. Next Action Gate
- **gate_status**: pending_implementation
- **recommended_action**:
  删除 quality gate 中的代码级命令执行逻辑。`runQualityChecks` 不再调用 shell 命令，而是将 lint/typecheck/test/format 标记为实现节点负责的 informational evidence。后续增强应围绕 behavior evidence / integration evidence，而不是新增命令配置。
- **fix_summary**: 将 Quality Gate 从 code test runner 收敛为 document/behavior evidence judge
- **fix_location**:
  - `src/commands/verify.ts` — runQualityChecks, getQualityCommandSpec, runCommand
  - `docs/changes/2026-05-20-quality-gate-evidence-judge/*` — 约束文档
- **blocked_by**: implementation and verification evidence

### 8. Governance Promotion
- **governance_status**: `candidate_pending`
- **promotion_blockers**: 实现和测试完成后创建 promotion-candidate
- **required_for_promotion**: quality gate readiness
- **decision_impact**: 使 quality gate 的 verify 步骤从“代码级命令执行器”变为“文档/行为证据裁判”
- **next_governance_step**: 实现 → quality-gate → archive

### 9. Recommended Next Step
- **classification**: `bugfix` (high confidence)
- **recommendation**: 删除代码级命令执行，保留文档漂移、行为证据、语义对齐和 readiness 判断
- **next_step**: 完成实现验证并记录 issue resolution
