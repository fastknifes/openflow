# Plan: openflow-feature-optimization

## Overview

Implement the optimized `/openflow-feature` workflow defined in `docs/changes/2026-05-25-openflow-feature-optimization/`: natural-language feature intent, one feature per session, `state.md` Feature Brief, mandatory `design.md`/`behavior.md`, conditional design documents, body-based Cross-Validation, guarded `/openflow-writing-plan`, and cleanup of legacy proposal/meta/session fallbacks.

## Design Context

Primary design workspace: `docs/changes/2026-05-25-openflow-feature-optimization/`.

Authoritative design inputs:
- `requirements.md`: functional requirements and acceptance criteria.
- `design.md`: workflow order, state model, module boundaries, writing-plan gate.
- `behavior.md`: user-visible behavior for startup, session guard, validation, editing, completion.
- `decisions.md`: local and Candidate Global decisions.
- `state.md`: working Feature Brief only; not a Cross-Validation input.

Key constraints to preserve:
- `/openflow-feature <text>` treats `<text>` as requirement description, not feature id/slug.
- One session can contain only one feature; no same-session switching and no cross-session continuation.
- Feature directory names are AI-derived dated names: `YYYY-MM-DD-semantic-name`, Asia/Shanghai date, deterministic conflicts, stable after creation.
- `state.md` is the design-stage token and working memory; writes must be atomic and failures block formal document generation.
- `design.md` and `behavior.md` are mandatory; `requirements.md`, `prd.md`, and `decisions.md` are conditional with explicit reasons.
- Do not generate, validate, or depend on default `proposal.md`, `design.meta.json`, or `behavior.meta.json`.
- Cross-Validation must reread document bodies in order `requirements.md -> prd.md -> design.md -> behavior.md -> decisions.md` and classify Non-blocking, Blocking, and Critical Blocking gaps.
- `/openflow-writing-plan` accepts full dated directory names and unambiguous semantic suffixes; it rejects ambiguous suffixes and non-complete/non-Passed features.
- Implementation must prefer refactoring and old-code cleanup over compatibility fallbacks.

## Execution Strategy

### Parallel Execution Waves

Wave 1: Core feature models, identity naming, `state.md` manager, Cross-Validation contracts.
Wave 2: Session guard, slot convergence, document selection/rendering, Cross-Validation engine.
Wave 3: `/openflow-feature` orchestration, `/openflow-writing-plan` gate, archive promotion, edit transaction guard.
Wave 4: Test migration, legacy fallback cleanup, runtime copy alignment.
Wave 5: Full verification and quality gate handoff.

### Dependency Matrix

| Task | Blocked By | Blocks |
|---|---|---|
| 1 | none | 5,6,7,8,9,10 |
| 2 | none | 5,9,10 |
| 3 | none | 5,9,12 |
| 4 | none | 8,10,11 |
| 5 | 1,2,3 | 9,13 |
| 6 | 1 | 9,13 |
| 7 | 1 | 9,13 |
| 8 | 1,4 | 9,10,12,13 |
| 9 | 5,6,7,8 | 13,14,16 |
| 10 | 2,4,8 | 13,16 |
| 11 | 4,8 | 13,16 |
| 12 | 3,8 | 13,16 |
| 13 | 9,10,11,12 | 14,16 |
| 14 | 13 | 16 |
| 15 | 9,10,11 | 16 |
| 16 | 13,14,15 | Final verification |

## Tasks

- [ ] 1. Establish feature workflow core models (Agent: unspecified-high | Blocks: [5,6,7,8,9,10] | Blocked By: [])
  - Files: `src/phases/feature/state-machine.ts`, `src/types.ts`, new `src/phases/feature/workflow-model.ts`, create or update `tests/phases/feature/state-machine.test.ts`.
  - Implement `FeatureBrief`, slot value/confidence/source, `FeatureWorkflowState = collecting | ready_to_generate | failed | draft_blocked | complete`, document-set types, validation result types, and Candidate Global metadata.
  - Normalize old persisted `completed` to `complete` only for legacy reads; never write new `completed` state.
  - Acceptance Criteria: typecheck passes; new state fixtures normalize correctly; no new workflow code writes `completed` as a persisted state.
  - Verification: `npm run typecheck` exits 0; `npm test` exits 0.

