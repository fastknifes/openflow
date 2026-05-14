# rename-brainstorm-to-feature - Design

## Overview

Rename the structured `/openflow-brainstorm` command to `/openflow-feature` to match its actual semantics — it collects structured requirements, derives constraints, and generates `design.md`/`behavior.md`. Then repurpose `openflow-brainstorm` as a conversational-only Skill that enables natural collaborative dialogue for requirement exploration, approach comparison, and trade-off discussion.

**Status**: src/ rename already completed (58 files, 0 brainstorm residue). This design covers remaining work: brainstorm skill creation, test fixes, and documentation updates.

## Problem

1. **Semantic mismatch**: `/openflow-brainstorm` behaves as a structured feature intake workflow (5-question collection → constraint derivation → document generation), not as brainstorming. The name confuses users about what the command actually does.
2. **Missing brainstorm capability**: OpenFlow has no natural collaborative dialogue for requirement exploration. Users must either jump straight into structured feature intake or use ad-hoc conversation without guidance.
3. **Design doc quality**: The auto-generated `design.md`/`behavior.md` from the brainstorm phase are template-quality — mechanically repeating answers without real architectural content.

## Goals

- `src/` code naming matches semantics: `feature` for the structured workflow, `brainstorm` for conversational skill
- A new conversational `openflow-brainstorm` Skill that AI agents can invoke based on keywords or autonomous judgment
- Tests compile and pass after all renames
- Active documentation (README, tutorial, ADR) reflects the new naming

## Non-Goals

- Backward compatibility with `/openflow-brainstorm` as a command
- Modifying historical docs in `docs/archive/` or existing `docs/changes/`
- Changing the structured feature workflow behavior (only renaming)
- Adding new structured workflow phases or modifying constraint derivation logic

## Architecture

### Part A: Renaming (COMPLETED)

The structured workflow has been renamed throughout `src/`:

| Before | After | Status |
|--------|-------|--------|
| `src/phases/brainstorm/` | `src/phases/feature/` | Done |
| `src/commands/brainstorm.ts` | `src/commands/feature.ts` | Done |
| `src/hooks/brainstorm-workflow.ts` | `src/hooks/feature-workflow.ts` | Done |
| `src/skills/brainstorm-skill.ts` | `src/skills/feature-skill.ts` | Done |
| `BrainstormingConfig` type | `FeatureConfig` | Done |
| `brainstorming` config key | `feature` config key | Done |
| `.sisyphus/brainstorm/` state paths | `.sisyphus/feature/` state paths | Done |
| `tests/phases/brainstorm/` | `tests/phases/feature/` | Done |
| Tool name `openflow-brainstorm` | `openflow-feature` | Done |

### Part B: New Conversational Brainstorm Skill (TODO)

A new `openflow-brainstorm` Skill registered in the skill registry. This is NOT a command — it has no tool, no hook, no state machine. It is pure Skill content written to `~/.config/opencode/skills/openflow-brainstorm/SKILL.md`.

