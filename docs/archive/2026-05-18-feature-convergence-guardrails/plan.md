# Plan: feature-convergence-guardrails

## Overview

Implement the redesigned `/openflow-feature` behavior as a natural-language-first gentle design assistant. The feature command should work without requiring users to provide a slug, derive safe internal feature identity from active context or natural-language intent, stop treating fixed-question completion as readiness, introduce convergence/readiness decisions before document generation, support one valuable follow-up question at a time, allow `Draft with Assumptions` when users proceed before full convergence, and generate scenario-appropriate behavior documents without forcing code-level discussion.

## Design Context

- Design workspace: `docs/changes/2026-05-15-feature-convergence-guardrails/`
- Design source: `docs/changes/2026-05-15-feature-convergence-guardrails/design.md`
- Behavior source: `docs/changes/2026-05-15-feature-convergence-guardrails/behavior.md`
- Existing command entrypoint: `src/commands/feature.ts`
- Existing slash command dispatch: `src/hooks/chat-command-dispatch.ts`
- Existing tool registration: `src/index.ts`
- Existing feature trigger/identity helpers: `src/hooks/feature-workflow.ts`, `src/utils/feature-resolver.ts`, `src/utils/security.ts`
- Existing feature state/model logic: `src/phases/feature/state-machine.ts`, `src/phases/feature/requirement-model.ts`, `src/phases/feature/constraint-derivation.ts`
- Existing renderers: `src/phases/feature/design-renderer.ts`, `src/phases/feature/behavior-renderer.ts`
- Existing skill copy: `src/skills/feature-skill.ts`
- Existing tests to update/extend: `tests/commands/feature.test.ts`, `tests/phases/feature/behavior-renderer.test.ts`, `tests/hooks/feature-workflow.test.ts`

Key constraints from design:

- `/openflow-feature` should not require a user-provided feature name argument.
- Natural-language input must be treated as feature intent before path-safe slug sanitization.
- Internal feature slugs must be derived automatically, stable, safe, and collision-aware; user-facing title/source intent should be preserved separately where useful.
- Fixed questions become candidate dimensions, not a required flow.
- Document generation requires a convergence/readiness decision.
- If not converged, ask exactly one key question by default.
- If user says skip/proceed/generate anyway, generate `Draft with Assumptions` and clearly separate confirmed facts, assumptions, pending confirmations, and risks.
- Keep product/workflow-level language unless the user asks for code-level implementation design.
- `behavior.md` must describe observable behavior, not internal implementation.

## Execution Strategy

### Parallel Execution Waves

Wave 1: Establish natural-language feature identity resolution and convergence model.

- Task 1: Add feature identity resolution for no-argument and natural-language `/openflow-feature` entry.
- Task 2: Add convergence decision model and deterministic readiness rules.
- Task 3: Add tests covering identity resolution, convergence, skip/proceed feedback, and draft-with-assumptions decisions.

Wave 2: Integrate convergence into the command flow and session state.

- Task 4: Update feature state/session handling to support derived identity metadata, candidate questions, flow-control feedback, and draft status.
- Task 5: Update `handleFeature`, tool schema, and slash dispatch to resolve identity, ask one key question, or generate based on convergence decisions.

Wave 3: Update document generation and user-facing guidance.

- Task 6: Update design rendering to produce two-layer documents, derived identity metadata, and `Draft with Assumptions` sections.
- Task 7: Update behavior rendering to produce observable, scenario-appropriate behavior documents.
- Task 8: Update `/openflow-feature` skill text and command result copy to describe no-argument natural-language behavior and gentle convergence.

Wave 4: End-to-end verification and quality gate.

- Task 9: Add/update integration tests and run full verification, then invoke quality gate.

### Dependency Matrix

| Task | Blocked By | Blocks |
|------|------------|--------|
| 1. Feature identity resolution | None | 3, 4, 5, 6, 8, 9 |
| 2. Convergence decision model | None | 3, 4, 5, 6, 7, 9 |
| 3. Identity/convergence tests | 1, 2 | 4, 5, 9 |
| 4. Session/state support | 1, 2, 3 | 5, 9 |
| 5. Command/tool/dispatch integration | 1, 2, 3, 4 | 6, 7, 8, 9 |
| 6. Design renderer updates | 1, 2, 5 | 9 |
| 7. Behavior renderer updates | 2, 5 | 9 |
| 8. Skill/result copy updates | 1, 5 | 9 |
| 9. Integration verification and quality gate | 1, 2, 3, 4, 5, 6, 7, 8 | None |

## Tasks