- [ ] 2. Implement natural-language identity and dated directory naming (Agent: unspecified-high | Blocks: [5,9,10] | Blocked By: [])
  - Files: `src/utils/feature-resolver.ts`, new `src/phases/feature/identity.ts`, create `tests/phases/feature/identity.test.ts`.
  - Treat command text as source intent, derive stable English kebab-case semantic names, prepend Asia/Shanghai `YYYY-MM-DD`, handle conflicts with deterministic alternatives or `-2`, and persist the selected identity in current session state.
  - Remove the path that treats user command text as an explicit slug for `/openflow-feature` startup.
  - Acceptance Criteria: Chinese/English natural-language inputs produce dated semantic directories; no random suffixes; conflicts are deterministic; same session reuses the same directory.
  - Verification: `npm run typecheck` exits 0; `npm test` exits 0.

- [ ] 3. Implement `state.md` Feature Brief state manager (Agent: unspecified-high | Blocks: [5,9,12] | Blocked By: [])
  - Files: new `src/phases/feature/brief-state.ts`, `src/commands/feature.ts`, tests under `tests/phases/feature/brief-state.test.ts` and `tests/commands/feature.test.ts`.
  - Read/write `docs/changes/{feature}/state.md` with Feature Identity, slot values, Stable Decisions, Open Questions, status, generated paths, and stable constraints.
  - Use temp-file plus rename atomic writes. If read/parse/write fails, return explicit recovery failure and block formal document generation.
  - Acceptance Criteria: every answered clarification updates `state.md`; corrupt state blocks generation; `state.md` is never included in Cross-Validation.
  - Verification: `npm run typecheck` exits 0; `npm test` exits 0.

- [ ] 4. Define Cross-Validation document contracts (Agent: quick | Blocks: [8,10,11] | Blocked By: [])
  - Files: new `src/phases/feature/cross-validation-types.ts`, new `src/phases/feature/document-reader.ts`, create `tests/phases/feature/cross-validation.test.ts`.
  - Implement fixed document read order, checked-doc metadata, Summary block parse/update contracts, severity issue shape, and ignore rules for `state.md`, `proposal.md`, and `plan.md`.
  - Acceptance Criteria: reader returns existing docs in fixed order; missing `design.md` or `behavior.md` is Critical Blocking; ignored docs never appear in checked list.
  - Verification: `npm run typecheck` exits 0; `npm test` exits 0.

- [ ] 5. Enforce command dispatch and one-session-one-feature guard (Agent: unspecified-high | Blocks: [9,13] | Blocked By: [1,2,3])
  - Files: `src/hooks/chat-command-dispatch.ts`, `src/hooks/chat-message.ts`, `src/hooks/feature-workflow.ts`, `src/commands/feature.ts`, tests `tests/hooks/chat-message-feature.test.ts`, `tests/hooks/feature-workflow.test.ts`.
  - Ensure `/openflow-feature` only enters the formal workflow through dispatch/hook handling; reject a second `/openflow-feature ...` in the same session; treat natural language in the active feature session as supplement/answer/revision.
  - Remove cross-session continuation and old active/incomplete session scans from feature startup.
  - Acceptance Criteria: same-session second feature is rejected; new session starts a new feature; command dispatch failure is explicit and does not fall through to ordinary document-writing chat.
  - Verification: `npm run typecheck` exits 0; `npm test` exits 0.

- [ ] 6. Implement dynamic slot convergence (Agent: unspecified-high | Blocks: [9,13] | Blocked By: [1])
  - Files: `src/phases/feature/convergence.ts`, `src/phases/feature/state-machine.ts`, tests `tests/phases/feature/convergence.test.ts`.
  - Replace fixed questionnaire behavior with slot confidence/source convergence for `problem`, `target-users`, `scope`, `priority`, and `constraints`.
  - Select one next question by blocking risk, high-risk ambiguity, lowest useful confidence, then optional refinement. Treat “按你理解继续” as assumed, not explicit.
  - Acceptance Criteria: key slots `problem`, `scope`, and `constraints` must reach at least medium before formal generation; already high-confidence slots are not re-asked; every turn asks at most one question.
  - Verification: `npm run typecheck` exits 0; `npm test` exits 0.

