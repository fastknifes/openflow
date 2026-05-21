# Plan: feature-confirmation-interaction

## Overview

将 `/openflow-feature` 生成 `design.md` / `behavior.md` 后的单向 advisory 输出，改为“确认式交互 + 非交互文本降级”。实现只改 feature 命令的完成后交互层、session metadata、skill 文案和测试，不改 feature 收敛、文档渲染、writing-plan 自动执行逻辑。

## Design Context

设计工作区：`docs/changes/2026-05-21-feature-confirmation-interaction/`

关键约束来自：
- `docs/changes/2026-05-21-feature-confirmation-interaction/design.md:21-29`：生成文档后新增确认式交互，交互模式用 `Question` 工具，非交互模式用文本选项。
- `docs/changes/2026-05-21-feature-confirmation-interaction/design.md:60-66`：不自动执行 `/openflow-writing-plan`，不改 feature 收敛逻辑，不修改设计/行为文档渲染。
- `docs/changes/2026-05-21-feature-confirmation-interaction/behavior.md:14-20`：用户选择记录到 `FeatureSession.postDesignDecision`，选择只影响返回文本和后续建议。
- `src/commands/feature.ts:203-258`：`finalizeFeature()` 是主插入点，当前在生成文档后调用 `askDeepVerification()`。
- `src/commands/feature.ts:742-790`：`askDeepVerification()` 是现有 post-generation 交互模式，应被新确认式交互整合/替换。
- `src/commands/feature.ts:850-896`：`formatGenerationResultAll()` 是当前单向 advisory 输出。
- `src/phases/feature/state-machine.ts:20-43`：`FeatureSession` session 类型需要新增 optional metadata 字段。
- `tests/commands/feature.test.ts:50-71`：已有 `createQuestionToolContext()` mock 可复用来测试 `askQuestion`。

实施边界：插件代码没有可靠的内置 Oracle/Momus 调度 API；“检查约束充分性”应在插件内输出明确的 AI review 请求/结果块，并保留现有轻量检查能力。若执行环境后续提供 agent dispatch，可在该块基础上由 assistant 调用 Oracle/Momus；本次实现不得臆造不存在的 plugin API。

## Execution Strategy

### Parallel Execution Waves

Wave 1: Task 1、Task 2 可并行。一个负责 session 类型/兼容读取，一个负责命令输出与交互 helper 的主体改造。

Wave 2: Task 3、Task 4 在 Wave 1 后并行。一个补测试，一个更新 skill 文案。

Wave 3: Task 5 做集成验证与回归修正。

Wave 4: Task 6 执行质量门收尾。

同波最大并发 2，低于默认上限 3–4；本功能触点集中，过度拆分会增加协调成本。

### Dependency Matrix

| Task | Blocked By | Blocks |
|---|---|---|
| 1. Session metadata | - | 2, 3, 5 |
| 2. Post-design interaction | - | 3, 4, 5 |
| 3. Command tests | 1, 2 | 5 |
| 4. Skill documentation | 2 | 5 |
| 5. Verification and fixes | 1, 2, 3, 4 | 6 |
| 6. Quality gate handoff | 5 | - |

## Tasks

- [ ] 1. Add post-design decision metadata to feature sessions (Agent: quick | Blocks: [2, 3, 5] | Blocked By: [])

  Agent Profile: `quick`, Skills: []。这是单文件类型扩展，范围明确。

  Parallelization: Wave 1，可与 Task 2 并行；Task 2 需要使用最终字段名时，以本任务定义为准。

  Implementation instructions:
  - Modify `src/phases/feature/state-machine.ts`.
  - Add exported type `PostDesignDecision = 'proceed_to_plan' | 'review_docs' | 'inspect'` near `FeatureDraftStatus`.
  - Add optional field `postDesignDecision?: PostDesignDecision | undefined` to `FeatureSession`.
  - Add optional `postDesignDecision?: string` to `LegacyFeatureSession` so old JSON can be normalized safely.
  - In `normalizeFeatureSession()`, preserve only valid values; invalid or absent values must normalize to `undefined`.
  - Do not increment `version`; keep `version: 3` because the field is optional and backward compatible.

  Acceptance Criteria:
  - `src/phases/feature/state-machine.ts` exports `PostDesignDecision`.
  - Old session JSON without `postDesignDecision` still normalizes successfully.
  - Invalid persisted value does not leak into the normalized session.

  QA Scenarios:
  - Run `npm run typecheck`; expected: exit code 0.
  - Run `bun test tests/commands/feature.test.ts`; expected: existing feature tests still pass.