- [x] 1. Add feature identity resolution for no-argument and natural-language entry (Agent: unspecified-high | Blocks: [3, 4, 5, 6, 8, 9] | Blocked By: [])
  - Agent Profile: Category `unspecified-high`; Skills `[]`; reason: central UX and persistence change affecting command dispatch, tool arguments, safe path naming, and active-session lookup.
  - Parallelization: Wave 1; can run in parallel with Task 2.
  - Files: update `src/commands/feature.ts`, `src/hooks/chat-command-dispatch.ts`, `src/index.ts`, `src/utils/feature-resolver.ts`, `src/utils/security.ts`; update `src/hooks/feature-workflow.ts` only if existing extraction helpers should be shared instead of duplicated.
  - Implementation instructions: make the public feature tool argument optional; allow slash `/openflow-feature` with no argument; treat command arguments that are not safe slugs as natural-language intent. Resolve identity using active session binding, AI/tool-provided slug, derived slug from natural-language intent, latest unambiguous incomplete feature session, latest unambiguous plan/design workspace, then deterministic collision-aware fallback. Preserve human-readable `featureTitle` and `sourceIntent` where available. Raw sanitization failure must not be the normal user-facing error path.
  - Acceptance Criteria: `/openflow-feature` without arguments continues an active feature session when one exists; `/openflow-feature 为 quality gate 引入 evidence-ledger 机制` creates or continues a session without “Feature name is too short after sanitization”; ambiguous multiple active candidates produces one natural-language disambiguation prompt, not a slug request; `npm run typecheck` completes without type errors.
  - QA Scenarios: Run `npm test -- tests/commands/feature.test.ts`; expected: command identity tests pass. Run `npm test -- tests/hooks/chat-message-feature.test.ts`; expected: hook/dispatch tests pass. Run `npm run typecheck`; expected: TypeScript exits successfully.

- [x] 2. Add convergence decision model and deterministic readiness rules (Agent: unspecified-high | Blocks: [3, 4, 5, 6, 7, 9] | Blocked By: [])
  - Agent Profile: Category `unspecified-high`; Skills `[]`; reason: requires careful workflow modeling across feature state and generated artifacts.
  - Parallelization: Wave 1; can run in parallel with Task 1.
  - Files: create `src/phases/feature/convergence.ts`; update `src/phases/feature/requirement-model.ts` only if additional public model fields are required.
  - Implementation instructions: define a structured convergence decision that can express `ask_next`, `ready_to_generate`, and `draft_with_assumptions`; include known facts, blocking gaps, assumptions, pending confirmations, recommended next question, and artifact policy for design/behavior generation. Keep fixed question labels as candidate dimensions only, not required states. Implement deterministic baseline rules from `design.md`: problem/improvement target, rough boundary, expected observable/process result, and whether unresolved unknowns can be assumptions.
  - Acceptance Criteria: `src/phases/feature/convergence.ts` exports a typed decision API; readiness does not depend on answering all old fixed questions; low-signal input returns `ask_next`; explicit proceed/skip feedback can return `draft_with_assumptions`; `npm run typecheck` completes without type errors.
  - QA Scenarios: Run `npm run typecheck`; expected: TypeScript exits successfully. Run targeted tests added in Task 3 after both tasks are complete; expected: convergence semantics pass.

- [x] 3. Add identity, convergence, and user-feedback decision tests (Agent: quick | Blocks: [4, 5, 9] | Blocked By: [1, 2])
  - Agent Profile: Category `quick`; Skills `[]`; reason: focused unit-test coverage for new identity and decision semantics.
  - Parallelization: Wave 1 follow-up; begins once Tasks 1 and 2 expose public API names.
  - Files: create `tests/phases/feature/convergence.test.ts`; update `tests/commands/feature.test.ts`, `tests/hooks/chat-message-feature.test.ts`, and `tests/index.test.ts` for optional tool argument/schema behavior.
  - Implementation instructions: cover no-argument active-session continuation, Chinese/mixed-language natural intent becoming a safe internal slug, ambiguous identity disambiguation, clear feature request readiness, vague feature request asking one key question, user skip/proceed feedback producing assumptions, user rejection of code-level discussion lowering abstraction, and no dependency on all five old fixed questions.
  - Acceptance Criteria: tests assert that user-provided slug is optional; tests assert natural-language text is not rejected by `sanitizeFeatureName` failures; tests assert “target users” is not mandatory when inferable; tests assert `Draft with Assumptions` is selected only when user feedback asks to proceed before full convergence; tests assert blocking design-direction gaps do not generate final documents.
  - QA Scenarios: Run `npm test -- tests/phases/feature/convergence.test.ts`; expected: all convergence tests pass. Run `npm test -- tests/commands/feature.test.ts`; expected: identity and command tests pass. Run `npm test -- tests/hooks/chat-message-feature.test.ts`; expected: slash-command dispatch behavior passes.

