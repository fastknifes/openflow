# Plan: rename-brainstorm-to-feature

## Overview

Rename the structured `/openflow-brainstorm` command to `/openflow-feature` and create a new conversational `openflow-brainstorm` Skill for collaborative requirement exploration. The `src/` rename is already complete; this plan covers the remaining work: creating the brainstorm skill, updating the registry, fixing tests, and updating documentation.

## Design Context

- **Design workspace**: `docs/changes/2026-05-13-rename-brainstorm-to-feature/`
- **Design doc**: `design.md` — Architecture with 4 change parts (A: rename done, B: new skill, C: test fixes, D: doc updates)
- **Behavior doc**: `behavior.md` — 10 verifiable scenarios, 5 must-not behaviors, verification mapping
- **Key constraints**: No backward compatibility; zero brainstorm residue in `src/` (excluding new skill file); skill must be conversational-only (no tool/hook/state machine); docs/archive/ unchanged

## Execution Strategy

### Parallel Execution Waves

**Wave 1**: Core code changes (parallel — no dependencies)
- Create brainstorm-skill.ts
- Update registry.ts
- Grep verification for src/ residue

**Wave 2**: Test fixes (depends on Wave 1)
- Run bun test to identify failures
- Fix failing test files

**Wave 3**: Documentation updates (parallel — no dependencies between docs)
- Update README.md
- Update README_CN.md
- Update tutorial docs
- Update ADR docs

**Wave 4**: Final verification (depends on Waves 1-3)
- Full verification suite (bun test + grep + doc check)

### Dependency Matrix

| Task | Blocked By | Blocks |
|------|-----------|--------|
| T1: Create brainstorm-skill.ts | — | T4, T10 |
| T2: Update registry.ts | — | T4, T10 |
| T3: Grep verify src/ residue | — | T10 |
| T4: Run bun test | T1, T2 | T5 |
| T5: Fix test failures | T4 | T10 |
| T6: Update README.md | — | T10 |
| T7: Update README_CN.md | — | T10 |
| T8: Update tutorial docs | — | T10 |
| T9: Update ADR docs | — | T10 |
| T10: Final verification | T3, T5, T6, T7, T8, T9 | — |

## Tasks

- [x] **1. Create `src/skills/brainstorm-skill.ts`**
  
  **What to do**: Create a new file `src/skills/brainstorm-skill.ts` that exports `getBrainstormSkill(): SkillInfo`. The skill content should be a conversational guide for collaborative requirement exploration, adapted from superpowers' brainstorming skill (exploration portions only).
  
  **Content requirements** (from `design.md`):
  - `name: 'openflow-brainstorm'`
  - `description`: Contains trigger keywords (brainstorm, explore requirements, compare approaches, design discussion) + guidance for AI autonomous invocation
  - `content`: Conversational skill covering: (1) understanding project context, (2) one question at a time, (3) propose 2-3 approaches with trade-offs, (4) present design in sections, (5) suggest `/openflow-feature` after exploration. No hard gates, no checklists, no visual companion.
  
  **File to create**: `src/skills/brainstorm-skill.ts`
  
  **Verification**: `npx tsc --noEmit src/skills/brainstorm-skill.ts` compiles without errors
  
  **Agent Profile**:
  - Category: `quick`
  - Skills: `gitnexus-exploring` (to understand existing skill patterns)
  
  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: T4, T10 | Blocked By: —
  
  **QA Scenarios**:
  ```
  Scenario: Skill exports correct interface
    Tool: bash
    Command: node -e "const {getBrainstormSkill} = require('./src/skills/brainstorm-skill.ts'); const s = getBrainstormSkill(); console.log(s.name, !!s.description, !!s.content);"
    Expected: Outputs "openflow-brainstorm true true"
  ```

- [x] **2. Update `src/skills/registry.ts`**
  
  **What to do**: Add `import { getBrainstormSkill } from './brainstorm-skill.js'` and include `getBrainstormSkill()` in the `getSkills()` return array.
  
  **File to modify**: `src/skills/registry.ts`
  
  **Verification**: `npx tsc --noEmit src/skills/registry.ts` compiles without errors
  
  **Agent Profile**:
  - Category: `quick`
  
  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: T4, T10 | Blocked By: —
  
  **QA Scenarios**:
  ```
  Scenario: Registry exports 3 skills
    Tool: bash
    Command: node -e "const {getSkills} = require('./src/skills/registry.ts'); console.log(getSkills().length);"
    Expected: Outputs "3"
  ```