**Skill Design** (referencing superpowers' brainstorming skill, dialogue/exploration portions only):

The brainstorm skill enables natural collaborative dialogue. Its content covers:

1. **Understanding the idea**: Check project context first. Assess scope — if too large for a single feature, help decompose. Ask one question at a time to refine understanding.
2. **Exploring approaches**: Propose 2-3 different approaches with trade-offs. Lead with recommendation and reasoning. Present options conversationally.
3. **Presenting the design**: Once understanding is sufficient, present the design in sections scaled to complexity. Ask after each section whether it looks right.
4. **Design for isolation and clarity**: Break the system into smaller units with clear purpose, well-defined interfaces, independent testability.
5. **Working in existing codebases**: Explore current structure before proposing changes. Follow existing patterns. Include targeted improvements, not unrelated refactoring.

**Key principles** (adapted from superpowers):
- One question at a time — don't overwhelm
- Multiple choice preferred when possible
- YAGNI ruthlessly — remove unnecessary features from designs
- Explore alternatives — always propose 2-3 approaches before settling
- Incremental validation — present design, get approval before moving on
- Be flexible — go back and clarify when something doesn't make sense

**What NOT copied from superpowers**:
- Hard gate (`<HARD-GATE>` block) — OpenFlow has its own governance model
- Visual Companion — out of scope for this skill
- Spec self-review checklist — OpenFlow's verify phase handles this
- Writing-plans transition — OpenFlow has its own `/openflow-writing-plan` command
- Process flow diagram — unnecessary for a conversational skill

**Trigger mechanism**:
- **Keyword trigger**: Skill `description` field contains trigger words: "brainstorm, explore requirements, compare approaches, design discussion, ideation, requirements exploration"
- **AI judgment**: The description also states "Use when the user wants to explore a problem space before committing to a structured feature workflow" so agents can autonomously decide to invoke it

**Skill registration**:

```
File: src/skills/brainstorm-skill.ts (NEW)
Export: getBrainstormSkill(): SkillInfo
  name: 'openflow-brainstorm'
  description: 'Conversational skill for collaborative requirement exploration, approach comparison, and design discussion. Triggered by keywords: brainstorm, explore requirements, compare approaches, design discussion. Use when the user wants to explore a problem space before committing to a structured feature workflow. After exploration, suggest running /openflow-feature to formalize the design.'
  content: <see SKILL.md content above>
```

```
File: src/skills/registry.ts (MODIFY)
Add: import { getBrainstormSkill } from './brainstorm-skill.js'
Change: getSkills() returns [...existing, getBrainstormSkill()]
```

### Part C: Test Fixes (TODO)

~19 test files may contain stale `brainstorm`/`Brainstorm` references that need updating to `feature`/`Feature`. The 4 most critical files were already fixed:
- `tests/commands/feature.test.ts`
- `tests/commands/change.test.ts`
- `tests/enhancer/enhancer.test.ts`
- `tests/index.test.ts`

Remaining test files need verification via `bun test` to identify real compilation errors.

### Part D: Documentation Updates (TODO)

Active docs to update:

| File | Change |
|------|--------|
| `README.md` | Replace all `/openflow-brainstorm` → `/openflow-feature` in examples, User Manual sections, "See it in action". Update config key `brainstorming` → `feature`. |
| `README_CN.md` | Same changes as README.md, Chinese version. |
| `docs/current/workflow/openflow-usage-tutorial.md` | Update command references and examples. |
| `docs/current/workflow/openflow-usage-tutorial.en.md` | Same, English version. |
| `docs/decisions/ADR-001-docs-governance-and-workflow.md` | Update command names if referenced. |

**NOT modified**: `docs/archive/`, existing `docs/changes/` historical records.

## Design Constraints

- [must] Zero `brainstorm`/`Brainstorm` residue in `src/` code (verified: 0 found)
- [must] No backward compatibility alias for old `/openflow-brainstorm` command
- [must] Brainstorm skill is conversational-only — no tool, no hook, no state machine
- [must] Skill content adapted from superpowers exploration portions only — no hard gates, no visual companion, no spec review checklist
- [should] Preserve existing `docs/archive/` and `docs/changes/` historical records unchanged
- [should] `bun test` must pass after all changes

## Success Criteria

- [ ] `src/` has zero `brainstorm`/`Brainstorm` references (excluding the new brainstorm-skill.ts)
- [ ] `src/skills/brainstorm-skill.ts` exists with conversational skill content
- [ ] `src/skills/registry.ts` exports `getBrainstormSkill()` alongside existing skills
- [ ] `bun test` passes with 0 failures
- [ ] README.md and README_CN.md reference `/openflow-feature` (not `/openflow-brainstorm`) as the design command
- [ ] Tutorial docs updated to reflect new command naming
- [ ] No changes to `docs/archive/` or historical `docs/changes/`

## Risks And Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Test files have stale references causing compilation errors | High | Medium | Run `bun test` first to identify exact errors; fix mechanically |
| Brainstorm skill content too long, exceeding agent context | Low | Medium | Keep content concise; focus on dialogue guidance, not exhaustive checklists |
| README still shows old command after rename | Medium | Low | Grep README for `brainstorm` after changes |
| Registry import order matters for skill priority | Low | Low | Add brainstorm skill last in array — feature skill should match first for `/openflow-feature` |

## Testing Strategy

1. **Compilation**: `bun test` to verify TypeScript compiles and all imports resolve
2. **Unit tests**: Existing test suite must pass (test assertions may need string updates)
3. **Grep verification**: `grep -ri brainstorm src/ --include="*.ts" | grep -v brainstorm-skill` must return 0 results
4. **Manual**: Verify README examples use `/openflow-feature`; verify `openflow-brainstorm` appears only in the skill description/context