- [x] 4. Update feature session/state support for derived identity, candidate questions, and draft status (Agent: unspecified-high | Blocks: [5, 9] | Blocked By: [1, 2, 3])
  - Agent Profile: Category `unspecified-high`; Skills `[]`; reason: changes persisted workflow state and backward compatibility for existing `.sisyphus/feature/*.json` sessions.
  - Parallelization: Wave 2; can run after Wave 1; can overlap with Task 4 only after state shape is agreed.
  - Files: update `src/phases/feature/state-machine.ts`; update tests in `tests/hooks/feature-workflow.test.ts` if lifecycle expectations change.
  - Implementation instructions: preserve compatibility with version 2/3 sessions; add state needed to record derived `featureSlug`, optional `featureTitle`, `sourceIntent`, convergence decisions, current assumptions, pending confirmations, skipped dimensions, abstraction preference, and draft/final generation status. Fixed `QUESTIONS` may remain as candidate prompt templates but must not determine completion. Ensure normalization fills safe defaults for legacy sessions.
  - Acceptance Criteria: legacy sessions still normalize without throwing; active/completed session lookup still works; sessions can preserve human-readable title/source intent separately from path-safe slug; skipped questions do not reappear as mandatory blockers; session can represent final generated docs and draft-with-assumptions generated docs distinctly.
  - QA Scenarios: Run `npm test -- tests/hooks/feature-workflow.test.ts`; expected: lifecycle tests pass. Run `npm test -- tests/commands/feature.test.ts`; expected: session persistence assertions pass after updates.

- [x] 5. Integrate identity and convergence decisions into command/tool/dispatch flow (Agent: unspecified-high | Blocks: [6, 7, 8, 9] | Blocked By: [1, 2, 3, 4])
  - Agent Profile: Category `unspecified-high`; Skills `[]`; reason: central command flow change with risk of regressions in slash-command interaction.
  - Parallelization: Wave 2; depends on Tasks 1-4.
  - Files: update `src/commands/feature.ts`, `src/hooks/chat-command-dispatch.ts`, `src/index.ts`; update tests in `tests/commands/feature.test.ts`, `tests/hooks/chat-message-feature.test.ts`, `tests/index.test.ts`, and `tests/index-runtime-registration.test.ts` as needed.
  - Implementation instructions: replace direct `shouldGenerateDesign(session)` completion behavior with identity-aware convergence evaluation. On missing but inferable identity, resolve internally. On ambiguous identity, return exactly one natural-language disambiguation prompt. On `ask_next`, return exactly one key question with rationale and optional choices. On `ready_to_generate`, generate final docs. On `draft_with_assumptions`, generate docs marked as draft. Treat user messages such as “跳过”, “先生成”, “按你的判断”, “不讨论代码”, and “看不懂” as flow-control signals. Keep idempotency using `lastConsumedMessageId`.
  - Acceptance Criteria: a clear feature request no longer requires a manual slug and no longer walks through all old fixed questions; a vague feature request asks one meaningful question; explicit skip/proceed generates or records assumptions without repeated questioning; duplicate message handling remains idempotent; command output summarizes derived identity, consensus, assumptions, generated files, and next step.
  - QA Scenarios: Run `npm test -- tests/commands/feature.test.ts`; expected: command flow tests pass. Run `npm run typecheck`; expected: TypeScript exits successfully.

- [x] 6. Update `design.md` rendering to two-layer documents, identity metadata, and draft assumptions (Agent: unspecified-high | Blocks: [9] | Blocked By: [1, 2, 5])
  - Agent Profile: Category `unspecified-high`; Skills `[]`; reason: changes generated artifact contract and sidecar metadata expectations.
  - Parallelization: Wave 3; can run in parallel with Task 7 and Task 8 after Task 5.
  - Files: update `src/phases/feature/design-renderer.ts`; update related expectations in `tests/commands/feature.test.ts`; add or update `tests/phases/feature/design-renderer.test.ts` if no focused renderer test exists.
  - Implementation instructions: render a human-readable consensus summary first, followed by execution constraints. Include human-readable feature title/source intent when available and keep the safe slug as metadata/traceability, not as the primary user-facing concept. Include sections for confirmed facts, assumptions, pending confirmations, in-scope, out-of-scope, success criteria, and when to return to the user. If the convergence status is draft, place `Draft with Assumptions / 带假设的草稿` at the top and ensure assumptions are not worded as final constraints.
  - Acceptance Criteria: generated final design docs do not contain old questionnaire scaffolding; docs preserve readable title/source intent separately from internal slug; draft docs clearly mark assumptions; human summary appears before execution constraints; no code-level implementation structure is generated unless present in confirmed user intent.
  - QA Scenarios: Run `npm test -- tests/commands/feature.test.ts`; expected: generated `design.md` assertions pass. Run `npm test -- tests/phases/feature/design-renderer.test.ts` if added; expected: renderer tests pass.

