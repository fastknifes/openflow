# 2026-05-17-quality-gate-scope-contamination - Implementation Mapper

**Date**: 2026-05-17
**Status**: Archived

## 1. 概述

本次变更解决了与 `2026-05-17-quality-gate-scope-contamination` 相关的实现追溯需求。

**归档时间**: 2026-05-17
**追溯范围**: 本次变更覆盖需求到实现的完整追溯链。

## 2. 需求到实现映射

| 追溯来源 | 需求/决策 | 代码文件 | 关键符号 | 关联说明 | 验证证据 |
|----------|-----------|----------|----------|----------|----------|
| changed files | 2026-05-17-quality-gate-scope-contamination archived implementation changes | F:/ai-code/openflow/docs/changes/2026-05-17-quality-gate-scope-contamination/issue-clarification.md | file-level fallback | F:/ai-code/openflow/docs/changes/2026-05-17-quality-gate-scope-contamination/issue-clarification.md \(modified\) | no verification evidence recorded |


## 3. 验证与结论

**验证证据**: no verification evidence recorded



## 4. 根本原因

- **Primary classification**: `bugfix`
- **Classifications considered**: `bugfix`, `implementation_gap`

### Evidence Investigation
- **available_evidence**: source code analysis of `src/commands/quality-gate.ts`, `src/commands/harden.ts`, `src/utils/risk-assessment.ts`, `src/utils/evidence-freshness.ts`, `src/utils/feature-resolver.ts`, plus tests
- **root_cause_identified**: yes
- **root_cause**: `handleQualityGate()` captured workspace diff via `git diff HEAD` and `git ls-files --others --exclude-standard` with no feature-specific path filtering. The resolved feature was used for context and display, not for diff scope. `handleHarden()` already had equivalent feature-diff scoping, but it was not shared with quality-gate.
- **contamination_path**:
  1. `readGitDiff()` captured workspace-wide tracked changes
  2. `readGitUntracked()` captured workspace-wide untracked files
  3. `changedFiles` merged both lists without feature filtering
  4. `decideQualityGateRisk()` evaluated unrelated files
  5. `captureCurrentWorkspaceState()` compared evidence against unrelated files
- **affected_symbols**:
  - `handleQualityGate` — risk/freshness/report scope
  - `scopeDiffToFeature` — extracted to shared utility
  - `resolveChangeUnitDir` — dated issue workspace fallback when index is absent
- **evidence_gaps**: none remaining

### Fix Decision
- **gate_status**: resolved_pending_quality_gate
- **recommended_action**: implementation_completed
- **fix_summary**: Shared diff scoping now filters quality-gate risk/report/freshness to feature-relevant files; dated change-unit fallback resolves issue workspaces without index state.
- **fix_location**:
  - `src/utils/diff-scope.ts`
  - `src/commands/quality-gate.ts`
  - `src/commands/harden.ts`
  - `src/utils/change-units.ts`
- **blocked_by**: final quality-gate readiness only


## 5. 语义契约

### Current Semantics
- **known_requirements**: quality gate must assess the active feature/issue scope, not unrelated local workspace changes
- **implicit_requirements**:
  - risk assessment should not be inflated by unrelated files
  - evidence freshness should not become stale because of unrelated files
  - quality-gate report should distinguish scoped files from unrelated omitted files
- **requirement_gaps**: none remaining
- **recommended_sources**: source code, regression tests, issue-resolution.md

### Violated Semantics
- **environment_constraint**: local
- **modification_constraint**: bugfix implementation allowed by `/openflow-issue quality-gate-scope-contamination --resolve`
- **docwrite_constraint**: maintain issue clarification, issue resolution, and promotion candidate artifacts
- **continuation_constraint**: resolved issue work node

### Undefined Semantics
- **semantic_hypothesis**: confirmed bugfix — quality-gate scope contamination
- **contradictory_signals**: none
- **disambiguation_needed**: no
- **symptom_manifestations**:
  1. unrelated files push file count to high-risk thresholds
  2. unrelated files make evidence freshness stale
  3. report lists unrelated files as active changed files
  4. dated issue workspace may be missed when `.sisyphus/change-units.json` is absent


## 6. 问题分类

- **Primary**: `bugfix`
- **All classifications**: `bugfix`, `implementation_gap`
- **Description**: Code defect requiring a fix


## 7. 治理提升

- **Status**: `candidate_created`
- **Candidate archived at**: `F:\\ai-code\\openflow\\docs\\archive\\2026-05-17-2026-05-17-quality-gate-scope-contamination\\promotion-candidate.md`

### Proposed Decision
Future similar bugfix investigations should first inspect this issue's clarification and resolution archive before changing quality-gate scope, risk, or evidence freshness behavior.


## 8. 追溯链路

| Step | Detail |
|------|--------|
| Issue | `2026-05-17-quality-gate-scope-contamination` |
| Root cause | `bugfix` |
| Changed symbols / files | `F:\\ai-code\\openflow\\docs\\changes\\2026-05-17-quality-gate-scope-contamination\\issue-clarification.md`, `F:\\ai-code\\openflow\\src\\index.ts`, `F:\\ai-code\\openflow\\docs\\current\\workflow\\openflow-usage-tutorial.md`, `F:\\ai-code\\openflow\\docs\\current\\workflow\\openflow-usage-tutorial.en.md`, `F:\\ai-code\\openflow\\README.md`, `F:\\ai-code\\openflow\\README_CN.md`, `C:\\Users\\Administrator\\.config\\opencode\\skills\\openflow-brainstorm\\SKILL.md` |
| Tests / verification | no verification evidence |
| Promoted current / decision entries | none (governance: `governance candidate_created`) |

