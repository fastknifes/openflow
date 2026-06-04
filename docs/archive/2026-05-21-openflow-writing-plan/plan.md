# Plan: openflow-writing-plan

## Overview

Rewrite `openflow-writing-plan` so that agent selection is **program-enforced**, not left to Skill text. When OMO is present, the command routes execution to **Prometheus**; otherwise it routes to OpenCode's native **`plan`** agent. The Skill itself is upgraded with superpowers-style structural steps (Scope Check, File Structure, Plan Document Header, Task Structure, No Placeholders, Remember, Self-Review, Execution Handoff) while preserving Prometheus' native interview behavior (blocking clarification when requirements are unclear). All output paths become config-driven, removing hardcoded `docs/` fallbacks.

## Design Context

- Change workspace: `docs/changes/2026-05-21-openflow-writing-plan/`
- Existing OMO detection helper: `src/utils/omo-detection.ts` (`detectOmoExecutionFlow`)
- Primary change surfaces:
  - `src/skills/writing-plan-skill.ts` — Skill prompt rewrite
  - `src/commands/writing-plan.ts` — handler & packet rewrite; config-based paths
  - `src/hooks/chat-command-dispatch.ts` — route `/openflow-writing-plan` through handler and emit agent-targeted next step
  - `src/plan/enhancer.ts` — pass config into `readDesignContextPacket` for custom paths
  - `tests/commands/writing-plan.test.ts` & `tests/skills/registration.test.ts` — update assertions

## Execution Strategy

### Parallel Execution Waves

Wave 1 (no deps):
- Task 1: Add `detectPlanAgent` helper + update dispatch hook to call `handleWritingPlan` and route agent
- Task 2: Fix config-based path resolution in `writing-plan.ts` and `findDatedChangeCandidatePaths`
- Task 3: Rewrite `writing-plan-skill.ts` with superpowers steps, agent routing instructions, and blocking clarification

Wave 2 (depends on Wave 1):
- Task 4: Update packet format, Next Step guidance, and OMO/Prometheus compatibility notes in `writing-plan.ts`
- Task 5: Verify enhancer/parser compatibility after path resolution changes

Wave 3 (depends on Wave 1–2):
- Task 6: Update tests (agent routing, config paths, Skill content contracts)

Wave 4 (depends on Wave 3):
- Task 7: Build, typecheck, and run tests

### Dependency Matrix

| Task | Blocked By | Blocks |
|------|------------|--------|
| 1 | — | 4 |
| 2 | — | 4, 5 |
| 3 | — | 6 |
| 4 | 1, 2 | 6 |
| 5 | 2 | 6 |
| 6 | 3, 4, 5 | 7 |
| 7 | 6 | — |

## Tasks

- [ ] 1. Add agent detection helper and update command dispatch (Agent: quick | Blocks: [4] | Blocked By: [])
  - Add `detectPlanAgent(ctx, message?): 'prometheus' | 'plan'` in a new file `src/utils/agent-router.ts` (or extend `omo-detection.ts`).
  - Logic: if `detectOmoExecutionFlow` returns `'omo'` → `'prometheus'`; else → `'plan'`.
  - Update `src/hooks/chat-command-dispatch.ts` lines 102-120:
    - Call `handleWritingPlan(ctx, resolvedFeature)` instead of only `readDesignContextPacket`.
    - Append `detectPlanAgent` result into the packet (e.g., `**Agent Target**: prometheus`).
    - If agent is `prometheus`, append instruction: `Switch to Prometheus planner to continue.`
    - If agent is `plan`, append instruction: `Switch to OpenCode plan agent to continue.`
  - **Acceptance Criteria**: dispatch tests verify both `prometheus` and `plan` targets are returned; no regression on other commands.

- [ ] 2. Fix config-based path resolution in writing-plan handler (Agent: quick | Blocks: [4, 5] | Blocked By: [])
  - In `src/commands/writing-plan.ts`:
    - Pass `ctx.config` to `getChangePlansPath(ctx.directory, sanitizedFeature, ctx.config)` and `getPlanPath(ctx.directory, sanitizedFeature, ctx.config)`.
    - Update `findDatedChangeCandidatePaths` signature to accept `config?: OpenFlowConfig` and use `config?.paths.changes ?? defaultConfig.paths.changes` instead of hardcoded `docs/changes`.
    - Update `readDesignContextPacket` to accept optional `config` and forward it.
  - **Acceptance Criteria**: `writing-plan.test.ts` passes with custom `paths.changes` and `paths.plans` configs; no hardcoded `docs/changes` in handler.