- [x] 7. Update `behavior.md` rendering for observable scenario-specific behavior (Agent: unspecified-high | Blocks: [9] | Blocked By: [2, 5])
  - Agent Profile: Category `unspecified-high`; Skills `[]`; reason: existing behavior renderer has fixed headings and must shift to scenario-appropriate observable behavior.
  - Parallelization: Wave 3; can run in parallel with Task 6 and Task 8 after Task 5.
  - Files: update `src/phases/feature/behavior-renderer.ts`; update `tests/phases/feature/behavior-renderer.test.ts`.
  - Implementation instructions: preserve the filename `behavior.md`, but generate behavior as an observable contract. Support scenario shapes for command, hook, workflow, documentation governance, and error/exception behavior. Avoid internal function/module/type details. Allow minimal behavior output when behavior is not externally or process-observably changing. Ensure `Draft with Assumptions` behavior documents separate confirmed behavior from assumptions.
  - Acceptance Criteria: tests no longer require one rigid heading set for every feature; behavior docs describe triggers, non-triggers, observable outcomes, failure/recovery where relevant, and documentation governance where relevant; internal implementation details are absent from generated scaffolding.
  - QA Scenarios: Run `npm test -- tests/phases/feature/behavior-renderer.test.ts`; expected: renderer tests pass with scenario-specific expectations. Run `npm test -- tests/commands/feature.test.ts`; expected: command-generated `behavior.md` assertions pass.

- [x] 8. Update skill/help text and generated result messaging (Agent: writing | Blocks: [9] | Blocked By: [1, 5])
  - Agent Profile: Category `writing`; Skills `[]`; reason: user-facing copy must match the new product behavior without code-level framing.
  - Parallelization: Wave 3; can run in parallel with Tasks 6 and 7 after Task 5.
  - Files: update `src/skills/feature-skill.ts`, `src/commands/manifest.ts`; update tests in `tests/skills/registration.test.ts` only if wording snapshots or discovery assumptions require changes.
  - Implementation instructions: describe `/openflow-feature` as a no-argument, natural-language-first gentle design assistant. Remove or soften wording that implies users must provide a feature name, exactly five fixed questions, or automatic generation after required answers. Explain derived feature identity, one-key-question behavior, skip/proceed handling, `Draft with Assumptions`, two-layer documents, and scenario-specific behavior docs. Keep command-only registration behavior unchanged.
  - Acceptance Criteria: skill text no longer says users start with `/openflow-feature <feature>` as the required public entry; skill text no longer says the workflow always advances one fixed question list until all answers are collected; help text tells users they can use natural language, skip, or ask for a draft; command-only registration tests remain valid.
  - QA Scenarios: Run `npm test -- tests/skills/registration.test.ts`; expected: registration tests pass. Run `npm test -- tests/index-runtime-registration.test.ts`; expected: command-only registration remains unchanged.

- [x] 9. Complete integration verification and invoke quality gate (Agent: unspecified-high | Blocks: [] | Blocked By: [1, 2, 3, 4, 5, 6, 7, 8])
  - Agent Profile: Category `unspecified-high`; Skills [`openflow-quality-gate`] for final readiness; reason: validates cross-module behavior and project readiness after implementation.
  - Parallelization: Wave 4; final task after all implementation tasks.
  - Files: update `tests/commands/feature.test.ts`, `tests/hooks/chat-message-feature.test.ts`, `tests/phases/feature/convergence.test.ts`, `tests/phases/feature/behavior-renderer.test.ts`, and any additional focused tests needed for changed behavior.
  - Implementation instructions: run focused tests first, then full test/typecheck commands. Confirm no generated docs contain old fixed-question scaffold unless explicitly preserved as candidate prompt metadata. Confirm no normal natural-language `/openflow-feature` path can surface “Feature name is too short after sanitization”. Confirm quality gate is invoked after implementation.
  - Acceptance Criteria: `npm run typecheck` passes; `npm test -- tests/commands/feature.test.ts` passes; `npm test -- tests/hooks/chat-message-feature.test.ts` passes; `npm test -- tests/phases/feature/convergence.test.ts` passes; `npm test -- tests/phases/feature/behavior-renderer.test.ts` passes; `npm test` passes or any failures are documented as unrelated with evidence; quality gate reports readiness before completion is claimed.
  - QA Scenarios: Run `npm run typecheck`; expected: no TypeScript errors. Run `npm test`; expected: full suite passes. After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.

## Execution Unit Estimate

- Tasks: 9
- Estimated execution units: 20
- Largest same-wave concurrency: 3 tasks in Wave 3
- Bounded complexity check: at the 20-unit threshold; no wave exceeds 4 parallel tasks.

## Self-Check

- No placeholders: pass.
- Concrete file paths: pass.
- Verification commands: pass.
- Bounded complexity: pass.
- Parser-compatible tasks: pass; every task in `## Tasks` starts with `- [ ]`.