- [ ] 7. Implement clean document-set selection and renderers (Agent: unspecified-high | Blocks: [9,13] | Blocked By: [1])
  - Files: new `src/phases/feature/document-set.ts`, `src/phases/feature/design-renderer.ts`, `src/phases/feature/behavior-renderer.ts`, `src/phases/feature/prd-generator.ts`, new `src/phases/feature/requirements-renderer.ts`, new `src/phases/feature/decisions-renderer.ts`, `src/commands/feature.ts`, create `tests/phases/feature/document-set.test.ts`.
  - Always generate `design.md` and `behavior.md`; conditionally generate `requirements.md`, `prd.md`, and `decisions.md` with explicit reasons.
  - Delete generation of `design.meta.json` and `behavior.meta.json`; do not default-generate `proposal.md`.
  - Acceptance Criteria: completed features always contain mandatory docs; conditional docs match rule reasons; new generated workspaces contain no meta sidecars and no default proposal.
  - Verification: `npm run typecheck` exits 0; `npm test` exits 0; grep confirms no feature generation write path for `design.meta.json` or `behavior.meta.json`.

- [ ] 8. Implement body-based Cross-Validation engine and Summary updates (Agent: deep | Blocks: [9,10,12,13] | Blocked By: [1,4])
  - Files: new `src/phases/feature/cross-validation.ts`, `src/phases/feature/document-reader.ts`, `src/commands/feature.ts`, tests under `tests/phases/feature/cross-validation.test.ts`.
  - Perform structural checks: mandatory docs, unique Summary blocks, checked-doc consistency, legal status, no meta sidecars, no default proposal rule.
  - Perform conservative semantic checks across design/behavior/requirements/prd/decisions; security, permissions, data deletion, automatic execution, cross-session, and global-governance conflicts default to Critical Blocking.
  - Acceptance Criteria: Passed writes one Summary to each checked formal doc; Blocking prevents complete but can allow explicit draft; Critical prevents complete and draft.
  - Verification: `npm run typecheck` exits 0; `npm test` exits 0.

- [ ] 9. Recompose `/openflow-feature` orchestration (Agent: deep | Blocks: [13,14,16] | Blocked By: [5,6,7,8])
  - Files: `src/commands/feature.ts`, `src/phases/feature/state-machine.ts`, `src/phases/feature/convergence.ts`, `src/phases/feature/brief-state.ts`, `src/phases/feature/document-set.ts`, `src/phases/feature/cross-validation.ts`, `src/phases/feature/design-renderer.ts`, `src/phases/feature/behavior-renderer.ts`, `tests/commands/feature.test.ts`.
  - Implement the required order: Intent Gate → current session feature detection → `state.md` restore/init → Feature Brief update → slot convergence → document-set selection → pre-generation confirmation → document writes → Cross-Validation → `complete`/`failed`/`draft_blocked` output.
  - Preserve complete idempotency, failed/draft recovery advice, Candidate Global completion notice, and complete exit when formal docs change.
  - Acceptance Criteria: happy path generates docs and Passed Summary; state write failure blocks docs; failed/draft states never output implementation-ready next steps.
  - Verification: `npm run typecheck` exits 0; `npm test` exits 0.

- [ ] 10. Gate `/openflow-writing-plan` on complete validated feature docs (Agent: unspecified-high | Blocks: [13,16] | Blocked By: [2,4,8])
  - Files: `src/commands/writing-plan.ts`, `src/hooks/chat-command-dispatch.ts`, tests `tests/commands/writing-plan.test.ts` and relevant hook tests.
  - Resolve either full dated directory name or unambiguous semantic suffix; reject ambiguous semantic suffixes and require full directory name.
  - Before emitting the packet, read `state.md` and formal document bodies, require `complete`, mandatory docs present, Cross-Validation body recomputation Passed, and no Blocking/Critical gaps.
  - Remove `design.meta.json`/`requirements.json` sidecar priority logic.
  - Acceptance Criteria: unique semantic suffix resolves; ambiguous suffix rejects; Summary Passed but body recomputation Failed rejects; failed/draft/missing docs reject.
  - Verification: `npm run typecheck` exits 0; `npm test` exits 0.

- [ ] 11. Implement safe Candidate Global archive promotion (Agent: unspecified-high | Blocks: [13,16] | Blocked By: [4,8])
  - Files: `src/commands/archive.ts`, create or update `tests/commands/archive.test.ts`.
  - Parse `decisions.md` Candidate Global entries. Promote automatically only when a target is locatable and non-conflicting; `Promotion note: target TBD` warns and does not promote; conflicts produce a report and never silently overwrite ADR/current docs.
  - De-duplicate decisions by title and semantic similarity; reversed decisions update existing entries instead of appending conflicts.
  - Acceptance Criteria: Candidate Global decisions are detected; target TBD warning is non-blocking; conflicting ADR content is not overwritten.
  - Verification: `npm run typecheck` exits 0; `npm test` exits 0.