- [ ] 3. Rewrite writing-plan Skill with superpowers steps (Agent: writing | Blocks: [6] | Blocked By: [])
  - Replace the existing 8 steps in `src/skills/writing-plan-skill.ts` with:
    1. **Scope Check** — confirm design docs exist; if missing, suggest `/openflow-feature` first.
    2. **File Structure** — list expected output files (config-based paths) and verify directories exist.
    3. **Plan Document Header** — enforce `# Plan: {feature}` and metadata block.
    4. **Task Structure** — require `## Tasks` with checkbox/numbered items, waves, dependency matrix, agent profile per task.
    5. **No Placeholders** — every task must have concrete file paths and verification commands; TBD/placeholder tasks are forbidden.
    6. **Remember** — preserve design constraints and acceptance criteria from the design packet in every relevant task.
    7. **Self-Review** — before saving, run checklist: no placeholders, bounded complexity, parser-compatible, task count proportional.
    8. **Execution Handoff** — stop after saving; do not execute. If Prometheus is the target, hand off to Prometheus; if `plan` agent, hand off to OpenCode `plan`.
  - Add **Blocking Clarification** rule: when requirements or design context are unclear, **stop and ask clarifying questions** instead of generating a plan. Do not proceed with `[DECISION NEEDED]` placeholders.
  - Add **Prometheus Precedence** rule: if Prometheus is the target, OpenFlow only prepares the design context packet and constraints; Prometheus owns interview, task detail, and QA scenarios. Do not override Prometheus behavior.
  - Update Skill `description` to mention agent routing (`prometheus` or `plan`).
  - **Acceptance Criteria**: `registration.test.ts` asserts presence of each superpowers step label, blocking clarification language, and Prometheus precedence note.

- [ ] 4. Update command packet format and Next Step guidance (Agent: quick | Blocks: [6] | Blocked By: [1, 2])
  - In `src/commands/writing-plan.ts`:
    - Add `**Agent Target**: {prometheus|plan}` section.
    - Replace deprecated `/openflow-verify` in Next Step with `openflow-quality-gate`.
    - Ensure output paths reflect config-based values (from Task 2).
    - Add note: if design context is insufficient, the executor must perform blocking clarification before planning.
  - **Acceptance Criteria**: packet contains agent target, quality-gate reference, and config-derived paths; no `/openflow-verify` string.

- [ ] 5. Verify enhancer and parser compatibility (Agent: quick | Blocks: [6] | Blocked By: [2])
  - In `src/plan/enhancer.ts`, ensure `readDesignContextPacket` receives `config` so custom `paths.changes` are respected.
  - Confirm `src/plan/parser.ts` still parses `## Tasks` and `## TODOs` correctly after any header changes.
  - Run existing enhancer and parser tests.
  - **Acceptance Criteria**: all existing parser/enhancer tests pass without modification; if any fail, fix path-passing only.

- [ ] 6. Update tests for agent routing, config paths, and Skill contracts (Agent: quick | Blocks: [7] | Blocked By: [3, 4, 5])
  - `tests/commands/writing-plan.test.ts`:
    - Add tests for `prometheus` vs `plan` agent target in packet.
    - Add tests for custom `paths.changes` and `paths.plans` in packet output.
    - Update existing assertions that hardcode `docs/changes` or `.sisyphus/plans` to use configured values.
    - Assert Next Step references `openflow-quality-gate`, not `/openflow-verify`.
  - `tests/skills/registration.test.ts`:
    - Add positive assertions for superpowers step labels in Skill content.
    - Add assertion for blocking clarification language.
    - Add assertion for Prometheus precedence / agent routing mention.
    - Keep existing negative-scope tests (no forbidden phrases).
  - **Acceptance Criteria**: new tests pass; no existing test regressions unless intentionally updated.

- [ ] 7. Build, typecheck, and run test suite (Agent: quick | Blocks: [] | Blocked By: [6])
  - Run `npm run build` (or `tsc --noEmit`) and `npm test`.
  - Fix any type errors introduced by new helper signatures or config propagation.
  - **Acceptance Criteria**: build exits 0; all tests green; no pre-existing failures newly introduced.

## Notes

- **Prometheus conflict resolution**: If any instruction in the upgraded Skill conflicts with Prometheus' built-in interview/clearance/plan-template behavior, Prometheus wins. OpenFlow's role is limited to producing the design context packet and saving the artifact; Prometheus drives the actual planning conversation.
- **Path config source of truth**: `defaultConfig.paths.changes` and `defaultConfig.paths.plans` are defaults; user config overrides them. The Skill text should mention that paths come from configuration, not hardcoded values.
- **Backward compatibility**: The parser already accepts both `## Tasks` and `## TODOs`; no breaking change for existing plans.
- **No placeholders in this plan**: Every task specifies exact files and verification commands.


---
## Verification Phase

### Security Checks
- **Secret Scan**: Check for accidentally committed secrets
- **Vulnerability Scan**: Run dependency vulnerability check

### Quality Checks
- **Lint Check**: Run linter
- **Type Check**: Run type checker
- **Test Suite**: Run all tests

### Final Verification Authority

**After all implementation tasks are complete, invoke `openflow-quality-gate` as the final readiness authority.**

The quality gate performs:
- Adversarial hardening assessment (risk-based)
- Evidence collection and verification
- Readiness classification (`Ready`, `ReadyWithDocUpdates`, `NotReady`, `NeedsDecision`)

Do not claim completion until `openflow-quality-gate` returns `Ready` or `ReadyWithDocUpdates`.

### Failure Handling
- Quality failure: fix implementation and rerun verification.
- Security failure: block archive until fixed.
- Consistency failure: sync docs and implementation, then rerun verification.

> Auto-generated by OpenFlow. `openflow-quality-gate` is the final verification authority.

---
## Plan Budget Warning

> This plan exceeds recommended task density. The warning is non-blocking —
> implementation may proceed, but consider splitting into smaller waves.

- **Same-wave tasks**: 7 (recommended max: 4)
- **Estimated execution units**: 11 (recommended max: 20)

**Suggestion**: Split large waves across multiple `/start-work` invocations
or reduce per-wave task count to keep execution feedback loops short.
