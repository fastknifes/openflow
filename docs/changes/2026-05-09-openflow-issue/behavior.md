# openflow-issue - Behavior

## Terms

- Issue investigation: 用户描述系统症状，系统搜集证据、分类问题类别，并给出下一步建议的调查流程
- Issue fix: 确认问题分类后，系统执行代码改动、验证质量并完成归档的修复流程
- Readiness: 改动通过全部验证检查后的就绪状态，表示可以归档
- Quality hardening: 对高风险改动自动运行的额外对抗性质量检查，用户无需手动选择
- Quality gate: AI 可调用的 Skill，在实现完成后自动执行 risk-based harden 和 evidence-aware verify
- Context alignment: 验证改动是否与问题调查报告一致，而非检查内部文件是否存在

## Scope

**In scope:**
- `/openflow-issue` 流程重塑：调查、意图路由、修复、留档
- Work Node execute 后，质量门（harden + verify）委托给 openflow-quality-gate
- Issue fix 的质量门委托给 openflow-quality-gate
- Archive 对 issue workspace 的支持（无 design.md、无 plan）
- Issue 修复留档：issue-resolution.md、promotion-candidate.md
- Hook 层 issue-mode 感知，压制 feature 建议噪声

**Out of scope:**
- start-work 的用户交互流程变更
- brainstorm 设计文档生成流程变更
- execute 细节的统一

## Rules

1. **Issue investigation produces classification and routing.** Every investigation outputs a structured report with a classification (code bug, data problem, config issue, behavior change, or unclear) and whether the next step is read-only analysis or code fix.

2. **Issue fixes may be verified and archived without design docs or plan files.** An issue fix requires an investigation report and verification evidence, not a plan file or design document.

3. **Quality gating is delegated to `openflow-quality-gate` after issue resolution.** The AI invokes the quality gate Skill after completing code changes. The quality gate decides whether harden is required and always runs evidence-aware verify. The user is never asked to choose between fast, balanced, or strict modes.

4. **Production environment investigations are read-only.** When `--env production` is specified, the system collects evidence and outputs recommendations but does not execute code changes.

5. **Issue investigation mode suppresses feature-oriented suggestions.** During an active investigation, the system does not suggest `/openflow-brainstorm` or `/openflow-harden`. It shows issue-specific guidance instead.

6. **Issue resolutions are not automatically promoted to current docs without review.** Investigation outcomes generate a promotion-candidate document for manual confirmation before they become project-wide knowledge.

7. **Subsequent investigations search historical resolutions for similar problems.** When a user starts a new investigation, the system checks archived issue records and surfaces relevant prior findings without blocking the current investigation.

## Behavior Scenarios

### Scenario 1: Issue investigation outputs classification and routing

**Given** a user runs `/openflow-issue "api returning 500 on login endpoint"`
**And** there is no existing issue workspace matching this problem

**When** the investigation completes

**Then** the user sees a structured investigation report
**And** the report includes a classification: one of "code bug", "data problem", "config issue", "behavior change", or "unclear"
**And** the report includes routing guidance:
  - If the issue only needs analysis: the user sees the investigation results and the conversation ends
  - If the issue needs a fix: the user is advised to proceed into the fix pipeline

### Scenario 2: Issue fix enters the fix pipeline

**Given** the investigation classification indicates a fix is needed
**And** the user confirms they want to proceed with the fix

**When** the fix code is complete

**Then** the system enters the fix pipeline
**And** the system automatically decides whether to run additional quality checks based on the scope of changes
**And** the system verifies the changes against the investigation report
**And** the system outputs verification evidence and a readiness result

### Scenario 3: Quality gate is delegated to openflow-quality-gate

**Given** `/openflow-issue --resolve` has recorded the issue Work Node state
**And** the AI has completed code changes for the fix

**When** the AI invokes `openflow-quality-gate`

**Then** the quality gate assesses risk from the git diff
**And** trivial/simple changes: the gate skips harden and runs evidence-aware verify
**And** complex or high-risk changes: the gate runs adversarial harden automatically
**And** the gate reuses fresh existing evidence and reruns only stale or missing checks
**And** the gate outputs readiness and evidence summary before the AI claims completion
**And** the user is never asked to choose between fast, balanced, or strict modes

### Scenario 5: Issue fix verified without plan file

**Given** a fix has been implemented
**And** no plan file exists in the project

**When** the system runs verification

**Then** verification does not require a plan file to exist
**And** verification checks whether the changes align with the issue investigation report (issue-clarification.md)
**And** verification outputs evidence and readiness normally
**And** the absence of a plan file does not cause a NotReady result

### Scenario 6: Post-fix documentation artifacts

**Given** the fix pipeline has completed with readiness = Ready

**When** the archive step is about to run

