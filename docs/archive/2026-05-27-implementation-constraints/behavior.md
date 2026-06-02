# Behavior: implementation-constraints

## Scenario: Constraints Generated Before Backend Handoff

**Criticality**: critical

**Given**:
- A feature `my-feature` has a completed plan at `docs/changes/2026-05-27-my-feature/plan.md`
- The plan tasks reference files `src/auth/token.ts` and `src/middleware/auth.ts`
- `docs/decisions/ADR-003-auth.md` contains a rule: "Must use RS256" with code pattern `src/auth/token.ts`
- `docs/current/design/auth-boundaries.md` contains a constraint section with a rule mentioning `src/middleware/auth.ts`

**When**:
- User runs `/openflow-implement my-feature`
- Worktree is created and ImplementationRun is created (step 6 complete)

**Then**:
- `resolveChangeUnitDir(executionRoot, 'my-feature')` returns the actual dated directory name
- `docs/changes/{resolved-changeDir}/constraints.md` is generated in the execution root
- The file contains the ADR-003 rule as a blocking constraint (applies to `src/auth/token.ts`, score 1.0)
- The file contains the auth-boundaries constraint (applies to `src/middleware/auth.ts`, score 0.8)
- The total number of constraint entries does not exceed 15
- Each constraint **Rule text** is at most 300 characters (full markdown entry may exceed)
- `ConstraintPacketResult` is returned with `status: 'success'`
- Backend handoff (step 7) includes the constraint packet path in the prompt or observation

## Scenario: Backend Handoff Includes Constraint Reference

**Criticality**: critical

**Given**:
- A `constraints.md` file was successfully generated for the active ImplementationRun

**When**:
- `handoffToBackend` is called (omo or opencode backend)

**Then (omo backend)**:
- The handoff prompt contains the resolved path to `constraints.md` (via `resolveChangeUnitDir`)
- The prompt contains the generation status (`success` or `degraded`)
- The prompt instructs the backend to read the file before creating tasks
- The prompt instructs sub-agents to include applicable constraints in their task prompts
- The prompt states that blocking constraints are advisory during implementation, enforcement is at final-verify

**Then (opencode backend)**:
- `recordObservation` records the constraint path and generation status
- No `session.prompt` is sent (non-omo path does not send prompts)
- Constraint injection relies on `tool-before.ts` hook + `constraint-guard.ts` advisory

## Scenario: Constraint Guard Fires on Edit (Advisory Only)

**Criticality**: normal

**Given**:
- An active ImplementationRun exists with a generated `constraints.md`
- The constraints file lists `src/auth/token.ts` as subject to a blocking constraint from `ADR-003`

**When**:
- An AI agent calls `edit` or `write` targeting `src/auth/token.ts`

**Then**:
- `checkConstraintGuard` is called from `tool-before.ts` `createToolBeforeHook`
- The constraint guard returns an advisory reminder containing the constraint rule
- The edit is **not blocked** (proceeds normally)
- For `task` tool: advisory text is injected into the task prompt
- For `write`/`edit` tool: advisory is recorded as an observation (opencode does not support prompt injection for non-task tools)
- If the guard hook crashes, the edit still proceeds (silent failure)

## Scenario: Final-Verify Performs Constraint Enforcement (Consumed by Quality Gate)

**Criticality**: critical

**Given**:
- An ImplementationRun is in `quality_gate_pending` state
- The `constraints.md` lists a blocking constraint on `src/auth/token.ts`
- The git diff shows `src/auth/token.ts` was modified

**When**:
- The user invokes `/openflow-quality-gate`
- The quality-gate orchestrator triggers the final-verify node (or directly calls `verifyConstraintSatisfaction` as transitional path)

**Then**:
- Final-verify reads the constraints file
- It identifies that `src/auth/token.ts` changed and has a blocking constraint
- It requires verification evidence as `ConstraintEvidence` — command output with `command`, `output`, `exitCode`, `reasoning` fields
- If evidence is missing or insufficient, final-verify returns `ConstraintVerificationResult` with `status: 'blocked'` and lists missing evidence
- Warning constraints that match changed files are listed in `warnings` array but do not block
- Quality-gate reads final-verify's `ConstraintVerificationResult` and incorporates it into readiness judgment

> **Transitional path**: If final-verify node is not available (feature not yet implemented), quality-gate directly calls `verifyConstraintSatisfaction()` and uses the result as readiness input.

## Scenario: Final-Verify Accepts Command Output Evidence

**Criticality**: normal

**Given**:
- A blocking constraint requires "no HS256 usage in src/auth/"
- The AI agent provides a `ConstraintEvidence` with: `command: "grep -r 'HS256' src/auth/"`, `output: "(no matches)"`, `exitCode: 1`, `reasoning: "Exit code 1 means no matches found"`

**When**:
- Final-verify evaluates the evidence

**Then**:
- The evidence is accepted (command output with structured `ConstraintEvidence`, not observation log or verbal claim)
- The constraint is marked as satisfied in `ConstraintVerificationResult`
- Final-verify proceeds to next constraint check

## Scenario: Constraints Not Found — Graceful Degradation

**Criticality**: normal

**Given**:
- A feature plan exists but references no paths that match any constraint source
- OR `docs/current/` and `docs/decisions/` are both empty or absent

