## OpenFlow Issue Clarification

Case: quality-gate scope includes unrelated workspace changes
Slug: `quality-gate-scope-contamination`
Environment: `local`

### 1. Issue Intake
- **raw_case_text**: quality-gate scope includes unrelated workspace changes
- **issue_slug**: quality-gate-scope-contamination
- **environment**: local
- **mode_flags**: resolve
- **intake_status**: case_text_received

### 2. Requirement Clarification
- **known_requirements**: quality gate must assess the active feature/issue scope, not unrelated local workspace changes
- **implicit_requirements**:
  - risk assessment should not be inflated by unrelated files
  - evidence freshness should not become stale because of unrelated files
  - quality-gate report should distinguish scoped files from unrelated omitted files
- **requirement_gaps**: none remaining
- **recommended_sources**: source code, regression tests, issue-resolution.md

### 3. Constraint Clarification
- **environment_constraint**: local
- **modification_constraint**: bugfix implementation allowed by `/openflow-issue quality-gate-scope-contamination --resolve`
- **docwrite_constraint**: maintain issue clarification, issue resolution, and promotion candidate artifacts
- **continuation_constraint**: resolved issue work node

### 4. Evidence Investigation
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

### 5. Semantic Alignment
- **semantic_hypothesis**: confirmed bugfix — quality-gate scope contamination
- **contradictory_signals**: none
- **disambiguation_needed**: no
- **symptom_manifestations**:
  1. unrelated files push file count to high-risk thresholds
  2. unrelated files make evidence freshness stale
  3. report lists unrelated files as active changed files
  4. dated issue workspace may be missed when `.sisyphus/change-units.json` is absent

### 6. Classification
- **primary_classification**: `bugfix`
- **classification_confidence**: high
- **all_classifications**: [bugfix, implementation_gap]
- **classification_rationale**: The quality gate incorrectly used full workspace changes where feature/issue-scoped changes were required. Existing harden scoping demonstrated the intended behavior and was extracted for reuse.

### 7. Next Action Gate
- **gate_status**: resolved_pending_quality_gate
- **recommended_action**: implementation_completed
- **fix_summary**: Shared diff scoping now filters quality-gate risk/report/freshness to feature-relevant files; dated change-unit fallback resolves issue workspaces without index state.
- **fix_location**:
  - `src/utils/diff-scope.ts`
  - `src/commands/quality-gate.ts`
  - `src/commands/harden.ts`
  - `src/utils/change-units.ts`
- **blocked_by**: final quality-gate readiness only

### 8. Governance Promotion
- **governance_status**: `candidate_created`
- **promotion_blockers**: none for issue classification; final archive still depends on quality gate readiness
- **required_for_promotion**: quality gate readiness and user approval before promotion to current/decisions
- **decision_impact**: quality-gate behavior is now scoped to active feature/issue context when scope evidence exists; full-workspace behavior remains fallback for limited/none context
- **next_governance_step**: run quality gate, then archive if ready

### 9. Recommended Next Step
- **classification**: `bugfix` (high confidence)
- **recommendation**: Keep the implemented scoped quality-gate behavior
- **next_step**: Quality gate verification, then archive when ready