**Then** the system generates issue-resolution.md containing:
  - Symptom: the original problem description
  - Root Cause: the identified cause
  - Fix Summary: the approach used to resolve it
  - Files Involved: which files were changed
  - Verification Evidence: what confirmed the fix works
  - Recurrence Signature: how to recognize the same problem in the future
  - Future AI Guidance: what the next AI should check first for similar issues

**And** the system may generate promotion-candidate.md containing:
  - Which lessons are worth elevating to docs/current or docs/decisions
  - Applies When / Does Not Apply When conditions
  - Review Condition for when this promotion should be considered

### Scenario 7: Archiving an issue workspace

**Given** an issue workspace has issue-clarification.md
**And** the workspace has no design.md and no plan file
**And** the fix pipeline readiness status is Ready

**When** the user runs `/openflow-archive <issue-name>`

**Then** the archive completes successfully even without design documents
**And** the archive completes successfully even without a plan file
**And** issue-clarification.md is copied to the archive
**And** promotion-candidate.md is copied to the archive (if it exists)
**And** issue-resolution.md is generated in the archive
**And** implementation-mapper.md is generated
**And** the docs/changes/ workspace is cleaned up

### Scenario 8: Feature suggestions suppressed during issue investigation

**Given** the current workspace is in issue mode (has issue-clarification.md, no design.md)

**When** the system would normally suggest feature-oriented commands like `/openflow-brainstorm` or `/openflow-harden`

**Then** the system does not show those feature suggestions
**And** instead, the user sees issue-specific guidance:
  ```
  OpenFlow: Issue Investigation Active
  This workspace is in issue-classification mode.
  Next step: collect evidence or classify before starting implementation.
  ```

### Scenario 9: Historical issue search

**Given** a user runs `/openflow-issue "similar problem to last time"`
**And** docs/archive/ contains previous issue-resolution.md files

**When** the investigation starts

**Then** the system searches docs/archive/ and docs/changes/ for matching issue-resolution.md files
**And** if a similar prior issue is found, the user sees:
  ```
  Similar prior issue found:
  - docs/archive/YYYY-MM-DD-issue-xxx/issue-resolution.md
  Suggested first check: [recurrence signature from prior issue]
  ```
**And** the current investigation proceeds without being blocked by historical results

## Boundary Scenarios

### Boundary: Read-only query does not enter fix pipeline

**Given** the investigation classification indicates this is a read-only query (e.g., config check, code understanding)

**When** the investigation completes

**Then** the user sees the analysis results and classification
**And** the system does not enter the fix pipeline
**And** no issue-resolution.md is generated
**And** the user may optionally use `--write-doc` to save the investigation report

### Boundary: Large-scope issue suggests feature workflow

**Given** the investigation reveals that the required changes are large-scale (not just a bug fix)

**When** the classification is "behavior change" and the changes span multiple modules

**Then** the system suggests the user switch to the `/openflow-brainstorm` workflow
**And** the system does not prevent the user from continuing as an issue fix, but marks it as high-risk
**And** if the user chooses to continue as an issue fix, hardening is automatically executed

### Boundary: Production environment is read-only

**Given** the user runs `/openflow-issue xxx --env production`

**When** the investigation enters the fix pipeline

**Then** the system operates in read-only mode (no code changes are executed)
**And** the user only sees investigation results and recommendations
**And** if a fix is needed, the user is prompted to perform it in a local or staging environment

## Non-Goals

- 不改变 start-work 的用户交互流程（仍可询问质量模式）
- 不改变 brainstorm 的设计文档生成流程
- 不强制 issue fix 生成 plan 文件
- 不把 execute 细节统一（feature 和 issue 的执行方式可以不同）

## Test Mapping

This section maps behavior scenarios to their test evidence for traceability.

| Behavior | Evidence Type | Expected Evidence | Status |
|----------|--------------|-------------------|--------|
| Issue investigation outputs classification and routing | test | issue-clarification.md contains classification and recommended_action | pending |
| Issue fix enters the fix pipeline | test | acceptance-state records issue mode, pipeline completes harden+verify | pending |
| Quality gate is delegated to openflow-quality-gate | test | --resolve records Work Node; quality gate invocation delegated | pending |
| Issue fix verified without plan file | test | without plan file, verify outputs readiness=Ready | pending |
| Post-fix documentation artifacts | test | archive contains issue-resolution.md and promotion-candidate.md | pending |
| Archiving an issue workspace | test | archive succeeds without design.md, generates implementation-mapper.md | pending |
| Feature suggestions suppressed during issue investigation | test | during active issue workspace, no brainstorm/harden suggestion is shown | pending |
| Historical issue search | test | prior issue-resolution.md is surfaced with similarity suggestion | pending |
