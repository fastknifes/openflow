# Work Node Autonomous Quality

## TL;DR
> **Summary**: Introduce `openflow-quality-gate` as an AI-callable Skill backed by an executable tool/handler. It replaces the normal manual `/openflow-harden` + `/openflow-verify` path with risk-based harden plus evidence-aware verify after implementation.
> **Deliverables**:
> - `openflow-quality-gate` Skill registration and backing tool
> - quality gate orchestration handler
> - unified risk/context/evidence behavior
> - deprecated manual harden/verify registration path
> - archive and writing-plan integration
> - tests and docs alignment
> **Effort**: Large
> **Parallel**: YES - 4 waves
> **Critical Path**: Task 1 → Task 2 → Task 4 → Task 7 → Final Verification

## Context
### Original Request
The user wants harden + verify packaged as a Skill that AI invokes after code implementation or bug fixes. Manual `/openflow-harden` and `/openflow-verify` should no longer be normal user workflow commands. Whether harden runs is decided by AI/quality gate risk assessment. `/openflow-writing-plan` must prompt AI to call `openflow-quality-gate` after implementation.

### Interview Summary
- Confirmed `openflow-quality-gate` should be an AI-callable Skill.
- Confirmed it contains two stages: risk-based harden + evidence-aware verify.
- Confirmed missing `issue-clarification.md` or `design.md` must not skip verify; it downgrades semantic alignment to limited context.
- Confirmed verify should reuse fresh evidence and rerun only stale/missing/insufficient checks.
- Confirmed archive should consume quality-gate readiness evidence.

### Metis Review (gaps addressed)
- Skill alone cannot execute code; plan includes a backing `openflow-quality-gate` tool and `handleQualityGate` orchestrator.
- Manual command deprecation is explicit: remove from command registration; keep internal handlers; optionally leave chat dispatch with deprecation guidance.
- Evidence freshness is defined via timestamp and git state metadata.
- Risk assessment is unified behind one quality-gate decision module.
- Readiness contract writes to existing acceptance-state fields so archive can consume it.

## Work Objectives
### Core Objective
Make `openflow-quality-gate` the standard AI-triggered post-implementation quality gate for native OpenCode, OMO, feature, issue, and limited-context fixes.

### Deliverables
- `src/skills/quality-gate-skill.ts`
- registry/registration updates for the new Skill
- `src/commands/quality-gate.ts` or equivalent handler
- tool registration in `src/index.ts`
- risk/context/evidence helper functions
- removal/deprecation of normal manual harden/verify command registration
- writing-plan guidance retained and tested
- archive readiness compatibility
- tests for skill registration, quality-gate behavior, command deprecation, evidence-aware verify, and archive consumption

### Definition of Done
- `npm run typecheck` passes.
- `bun test` passes, or changed/scoped tests pass with documented skipped broader failures.
- `openflow-quality-gate` appears in registered skills.
- `/openflow-harden` and `/openflow-verify` no longer appear as normal command files.
- Quality gate can report readiness for feature context, issue context, and limited context.
- Archive can proceed using readiness produced by quality gate.

### Must Have
- AI-callable Skill with clear usage instructions.
- Backing executable tool/handler.
- Risk-based harden decision with explicit rationale.
- Evidence-aware verify that reuses fresh evidence and reruns stale/missing evidence.
- Limited-context mode when semantic docs are missing.
- Existing harden/verify internals preserved for quality-gate use.

### Must NOT Have
- No user prompt asking fast/balanced/strict.
- No normal workflow documentation telling users to run `/openflow-harden` or `/openflow-verify` manually.
- No skip of verify solely because `design.md` or `issue-clarification.md` is missing.
- No blind rerun of all checks when fresh sufficient evidence is available.
- No automatic archive after quality gate.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: tests-after + existing `bun test` framework
- QA policy: Every task has agent-executed scenarios
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
Wave 1: Task 1, Task 3, Task 8 (foundation: contracts, skill docs, command deprecation docs/tests)
Wave 2: Task 2, Task 4, Task 5 (handler, risk/context, evidence metadata)
Wave 3: Task 6, Task 7, Task 9 (archive integration, command lifecycle, tests)
Wave 4: Task 10 (docs/readme sweep and final consistency)