- [x] **3. Grep verify src/ has no old brainstorm workflow residue**
  
  **What to do**: Run grep to confirm `src/` has no old brainstorm workflow residue. The only allowed matches are the new conversational skill file and the registry import/call required to expose that skill.
  
  **Verification command**: `git grep -n -i "brainstorm" -- src` — expected output: only `src/skills/brainstorm-skill.ts` and `src/skills/registry.ts` registration lines.
  
  **Agent Profile**:
  - Category: `quick`
  
  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: T10 | Blocked By: —
  
  **QA Scenarios**:
  ```
  Scenario: No old workflow residue in src/
    Tool: bash
    Command: git grep -n -i "brainstorm" -- src
    Expected: Only `src/skills/brainstorm-skill.ts` and `src/skills/registry.ts` registration references appear
  ```

- [x] **4. Run `bun test` to identify failures**
  
  **What to do**: Run the full test suite and capture the output. Identify which test files fail due to stale `brainstorm` references (vs pre-existing failures).
  
  **Verification command**: `bun test 2>&1 | tee /tmp/test-output.txt` — examine output for compilation errors and test failures
  
  **Agent Profile**:
  - Category: `quick`
  
  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: T5 | Blocked By: T1, T2
  
  **QA Scenarios**:
  ```
  Scenario: Test output captured
    Tool: bash
    Command: test -f /tmp/test-output.txt && echo "captured"
    Expected: Outputs "captured"
  ```

- [x] **5. Fix test failures from stale brainstorm references**
  
  **What to do**: For each test file that fails due to `brainstorm`/`Brainstorm` references (import paths, type names, config keys, assertion strings, snapshot content), update to use `feature`/`Feature`. Run `bun test` after fixes to verify.
  
  **Known already-fixed files** (from design.md): `tests/commands/feature.test.ts`, `tests/commands/change.test.ts`, `tests/enhancer/enhancer.test.ts`, `tests/index.test.ts`
  
  **Likely affected areas**: Import paths from `src/phases/brainstorm/` → `src/phases/feature/`, type names `BrainstormingConfig` → `FeatureConfig`, config key `brainstorming` → `feature`, tool name references `openflow-brainstorm` → `openflow-feature`, string assertions containing "brainstorm"
  
  **Verification command**: `bun test` — all tests pass (or only pre-existing failures remain)
  
  **Agent Profile**:
  - Category: `unspecified-high` (may need to touch many files)
  
  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: T10 | Blocked By: T4
  
  **QA Scenarios**:
  ```
  Scenario: Tests pass after fixes
    Tool: bash
    Command: bun test
    Expected: Exit code 0 (or documented pre-existing failures only)
  ```

- [x] **6. Update `README.md`**
  
  **What to do**: Replace all `/openflow-brainstorm` with `/openflow-feature` in command references, examples, and "See it in action" section. Update config key `brainstorming` to `feature` in the Configuration section. Update "Three Core Commands" section. Do NOT modify architecture diagram or historical references.
  
  **File to modify**: `README.md`
  
  **Verification command**: `grep -n "openflow-brainstorm" README.md` — expected: 0 matches (except possibly in historical context if any)
  
  **Agent Profile**:
  - Category: `writing`
  
  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: T10 | Blocked By: —
  
  **QA Scenarios**:
  ```
  Scenario: No old command references in README
    Tool: bash
    Command: grep -c "openflow-brainstorm" README.md
    Expected: Outputs "0"
  ```

- [x] **7. Update `README_CN.md`**
  
  **What to do**: Same changes as T6 but for the Chinese version — replace `/openflow-brainstorm` with `/openflow-feature`, update config key `brainstorming` → `feature`.
  
  **File to modify**: `README_CN.md`
  
  **Verification command**: `grep -n "openflow-brainstorm" README_CN.md` — expected: 0 matches
  
  **Agent Profile**:
  - Category: `writing`
  
  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: T10 | Blocked By: —
  
  **QA Scenarios**:
  ```
  Scenario: No old command references in README_CN
    Tool: bash
    Command: grep -c "openflow-brainstorm" README_CN.md
    Expected: Outputs "0"
  ```