- [ ] 2. Replace post-generation deep verification prompt with confirmation-style post-design interaction (Agent: unspecified-high | Blocks: [3, 4, 5] | Blocked By: [])

  Agent Profile: `unspecified-high`, Skills: []。这是核心行为改造，涉及 async flow、文本 fallback、session persistence。

  Parallelization: Wave 1，可与 Task 1 并行；最终提交前需与 Task 1 的字段名对齐。

  Implementation instructions:
  - Modify `src/commands/feature.ts` only.
  - Replace `askDeepVerification()` with `askPostDesignConfirmation()` or refactor it into the new helper. Keep `normalizeInteractiveAnswer()` and `hasAskQuestion()` patterns unchanged.
  - New interactive question content must use header `下一步行动` and question text equivalent to `设计文档已生成。您希望如何继续？`.
  - Options must be exactly these labels for stable tests: `进入开发计划`, `检查约束充分性`, `查看文档`.
  - Map options to `PostDesignDecision` values: `proceed_to_plan`, `review_docs`, `inspect`.
  - In `finalizeFeature()`, after `markCompleted()` and initial `saveFeatureSession()`, ask the confirmation only when `hasAskQuestion(toolContext)` is true and `completedSession.postDesignDecision` is absent.
  - Persist the selected `postDesignDecision` by saving an updated completed session before returning.
  - `proceed_to_plan`: return base result plus a short confirmation block recommending `/openflow-writing-plan ${feature}`. Do not auto-run the command.
  - `review_docs`: return base result plus `## Design Constraint Review Requested` / `## Design Document Review` block that explicitly names `design.md` and `behavior.md`, summarizes constraints from `RequirementModel`, and instructs the assistant/runtime to review constraint sufficiency. Do not invent a plugin-side Oracle API.
  - `inspect`: return base result plus a short block saying documents are ready for inspection and no next action was started.
  - Non-interactive fallback (`hasAskQuestion` false): keep the current `formatGenerationResultAll()` advisory behavior and append a `## Next Step Options` block listing the same three options. This preserves compatibility while making options visible.
  - Completed-session re-display paths at `src/commands/feature.ts:109-112`, `src/commands/feature.ts:128`, and `src/commands/feature.ts:208-212` must not re-open the confirmation question; they may show plain generated result only.

  Acceptance Criteria:
  - Interactive tool path asks one `Question` after document generation with the three labels above.
  - Non-interactive path does not call `askQuestion` and includes `## Next Step Options`.
  - No code path automatically invokes `/openflow-writing-plan`.
  - Existing design and behavior document generation remains unchanged.

  QA Scenarios:
  - Run `bun test tests/commands/feature.test.ts`; expected: all feature command tests pass after updates.
  - Run `npm run typecheck`; expected: exit code 0.

- [ ] 3. Add command tests for confirmation interaction, fallback, and persistence (Agent: quick | Blocks: [5] | Blocked By: [1, 2])

  Agent Profile: `quick`, Skills: []。测试集中在现有 command test 文件，模式已存在。

  Parallelization: Wave 2，可与 Task 4 并行。

  Implementation instructions:
  - Modify `tests/commands/feature.test.ts`.
  - Reuse existing helpers `createContext()`, `createToolContext()`, and `createQuestionToolContext()` at `tests/commands/feature.test.ts:8-71`.
  - Update existing deep verification tests around `tests/commands/feature.test.ts:396-444` to match the new confirmation interaction, or replace them with equivalent post-design confirmation tests.
  - Add/keep tests for these cases:
    1. Interactive `进入开发计划`: result contains `Feature Design Complete`, `进入开发计划`, and `/openflow-writing-plan user-login`; session JSON contains `postDesignDecision: 'proceed_to_plan'`.
    2. Interactive `检查约束充分性`: result contains `Design Document Review` or `Design Constraint Review Requested`, references `design.md` and `behavior.md`, and session JSON contains `postDesignDecision: 'review_docs'`.
    3. Interactive `查看文档`: result contains generated document paths and session JSON contains `postDesignDecision: 'inspect'`.
    4. Non-interactive fallback with `createToolContext()`: result contains `## Next Step Options` and all three labels, with no persisted `postDesignDecision`.
    5. Re-display of completed session does not ask the confirmation question again.
  - Use temp directories matching existing convention: `.test-feature-post-design-*`.
  - Keep cleanup with `await rm(root, { recursive: true, force: true })`.

  Acceptance Criteria:
  - Tests assert returned strings and persisted `.sisyphus/feature/user-login.json` state.
  - Tests do not depend on exact absolute dates except by discovering `docs/changes` directory like existing tests.
  - No brittle assertion depends on full multiline output.

  QA Scenarios:
  - Run `bun test tests/commands/feature.test.ts`; expected: exit code 0.
  - Run `npm test`; expected: exit code 0 or only pre-existing unrelated failures documented with file/test names.

