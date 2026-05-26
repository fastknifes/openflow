# Quality Gate Workflow Redesign - Design

## Human Consensus Summary

Feature title: Quality Gate Workflow Redesign
Internal slug: quality-gate-workflow-redesign

This change redesigns the Quality Gate workflow around five agreed decisions:

1. Harden uses an explicit contract-alignment judgment model.
2. Quality Gate creates one visible session that owns the whole gate process.
3. Behavior Evidence is produced from integration-test evidence and maps behavior to core code.
4. Archive readiness remains distinct from archive completion.
5. Legacy branches and duplicated responsibilities must be cleaned up while implementing the redesign.

## Problem

The current Quality Gate design is powerful but hard to observe and reason about:

- Harden may create a parent session that appears empty because orchestration happens in the tool handler, not in the visible session.
- Reviewer and Executor sessions can appear disconnected from the user-facing Quality Gate result.
- Harden finding categories do not clearly distinguish explicit behavior violations, inferred intent gaps, contract divergence, and missing evidence.
- Behavior Evidence is too document/manual oriented and should become integration-test-backed evidence.
- Archive readiness is easy to confuse with completed archive.
- Removed or deprecated concepts, especially legacy issue-mode paths and old harden/verify workflow assumptions, remain in code and documentation.

## Goals

- Make Quality Gate execution visible, inspectable, and attributable.
- Make Harden judge implementation against approved behavior/design contracts with clear outcomes.
- Allow documented intent gaps to continue when intent can be inferred with evidence, without silently changing requirements.
- Use integration evidence to prove critical behavior scenarios and generate traceability from behavior to code.
- Preserve `ready_for_archive` as a workflow state while clarifying that archive still requires explicit user confirmation.
- Clean up obsolete branches and duplicated logic instead of layering new workflow logic on top of stale code.

## Non-Goals

- Do not make Quality Gate a free-form autonomous agent.
- Do not let Harden rewrite requirements or silently approve contract changes.
- Do not make Archive rerun Quality Gate, Harden, Verify, or integration tests.
- Do not require every lightweight technical fix to create full semantic feature documents.
- Do not reintroduce removed issue-mode commands or product surface.

## Design Overview

The redesigned workflow is:

```text
Implementation complete
  -> Quality Gate visible session starts
    -> Context and scope are resolved
    -> Risk is assessed
    -> Harden reviews implementation against approved contracts
      -> Reviewer identifies findings
      -> Coordinator classifies findings
      -> Executor fixes only authorized implementation deviations
      -> Intent gaps are inferred or escalated
    -> Verify checks behavior/integration evidence and consistency
    -> Readiness is classified
    -> Main conversation receives concise summary
  -> Archive may run only after explicit user confirmation
```

Quality Gate remains a deterministic workflow orchestrator. The visible Quality Gate session is an execution container and audit surface, not an independent decision-making agent.

## 1. Harden Judgment Model

### Contract Sources

Harden judges code against approved context in this priority order:

1. `docs/decisions/*`
2. `docs/current/*`
3. `docs/changes/{feature}/behavior.md`
4. `docs/changes/{feature}/design.md`
5. `docs/changes/{feature}/plan.md`
6. Current user request, when available in workflow context
7. Git diff and implementation files

Higher-priority sources override lower-priority sources. AI inference is allowed only when documents do not cover the case; it must not override explicit requirements.

### Finding Types

| Finding | Meaning | Default action | Blocks readiness? |
|---|---|---|---|
| `behavior_violation` | Code violates explicit `behavior.md` behavior | Fix implementation | Yes until fixed |
| `spec_violation` | Code violates explicit design, plan, current facts, or decisions | Fix implementation | Yes until fixed |
| `intent_gap` | Documents do not cover a case, but intent may be inferable | Enter Intent Inference branch | Depends on inference |
| `contract_divergence` | Implementation changes or contradicts approved contract | NeedsDecision | Yes |
| `regression_risk` | Evidence suggests existing behavior may break | Fix or test when high-confidence; otherwise report | High-confidence blocks |
| `missing_evidence` | Implementation may be correct, but behavior/test evidence is absent | Defer to Verify | Verify decides |

