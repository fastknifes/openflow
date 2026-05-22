# Quality Governance Specification

## Terms

- **Quality gate**: AI-callable Skill that runs after implementation or bug fix completion. It decides whether harden is required, performs evidence-aware verify, and reports readiness.
- **Harden**: Adversarial quality review and fix loop for complex or high-risk changes, coordinated internally by the quality gate.
- **Evidence-aware verify**: Verification that reuses fresh existing evidence, validates freshness and coverage, and reports missing, stale, or insufficient evidence as readiness blockers or advisory gaps.
- **Context alignment**: Semantic check that the change matches available design, behavior, issue, or request context.
- **Limited context**: Verification mode used when no design document or issue clarification exists.

---

## Scope

**In scope:**

- `openflow-quality-gate` as the standard AI-callable post-implementation Skill.
- Risk-based harden and evidence-aware verify combined into one quality gate flow.
- AI decides whether harden is required; user does not choose quality mode.
- `/openflow-harden` and `/openflow-verify` removed from normal manual workflow.
- `/openflow-writing-plan` guidance instructs AI to call `openflow-quality-gate` after implementation.
- Feature work, issue fixes, and lightweight ad-hoc fixes with different context sources.

**Out of scope:**

- Automatically running archive.
- Requiring design docs for every small fix.
- Rerunning every test/typecheck/lint command when fresh evidence already exists.
- Replacing all internal harden/verify implementation code in the first migration.

---

## Rules

1. **AI invokes the quality gate after code changes.** After implementing a feature or fixing a bug, the AI invokes `openflow-quality-gate` before claiming completion.

2. **Manual harden/verify commands are no longer the main workflow.** Users should not need to run `/openflow-harden` or `/openflow-verify` manually. The quality gate owns both steps.

3. **Harden is automatic and risk-based.** The quality gate decides whether harden is needed from git diff, changed files, context type, and risk-sensitive paths.

4. **Verify always runs, but it is evidence-aware.** The quality gate reuses fresh test/typecheck/lint/security evidence and validates whether existing evidence is fresh, passing, and scoped to the changed area. Missing, stale, failed, or insufficiently scoped required evidence becomes a readiness blocker; optional gaps are reported as advisory.

5. **Missing design or issue documents do not skip verify.** If no `design.md`, `behavior.md`, or `issue-clarification.md` exists, the quality gate performs technical verification and reports limited context.

6. **The user is not asked to choose fast/balanced/strict.** Quality strategy is automatic.

7. **Archive consumes quality gate readiness.** Archive relies on quality gate evidence/readiness rather than requiring a manual verify command.

---

## Behavior Scenarios

### Scenario 1: Feature implementation completes

**Given** an AI agent has completed feature implementation
**And** the workspace has feature design or behavior documents

**When** the agent invokes `openflow-quality-gate`

**Then** the skill builds a context bundle from the feature docs
**And** assesses git diff risk
**And** runs harden if the change is complex or high-risk
**And** performs evidence-aware verify
**And** reports readiness before the agent claims completion

### Scenario 2: OMO `/start-work` completes code execution

**Given** implementation was executed through OMO `/start-work`
**And** OpenFlow cannot directly control OMO's execution timing

**When** the executing AI reaches the post-implementation phase

**Then** the AI invokes `openflow-quality-gate` as a Skill
**And** OpenFlow does not rely on `appendGuardMessage` or quality-mode selection to trigger harden/verify

### Scenario 3: Native OpenCode implementation completes

**Given** implementation was done through native OpenCode planning/building rather than OMO

**When** code changes are complete

**Then** the AI invokes `openflow-quality-gate`
**And** the same harden + verify logic applies without requiring OMO-specific state

### Scenario 4: Issue fix without design docs

**Given** a lightweight bug fix has been implemented
**And** no `design.md` or plan file exists

**When** `openflow-quality-gate` runs

**Then** the skill does not fail solely because design docs are missing
**And** if `issue-clarification.md` exists, it checks issue context alignment
**And** if no issue clarification exists, it performs limited-context technical verification
**And** readiness clearly states the context limitation

### Scenario 5: Trivial or simple fix skips harden