- [ ] 4. Update feature skill documentation for the new confirmation behavior (Agent: writing | Blocks: [5] | Blocked By: [2])

  Agent Profile: `writing`, Skills: []。这是文档/提示约束更新，不需要代码技能。

  Parallelization: Wave 2，可与 Task 3 并行。

  Implementation instructions:
  - Modify `src/skills/feature-skill.ts`.
  - In `Required Behavior`, update the post-completion guidance so it says `/openflow-feature` should present a confirmation-style next-step choice when available.
  - Preserve the existing hard rule: do not invoke `openflow-writing-plan` automatically unless explicitly requested.
  - Document non-interactive fallback: if the question picker is unavailable, output text options and wait for natural-language continuation.
  - Document `检查约束充分性` as design/behavior document review, not implementation-plan review.

  Acceptance Criteria:
  - Skill text mentions three choices: enter writing-plan, review design constraints, inspect documents.
  - Skill text still prohibits automatic writing-plan invocation.
  - Skill text does not mention obsolete `/openflow-harden` or `/openflow-verify` manual entrypoints.

  QA Scenarios:
  - Run `npm run typecheck`; expected: exit code 0.
  - Run `bun test tests/commands/feature.test.ts`; expected: feature command tests still pass.

- [ ] 5. Run full verification and fix regressions within the feature scope (Agent: unspecified-high | Blocks: [6] | Blocked By: [1, 2, 3, 4])

  Agent Profile: `unspecified-high`, Skills: []。需要综合测试输出、修复同范围回归，但不能扩展功能。

  Parallelization: Wave 3，必须在实现和测试任务完成后执行。

  Implementation instructions:
  - Run `npm run typecheck`.
  - Run `bun test tests/commands/feature.test.ts`.
  - Run `npm test`.
  - If failures are caused by this feature, fix only files touched by Tasks 1–4: `src/phases/feature/state-machine.ts`, `src/commands/feature.ts`, `src/skills/feature-skill.ts`, `tests/commands/feature.test.ts`.
  - Do not refactor unrelated command, hook, renderer, or config code.

  Acceptance Criteria:
  - Typecheck exits 0.
  - Targeted feature command tests exit 0.
  - Full test suite exits 0, or unrelated pre-existing failures are documented with exact failing test names and evidence.

  QA Scenarios:
  - Manual QA command: create a temp feature flow by running the relevant command/test harness through `bun test tests/commands/feature.test.ts -t "post-design"` if test filtering is supported; otherwise run full `bun test tests/commands/feature.test.ts`. Expected output includes passing confirmation-interaction tests.

- [ ] 6. Invoke OpenFlow quality gate after implementation is complete (Agent: unspecified-high | Blocks: [] | Blocked By: [5])

  Agent Profile: `unspecified-high`, Skills: [`openflow-quality-gate`]。Final readiness must be decided by OpenFlow quality governance.

  Parallelization: Wave 4，final sequential task。

  Implementation instructions:
  - After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.
  - Provide the quality gate with the feature name `feature-confirmation-interaction` and evidence from Task 5.
  - Do not manually run `/openflow-harden` or `/openflow-verify`.

  Acceptance Criteria:
  - Quality gate returns readiness classification.
  - If readiness is not ready, executor fixes only in-scope issues and reruns Task 5 + quality gate.

  QA Scenarios:
  - Evidence: quality gate output includes readiness and evidence summary for typecheck/tests.

## Complexity Budget

Task count: 6. Estimated execution units: 15. Same-wave maximum concurrency: 2. This is within the 20-unit budget and avoids one-task-per-file over-splitting.