### Dependency Matrix
| Task | Blocked By | Blocks |
|---|---|---|
| 1 | none | 2, 4, 6, 7, 9 |
| 2 | 1 | 6, 7, 9 |
| 3 | none | 9, 10 |
| 4 | 1 | 2, 9 |
| 5 | none | 2, 9 |
| 6 | 1, 2 | 9 |
| 7 | 1, 2 | 9, 10 |
| 8 | none | 9, 10 |
| 9 | 1, 2, 3, 4, 5, 6, 7, 8 | 10 |
| 10 | 3, 7, 8, 9 | Final Verification |

### Agent Dispatch Summary
| Wave | Task count | Categories |
|---|---:|---|
| 1 | 3 | quick, writing, unspecified-high |
| 2 | 3 | deep, unspecified-high |
| 3 | 3 | unspecified-high, quick |
| 4 | 1 | writing |

## TODOs

- [x] 1. Define quality gate contracts and state fields

  **What to do**: Add the minimum types needed for quality-gate orchestration in `src/types.ts`. Define a `QualityGateResult` shape that includes `feature`, `mode/contextKind`, `hardenDecision`, `hardenStatus`, `verifyReadiness`, `evidenceSummary`, `warnings`, and `limitedContext`. Reuse existing `VerifyReadinessStatus` for archive compatibility. Add optional acceptance-state fields only if existing readiness fields are insufficient; prefer existing `readiness`, `readinessReasonCodes`, `readinessEvidenceSummary`, `readinessConstraintsChecked`, and `readinessVerifiedAt`.
  **Must NOT do**: Do not invent a completely separate readiness state store unless existing acceptance-state cannot represent quality-gate output.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: shared contracts affect multiple modules
  - Skills: [] - no special skill required
  - Omitted: [`gitnexus-refactoring`] - no rename/refactor required

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [2, 4, 6, 7, 9] | Blocked By: []

  **References**:
  - Pattern: `src/types.ts:88-125` - existing harden result and complexity types
  - Pattern: `src/types.ts:196-206` - `OpenFlowConfig` structure
  - Pattern: `src/utils/acceptance-state.ts:127-149` - existing readiness fields parsing
  - Pattern: `docs/decisions/ADR-004-quality-gate-skill.md` - accepted quality-gate contract

  **Acceptance Criteria**:
  - [ ] `npm run typecheck` succeeds.
  - [ ] New types reuse `VerifyReadinessStatus` rather than creating archive-incompatible readiness values.
  - [ ] Type comments or names distinguish `limitedContext` from verification failure.

  **QA Scenarios**:
  ```
  Scenario: Type contracts compile
    Tool: Bash
    Steps: npm run typecheck
    Expected: command exits 0
    Evidence: .sisyphus/evidence/task-1-contracts-typecheck.txt

  Scenario: Archive-compatible readiness
    Tool: Grep
    Steps: search src/types.ts for QualityGateResult and VerifyReadinessStatus
    Expected: QualityGateResult references VerifyReadinessStatus or existing VerifyResult-compatible status
    Evidence: .sisyphus/evidence/task-1-contracts-readiness.txt
  ```

  **Commit**: NO | Message: `feat(quality-gate): define quality gate contracts` | Files: [`src/types.ts`]

