## OpenFlow Issue Clarification

Case: /openflow-archive \<feature\> 当前只读取全局 .sisyphus/acceptance.local.md 的 readiness，导致目标 feature 与当前 acceptance state 不一致时出现错误阻塞或错误放行。例如 rename-brainstorm-to-feature 已完成并可验证，但 archive 被旧 feature openflow-writing-plan 的 not_ready readiness 阻塞；随后 handleVerify\(ctx, explicitFeature\) 计算的是显式 feature，却把 verify result 写入当前 acceptance state feature，造成 readiness 归属错位。需要优化 archive/verify 的目标 feature 绑定、参数清洗以及无参数 archive 的行为，避免 slash-command 元信息或尾随 markdown 符号污染 feature 名。
Slug: `archive-feature-readiness-binding`
Environment: `local`

### 1. Issue Intake
- **raw_case_text**: /openflow-archive \<feature\> 当前只读取全局 .sisyphus/acceptance.local.md 的 readiness，导致目标 feature 与当前 acceptance state 不一致时出现错误阻塞或错误放行。例如 rename-brainstorm-to-feature 已完成并可验证，但 archive 被旧 feature openflow-writing-plan 的 not_ready readiness 阻塞；随后 handleVerify\(ctx, explicitFeature\) 计算的是显式 feature，却把 verify result 写入当前 acceptance state feature，造成 readiness 归属错位。需要优化 archive/verify 的目标 feature 绑定、参数清洗以及无参数 archive 的行为，避免 slash-command 元信息或尾随 markdown 符号污染 feature 名。
- **issue_slug**: archive-feature-readiness-binding
- **environment**: local
- **mode_flags**: write-doc, name=archive-feature-readiness-binding
- **intake_status**: case_text_received


### 2. Requirement Clarification
- **known_requirements**: none (no requirement source provided)
- **implicit_requirements**: issue_intake_only (no design/PRD/spec context referenced)
- **requirement_gaps**: the issue description alone is insufficient to infer concrete requirements; additional evidence or disambiguation is needed
- **recommended_sources**: current design docs, PRD, relevant decisions, test cases, error logs

### 3. Constraint Clarification
- **environment_constraint**: local
- **modification_constraint**: no automatic code or data changes without explicit approval
- **docwrite_constraint**: will write clarification to docs/changes/{date}-archive-feature-readiness-binding/issue-clarification.md
- **continuation_constraint**: fresh issue intake

### 4. Evidence Investigation
- **available_evidence**: user-provided case description only
- **missing_evidence**: error messages, stack traces, logs, reproduction steps, affected files, configuration context, environment variables, recent changes
- **evidence_gaps**: high — cannot classify or recommend action without additional evidence
- **next_evidence_step**: gather error logs, reproduction steps, affected code paths, and environment details before attempting classification

### 5. Semantic Alignment
- **semantic_hypothesis**: unknown — insufficient evidence to map the reported issue to a known semantic category
- **potential_alignments**: the case text suggests a problem but no clear semantic category is evident without further investigation
- **disambiguation_needed**: yes — user should clarify whether this is a bug, data issue, config issue, environment issue, documentation ambiguity, or behavior change request
- **contradictory_signals**: none detected (no conflict with current decisions or design docs identified at this stage)

### 6. Classification
- **primary_classification**: `cannot_determine`
- **classification_confidence**: low
- **all_classifications**: [cannot_determine]
- **classification_rationale**: insufficient evidence to determine whether this is a bugfix, data issue, config issue, environment issue, doc ambiguity, or behavior change. Classification remains conservative by default — explicit evidence or user disambiguation is required to assign a non-default classification.

### 7. Next Action Gate
- **gate_status**: blocked_on_evidence
- **recommended_action**: gather_additional_evidence
- **alternative_action**: user_disambiguation
- **required_inputs**: case description with error details, reproduction steps, affected code paths, environment specifics
- **deferred_actions**: clarification doc will be written to docs/changes/{date}-archive-feature-readiness-binding/
- **blocked_by**: insufficient_evidence_for_classification

### 8. Governance Promotion
- **governance_status**: `none`
- **promotion_blockers**: classification is `cannot_determine` — promotion requires a confirmed classification with supporting evidence
- **required_for_promotion**: confirmed issue classification, verified evidence, explicit user approval
- **decision_impact**: no decisions or current-state changes are proposed at this stage
- **next_governance_step**: complete evidence gathering and classification before considering promotion to `candidate_created` or further governance states