### Intent Inference Branch

When Reviewer finds `intent_gap`, Coordinator must not stop immediately. It runs an inference branch:

```text
intent_gap
  -> infer user intent from approved context
  -> require evidence references
  -> classify confidence: high / medium / low
  -> classify implementation alignment: aligned / misaligned / unknown
```

Outcomes:

| Inference result | Implementation alignment | Decision | Readiness effect |
|---|---|---|---|
| high or medium confidence | aligned | Accept with doc update report | ReadyWithDocUpdates allowed |
| high or medium confidence | misaligned | Fix implementation | Continue Harden |
| low confidence or conflicting interpretations | unknown | NeedsDecision | Blocks |

Intent inference must include:

- Missing coverage statement
- Inferred intent
- Evidence from behavior/design/plan/current/decisions
- Confidence level
- Implementation alignment
- Final decision: `accept_with_doc_update`, `fix_implementation`, or `needs_decision`
- Summary to report to the main conversation

### Coordinator Responsibilities

Coordinator is the Quality Gate workflow controller. It:

- Classifies Reviewer findings.
- Sends fixable findings to Executor.
- Starts rebuttal only when Reviewer and Executor disagree on evidence.
- Makes final finding disposition.
- Reports unresolved decisions upward.

Coordinator does not modify code directly.

## 2. Quality Gate Visible Session Model

Quality Gate creates one top-level visible session for the gate run:

```text
Main conversation
  -> Quality Gate: {feature}
       -> 00 Context & Scope
       -> 01 Risk Assessment
       -> 02 Harden Review
            -> Round N - Reviewer
            -> Round N - Executor
            -> Round N - Rebuttal, if needed
            -> Round Summary
       -> 03 Verify / Behavior Evidence
       -> 04 Readiness Decision
       -> 05 Report to Main
```

The old empty Harden Coordinator parent session should be removed or repurposed. Quality Gate session is the coordinator container. Reviewer and Executor sessions must be children or clearly linked descendants of the Quality Gate session.

The Quality Gate session must record stage progress:

- Gate start metadata
- Context kind and resolved feature
- Changed files and scoped/omitted files
- Applicability result
- Risk assessment and harden decision
- Each Harden round summary
- Intent gap decisions
- Verify evidence summary
- Readiness and next step

The main conversation receives only the final summary:

- Quality Gate session ID/title
- Harden status
- Verify status
- Readiness
- Blocking issue count
- Doc update count
- Whether archive confirmation is required

## 3. Behavior Evidence And Integration Test Evidence

`behavior.md` is the behavior contract. Integration tests prove that critical behavior works. Evidence files preserve the proof. Implementation Mapper connects behavior, evidence, and code.

### Behavior Scenario Requirements

Each behavior scenario should have:

- Stable Scenario ID, such as `SC-001`
- Criticality: `critical`, `optional`, or `boundary`
- Given / When / Then or equivalent observable behavior
- Expected observable result

### Evidence Production

Implementation or CI produces evidence after running integration-level checks. Quality Gate does not hardcode project-specific test commands, but it validates evidence shape and freshness.

Evidence files live under:

```text
.sisyphus/evidence/{scenario-id}-{slug}.md
```

Evidence must include:

- Scenario reference
- Evidence type, usually `integration_test`, `api_smoke`, `e2e`, `qa_record`, or `manual_repro`
- Test file or verification method
- Command or execution steps
- Result: pass/fail
- Timestamp and git HEAD or equivalent freshness metadata
- Coverage rationale
- Core code mapping

### Verify Responsibilities

Verify checks:

- Every critical scenario has fresh exact/equivalent evidence.
- Equivalent evidence has a rationale.
- Partial or missing critical evidence blocks readiness.
- Optional or boundary evidence gaps are advisory unless marked blocking.
- Core code mapping exists for archive traceability.

### Implementation Mapper

When readiness allows archive, Quality Gate or archive preparation generates:

```text
docs/changes/{feature}/implementation-mapper.md
```

The mapper records:

| Scenario ID | Behavior | Evidence Ref | Core Code Files |
|---|---|---|---|