- [x] 2. Implement `handleQualityGate` orchestrator

  **What to do**: Create `src/commands/quality-gate.ts`. The handler must resolve context, assess risk, run harden only when required, run verify/evidence collection, persist readiness into acceptance-state, and return markdown with sections: Context, Risk Assessment, Harden Decision, Evidence-Aware Verify, Readiness, Next Step. It may call existing internal `handleHarden` and `handleVerify`, but must handle no-plan/limited-context cases gracefully.
  **Must NOT do**: Do not require a plan file for all cases. Do not ask the user for fast/balanced/strict.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: central orchestrator touches harden, verify, acceptance state, and issue/feature modes
  - Skills: [] - no special skill required
  - Omitted: [`frontend-ui-ux`] - no UI work

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [6, 7, 9] | Blocked By: [1, 4, 5]

  **References**:
  - Pattern: `src/commands/harden.ts:38-145` - `handleHarden` behavior and rejection cases
  - Pattern: `src/commands/verify.ts` - current verify/evidence/readiness implementation
  - Pattern: `src/commands/index.ts:1-10` - command exports
  - Pattern: `src/utils/feature-resolver.ts` - active feature resolution
  - Pattern: `src/utils/acceptance-state.ts` - readiness persistence
  - External: `docs/changes/2026-05-13-work-node-autonomous-quality/design.md` - desired flow

  **Acceptance Criteria**:
  - [ ] `handleQualityGate(ctx, args?)` exists and is exported from `src/commands/index.ts`.
  - [ ] No-plan limited-context path returns verify output rather than hard failure.
  - [ ] Harden runs for high-risk changes and is skipped with rationale for low-risk changes.
  - [ ] Markdown output includes all required sections.

  **QA Scenarios**:
  ```
  Scenario: Low-risk quality gate skips harden
    Tool: Bash
    Steps: bun test tests/quality-gate/quality-gate.test.ts --filter "low-risk"
    Expected: test confirms harden not invoked and verify invoked
    Evidence: .sisyphus/evidence/task-2-quality-gate-low-risk.txt

  Scenario: High-risk quality gate runs harden
    Tool: Bash
    Steps: bun test tests/quality-gate/quality-gate.test.ts --filter "high-risk"
    Expected: test confirms harden invoked before verify
    Evidence: .sisyphus/evidence/task-2-quality-gate-high-risk.txt
  ```

  **Commit**: NO | Message: `feat(quality-gate): orchestrate harden and verify` | Files: [`src/commands/quality-gate.ts`, `src/commands/index.ts`]

- [x] 3. Add `openflow-quality-gate` Skill content and registration

  **What to do**: Add `src/skills/quality-gate-skill.ts` with clear instructions: use after code changes or bug fixes, assess context, call the `openflow-quality-gate` tool, do not claim completion until readiness is returned. Register it in `src/skills/registry.ts`. Ensure `registerSkills()` writes it globally and does not clean it as legacy.
  **Must NOT do**: Do not register it as a normal command file.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: localized skill registration work
  - Skills: [] - no special skill required
  - Omitted: [`writing`] - prose is technical and short

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [9, 10] | Blocked By: []

  **References**:
  - Pattern: `src/skills/writing-plan-skill.ts` - SkillInfo content format
  - Pattern: `src/skills/registry.ts:1-16` - current registry
  - Pattern: `src/skills/registration.ts:52-80` - skill write flow
  - Pattern: `docs/decisions/ADR-004-quality-gate-skill.md` - skill semantics

  **Acceptance Criteria**:
  - [ ] `getQualityGateSkill()` exists and is included in `getSkills()`.
  - [ ] Skill description explicitly says it is used after code changes and bug fixes.
  - [ ] Skill content instructs AI to call the `openflow-quality-gate` tool.
  - [ ] No cleanup path removes `openflow-quality-gate` after registration.

  **QA Scenarios**:
  ```
  Scenario: Skill registry includes quality gate
    Tool: Bash
    Steps: bun test tests/skills/registration.test.ts
    Expected: registration test passes and includes openflow-quality-gate
    Evidence: .sisyphus/evidence/task-3-skill-registration.txt

  Scenario: Skill content has required trigger guidance
    Tool: Grep
    Steps: search src/skills/quality-gate-skill.ts for "after code changes", "bug fix", and "openflow-quality-gate"
    Expected: all phrases are present or equivalent wording exists
    Evidence: .sisyphus/evidence/task-3-skill-content.txt
  ```

  **Commit**: NO | Message: `feat(skills): register quality gate skill` | Files: [`src/skills/quality-gate-skill.ts`, `src/skills/registry.ts`, `tests/skills/registration.test.ts`]

