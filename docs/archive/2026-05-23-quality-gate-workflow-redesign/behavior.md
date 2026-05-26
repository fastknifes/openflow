# Quality Gate Workflow Redesign - Observable Behavior

## Human Consensus Summary

Feature title: Quality Gate Workflow Redesign
Internal slug: quality-gate-workflow-redesign

The user-visible outcome is a Quality Gate workflow that is easier to inspect, produces clearer Harden decisions, verifies behavior through integration evidence, preserves archive readiness semantics, and removes stale workflow logic.

## Trigger Rules

The redesigned behavior applies when:

- An implementation or bug fix reaches the post-implementation Quality Gate phase.
- Quality Gate must decide whether the work is ready for archive.
- Harden is required by risk or workflow context.
- Behavior scenarios exist and need evidence coverage.
- Archive consumes Quality Gate readiness.
- The system exposes stale issue-mode, old harden/verify, or empty coordinator-session behavior during this workflow.

## Non-Trigger Rules

The redesigned behavior does not apply to:

- Design-only discussion with no implementation readiness check.
- Planning-only work before implementation.
- Pure documentation edits unless explicitly verified for readiness/archive.
- Unrelated product workflows outside Quality Gate, Harden, Verify, Evidence, and Archive readiness.

## User-Visible Scenarios

### SC-001: Quality Gate exposes a visible run session

**Criticality:** critical

**Given:**
- Implementation work is complete.
- The AI invokes Quality Gate.

**When:**
- Quality Gate starts.

**Then:**
- A visible session named or clearly labeled `Quality Gate: {feature}` exists.
- The session records context, scope, applicability, risk assessment, Harden progress, Verify summary, and readiness.
- The main conversation receives a concise final summary with the Quality Gate session reference.

### SC-002: Harden Reviewer and Executor are linked under the Quality Gate session

**Criticality:** critical

**Given:**
- Quality Gate decides Harden is required.

**When:**
- Harden starts its review loop.

**Then:**
- Reviewer and Executor sessions are created as children or clearly linked descendants of the Quality Gate session.
- No empty Harden Coordinator session is presented as the primary visible container.
- The Quality Gate session records each round summary and finding disposition.

### SC-003: Explicit behavior or spec violation is fixed by implementation changes

**Criticality:** critical

**Given:**
- `behavior.md`, `design.md`, `plan.md`, `docs/current`, or `docs/decisions` explicitly requires behavior X.
- The implementation does behavior Y instead.

**When:**
- Harden Reviewer examines the implementation.

**Then:**
- Harden records a `behavior_violation` or `spec_violation` finding.
- Executor is allowed to fix implementation code within scope.
- Readiness remains blocked until the finding is fixed or otherwise resolved.

### SC-004: Document gap with inferable intent does not automatically block

**Criticality:** critical

**Given:**
- Approved documents do not explicitly cover an implementation case.
- The surrounding behavior/design/current context supports a high- or medium-confidence inferred intent.
- The implementation aligns with that inferred intent.

**When:**
- Harden classifies the gap.

**Then:**
- Harden records an `intent_gap` with evidence, inferred intent, confidence, and alignment.
- The workflow does not block solely because the document is incomplete.
- The main conversation reports the inferred intent and required doc update.
- Readiness may be `ReadyWithDocUpdates` if Verify evidence passes.

### SC-005: Document gap with misaligned implementation is fixed

**Criticality:** critical

**Given:**
- Approved documents do not explicitly cover an implementation case.
- Harden can infer user intent with high or medium confidence.
- The implementation does not align with that inferred intent.

**When:**
- Harden classifies the gap.

**Then:**
- Harden records `intent_gap` with decision `fix_implementation`.
- Executor fixes implementation code within scope.
- Quality Gate continues after the fix and reruns the necessary checks.

### SC-006: Uninferable intent blocks for decision

**Criticality:** critical

**Given:**
- Approved documents do not cover a case.
- Multiple reasonable interpretations exist, or confidence is low.

**When:**
- Harden runs Intent Inference.

**Then:**
- Harden records `intent_gap` with decision `needs_decision`.
- Readiness becomes `NeedsDecision`.
- The main conversation reports the exact decision needed.

### SC-007: Contract divergence requires explicit decision

**Criticality:** critical

**Given:**
- Implementation changes or contradicts an approved contract.
- The change may be reasonable but changes expected behavior or workflow semantics.

**When:**
- Harden reviews the change.

**Then:**
- Harden records `contract_divergence`.
- Executor does not silently change docs or approve the divergence.
- Quality Gate reports `NeedsDecision` unless a prior explicit decision authorizes the change.

### SC-008: Missing behavior evidence blocks critical scenario readiness

**Criticality:** critical

**Given:**
- `behavior.md` contains a critical scenario.
- No fresh exact or equivalent evidence exists for that scenario.

**When:**
- Verify evaluates Behavior Evidence.

**Then:**
- Verify records a behavior evidence gap.
- Readiness is `NotReady` or `NeedsDecision` depending on the gap.
- The report identifies the scenario that lacks evidence.

### SC-009: Integration evidence verifies critical behavior

**Criticality:** critical

**Given:**
- A critical behavior scenario has an evidence file under `.sisyphus/evidence/`.
- The evidence references an integration test or equivalent verification.
- The evidence is fresh and passing.