**When**:
- `/openflow-implement` runs and attempts to generate `constraints.md`

**Then**:
- `constraints.md` is generated with header `Generation status: degraded (no constraints resolved)`
- The file contains no constraint entries, only the header and summary
- A warning observation is recorded in `observations.jsonl`
- Backend handoff proceeds normally with `generation status: degraded`
- Quality gate skips constraint verification (no constraints to verify)

## Scenario: Constraint Generation Failure — Atomic Write

**Criticality**: normal

**Given**:
- The plan references paths that match constraints in `docs/decisions/`
- During `generateConstraintPacket`, a filesystem error occurs (e.g., permission denied)

**When**:
- The write to `constraints.md.tmp` or rename fails

**Then**:
- No partial `constraints.md` file exists on disk (atomic write: tmp + rename)
- `generateConstraintPacket()` returns `ConstraintPacketResult` with `status: 'failed'` and error message
- A warning observation is recorded: "constraint generation failed: {error message}"
- Backend handoff proceeds with `generation status: failed`
- The handoff prompt or observation includes "constraint generation failed, no constraints injected"
- Quality gate skips constraint verification

## Scenario: Plan Phase Produces Constraint Mapping

**Criticality**: normal

**Given**:
- A feature design is complete (`design.md` and `behavior.md` exist, cross-validation passed)
- User runs `/openflow-writing-plan {feature}`

**When**:
- The plan packet is constructed

**Then**:
- The plan output includes a section `## Implementation Constraints`
- The section lists constraint source files relevant to the feature scope
- The section maps planned task file paths to their applicable constraint sources
- This mapping is declarative (not the final constraints.md)
- No constraints.md file is generated at this stage

## Scenario: Constraint Entry Limits Respected

**Criticality**: normal

**Given**:
- 50 constraint rules exist across `docs/current/**` and `docs/decisions/`
- The plan references paths matching 30 of these constraints

**When**:
- The ContextResolver scores and ranks constraints

**Then**:
- Only the top 15 constraints (by relevance score) are included
- Ties are broken by source priority: decision > current > reflection
- Each constraint **Rule text** is truncated to 300 characters (full markdown entry may exceed this)
- The summary notes how many constraints were filtered out

## Scenario: Duplicate Constraints Deduplicated

**Criticality**: normal

**Given**:
- `docs/decisions/ADR-003.md` contains a rule about `src/auth/token.ts`
- `docs/current/design/auth.md` contains the same rule about `src/auth/token.ts`

**When**:
- The ContextResolver resolves constraints

**Then**:
- The two constraints are deduplicated by key `{normalizedRule}:{normalizedAppliesTo}` (without sourceFile)
- One entry is kept with a merged `sources` array listing both source files
- The entry's score is the higher of the two source scores
- The `Applies to` field merges paths from both sources
- The summary does not double-count the deduplicated constraint

## Scenario: Resumed Run Reuses Existing Constraints

**Criticality**: normal

**Given**:
- An ImplementationRun exists with status `running` (resumed from a previous session)
- `constraints.md` already exists at the expected path in the worktree

**When**:
- `handleImplement` detects the active run and enters the resume branch

**Then**:
- The existing `constraints.md` is reused (not regenerated)
- An observation is recorded: "Reusing existing constraints.md for run {runID}"
- Backend handoff references the existing file

## Scenario: Resumed Run Generates Missing Constraints

**Criticality**: normal

**Given**:
- An ImplementationRun exists with status `running` (resumed)
- `constraints.md` does NOT exist (e.g., generated in a version before this feature)

**When**:
- `handleImplement` detects the active run and the missing constraints file

**Then**:
- A new `constraints.md` is generated based on the current plan and constraint sources
- An observation is recorded: "Generated missing constraints.md for resumed run {runID}"

## Scenario: Worktree Mode — Constraints in Worktree Directory

**Criticality**: normal

**Given**:
- Worktree mode is enabled for feature `my-feature`
- The worktree is at `/path/to/worktree-my-feature/`
- The plan file exists at `docs/changes/2026-05-27-my-feature/plan.md` (in worktree)

**When**:
- `generateConstraintPacket` runs

**Then**:
- `constraints.md` is written to `{run.worktree}/docs/changes/2026-05-27-my-feature/constraints.md`
- NOT to the main worktree's `docs/changes/` directory
- The backend executes in the worktree where constraints.md is accessible

## Scenario: Guard Hook Crash — Silent Failure

**Criticality**: normal

**Given**:
- An active ImplementationRun exists with a `constraints.md`
- The constraint guard hook throws an uncaught exception (e.g., malformed constraints.md)

**When**:
- An AI agent calls `edit` on any file

**Then**:
- The edit proceeds normally (guard failure does not block)
- No constraint reminder is returned
- The error is logged (not surfaced to the agent)

## Scenario: No Paths in Plan

**Criticality**: normal

**Given**:
- A feature plan exists but contains no file paths (purely architectural change)
- `extractPlanPaths()` returns an empty array

**When**:
- The ContextResolver attempts to resolve constraints

**Then**:
- No path matching is possible, all constraints score 0
- `constraints.md` is generated with `Generation status: degraded (no plan paths resolved)`
- Backend handoff proceeds normally