**Given** a fix only changes a small localized file or documentation
**And** no risk-sensitive paths are touched

**When** the quality gate assesses risk

**Then** harden is skipped
**And** the report explains why harden was unnecessary
**And** evidence-aware verify still runs

### Scenario 6: Complex or high-risk change runs harden

**Given** a change touches multiple files, command lifecycle, hooks, config, harden, verify, archive, security, auth, permission, payment, public API, or stateful logic

**When** the quality gate assesses risk

**Then** harden runs automatically
**And** any actionable harden finding must be resolved or reported as blocking
**And** verify runs after harden completes

### Scenario 7: Existing verification evidence is fresh

**Given** the implementing agent already ran typecheck, relevant tests, and lint after the last code change
**And** the outputs are recorded and cover the modified area

**When** evidence-aware verify runs

**Then** the quality gate reuses that evidence
**And** does not rerun the same checks unnecessarily
**And** includes the reused evidence in its readiness report

### Scenario 8: Existing verification evidence is stale or missing

**Given** the agent ran tests before the last code change
**Or** only provided an unrecorded statement like "tests passed"
**Or** the checks do not cover the changed area

**When** evidence-aware verify runs

**Then** the quality gate reports the missing, stale, or insufficient evidence as a readiness blocker for required coverage or an advisory gap for optional coverage
**And** readiness depends on fresh, scoped evidence being provided by the implementing agent, CI, or another recorded verification source

### Scenario 9: Writing plan instructs quality gate usage

**Given** an AI generates a development plan through `/openflow-writing-plan`

**When** the plan is saved

**Then** the plan includes a final implementation QA task instructing the executor to invoke `openflow-quality-gate` after code changes
**And** the plan does not instruct the user to manually run `/openflow-harden` or `/openflow-verify`

### Scenario 10: Archive consumes quality gate readiness

**Given** `openflow-quality-gate` has produced readiness evidence

**When** archive is requested

**Then** archive treats the quality gate readiness as the verification gate
**And** does not require a separate manual `/openflow-verify` invocation

### Scenario 11: Complex-level harden enters full adversarial loop

**Given** the current feature's git diff reaches complex level (multi-file, logic branches, state changes)
**And** a valid plan file exists

**When** quality-gate triggers harden

**Then:**

1. **Session visibility**: Multiple sub-sessions are created with titles:
   - `Harden Round 1/5 - Reviewer`
   - `Harden Round 1/5 - Executor`
   - `Harden Round 2/5 - Reviewer`
   - `Harden Round 2/5 - Executor`
   - ... (per actual rounds)

2. **Reviewer behavior**: Read-only session, outputs formatted findings list with Level / Description / Evidence / Files per finding.

3. **Executor behavior**: May modify code for accept/partial findings. Outputs Disposition Report with verdict (accept/reject/partial) and rationale per finding.

4. **Rebuttal flow (if triggered)**: If Executor rejects a finding, additional sessions may appear:
   - `Harden Round 1/5 - Reviewer Rebuttal`
   - `Harden Round 1/5 - Executor Rebuttal`

5. **Termination**: Final markdown report includes:
   - Status: `pass` / `pass_with_risks` / `max_rounds_reached` / `needs_human`
   - Rounds executed
   - Total tokens consumed (display only, does not affect result)
   - Per-round findings and disposition summary

### Scenario 12: Simple-level harden enters lightweight review

**Given** the current feature's git diff reaches simple level (single file, 50 lines or fewer, no significant logic branches)

**When** quality-gate triggers harden

**Then** only one Reviewer + Executor session pair is created
**And** Executor does confirmation/veto only, no multi-round fix loop
**And** final report is returned to the quality gate for readiness handling, not for a separate user decision
**And** no auto-fix is performed in simple mode

### Scenario 13: Token consumption does not trigger truncation

**Given** a round's Reviewer or Executor consumed a large number of tokens

**When** token consumption exceeds legacy budget thresholds

**Then** the process continues without interruption
**And** the final report shows actual token consumption, no budget exhausted warning
**And** termination reason is rounds exhausted or human intervention only, never token budget

### Scenario 14: Legacy config fields are silently ignored

**Given** project config still contains `tokenBudgetTotal` or `tokenBudgetPerRound` fields

