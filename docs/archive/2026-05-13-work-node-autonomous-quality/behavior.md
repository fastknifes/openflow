# work-node-autonomous-quality - Behavior

## Terms

- **Quality gate**: AI-callable Skill that runs after implementation or bug fix completion. It decides whether harden is required, performs evidence-aware verify, and reports readiness.
- **Harden**: Adversarial quality review and fix loop for complex or high-risk changes.
- **Evidence-aware verify**: Verification that reuses fresh existing evidence and reruns only missing, stale, or insufficient checks.
- **Context alignment**: Semantic check that the change matches available design, behavior, issue, or request context.
- **Limited context**: Verification mode used when no design document or issue clarification exists.

## Scope

**In scope:**

- Add `openflow-quality-gate` as the standard AI-callable post-implementation Skill.
- Combine risk-based harden and evidence-aware verify into one quality gate flow.
- Let AI decide whether harden is required; do not ask the user to choose quality mode.
- Remove `/openflow-harden` and `/openflow-verify` from the normal manual workflow.
- Update `/openflow-writing-plan` guidance so generated plans instruct AI to call `openflow-quality-gate` after implementation.
- Support feature work, issue fixes, and lightweight ad-hoc fixes with different context sources.

**Out of scope:**

- Automatically running archive.
- Requiring design docs for every small fix.
- Requiring agents to rerun every test/typecheck/lint command if fresh evidence already exists.
- Replacing all internal harden/verify implementation code in the first migration.

## Rules

1. **AI invokes the quality gate after code changes.** After implementing a feature or fixing a bug, the AI should invoke `openflow-quality-gate` before claiming completion.

2. **Manual harden/verify commands are no longer the main workflow.** Users should not need to run `/openflow-harden` or `/openflow-verify` manually. The quality gate owns both steps.

3. **Harden is automatic and risk-based.** The quality gate decides whether harden is needed from git diff, changed files, context type, and risk-sensitive paths.

4. **Verify always runs, but it is evidence-aware.** The quality gate may reuse fresh test/typecheck/lint/security evidence and only reruns checks that are missing, stale, failed, or insufficiently scoped.

5. **Missing design or issue documents do not skip verify.** If no `design.md`, `behavior.md`, or `issue-clarification.md` exists, the quality gate performs technical verification and reports limited context.

6. **The user is not asked to choose fast/balanced/strict.** Quality strategy is automatic. Explicit future override flags may be added later, but they are not part of the primary flow.

7. **Archive consumes quality gate readiness.** Archive should rely on quality gate evidence/readiness rather than requiring a manual verify command.

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

**Then** the quality gate reruns the missing or stale checks  
**And** readiness depends on the fresh results

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

## Must Not Behaviors

- Do not ask the user whether to run harden during the normal quality gate flow.
- Do not require fast/balanced/strict mode selection.
- Do not skip verify because `issue-clarification.md` is missing.
- Do not rerun fresh sufficient checks purely for ritual completeness.
- Do not document `/openflow-harden` or `/openflow-verify` as required manual workflow steps.
- Do not automatically archive after quality gate; readiness and archive remain separate stages.

## Boundary Scenarios

### Boundary: No semantic context exists

**Given** code changes exist  
**And** no design, behavior, issue clarification, or clear request context is available

**When** `openflow-quality-gate` runs

**Then** technical verification still runs  
**And** readiness is reported as limited-context or warning-bearing  
**And** the report explains that semantic alignment could not be fully checked

### Boundary: Harden finds design ambiguity

**Given** harden runs for a high-risk change

**When** the reviewer finds a design ambiguity that cannot be resolved from available context

**Then** the quality gate reports `NeedsHumanDecision`  
**And** verify readiness cannot be `Ready` until the ambiguity is resolved or explicitly accepted

### Boundary: Internal harden/verify handlers still exist

**Given** the codebase still contains internal `handleHarden` or `handleVerify` functions during migration

**When** users inspect the workflow docs

**Then** the documented workflow still points to `openflow-quality-gate`  
**And** the internal handlers are treated as implementation details, not normal manual commands

## Test Mapping

| Behavior | Evidence Type | Expected Evidence | Status |
|---|---|---|---|
| AI-callable quality gate exists | test | `openflow-quality-gate` Skill registered and visible to agents | pending |
| Manual harden/verify removed from main workflow | docs/test | command registration or docs no longer advertise them as normal workflow steps | pending |
| Harden is automatic and risk-based | test | trivial change skips harden; high-risk change runs harden | pending |
| Verify is evidence-aware | test | fresh evidence reused; stale/missing evidence rerun | pending |
| Missing issue clarification does not skip verify | test | limited-context verification report is produced | pending |
| Writing plan instructs quality gate | test | generated plan includes `openflow-quality-gate` final QA task | pending |
| Archive consumes quality gate readiness | test | archive can proceed from quality gate readiness without manual verify | pending |