- [ ] 12. Add feature document edit transaction guard (Agent: unspecified-high | Blocks: [13,16] | Blocked By: [3,8])
  - Files: new `src/phases/feature/edit-transaction.ts`, `src/hooks/chat-message.ts`, `src/commands/feature.ts`, create `tests/phases/feature/edit-transaction.test.ts`, update `tests/hooks/chat-message-feature.test.ts`.
  - Support explicit review of user-edited Markdown without automatic body edits. For AI natural-language edits, require restated intent and confirmation, restrict writes to `docs/changes/{feature}/*`, then run Cross-Validation.
  - Acceptance Criteria: review reports without auto-fixing; unconfirmed AI edits do not write; attempts to edit outside current feature workspace are rejected.
  - Verification: `npm run typecheck` exits 0; `npm test` exits 0.

- [ ] 13. Update and expand tests for new semantics (Agent: unspecified-high | Blocks: [14,16] | Blocked By: [9,10,11,12])
  - Files: `tests/commands/feature.test.ts`, `tests/hooks/chat-message-feature.test.ts`, `tests/hooks/feature-workflow.test.ts`, `tests/commands/writing-plan.test.ts`, `tests/phases/feature/state-machine.test.ts`, `tests/phases/feature/convergence.test.ts`, `tests/phases/feature/behavior-renderer.test.ts`, `tests/phases/feature/context-harvest.test.ts`, `tests/phases/feature/cross-validation.test.ts`, `tests/phases/feature/document-set.test.ts`, `tests/phases/feature/edit-transaction.test.ts`, `tests/commands/archive.test.ts`.
  - Replace old expectations for slug commands, generated `design.meta.json`, completion-cleared active binding, fixed question order, and cross-session resume.
  - Add tests for natural-language identity, one-session guard, `state.md`, dynamic convergence, conditional docs, no proposal/meta, Cross-Validation severity, writing-plan gate, archive promotion, and edit authorization.
  - Acceptance Criteria: tests fail if legacy proposal/meta/cross-session behavior returns; tests fail if writing-plan accepts ambiguous semantic names.
  - Verification: `npm test` exits 0.

- [ ] 14. Remove legacy fallback paths and dead code (Agent: unspecified-high | Blocks: [16] | Blocked By: [13])
  - Files: `src/commands/feature.ts`, `src/commands/writing-plan.ts`, `src/utils/feature-resolver.ts`, `src/config.ts`, `tests/commands/feature.test.ts`, `tests/commands/writing-plan.test.ts`, `tests/plan/enhancer.test.ts`, `tests/utils/drift-detector.test.ts`.
  - Remove or isolate `inferFeatureIdentityFromSessionHistory`, active feature fallback for feature startup, sidecar reads/writes, default proposal assumptions, fixed-question dead paths, and new writes of legacy `completed` state.
  - Run GitNexus impact analysis before deleting or moving shared symbols, per `AGENTS.md`.
  - Acceptance Criteria: grep finds no feature-generation write path for meta sidecars; `/openflow-feature` no longer infers identity from assistant history; typecheck/test pass.
  - Verification: `npm run typecheck` exits 0; `npm test` exits 0; GitNexus impact/detect output is reviewed for intended scope.

- [ ] 15. Align runtime copy and command help (Agent: writing | Blocks: [16] | Blocked By: [9,10,11])
  - Files: `src/commands/init-content.ts`, `src/commands/writing-plan.ts`, `src/commands/manifest.ts`, `src/command-registration.ts`, related tests.
  - Update runtime/help text so `/openflow-feature` uses requirement-description wording, not `<feature-name>`. Keep `/openflow-writing-plan` planning-only and quality-gate-after-implementation wording.
  - Do not update website docs; use `docs/*.md` only if a current runtime doc test requires it.
  - Acceptance Criteria: command help no longer describes `/openflow-feature` argument as feature name; writing-plan packet remains plan-only; quality gate instruction is present.
  - Verification: `npm run typecheck` exits 0; `npm test` exits 0.

