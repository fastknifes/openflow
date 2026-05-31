# Plan: openflow-harden

## Overview

Implement `/openflow-harden` — an optional adversarial hardening command that sits between `implement` and `verify` in the OpenFlow workflow. It spawns a Reviewer subagent (strict, high-quality model) and an Executor subagent (cheap model) in a multi-round loop. Reviewer attacks the implementation against design docs; Executor fixes only confirmed blocking issues. The loop converges when no provable blocking findings remain, or on budget/round exhaustion.

## Design Context

- Design document: `docs/changes/2026-05-08-openflow-harden/design.md`
- Config key: `openflow.harden` (new section in `OpenFlowConfig`)
- Command name: `openflow-harden`

## Tasks

### Phase 1: Types & Config

- [ ] **T1: Add Harden types and config to `src/types.ts`**
  - Add `HardenConfig` interface: `{ enabled: boolean; maxRounds: number; tokenBudgetPerRound: number; tokenBudgetTotal: number; reviewerModel?: string; executorModel?: string }`
  - Add `HardenFindingLevel` enum: `blocking_bug | spec_violation | regression_risk | test_gap | design_ambiguity | style_or_preference`
  - Add `HardenFinding` interface: `{ level: HardenFindingLevel; description: string; evidence: string; files: string[]; lines?: string }`
  - Add `HardenRoundResult` interface: `{ round: number; findings: HardenFinding[]; fixReport?: string; fixDiff?: string }`
  - Add `HardenStatus` enum: `pass | pass_with_risks | max_rounds_reached | budget_exhausted | needs_human | rejected`
  - Add `HardenResult` interface: `{ status: HardenStatus; rounds: HardenRoundResult[]; budgetConsumed: number; summary: string }`
  - Add `HardenMode` enum: `quick | standard | deep`
  - Add `ComplexityGrade` enum: `trivial | simple | complex`
  - Add default config in `defaultConfig`: `harden: { enabled: true, maxRounds: 5, tokenBudgetPerRound: 10000, tokenBudgetTotal: 60000 }`
  - **Verify**: `npx tsc --noEmit src/types.ts`

- [ ] **T2: Add harden-related utilities to `src/utils/harden-utils.ts`**
  - `gradeComplexity(planPath: string, diffStr: string): ComplexityGrade` — reads plan + diff, returns trivial/simple/complex
  - `classifyFindings(rawFindings: string): { actionable: HardenFinding[]; ambiguous: HardenFinding[]; style: HardenFinding[] }` — parses reviewer output into structured findings, filters by level
  - `compressInput(fullInput: string, maxTokens: number): string` — summarizer for per-round context compression
  - **Verify**: `npx tsc --noEmit src/utils/harden-utils.ts`

### Phase 2: Command Handler

- [ ] **T3: Create `src/commands/harden.ts` — main handler**
  - Export `handleHarden(ctx: OpenFlowContext, feature?: string, args?: { full?: boolean; mode?: string; maxRounds?: number; reviewerModel?: string; executorModel?: string }): Promise<string>`
  - Step 1: Resolve feature name (from arg or active plan in `.sisyphus/plans/`)
  - Step 2: Read `docs/changes/{resolvedFeature}/design.md` and related plan
  - Step 3: Get git diff (`git diff HEAD`) for the feature
  - Step 4: Call `gradeComplexity()` → reject trivial, route simple to reviewer-only mode
  - Step 5: For complex, run the adversarial loop (delegate to `runAdversarialLoop()`)
  - Step 6: Format and return the final HardenResult as markdown
  - **Verify**: `npx tsc --noEmit src/commands/harden.ts`

- [ ] **T4: Implement `runAdversarialLoop()` in `src/commands/harden.ts`**
  - Track `budgetConsumed`, `roundResults: HardenRoundResult[]`
  - Per round:
    1. Build compressed reviewer input (plan summary, round diff, prior findings/fix)
    2. Spawn reviewer subagent via `task()` — use `oracle` subagent_type for strict review
    3. Parse reviewer output → classify findings
    4. If no actionable findings → return `pass`
    5. If only non-blocking for 2 consecutive rounds → return `pass_with_risks`
    6. Spawn executor subagent via `task()` — use `deep` category, pass only actionable findings
    7. Record fix report and diff
    8. Check convergence rules (same finding repeating, executor failures, etc.)
    9. Check budget limits
  - Emit `needs_human` on `design_ambiguity` or convergence failure
  - **Verify**: `npx tsc --noEmit src/commands/harden.ts`

