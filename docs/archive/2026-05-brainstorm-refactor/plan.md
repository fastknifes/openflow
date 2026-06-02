# Plan: brainstorm-refactor

## Overview
This plan implements Phase 1 of the brainstorm refactor: activate brainstorm context packet persistence, keep ordinary brainstorm saves non-blocking, add short-timeout transition saving before `/openflow-feature`, split the oversized harvest bridge into coherent modules while preserving barrel compatibility, and keep existing feature workflow consumption behavior unchanged.

## Design Context
Design workspace: `docs/changes/2026-05-brainstorm-refactor/`. Source documents: `docs/changes/2026-05-brainstorm-refactor/design.md` and `docs/changes/2026-05-brainstorm-refactor/behavior.md`. Carry-forward constraints: ordinary `opportunistic save` must be asynchronous and must not block brainstorm conversation; `transition-to-feature` save may short-timeout wait but timeout or failure must not block feature workflow startup; save failures must not surface as user-facing errors; brainstorm session detection must prefer skill activation metadata and use an explicit conservative session marker when metadata is unavailable; no new external dependencies; feature workflow harvest consumption behavior must not change except import compatibility; split `context-harvest.ts` must preserve barrel re-export compatibility.

## Pyramid + TDD Strategy
### Highest-Level Goal
Enable `openflow-brainstorm` conversations to persist stable context packets that `/openflow-feature` can harvest, without changing brainstorm's lightweight conversational behavior.

### Task Pyramid
1. Protect existing behavior with tests
   1.1 Add harvest compatibility tests before splitting modules
   1.2 Add auto-save behavior tests before hook wiring
2. Separate existing bridge responsibilities
   2.1 Split packet discovery, user choice, and injection from `context-harvest.ts`
   2.2 Keep `context-harvest.ts` as a barrel re-export for existing imports
3. Activate packet persistence
   3.1 Rename packet save module for consistent naming
   3.2 Add auto-save orchestration with detection, fingerprint, throttle, and result handling
   3.3 Wire ordinary assistant-turn save and transition-to-feature save
4. Verify integration
   4.1 Run typecheck and targeted tests
   4.2 Run manual QA for packet creation and feature harvest
   4.3 Invoke openflow-quality-gate after implementation is complete

### Core Abstractions and Boundaries
- Harvest discovery: owns packet listing, staleness filtering, feature/session matching, topic similarity, and harvest summary rendering; it must not ask users questions or mutate feature sessions.
- Harvest choice: owns user choice parsing and guarded question interactions; it must not read packet files or inject requirement models.
- Harvest injection: owns conversion from chosen packet items into `FeatureSession` and `RequirementModel`; it must not discover packets or perform interactive prompting.
- Packet save: owns `messages -> extracted items -> stability threshold -> packet write`; it must not know hook timing or throttling policy.
- Brainstorm auto-save: owns session detection, fingerprinting, throttling, trigger-specific result policy, and delegation to packet save; it must not modify feature workflow harvest consumption behavior.
- Hook integration: owns when to call auto-save; assistant-turn calls must be fire-and-forget, transition-to-feature calls may short-timeout wait, and both must suppress user-facing save failures.

### TDD Driving Order
1. RED: add tests proving `context-harvest.ts` exports preserve existing discovery, choice parsing, and injection behavior while new module files do not yet exist.
2. GREEN: split `context-harvest.ts` into `harvest-discovery.ts`, `harvest-choice.ts`, `harvest-injection.ts`, and a barrel `context-harvest.ts` until tests pass.
3. REFACTOR: check split boundaries and names while tests stay green.
4. RED: add tests for `tryAutoSaveBrainstormPacket` covering `not-brainstorm`, `not-stable`, `unchanged`, `throttled`, `saved`, and `failed` results.
5. GREEN: implement `brainstorm-auto-save.ts` and rename `brainstorm-packet-save.ts` to `packet-save.ts` until tests pass.
6. REFACTOR: ensure auto-save delegates extraction and writing instead of duplicating packet-save logic.
7. RED: add hook integration tests for assistant-turn non-blocking save and transition short-timeout save before hook wiring.
8. GREEN: wire `chat-message.ts` and `/openflow-feature` dispatch path until tests pass.
9. REFACTOR: verify hook code remains orchestration-only and does not contain extraction or packet I/O details.

## Execution Strategy
### Parallel Execution Waves
Wave 1: Task 1 and Task 2 can run in parallel because tests for harvest and auto-save touch separate surfaces. Wave 2: Task 3 depends on Task 1 and performs the harvest split. Wave 3: Task 4 depends on Task 2 and creates auto-save plus packet-save rename. Wave 4: Task 5 depends on Task 4 and wires hooks. Wave 5: Task 6 depends on Tasks 3 and 5 and performs final verification and quality gate.

### Dependency Matrix
| Task | Blocked By | Blocks |
|---|---|---|
| 1. Add harvest compatibility tests | None | 3 |
| 2. Add auto-save behavior tests | None | 4 |
| 3. Split harvest modules | 1 | 6 |
| 4. Add auto-save orchestration | 2 | 5 |
| 5. Wire auto-save hooks | 4 | 6 |
| 6. Verify and quality-gate | 3, 5 | None |