- [ ] 16. Run final integration verification and quality gate handoff (Agent: unspecified-high | Blocks: [Final verification] | Blocked By: [13,14,15])
  - Files: `.sisyphus/evidence/task-16-integration.txt`, `.sisyphus/evidence/task-16-quality-gate.txt`, plus any final fixes required by verification.
  - Run `npm run typecheck`, `npm test`, and `npm run build`; save outputs as evidence. After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.
  - Acceptance Criteria: typecheck, tests, build, and quality gate readiness all pass; any pre-existing failures are documented with evidence and not hidden.
  - Verification: `npm run typecheck` exits 0; `npm test` exits 0; `npm run build` exits 0; `openflow-quality-gate` reports readiness.

## Final Verification Wave

- [ ] F1. Plan Compliance Audit (Agent: oracle | Blocks: [] | Blocked By: [16])
  - Tool: oracle review agent.
  - Steps: Review the completed implementation diff, this plan file, and evidence files `.sisyphus/evidence/task-16-integration.txt` and `.sisyphus/evidence/task-16-quality-gate.txt`.
  - Expected: Oracle confirms every plan task 1-16 is implemented or explicitly deferred with user approval, no required acceptance criterion is missing, and quality gate readiness evidence exists.
  - Evidence: `.sisyphus/evidence/final-f1-plan-compliance.md`.
  - Pass/Fail: PASS only if all plan requirements are satisfied; FAIL if any task lacks implementation, verification, or evidence.

- [ ] F2. Code Quality Review (Agent: unspecified-high | Blocks: [] | Blocked By: [16])
  - Tool: reviewer or unspecified-high code review agent.
  - Steps: Inspect modified source and tests for maintainability, duplicated logic, unsafe filesystem handling, stale fallback behavior, and violations of the new rules; inspect `git diff` and the full test/typecheck/build outputs.
  - Expected: Reviewer reports no blocking code quality issues, no hidden legacy fallback that contradicts the design, and no untested critical path.
  - Evidence: `.sisyphus/evidence/final-f2-code-quality.md`.
  - Pass/Fail: PASS only if no blocking code quality issues remain; FAIL if reviewer identifies required fixes.

- [ ] F3. Real Manual QA (Agent: unspecified-high | Blocks: [] | Blocked By: [16])
  - Tool: Bash test execution with isolated temporary fixtures.
  - Steps: Execute representative end-to-end scenarios through tests or a temporary workspace: natural-language `/openflow-feature` start, same-session second-feature rejection, no `proposal.md`/meta sidecars, Cross-Validation Critical failure, valid `/openflow-writing-plan`, rejected invalid `/openflow-writing-plan`, and Candidate Global archive warning/conflict behavior.
  - Expected: Actual observed outputs match the behavior contract; generated files exist only where expected; obsolete files are absent.
  - Evidence: `.sisyphus/evidence/final-f3-manual-qa.txt`.
  - Pass/Fail: PASS only if every listed scenario is executed and observed output matches expected behavior; FAIL if any scenario is skipped or mismatches.

- [ ] F4. Scope Fidelity Check (Agent: deep | Blocks: [] | Blocked By: [16])
  - Tool: deep review agent.
  - Steps: Compare final diff against `docs/changes/2026-05-25-openflow-feature-optimization/requirements.md`, `design.md`, `behavior.md`, and `decisions.md`; verify no website docs or unrelated workflow features were modified unless directly required by tests; verify implementation does not exceed the plan scope.
  - Expected: Deep reviewer confirms all implemented behavior is within the approved feature scope and all explicit exclusions are respected.
  - Evidence: `.sisyphus/evidence/final-f4-scope-fidelity.md`.
  - Pass/Fail: PASS only if no scope creep or missing required scope is found; FAIL if implementation adds unrelated behavior or omits required design constraints.

## Commit Strategy

Commit by cohesive task when feasible. Before each commit, inspect `git status`, `git diff`, and `git log --oneline -10`; stage only intended files. Before modifying shared symbols or deleting legacy paths, run GitNexus impact analysis; before committing, run `gitnexus_detect_changes({scope: "all"})` and confirm affected flows match this plan.

## Success Criteria

The implementation is successful when `/openflow-feature` is natural-language, session-scoped, `state.md`-backed, validation-gated, and free of default proposal/meta legacy behavior; `/openflow-writing-plan` cannot plan from incomplete or invalid designs; archive promotion is conflict-aware; `npm run typecheck`, `npm test`, `npm run build`, and `openflow-quality-gate` all pass.