- [x] 4. Unify risk assessment for harden decision

  **What to do**: Create or update a helper, preferably in `src/utils/risk-assessment.ts` or `src/utils/harden-utils.ts`, so quality gate uses one risk decision. Combine current path/size-sensitive rules with complexity grading. Required triggers: >=3 files, >=50 diff lines, exported API changes, hooks/commands/config/verify/archive/harden/security/auth/permission/payment paths, stateful logic, production/data-loss risk. Return `{ risk, shouldHarden, reasons }`.
  **Must NOT do**: Do not let quality gate and harden use contradictory risk rules.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: shared decision logic affects harden behavior
  - Skills: [] - no special skill required
  - Omitted: [`gitnexus-refactoring`] - no symbol rename expected

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [2, 9] | Blocked By: [1]

  **References**:
  - Pattern: `src/utils/risk-assessment.ts:1-38` - existing high-risk heuristics
  - Pattern: `src/utils/harden-utils.ts` - existing `gradeComplexity`
  - Pattern: `docs/changes/2026-05-13-work-node-autonomous-quality/behavior.md` - risk behavior scenarios

  **Acceptance Criteria**:
  - [ ] One exported risk decision helper exists for quality gate.
  - [ ] Helper returns machine-readable reasons.
  - [ ] Tests cover trivial, simple, multi-file, sensitive-path, and public API cases.

  **QA Scenarios**:
  ```
  Scenario: Sensitive path forces harden
    Tool: Bash
    Steps: bun test tests/utils/harden-utils.test.ts tests/utils/risk-assessment.test.ts
    Expected: changes under src/commands or src/hooks return shouldHarden=true
    Evidence: .sisyphus/evidence/task-4-risk-sensitive.txt

  Scenario: Trivial doc change skips harden
    Tool: Bash
    Steps: bun test tests/utils/harden-utils.test.ts tests/utils/risk-assessment.test.ts
    Expected: doc-only small change returns shouldHarden=false with rationale
    Evidence: .sisyphus/evidence/task-4-risk-trivial.txt
  ```

  **Commit**: NO | Message: `feat(quality-gate): unify harden risk assessment` | Files: [`src/utils/risk-assessment.ts`, `src/utils/harden-utils.ts`, `tests/utils/*risk*.test.ts`]

- [x] 5. Implement evidence freshness metadata

  **What to do**: Add minimal evidence freshness support. Use current git state (`git rev-parse HEAD`, `git diff --name-only`, working tree diff hash or timestamp) and existing acceptance readiness metadata. Define fresh evidence as evidence recorded after the last changed file timestamp and matching current git state when possible. If metadata is absent, treat evidence as missing and rerun scoped checks.
  **Must NOT do**: Do not skip checks based only on natural language like "tests passed".

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: evidence correctness affects readiness
  - Skills: [] - no special skill required
  - Omitted: [`git-master`] - no git history manipulation needed

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [2, 9] | Blocked By: []

  **References**:
  - Pattern: `src/utils/acceptance-state.ts:33-39` - readiness metadata fields
  - Pattern: `src/commands/verify.ts` - current evidence collection and command execution
  - Pattern: `package.json:15-22` - typecheck/test scripts

  **Acceptance Criteria**:
  - [ ] Quality gate can distinguish fresh, stale, and missing evidence.
  - [ ] Unrecorded text claims are not accepted as fresh evidence.
  - [ ] Stale evidence causes rerun or NotReady with reason.

  **QA Scenarios**:
  ```
  Scenario: Fresh evidence reused
    Tool: Bash
    Steps: bun test tests/quality-gate/evidence.test.ts --filter "fresh"
    Expected: evidence is reused and duplicate command runner is not called
    Evidence: .sisyphus/evidence/task-5-evidence-fresh.txt

  Scenario: Stale evidence rerun
    Tool: Bash
    Steps: bun test tests/quality-gate/evidence.test.ts --filter "stale"
    Expected: stale evidence triggers rerun path
    Evidence: .sisyphus/evidence/task-5-evidence-stale.txt
  ```

  **Commit**: NO | Message: `feat(quality-gate): track evidence freshness` | Files: [`src/commands/quality-gate.ts`, `src/utils/acceptance-state.ts`, `tests/quality-gate/evidence.test.ts`]