This preserves the traceability chain: behavior -> evidence -> implementation.

## 4. Archive Readiness Model

Quality readiness and workflow lifecycle are distinct.

| Layer | Status | Meaning |
|---|---|---|
| Quality readiness | `Ready` | Quality evidence passed; archive may be requested |
| Quality readiness | `ReadyWithDocUpdates` | Quality evidence passed, but docs must be synced or reported |
| Quality readiness | `NotReady` | Blocking evidence or findings remain |
| Quality readiness | `NeedsDecision` | Human/product/architecture decision required |
| Quality readiness | `LimitedContextReady` | Technical checks passed without full semantic archive eligibility |
| Workflow run | `ready_for_archive` | Quality Gate passed; waiting for explicit archive confirmation |
| Workflow run | `archived` | Archive completed |
| Workflow run | `blocked` | Cannot continue until blockers are resolved |

Mapping:

| Quality Gate result | Workflow status |
|---|---|
| `Ready` | `ready_for_archive` |
| `ReadyWithDocUpdates` | `ready_for_archive` plus doc update marker/report |
| `NotReady` | `blocked` |
| `NeedsDecision` | `blocked` |
| `LimitedContextReady` | not archive eligible unless later workflow explicitly upgrades context |

`ready_for_archive` must remain. It means “awaiting explicit archive confirmation,” not “archive completed.”

Archive consumes readiness and evidence. Archive does not rerun quality judgment.

## 5. Legacy Cleanup And Responsibility Convergence

Implementation must remove or converge old logic while adding the redesign.

Cleanup targets include:

- Removed issue-mode user-facing paths and stale `/openflow-issue` documentation or command residues, where no longer supported.
- Empty Harden Coordinator session behavior.
- Duplicated drift utilities, especially repeated keyword/contract drift checks across Guardian, Verify adapters, and legacy utilities.
- Confusing readiness consumption paths. `AcceptanceState.readiness` and `verifyResult.readiness` may remain for compatibility, but the canonical source and fallback order must be documented.
- Obsolete references to manual `/openflow-harden` or `/openflow-verify` as normal user workflow steps.

Cleanup must be incremental and test-backed. Do not remove compatibility fields without migrating existing consumers or adding safe fallbacks.

## Risks And Mitigations

| Risk | Mitigation |
|---|---|
| AI uses intent inference to invent requirements | Require evidence references and confidence classification; low confidence blocks |
| Visible sessions add noisy output | Main conversation receives summary only; detailed trace stays in Quality Gate session |
| `ready_for_archive` is misunderstood as archived | User-facing label is “Awaiting Archive Confirmation” |
| Behavior Evidence becomes too manual | Prefer integration-test-backed evidence; manual evidence allowed only when explicitly categorized |
| Cleanup breaks legacy state | Use compatibility fallback and targeted tests before removing fields |
| Verify and Guardian drift logic diverge | Extract shared drift primitives or document final-judge boundary |

## Success Criteria

- Quality Gate creates or identifies a visible Quality Gate session for the run.
- Harden no longer creates an empty top-level Coordinator session as the primary visible container.
- Harden findings use the redesigned finding taxonomy.
- Intent gaps are inferred, accepted with doc update, fixed, or escalated according to confidence and alignment.
- Verify can evaluate behavior evidence mapped to critical behavior scenarios.
- Implementation Mapper records behavior -> evidence -> code mappings.
- `ready_for_archive` remains as workflow state and is displayed as awaiting explicit archive confirmation.
- Deprecated issue-mode and old harden/verify workflow residues are either removed or explicitly preserved as compatibility with documented fallback.

## Testing Strategy

- Unit tests for Harden finding classification and intent inference outcomes.
- Tests for Quality Gate visible session creation and child session linkage.
- Tests that main conversation summary includes session ID, readiness, blockers, and archive confirmation requirement.
- Tests for behavior evidence coverage: exact, equivalent, partial, missing, stale, optional.
- Tests for implementation mapper generation from evidence mappings.
- Tests for archive gating from readiness to `ready_for_archive` and then `archived` only after explicit archive.
- Regression tests proving removed issue-mode user-facing paths are not registered or documented as active workflow.