**When** harden reads config

**Then** harden executes normally without errors
**And** legacy fields are silently ignored, only `maxRounds` is effective

### Scenario 15: behavior.md guides integration test scope

**Given** `behavior.md` contains critical behavior scenarios

**When** AI/OMO enters implementation or acceptance phase

**Then** AI/OMO selects or writes project-appropriate integration tests based on the scenarios
**And** verification method is determined by project language, framework, and runtime
**And** the quality gate does not hardcode test commands

### Scenario 16: Quality gate checks integration evidence coverage

**Given** implementation is complete
**And** critical behavior scenarios exist

**When** AI invokes `openflow-quality-gate`

**Then** the quality gate checks each critical scenario for corresponding integration evidence
**And** evidence must state which behavior scenario it covers
**And** coverage is judged per-scenario; semantic-equivalent coverage is allowed but "roughly similar overall" is not

### Scenario 17: One integration test covers multiple behavior scenarios

**Given** an integration test or smoke test covers multiple behavior scenarios simultaneously

**When** the quality gate checks evidence mapping

**Then** that test can be referenced by multiple scenarios
**And** each scenario still has its own mapping row
**And** each row has a coverage level: `exact`, `equivalent`, `partial`, `missing`, or `not_applicable`
**And** "this test covers all scenarios" alone is not sufficient evidence

### Scenario 18: Missing critical integration evidence blocks readiness

**Given** a critical scenario has no corresponding integration evidence

**When** the quality gate classifies readiness

**Then** readiness is NotReady
**And** reason uses `missing_integration_evidence` or equivalent evidence-gap semantics
**And** output states which scenario lacks evidence

### Scenario 19: Optional scenario missing evidence does not hard-block

**Given** a behavior scenario is marked optional or boundary
**And** no corresponding integration evidence exists

**When** the quality gate classifies readiness

**Then** the quality gate records an advisory gap
**And** does not block archive readiness solely on that optional scenario

### Scenario 20: Quality gate runs compilation health probe

**Given** the project contains compilable code (TypeScript, Go, Rust, etc.)
**And** project root has language identifier files (`tsconfig.json`, `go.mod`, `Cargo.toml`)

**When** the quality gate performs readiness assessment

**Then** it auto-selects a zero-config compilation check command
**And** probe success: advisory pass, supporting evidence freshness
**And** probe failure: advisory gap, prompts "project has compilation errors", does not block readiness
**And** probe command not found (ENOENT): records tooling-missing advisory, does not block readiness

### Scenario 21: Dirty worktree during harden

**Given** harden is running

**When** git state changes during execution

**Then** harden stops immediately

### Scenario 22: No semantic context exists

**Given** code changes exist
**And** no design, behavior, issue clarification, or clear request context is available

**When** `openflow-quality-gate` runs

**Then** technical evidence validation still runs
**And** readiness is reported as limited-context or warning-bearing
**And** the report explains that semantic alignment could not be fully checked

### Scenario 23: Harden finds design ambiguity

**Given** harden runs for a high-risk change

**When** the reviewer finds a design ambiguity that cannot be resolved from available context

**Then** the quality gate reports `NeedsHumanDecision`
**And** verify readiness cannot be `Ready` until the ambiguity is resolved or explicitly accepted

### Scenario 24: Internal harden/verify handlers still exist

**Given** the codebase still contains internal `handleHarden` or `handleVerify` functions during migration

**When** users inspect the workflow docs

**Then** the documented workflow still points to `openflow-quality-gate`
**And** the internal handlers are treated as implementation details, not normal manual commands

---

## Required Content

### Hardened Execution Report

Any successful harden execution result must include:

- Status field (`pass` / `pass_with_risks` / `max_rounds_reached` / `needs_human` / `rejected`)
- Actual rounds executed
- Per-round findings list (if any)
- Executor Disposition Report (accept/reject/partial verdict + rationale)
- Rebuttal records (if rebuttal sub-flow triggered)
- Total tokens consumed (statistics only, does not affect result)
- Stop reason
- Coordinator session ID (audit trail)
- Per-round Reviewer/Executor sub-session IDs (audit trail)
- Findings final status summary (`resolved` / `rejected` / `unresolved_must_fix` / `unresolved_needs_decision` / `accepted_known_issues`)