- [x] 6. Persist quality gate readiness for archive

  **What to do**: Ensure quality gate writes readiness to the same acceptance-state fields archive already consumes. If archive expects `VerifyReadinessStatus`, map quality-gate results to existing statuses and include limited-context/warning information in reason codes and evidence summary. Update archive only if it cannot currently consume the state.
  **Must NOT do**: Do not create an archive-only readiness source that bypasses acceptance state.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: cross-module integration between quality gate and archive
  - Skills: [] - no special skill required
  - Omitted: [`git-master`] - no git operations beyond tests

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [9] | Blocked By: [1, 2]

  **References**:
  - Pattern: `src/commands/archive.ts` - readiness gate before archive
  - Pattern: `src/utils/acceptance-state.ts` - readiness fields serialization
  - Pattern: `docs/decisions/ADR-004-quality-gate-skill.md` - archive consumes quality-gate readiness

  **Acceptance Criteria**:
  - [ ] Archive can proceed after quality gate writes Ready-compatible state.
  - [ ] Archive blocks on NotReady or NeedsDecision from quality gate.
  - [ ] Limited context is visible in evidence summary or reason codes.

  **QA Scenarios**:
  ```
  Scenario: Archive consumes quality gate readiness
    Tool: Bash
    Steps: bun test tests/commands/archive.test.ts --filter "quality gate"
    Expected: archive succeeds when quality gate readiness is Ready
    Evidence: .sisyphus/evidence/task-6-archive-ready.txt

  Scenario: Archive blocks NotReady
    Tool: Bash
    Steps: bun test tests/commands/archive.test.ts --filter "NotReady"
    Expected: archive blocks when quality gate writes NotReady
    Evidence: .sisyphus/evidence/task-6-archive-notready.txt
  ```

  **Commit**: NO | Message: `feat(quality-gate): persist readiness for archive` | Files: [`src/commands/quality-gate.ts`, `src/commands/archive.ts`, `tests/commands/archive.test.ts`]

- [x] 7. Register quality gate tool and deprecate manual harden/verify commands

  **What to do**: Add `openflow-quality-gate` tool registration in `src/index.ts` that calls `handleQualityGate`. Remove `openflow-harden` and `openflow-verify` from `COMMANDS` in `src/command-registration.ts` so they do not appear as normal manual slash commands. Add them to stale command cleanup so old generated command files are removed. Keep internal handlers exported if quality gate uses them. In `chat-message.ts`, either remove slash dispatch for `/openflow-harden` and `/openflow-verify` or return a deprecation message pointing to `openflow-quality-gate`.
  **Must NOT do**: Do not remove `handleHarden` or `handleVerify` if quality gate calls them internally.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: command lifecycle and plugin registration are user-visible
  - Skills: [] - no special skill required
  - Omitted: [`frontend-ui-ux`] - no UI work

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [9, 10] | Blocked By: [1, 2]

  **References**:
  - Pattern: `src/index.ts:69-154` - existing tool registrations
  - Pattern: `src/command-registration.ts:6-33` - command registration and stale command files
  - Pattern: `src/hooks/chat-message.ts` - slash command dispatch and old quality policy lifecycle
  - Pattern: `docs/decisions/ADR-003-command-registration-via-commands-not-skills.md` - Skill exception

  **Acceptance Criteria**:
  - [ ] `openflow-quality-gate` tool is registered.
  - [ ] `openflow-harden.md` and `openflow-verify.md` are removed from generated command registration.
  - [ ] Old command files are cleaned via stale command cleanup.
  - [ ] Manual harden/verify slash input no longer silently runs old flow as normal path.

  **QA Scenarios**:
  ```
  Scenario: Quality gate tool registered
    Tool: Bash
    Steps: bun test tests/index-runtime-registration.test.ts
    Expected: plugin exposes openflow-quality-gate tool
    Evidence: .sisyphus/evidence/task-7-tool-registration.txt

  Scenario: Manual harden verify command files removed
    Tool: Bash
    Steps: bun test tests/index-runtime-registration.test.ts tests/commands/registration.test.ts
    Expected: command registration excludes openflow-harden and openflow-verify, stale cleanup includes their md files
    Evidence: .sisyphus/evidence/task-7-command-deprecation.txt
  ```

  **Commit**: NO | Message: `feat(quality-gate): register tool and deprecate manual commands` | Files: [`src/index.ts`, `src/command-registration.ts`, `src/hooks/chat-message.ts`, `tests/index-runtime-registration.test.ts`]

