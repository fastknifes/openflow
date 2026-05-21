# TDD Skill Redesign - Requirements

## Functional Requirements

### FR-1: TDD Skill Definition
- The system MUST provide a TDD skill (`src/skills/tdd-skill.ts`) that defines:
  - Skill name: `openflow-tdd`
  - Description indicating it's for core business logic implementation
  - Content based on superpowers TDD skill adapted for OpenFlow governance

### FR-2: Conditional Skill Registration
- When `config.tdd.enabled=true`, the system MUST register the TDD skill during plugin initialization
- When `config.tdd.enabled=false`, the system MUST NOT register the TDD skill
- The registration mechanism MUST reuse existing `src/skills/registration.ts` infrastructure

### FR-3: Skill Registration Registry Update
- `src/skills/registry.ts` MUST include `getTddSkill` in `SKILL_FACTORIES`
- `src/skills/registry.ts` MUST accept `OpenFlowConfig` parameter in `getSkills()` to filter conditional skills
- `src/commands/manifest.ts` MUST include `'openflow-tdd'` in `OPENFLOW_REGISTERED_SKILL_NAMES`

### FR-4: Plan Enhancer TDD Removal
- `src/plan/enhancer.ts` MUST NOT generate `## TDD Expanded Tasks` sections
- `src/plan/enhancer.ts` MUST remove `addTddExpansionComment()` function
- `src/plan/enhancer.ts` MUST remove `TDD_EXPANDED_HEADER` constant
- Other enhancer features (Design Context, Verification Phase, Budget Warning) MUST continue working

### FR-5: Config Simplification
- `src/types.ts` MUST define `TddConfig` as `{ enabled: boolean }` only
- `src/config.ts` MUST remove `expand_threshold` from Zod schema
- `src/hooks/tool-after.ts` MUST remove `tdd.enabled` from plan enhancement trigger condition
- `src/commands/config-cmd.ts` MUST remove `expand_threshold` from config display

### FR-6: TDD Skill Content
The skill content MUST include:
- Red-Green-Refactor cycle instructions
- When to use TDD (core business logic criteria)
- When to skip TDD (glue code, config, utilities)
- Testing anti-patterns reference
- Integration with `openflow-quality-gate` for final verification
- Reference to `testing-anti-patterns.md` companion document

## Non-Functional Requirements

### NFR-1: Backward Compatibility
- Existing config files with `expand_threshold` MUST load without error
- Existing plan files with `## TDD Expanded Tasks` sections MUST not cause errors
- Default behavior when `tdd.enabled` is not specified MUST be `true` (same as current default)

### NFR-2: Determinism
- Skill registration outcome MUST be deterministic for the same config
- Skill content MUST be deterministic (no random or session-dependent text)

### NFR-3: Testability
- All new code MUST have corresponding unit tests
- All removed code MUST have its tests removed or updated
- Test coverage for skill registration conditional logic MUST be > 80%

## Constraints

- [must] Changes limited to skill system, plan enhancer, config, and tests
- [must] No changes to OpenCode core or skill system infrastructure
- [must] No changes to quality gate verify logic (evidence expectations remain)
- [must] No changes to writing-plan command
- [should] Skill content adapted from superpowers TDD skill, not rewritten from scratch

## Verification Criteria

- [ ] `bun test tests/skills/tdd-skill.test.ts` passes
- [ ] `bun test tests/plan/enhancer.test.ts` passes (after TDD tests removed)
- [ ] `bun test tests/hooks/tool-after.test.ts` passes (if TDD trigger tests exist)
- [ ] `npm run typecheck` exits 0
- [ ] Manual verification: `tdd.enabled=true` creates skill file; `tdd.enabled=false` does not