### Integration Evidence

Successful integration evidence must include:

- Covered behavior scenario name or ID
- Verification method (automated integration test, API smoke, QA, manual repro)
- Execution result or observed result
- Evidence timestamp/context for freshness judgment
- Coverage level: `exact`, `equivalent`, `partial`, `missing`, or `not_applicable`
- If coverage is `equivalent`, rationale for semantic equivalence
- Freshness metadata: timestamp, git HEAD/diff hash, or QA date
- Persistent evidence reference; not one-time console output only

---

## Coverage Rules

| Coverage Level | Meaning | Blocking Behavior |
|---|---|---|
| `exact` | Evidence covers conditions, actions, and results item by item | Critical passes |
| `equivalent` | Steps differ but business semantics are equivalent | Critical passes |
| `partial` | Only covers some conditions or results | Critical does not pass |
| `missing` | No corresponding evidence found | Critical does not pass |
| `not_applicable` | Not applicable this time, with reason | Does not block, but reason must be recorded |

---

## Evidence Mapping Table

`behavior.md` must include or generate an evidence mapping table. Actual mapping goes in the document's `## Evidence Mapping` section.

### Field Rules

- `Scenario ID`: Required; use scenario title slug if document has no IDs.
- `Criticality`: Required; defaults to `critical` if unmarked.
- `Evidence Ref`: Required for critical scenarios; must point to persistent evidence.
- `Evidence Type`: `integration_test`, `api_smoke`, `e2e`, `qa_record`, `manual_repro`, `not_applicable`.
- `Coverage Level`: `exact`, `equivalent`, `partial`, `missing`, `not_applicable`.
- `Equivalence Rationale`: Required when `equivalent`.
- `Freshness`: `fresh`, `stale`, `unknown`.
- `Status`: `verified`, `failed`, `missing_evidence`, `needs_decision`, `not_applicable`.

### Criticality and Freshness Defaults

- Unmarked scenarios default to `critical`.
- `Boundary:` or explicitly `boundary` scenarios default to advisory unless marked as blocking.
- Optional scenarios must be explicitly marked.
- Critical evidence with `stale` or `unknown` freshness must not auto-pass.

---

## Evidence File Template

Evidence files are stored in `.sisyphus/evidence/{scenario-id}-{slug}.md`.

```md
# Evidence: {Scenario ID} - {brief description}

## Scenario Reference

- **Scenario ID**: SC-001
- **Scenario Name**: (scenario title from behavior.md)
- **Criticality**: critical

## Evidence Type

- **Type**: api_smoke  <!-- integration_test / api_smoke / e2e / qa_record / manual_repro -->

## Execution Context

- **Environment**: (local / CI / staging)
- **Commands Run**: (commands or operation steps)
- **Runtime Versions**: (language/framework/runtime versions)
- **Date**: YYYY-MM-DD

## Observed Results

- **Result**: pass  <!-- pass / fail -->
- **Output / Artifacts**:
  - (key output excerpts, screenshot paths, test report links)

## Coverage Rationale

(Explain why this evidence covers the scenario's key behavior. For exact coverage, show how Given/When/Then map. For equivalent, explain semantic equivalence.)

## Freshness Metadata

- **Timestamp**: YYYY-MM-DDTHH:mm:ss+ZZ:ZZ
- **Git HEAD**: abc1234
- **Changed Files**: (list of implementation files changed)
```

### Evidence File Field Requirements

| Field | Required | Description |
|---|---|---|
| Scenario Reference | Yes | Must include scenario ID and name for traceability |
| Evidence Type | Yes | Must be one of: `integration_test`, `api_smoke`, `e2e`, `qa_record`, `manual_repro` |
| Execution Context | Yes | At least environment and commands run |
| Observed Results | Yes | Explicit pass/fail with relevant output excerpts |
| Coverage Rationale | Yes | Explains evidence-to-scenario coverage; `equivalent` requires detailed rationale |
| Freshness Metadata | Yes | Must include timestamp and git HEAD; missing metadata → `unknown` |