- [x] 8. Remove obsolete OMO quality-policy prompting and harden suggestions

  **What to do**: Simplify `chat-message.ts` and `acceptance-prompt.ts` so they no longer prompt fast/balanced/strict, save new `execution-policy.json`, or show old harden suggestions as the normal path. Replace relevant guidance with a quality-gate reminder only if needed. Treat existing `execution-policy.json` as deprecated historical context.
  **Must NOT do**: Do not break unrelated `/openflow-feature`, `/openflow-issue`, `/openflow-archive`, or `/openflow-writing-plan` dispatch.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: chat hook is large and noisy
  - Skills: [] - no special skill required
  - Omitted: [`ai-slop-remover`] - cleanup is targeted, not style-only

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [9, 10] | Blocked By: []

  **References**:
  - Pattern: `src/hooks/chat-message.ts:206-312` - old quality policy lifecycle and harden suggestions
  - Pattern: `src/hooks/acceptance-prompt.ts:40-62` - old harden suggestion helper
  - Pattern: `src/utils/execution-policy.ts` - deprecated policy persistence
  - Pattern: `docs/decisions/ADR-004-quality-gate-skill.md` - new behavior

  **Acceptance Criteria**:
  - [ ] No fast/balanced/strict prompt is emitted in normal flow.
  - [ ] Old harden suggestion text is removed or replaced with quality-gate guidance.
  - [ ] Existing OpenFlow slash commands still dispatch correctly.
  - [ ] Tests reflect quality-gate flow instead of execution-policy prompting.

  **QA Scenarios**:
  ```
  Scenario: No quality mode prompt after start-work
    Tool: Bash
    Steps: bun test tests/hooks/chat-message.test.ts --filter "quality mode"
    Expected: test confirms fast/balanced/strict prompt is not emitted
    Evidence: .sisyphus/evidence/task-8-no-quality-mode.txt

  Scenario: Feature command dispatch unaffected
    Tool: Bash
    Steps: bun test tests/hooks/chat-message-feature.test.ts tests/hooks/chat-message.test.ts
    Expected: OpenFlow command dispatch tests pass
    Evidence: .sisyphus/evidence/task-8-dispatch-unaffected.txt
  ```

  **Commit**: NO | Message: `refactor(hooks): replace quality policy prompts with quality gate` | Files: [`src/hooks/chat-message.ts`, `src/hooks/acceptance-prompt.ts`, `tests/hooks/*.test.ts`]

- [x] 9. Add comprehensive quality gate tests

  **What to do**: Add `tests/quality-gate/quality-gate.test.ts`, `tests/quality-gate/evidence.test.ts`, and update related registration/archive tests. Cover feature context, issue context, limited context, high-risk harden, low-risk skip, fresh evidence reuse, stale evidence rerun, disabled harden config, no git diff, and duplicate invocation handling if a lock is implemented.
  **Must NOT do**: Do not rely on real external commands except safe mocked command runners.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: broad integration test coverage needed
  - Skills: [] - no special skill required
  - Omitted: [`playwright`] - no browser testing

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [10] | Blocked By: [1, 2, 3, 4, 5, 6, 7, 8]

  **References**:
  - Pattern: `tests/commands/verify.test.ts` - verify command testing style
  - Pattern: `tests/harden/command.test.ts` - harden behavior tests
  - Pattern: `tests/skills/registration.test.ts` - skill registration tests
  - Pattern: `tests/commands/archive.test.ts` - archive readiness tests

  **Acceptance Criteria**:
  - [ ] Tests cover all three context modes: feature, issue, limited.
  - [ ] Tests cover harden run and harden skip.
  - [ ] Tests cover fresh evidence reuse and stale evidence rerun.
  - [ ] Tests cover command deprecation and skill/tool registration.
  - [ ] `bun test tests/quality-gate tests/skills/registration.test.ts tests/index-runtime-registration.test.ts` passes.

  **QA Scenarios**:
  ```
  Scenario: Quality gate test suite passes
    Tool: Bash
    Steps: bun test tests/quality-gate tests/skills/registration.test.ts tests/index-runtime-registration.test.ts
    Expected: all targeted tests pass
    Evidence: .sisyphus/evidence/task-9-quality-gate-tests.txt

  Scenario: Full test suite sanity
    Tool: Bash
    Steps: bun test
    Expected: full suite passes, or existing unrelated failures are documented with exact failing files
    Evidence: .sisyphus/evidence/task-9-full-tests.txt
  ```

  **Commit**: NO | Message: `test(quality-gate): cover quality gate workflow` | Files: [`tests/quality-gate/*.test.ts`, `tests/skills/registration.test.ts`, `tests/index-runtime-registration.test.ts`, `tests/commands/archive.test.ts`]