**When:**
- Verify evaluates Behavior Evidence.

**Then:**
- The scenario is marked verified when coverage is `exact` or `equivalent` with rationale.
- The evidence contributes to `Ready` or `ReadyWithDocUpdates`.

### SC-010: Implementation Mapper records behavior to code traceability

**Criticality:** critical

**Given:**
- Quality Gate reaches `Ready` or `ReadyWithDocUpdates`.
- Behavior Evidence contains core code mappings.

**When:**
- Implementation Mapper is generated.

**Then:**
- `docs/changes/{feature}/implementation-mapper.md` records scenario ID, behavior, evidence reference, and core code files.
- Archive can preserve the behavior -> evidence -> code trace.

### SC-011: Ready for archive is not the same as archived

**Criticality:** critical

**Given:**
- Quality Gate returns `Ready` or `ReadyWithDocUpdates`.

**When:**
- The workflow updates implementation run status.

**Then:**
- The run becomes `ready_for_archive` or equivalent internal state.
- The user-facing label indicates “Awaiting Archive Confirmation”.
- Archive does not run until the user explicitly confirms archive.

### SC-012: Limited context does not grant semantic archive readiness

**Criticality:** critical

**Given:**
- Quality Gate can run only limited-context technical verification.
- Full behavior/design context is unavailable.

**When:**
- Quality Gate reports readiness.

**Then:**
- The report distinguishes technical verification from semantic archive readiness.
- The workflow does not mark the run `ready_for_archive` solely from limited-context technical checks.

### SC-013: Deprecated issue-mode user-facing workflow is not exposed as active Quality Gate path

**Criticality:** boundary

**Given:**
- Existing code or docs contain legacy issue-mode references.

**When:**
- The redesigned Quality Gate workflow is installed or documented.

**Then:**
- Removed issue-mode commands are not presented as active normal workflow entry points.
- Compatibility-only fields are documented as such or removed with tests.

### SC-014: Main conversation receives a concise Quality Gate result

**Criticality:** critical

**Given:**
- Quality Gate has completed.

**When:**
- Control returns to the main conversation.

**Then:**
- The user sees readiness, Harden status, Verify status, blocker count, doc update count, and archive confirmation requirement.
- Detailed review evidence remains available in the Quality Gate session and child sessions.

## Required Content

Successful implementation must include observable support for:

- Quality Gate visible session lifecycle.
- Harden finding taxonomy: `behavior_violation`, `spec_violation`, `intent_gap`, `contract_divergence`, `regression_risk`, `missing_evidence`.
- Intent inference with evidence, confidence, alignment, and final decision.
- Behavior Evidence coverage checks for critical scenarios.
- Implementation Mapper generation from behavior evidence.
- Archive readiness state that is separate from archived completion.
- Legacy cleanup or documented compatibility fallback for stale Quality Gate-related paths.

## Must Not Behavior

- Must not treat an empty Harden Coordinator session as the primary visible Quality Gate process.
- Must not let AI inference override explicit behavior, design, current, or decision constraints.
- Must not silently accept contract divergence.
- Must not mark critical behavior verified without fresh exact/equivalent evidence.
- Must not auto-run archive after Quality Gate readiness.
- Must not expose removed issue-mode commands as normal active workflow.
- Must not add new workflow layers without cleaning or converging obsolete branches.

## Acceptance / Verification Mapping

| Acceptance Criterion | Scenario | Evidence Type | Expected Evidence | Status |
|---|---|---|---|---|
| Quality Gate visible session exists and receives progress | SC-001 | test/log | Session title/reference plus stage records | pending |
| Harden child sessions link to Quality Gate session | SC-002 | test/log | Reviewer/Executor session parent or explicit linkage | pending |
| Explicit behavior/spec violations block until fixed | SC-003 | unit/integration test | Finding classified and readiness blocked before fix | pending |
| Inferable intent gap can pass with doc update report | SC-004 | unit test | `intent_gap` accepted with evidence and ReadyWithDocUpdates allowed | pending |
| Misaligned inferred intent triggers implementation fix | SC-005 | unit/integration test | Executor receives fixable finding and status clears after fix | pending |
| Low-confidence intent gap produces NeedsDecision | SC-006 | unit test | Readiness is NeedsDecision with explicit question | pending |
| Contract divergence blocks without explicit decision | SC-007 | unit test | `contract_divergence` maps to NeedsDecision | pending |
| Missing critical evidence blocks readiness | SC-008 | verify test | Missing scenario evidence yields NotReady/NeedsDecision | pending |
| Fresh integration evidence verifies critical behavior | SC-009 | verify test | exact/equivalent fresh evidence passes scenario | pending |
| Implementation Mapper records scenario/evidence/code | SC-010 | mapper test | mapper table includes scenario ID, evidence, core files | pending |
| Ready for archive remains awaiting confirmation | SC-011 | archive/quality-gate test | `ready_for_archive` set; archive not run automatically | pending |
| Limited context does not grant archive readiness | SC-012 | quality-gate test | limited-context result not archive eligible | pending |
| Deprecated issue-mode workflow is not active | SC-013 | docs/registration test | removed command not registered or presented as normal path | pending |
| Main conversation receives concise final summary | SC-014 | output test | summary includes session, readiness, blocker/doc counts, archive note | pending |