---

## Readiness Outcomes

| Evidence State | Outcome |
|---|---|
| All critical behaviors are exact/equivalent + fresh + verified | Ready |
| Any critical behavior is partial/missing/failed/stale | NotReady |
| Critical evidence is ambiguous or freshness unknown | NeedsDecision or NotReady |
| Only optional/boundary evidence is missing | Ready or ReadyWithDocUpdates with advisory gap |
| not_applicable without reason | NeedsDecision |

---

## Must Not Behaviors

- Do not ask the user whether to run harden during the normal quality gate flow.
- Do not require fast/balanced/strict mode selection.
- Do not skip verify because `issue-clarification.md` is missing.
- Do not rerun fresh sufficient checks purely for ritual completeness.
- Do not document `/openflow-harden` or `/openflow-verify` as required manual workflow steps.
- Do not automatically archive after quality gate; readiness and archive remain separate stages.
- Do not let Executor modify code without verdict and rationale.
- Do not skip Reviewer for simple-level changes.
- Do not terminate harden due to token consumption exceeding a threshold.
- Do not allow single-finding arguments to exceed `maxArgumentRoundsPerFinding` without marking as `design_ambiguity`.
- Do not let Coordinator review or modify code directly.
- Do not let Executor modify files outside the plan scope.

---

## Acceptance Criteria

| Criterion | Verification Scenario | Evidence Type | Expected Evidence |
|---|---|---|---|
| AI-callable quality gate exists | All scenarios | test | `openflow-quality-gate` Skill registered and visible to agents |
| Manual harden/verify removed from main workflow | Scenarios 1-10 | docs/test | Command registration no longer advertises them as normal workflow steps |
| Harden is automatic and risk-based | Scenarios 5, 6 | test | Trivial change skips harden; high-risk change runs harden |
| Verify is evidence-aware | Scenarios 7, 8 | test | Fresh evidence reused; stale/missing evidence reported as blocker or advisory gap |
| Missing issue clarification does not skip verify | Scenario 4 | test | Limited-context verification report is produced |
| Writing plan instructs quality gate | Scenario 9 | test | Generated plan includes `openflow-quality-gate` final QA task |
| Archive consumes quality gate readiness | Scenario 10 | test | Archive proceeds from quality gate readiness without manual verify |
| Reviewer and Executor have independent sessions | Scenario 11 | log/test | `createHardenSession` called multiple times, session titles include role and round |
| Executor can output reject verdict | Scenario 11 | log/test | Disposition Report contains `verdict: reject` with `rationale` |
| Reviewer can rebut rejection once | Scenario 11 | log/test | `Reviewer Rebuttal` session appears, not exceeding `maxArgumentRoundsPerFinding` |
| Token does not trigger truncation | Scenario 13 | log/test | Large token consumption does not stop flow; Status is not `budget_exhausted` |
| Session titles carry round info | Scenario 11 | log/test | All sub-session titles include `Round N/{maxRounds}` |
| Legacy config compatible | Scenario 14 | test | Config with old token fields does not error, harden runs normally |
| Simple mode does not auto-fix | Scenario 12 | test | Simple level: Executor outputs disposition but no multi-round fix |
| Report includes findings final summary | Scenario 11 | test | Final report includes `resolved`/`rejected`/`unresolved_must_fix`/`unresolved_needs_decision` categories |
| Report includes sub-session IDs | Scenario 11 | test | Per-round report includes reviewer_session_id and executor_session_id |
| Quality gate can parse new report format | Scenario 11 | test | `parseFindingsSummary` and `extractHardenStatus` recognize new format |

---

## Constraints

- The quality gate does not execute generic unit tests, lint, typecheck, build, or format. It validates evidence coverage, not execution.
- The quality gate does not prescribe which test framework or command to use.
- Scenarios explicitly marked as optional or not_applicable should not block readiness.
- Missing workflow artifacts are blockers, not authorization to auto-generate those artifacts.

## Integration Boundaries

- Archive consumes quality gate readiness evidence.
- `/openflow-writing-plan` must include quality gate invocation in generated plans.
- `handleHarden` and `handleVerify` internal APIs may remain during migration but are not user-facing commands.