- [x] **8. Update tutorial docs**
  
  **What to do**: Update `docs/current/workflow/openflow-usage-tutorial.md` and `docs/current/workflow/openflow-usage-tutorial.en.md` to replace `/openflow-brainstorm` with `/openflow-feature` in command references, examples, and workflow descriptions.
  
  **Files to modify**:
  - `docs/current/workflow/openflow-usage-tutorial.md`
  - `docs/current/workflow/openflow-usage-tutorial.en.md`
  
  **Verification command**: `grep -r "openflow-brainstorm" docs/current/workflow/` — expected: 0 matches
  
  **Agent Profile**:
  - Category: `writing`
  
  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: T10 | Blocked By: —
  
  **QA Scenarios**:
  ```
  Scenario: No old command references in tutorials
    Tool: bash
    Command: grep -r "openflow-brainstorm" docs/current/workflow/ | wc -l
    Expected: Outputs "0"
  ```

- [x] **9. Update ADR docs**
  
  **What to do**: Check `docs/decisions/ADR-001-docs-governance-and-workflow.md` (and any other ADR files) for references to `/openflow-brainstorm` command. Update to `/openflow-feature` if the ADR describes current behavior (not historical decisions).
  
  **Files to check/modify**:
  - `docs/decisions/ADR-001-docs-governance-and-workflow.md`
  - Any other `docs/decisions/ADR-*.md` files referencing the brainstorm command
  
  **Verification command**: `grep -r "openflow-brainstorm" docs/decisions/` — expected: 0 matches for current behavior references (historical mentions may remain if they document past state)
  
  **Agent Profile**:
  - Category: `writing`
  
  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: T10 | Blocked By: —
  
  **QA Scenarios**:
  ```
  Scenario: ADR docs updated for current command
    Tool: bash
    Command: grep -r "openflow-brainstorm" docs/decisions/ | wc -l
    Expected: Outputs "0" (or only historical references, none describing current behavior)
  ```

- [x] **10. Final verification suite**
  
  **What to do**: Run the complete verification checklist:
  1. `git grep -n -i "brainstorm" -- src` → expect only `src/skills/brainstorm-skill.ts` and `src/skills/registry.ts` registration references
  2. `bun test` → expect all pass (or pre-existing failures only)
  3. `grep -r "openflow-brainstorm" README.md README_CN.md docs/current/ docs/decisions/` → expect 0
  4. `grep -r "brainstorming" README.md README_CN.md docs/current/ docs/decisions/` → expect 0 (config key)
  5. Verify `src/skills/registry.ts` exports 3 skills
  6. Verify `src/skills/brainstorm-skill.ts` exists and exports `getBrainstormSkill`
  
  **Verification**: All 6 checks pass
  
  **Agent Profile**:
  - Category: `quick`
  
  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: — | Blocked By: T3, T5, T6, T7, T8, T9
  
  **QA Scenarios**:
  ```
  Scenario: Full verification pass
    Tool: bash
    Command: bash -c 'count=$(grep -ri "brainstorm\|Brainstorm" src/ --include="*.ts" | grep -v "brainstorm-skill.ts" | wc -l); test "$count" -eq 0 && echo "PASS" || echo "FAIL: $count residue"'
    Expected: Outputs "PASS"
  
  Scenario: Tests pass
    Tool: bash
    Command: bun test
    Expected: Exit code 0 (or documented pre-existing failures)
  ```


---
## Verification Phase

### Security Checks
- [x] **Secret Scan**: Check for accidentally committed secrets
- [x] **Vulnerability Scan**: Run dependency vulnerability check

### Quality Checks
- [x] **Lint Check**: Run linter
- [x] **Type Check**: Run type checker
- [x] **Test Suite**: Run all tests

### Failure Handling
- Quality failure: fix implementation and rerun verification.
- Security failure: block archive until fixed.
- Consistency failure: sync docs and implementation, then rerun verification.

> Auto-generated by OpenFlow. Complete all verification tasks before archiving.