## Tasks
- [ ] 1. Add harvest compatibility tests (Agent Profile: category=quick, load_skills=[openflow-tdd]; Parallelization: Wave 1, can run with Task 2; Boundary: tests only; Files: create or update `src/phases/feature/context-harvest.test.ts` or existing adjacent harvest test file discovered by `glob src/phases/feature/**/*harvest*.test.ts`; Constraints: feature workflow harvest consumption behavior must not change; Acceptance Criteria: tests cover `discoverContextPackets`, `parseHarvestResponse`, `parseItemSelection`, `applyHarvestToSession`, and `applyConfirmedHarvestToRequirementModel` through the existing `../context-harvest.js` import path; Verification: run `npm test -- src/phases/feature/context-harvest.test.ts` or the discovered harvest test command and expect exit code 0.)
- [ ] 2. Add auto-save behavior tests (Agent Profile: category=quick, load_skills=[openflow-tdd]; Parallelization: Wave 1, can run with Task 1; Boundary: tests only; Files: create `src/phases/feature/brainstorm-auto-save.test.ts`; Constraints: ordinary opportunistic save must be async/non-blocking, transition save timeout/failure must not block feature workflow, failures must not be user-facing, detection must avoid message-body regex; Acceptance Criteria: failing tests assert `not-brainstorm`, `not-stable`, `unchanged`, `throttled`, `saved`, `failed`, assistant-turn no-await behavior via promise observation, and transition short-timeout result handling; Verification: run `npm test -- src/phases/feature/brainstorm-auto-save.test.ts` and expect failures before implementation, then exit code 0 after Task 4.)
- [ ] 3. Split harvest modules (Agent Profile: category=quick, load_skills=[pyramid-principle-programming]; Parallelization: Wave 2; Blocked By: Task 1; Boundary: refactor only, no behavior changes; Files: create `src/phases/feature/harvest-discovery.ts`, create `src/phases/feature/harvest-choice.ts`, create `src/phases/feature/harvest-injection.ts`, replace `src/phases/feature/context-harvest.ts` with barrel re-exports; Constraints: preserve barrel compatibility, preserve feature workflow consumption behavior, no new dependencies; Acceptance Criteria: existing imports from `../context-harvest.js` compile unchanged and Task 1 tests pass; Verification: run `npm test -- src/phases/feature/context-harvest.test.ts` or discovered harvest test command and `npx tsc --noEmit`, both exit code 0.)
- [ ] 4. Add auto-save orchestration (Agent Profile: category=deep, load_skills=[pyramid-principle-programming, openflow-tdd]; Parallelization: Wave 3; Blocked By: Task 2; Boundary: auto-save module and packet-save rename only, no hook wiring; Files: rename `src/phases/feature/brainstorm-packet-save.ts` to `src/phases/feature/packet-save.ts`, create `src/phases/feature/brainstorm-auto-save.ts`, update direct imports if any; Constraints: no new external dependencies, prefer skill activation metadata and use explicit conservative session marker fallback when metadata is unavailable, failures return result objects instead of throwing, ordinary save policy remains non-blocking for callers; Acceptance Criteria: `tryAutoSaveBrainstormPacket` returns all result variants from behavior scenarios and delegates persistence to `saveBrainstormPacket` without duplicating extraction/write logic; Verification: run `npm test -- src/phases/feature/brainstorm-auto-save.test.ts` and `npx tsc --noEmit`, both exit code 0.)
- [ ] 5. Wire auto-save hooks (Agent Profile: category=deep, load_skills=[pyramid-principle-programming, openflow-tdd]; Parallelization: Wave 4; Blocked By: Task 4; Boundary: hook orchestration only, no extraction logic in hooks; Files: update `src/hooks/chat-message.ts`, update `src/hooks/chat-command-dispatch.ts` or the resolved `/openflow-feature` dispatch entrypoint in `src/commands/feature.ts` after reading existing command flow; Constraints: assistant-turn save must be fire-and-forget and never block brainstorm conversation, transition-to-feature save may short-timeout wait and timeout/failure must not block feature workflow, save failures must not surface as user-facing errors; Acceptance Criteria: assistant-turn hook schedules auto-save without awaiting, transition path attempts short-timeout save before feature harvest, and non-brainstorm sessions skip save; Verification: run hook/feature tests discovered by `glob src/**/*chat-message*.test.ts src/**/*feature*.test.ts`, run `npx tsc --noEmit`, and perform manual QA by starting a brainstorm-like session that produces a packet under `.sisyphus/brainstorm/context-packets/` then triggering `/openflow-feature` to observe harvest discovery.)
- [ ] 6. Verify and quality-gate (Agent Profile: category=quick, load_skills=[openflow-quality-gate]; Parallelization: Wave 5; Blocked By: Tasks 3 and 5; Boundary: verification only, no feature changes unless fixing failures introduced by this plan; Files: no planned source edits except targeted fixes for failing tests introduced by Tasks 3-5; Constraints: all acceptance criteria from `behavior.md` must be verified, plan must not claim completion without quality gate readiness; Acceptance Criteria: `npx tsc --noEmit` exits 0, targeted harvest tests exit 0, targeted auto-save tests exit 0, hook/feature tests exit 0, manual QA shows packet write and `/openflow-feature` harvest path, and no user-facing save error appears on failed save simulation; Verification: after implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.)