- [x] 10. Final documentation and README consistency sweep

  **What to do**: Update `README.md`, `README_CN.md`, and remaining current docs so normal workflows reference `openflow-quality-gate` instead of manual `/openflow-harden` and `/openflow-verify`. Leave historical/archive docs unchanged unless they explicitly claim current behavior. Ensure `docs/current/design/openflow-harden/design.md` has a deprecation/update note. Update `docs/current/design/openflow-issue/design.md` if it still describes manual harden/verify as current path.
  **Must NOT do**: Do not rewrite archived historical decisions beyond necessary current-status notes.

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: documentation consistency sweep
  - Skills: [] - no special skill required
  - Omitted: [`git-master`] - no history search required

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: [Final Verification] | Blocked By: [3, 7, 8, 9]

  **References**:
  - Pattern: `docs/current/workflow/openflow-usage-tutorial.md` - updated Chinese tutorial
  - Pattern: `docs/current/workflow/openflow-usage-tutorial.en.md` - updated English tutorial
  - Pattern: `docs/decisions/ADR-004-quality-gate-skill.md` - canonical decision
  - Pattern: `README.md`, `README_CN.md` - public docs still need sweep

  **Acceptance Criteria**:
  - [ ] Current user-facing docs describe `openflow-quality-gate` as post-implementation quality path.
  - [ ] README and README_CN no longer tell users to manually run `/openflow-harden` or `/openflow-verify` as the normal path.
  - [ ] Historical references are clearly marked as historical or left only in archive docs.
  - [ ] Grep output for `/openflow-harden|/openflow-verify` in current docs is limited to deprecation/internal-capability notes.

  **QA Scenarios**:
  ```
  Scenario: Current docs no longer advertise manual harden verify
    Tool: Bash
    Steps: grep -R "/openflow-harden\|/openflow-verify" docs/current README.md README_CN.md
    Expected: matches only appear in deprecation/internal-capability notes
    Evidence: .sisyphus/evidence/task-10-docs-grep.txt

  Scenario: Quality gate documented in public docs
    Tool: Bash
    Steps: grep -R "openflow-quality-gate" docs/current README.md README_CN.md docs/decisions/ADR-004-quality-gate-skill.md
    Expected: quality gate appears in tutorials, README docs, and ADR-004
    Evidence: .sisyphus/evidence/task-10-quality-gate-grep.txt
  ```

  **Commit**: NO | Message: `docs(quality-gate): align current workflow docs` | Files: [`README.md`, `README_CN.md`, `docs/current/**/*.md`]

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy
- Do not commit until user explicitly requests it.
- Recommended commit grouping after implementation:
  1. `feat(quality-gate): add AI-callable quality gate`
  2. `refactor(workflow): route harden verify through quality gate`
  3. `test(quality-gate): cover post-implementation quality gate`
  4. `docs(quality-gate): document AI quality gate workflow`

## Success Criteria
- `openflow-quality-gate` is registered as a Skill and a backing tool.
- AI instructions in writing-plan point to quality gate after implementation.
- Quality gate chooses harden automatically and always performs evidence-aware verify.
- Manual `/openflow-harden` and `/openflow-verify` are not normal command registration outputs.
- Limited-context fixes still verify and report reduced semantic confidence.
- Archive consumes quality-gate readiness.
- Targeted and full tests pass or unrelated pre-existing failures are explicitly documented.
