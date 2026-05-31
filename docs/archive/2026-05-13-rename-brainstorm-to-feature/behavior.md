# rename-brainstorm-to-feature - Behavior

## Scope

**In scope:**
- Renaming `/openflow-brainstorm` command to `/openflow-feature` throughout source code and documentation
- Creating a new conversational `openflow-brainstorm` Skill for collaborative requirement exploration
- Fixing test files to match renamed code
- Updating active documentation (README, tutorials, ADR)

**Out of scope:**
- Changing the structured feature workflow behavior (it collects the same 5 questions, derives the same constraints, generates the same documents — only the command name changes)
- Modifying historical docs in `docs/archive/` or existing `docs/changes/`
- Adding hard gates or checklists to the brainstorm skill
- Changing issue/harden/verify/archive workflows

## Behavior Scenarios

### Scenario 1: User invokes the design command

**Given** a user wants to start a structured feature design workflow
**When** the user types `/openflow-feature <feature-name>`
**Then** the system collects feature requirements through 5 structured questions, derives constraints, and generates `design.md` and `behavior.md` in `docs/changes/YYYY-MM-DD-<feature-name>/`

**Verification**: Command works identically to the old `/openflow-brainstorm` — same questions, same constraint derivation, same output files. Only the command name changed.

### Scenario 2: Old command name is no longer recognized

**Given** a user who previously used `/openflow-brainstorm`
**When** the user types `/openflow-brainstorm <feature-name>`
**Then** the system does NOT recognize this as a command; no tool is registered with that name; the user receives no structured workflow response

**Verification**: `grep -r "openflow-brainstorm" src/ --include="*.ts"` returns 0 results in tool registration code. Only `openflow-feature` tool exists.

### Scenario 3: AI agent detects brainstorming need via keywords

**Given** a user's message contains keywords like "brainstorm", "explore requirements", "compare approaches", or "design discussion"
**When** the AI agent processes the message
**Then** the agent may invoke the `openflow-brainstorm` skill to start collaborative dialogue — asking one question at a time, exploring approaches, and comparing trade-offs

**Verification**: The skill's `description` field contains trigger keywords. The agent has access to the skill content via the registry.

### Scenario 4: AI agent autonomously decides to brainstorm

**Given** a user describes an ambiguous or complex problem without explicitly requesting brainstorming
**When** the AI agent judges that collaborative exploration would be valuable before committing to a structured workflow
**Then** the agent may invoke the `openflow-brainstorm` skill based on its own assessment

**Verification**: The skill description includes guidance: "Use when the user wants to explore a problem space before committing to a structured feature workflow."

### Scenario 5: Brainstorm skill suggests feature command

**Given** a user has completed collaborative exploration via the brainstorm skill
**When** the exploration reaches a natural conclusion (requirements are clear enough to formalize)
**Then** the skill content suggests running `/openflow-feature` to enter the structured design workflow

**Verification**: The skill's `content` field includes a recommendation to transition to `/openflow-feature` after exploration.

### Scenario 6: Brainstorm skill does NOT block implementation

**Given** a user wants to brainstorm
**When** the brainstorm skill is active
**Then** the skill does NOT impose hard gates, mandatory checklists, or implementation blocks — it is a conversational guide only

**Verification**: The skill content contains no `<HARD-GATE>` blocks, no mandatory checklist steps, no visual companion requirement.

### Scenario 7: Source code has zero brainstorm residue

**Given** all renames are complete
**When** searching the `src/` directory for "brainstorm" or "Brainstorm" in TypeScript files
**Then** the only matches are in `src/skills/brainstorm-skill.ts` (the new conversational skill) — no other file contains these terms

**Verification**: `grep -ri brainstorm src/ --include="*.ts" | grep -v brainstorm-skill` returns 0 results.

### Scenario 8: Tests compile and pass

**Given** all test files have been updated to match renamed code
**When** running `bun test`
**Then** all tests pass (or only pre-existing failures remain, unrelated to this rename)

**Verification**: `bun test` exit code 0 (or documented pre-existing failures only).

### Scenario 9: Documentation reflects new naming

**Given** active documentation has been updated
**When** a user reads README.md, README_CN.md, or tutorial docs
**Then** all command references show `/openflow-feature` (not `/openflow-brainstorm`); config examples show `feature` key (not `brainstorming`)

**Verification**: `grep -ri "openflow-brainstorm" README.md README_CN.md docs/current/ docs/decisions/` returns 0 results. `grep -ri "brainstorming" README.md README_CN.md` returns 0 results.

### Scenario 10: Historical documentation is preserved

**Given** the rename is complete
**When** examining `docs/archive/` and existing `docs/changes/` (other than this feature's directory)
**Then** no files have been modified — historical records remain exactly as they were

**Verification**: `git diff docs/archive/` shows no changes. Other `docs/changes/` directories show no changes.

## Must Not Behaviors

- The brainstorm skill MUST NOT register as a tool/command — it is Skill content only
- The brainstorm skill MUST NOT impose hard gates or block implementation
- The old `/openflow-brainstorm` command MUST NOT exist as an alias
- Historical documentation MUST NOT be modified
- The structured feature workflow behavior MUST NOT change (only the command name changes)

## Verification Mapping

| Behavior | Evidence Type | Expected Evidence | Status |
|----------|--------------|-------------------|--------|
| Command `/openflow-feature` works | Functional test | `bun test` passes for feature command tests | pending |
| Old command `/openflow-brainstorm` absent | Grep | 0 results in tool registration code | pending |
| Brainstorm skill registered | Code inspection | `registry.ts` exports 3 skills including brainstorm | pending |
| Brainstorm skill is conversational | Code inspection | No tool/hook/state-machine for brainstorm | pending |
| Source code has zero brainstorm residue | Grep | `grep -ri brainstorm src/ --include="*.ts" \| grep -v brainstorm-skill` = 0 | pending |
| Tests pass | Build | `bun test` exit code 0 | pending |
| Documentation updated | Grep | No `/openflow-brainstorm` in active docs | pending |
| Historical docs preserved | Git diff | No changes in `docs/archive/` | pending |