- [ ] **T5: Implement reviewer prompt builder in `src/commands/harden.ts`**
  - Function `buildReviewerPrompt(planSummary: string, diffStr: string, priorFindings: HardenFinding[], fixReport?: string): string`
  - Must include explicit anchoring rules (only judge against plan/design/decisions/current)
  - Must include finding level definitions and output format
  - Must NOT include any instruction to propose new requirements
  - **Verify**: `npx tsc --noEmit src/commands/harden.ts`

- [ ] **T6: Implement executor prompt builder in `src/commands/harden.ts`**
  - Function `buildExecutorPrompt(actionableFindings: HardenFinding[], planSummary: string, filePaths: string[]): string`
  - Must enforce minimal fix (only fix the finding, no refactoring)
  - Must enforce scope boundary (only files in plan scope)
  - Must require fix diff output
  - Must require root cause explanation
  - **Verify**: `npx tsc --noEmit src/commands/harden.ts`

### Phase 3: Tool Registration

- [ ] **T7: Register `openflow-harden` command in `src/command-registration.ts`**
  - Add `'openflow-harden': 'OpenFlow harden command for adversarial quality hardening'` to the `COMMANDS` map
  - Add `'openflow-harden'` to `LEGACY_SKILL_DIRS`
  - **Verify**: `npx tsc --noEmit src/command-registration.ts`

- [ ] **T8: Export and wire up in `src/commands/index.ts` and `src/index.ts`**
  - Add `export { handleHarden } from './harden.js'` to `src/commands/index.ts`
  - Add `handleHarden` to the import in `src/index.ts`
  - Register the `openflow-harden` tool in the plugin `tool` map:
    ```ts
    'openflow-harden': tool({
      description: 'OpenFlow harden command for adversarial quality hardening',
      args: {
        feature: tool.schema.string().max(64),
        full: tool.schema.boolean().optional(),
        mode: tool.schema.string().optional(),
        maxRounds: tool.schema.number().optional(),
        reviewerModel: tool.schema.string().optional(),
        executorModel: tool.schema.string().optional(),
      },
      execute: async (args, toolContext) => {
        void toolContext
        try {
          return await handleHarden(openflowCtx, args.feature, args)
        } catch (error) { /* standard error handling */ }
      },
    }),
    ```
  - **Verify**: `npx tsc --noEmit src/index.ts`

### Phase 4: Tests

- [ ] **T9: Unit tests for `gradeComplexity` in `tests/harden/complexity.test.ts`**
  - Test trivial rejection (single file ≤10 lines, doc-only, formatting-only)
  - Test simple routing (single file ≤50 lines, multi-file but small)
  - Test complex routing (multi-file with logic, state changes)
  - **Create**: `tests/harden/complexity.test.ts`
  - **Verify**: `npx jest tests/harden/complexity.test.ts`

- [ ] **T10: Unit tests for `classifyFindings` in `tests/harden/findings.test.ts`**
  - Test correct classification of each finding level
  - Test actionability filtering (only blocking/spec_violation/regression_risk pass)
  - Test style/preference filtering (must be dropped)
  - Test evidence-required filtering (findings without evidence rejected)
  - **Create**: `tests/harden/findings.test.ts`
  - **Verify**: `npx jest tests/harden/findings.test.ts`

- [ ] **T11: Integration test for harden command in `tests/harden/command.test.ts`**
  - Test trivial rejection output
  - Test simple reviewer-only mode output
  - Mock subagent spawns to test loop convergence
  - Test budget exhaustion output
  - Test design_ambiguity → needs_human output
  - **Create**: `tests/harden/command.test.ts`
  - **Verify**: `npx jest tests/harden/command.test.ts`

### Phase 5: Hooks & Cleanup

- [ ] **T12: Add harden completion prompt hook in `src/hooks/acceptance-prompt.ts`**
  - After implementation completes, optionally suggest running `/openflow-harden` for complex features
  - Only triggers for features graded complex by `gradeComplexity`
  - **Verify**: `npx tsc --noEmit src/hooks/acceptance-prompt.ts`
