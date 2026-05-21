# TDD Skill Redesign - Behavior

## Overview

This document describes the observable behavior of the TDD skill redesign feature.

## Behavior Scenarios

### Scenario 1: TDD Skill Registration When Enabled

**Given**: OpenFlow plugin initializes with `tdd.enabled=true`
**When**: `registerSkills()` is called during plugin init
**Then**:
- `getSkills(config)` returns skill list including `openflow-tdd`
- `SKILL.md` is written to `~/.config/opencode/skills/openflow-tdd/SKILL.md`
- Skill content includes Red-Green-Refactor guidance, anti-patterns, and OpenFlow-specific quality gate reference

### Scenario 2: No TDD Skill Registration When Disabled

**Given**: OpenFlow plugin initializes with `tdd.enabled=false`
**When**: `registerSkills()` is called during plugin init
**Then**:
- `getSkills(config)` returns skill list WITHOUT `openflow-tdd`
- No `openflow-tdd` directory is created in skills directory
- Existing `openflow-tdd` directory (from previous run) is removed or left as-is

### Scenario 3: Orchestrator Loads TDD Skill for Core Business Task

**Given**: A task involves implementing core business logic (algorithms, data models, business rules)
**When**: Orchestrator delegates the task to a subagent
**Then**:
- `load_skills` parameter includes `"openflow-tdd"`
- Subagent receives TDD skill instructions in its context
- Subagent knows to follow Red-Green-Refactor for implementation functions

### Scenario 4: Orchestrator Skips TDD Skill for Glue Code

**Given**: A task involves configuration, styling, simple CRUD, or utility functions
**When**: Orchestrator delegates the task to a subagent
**Then**:
- `load_skills` parameter does NOT include `"openflow-tdd"`
- Subagent works normally without TDD constraints

### Scenario 5: Subagent Applies TDD to Core Function

**Given**: Subagent is loaded with TDD skill and implements a core function
**When**: Writing the function
**Then**:
- Subagent writes failing test first (RED)
- Subagent runs test to verify failure
- Subagent writes minimal implementation (GREEN)
- Subagent runs test to verify pass
- Subagent refactors if needed (REFACTOR)

### Scenario 6: Subagent Skips TDD for Simple Function

**Given**: Subagent is loaded with TDD skill and encounters a simple passthrough function
**When**: Writing the function
**Then**:
- Subagent may skip TDD with brief reasoning
- Subagent does not dogmatically enforce TDD on trivial code

### Scenario 7: Plan Enhancer No Longer Injects TDD

**Given**: A plan file is written with implementation tasks >= old threshold
**When**: `enhancePlan()` processes the file
**Then**:
- No `## TDD Expanded Tasks` section is added
- Design Context, Verification Phase, and Budget Warning sections are still added if enabled
- Enhancer returns `true` if other enhancements were made

### Scenario 8: Backward Compatibility for Existing Config

**Given**: An existing config file contains `tdd: { enabled: true, expand_threshold: 3 }`
**When**: OpenFlow loads the config
**Then**:
- Config loads successfully without error
- `expand_threshold` is silently ignored
- `tdd.enabled` is respected

## State Transitions

```
Plugin Init
  ├── tdd.enabled=true ──> Register openflow-tdd skill ──> Skill available for loading
  └── tdd.enabled=false ──> Skip TDD skill registration ──> Skill not available

Plan Write
  ├── (any task count) ──> enhancePlan() ──> No TDD section added
  └── Other enhancers still work normally

Task Delegation (Orchestrator)
  ├── Core business task ──> load_skills includes "openflow-tdd"
  └── Glue/config task ──> load_skills excludes "openflow-tdd"

Subagent Execution
  ├── TDD skill loaded + core function ──> Red-Green-Refactor
  └── TDD skill loaded + simple function ──> May skip with reasoning
```

## Error Handling

| Error Condition | Behavior |
|----------------|----------|
| Skill file write fails | Log warning; plugin continues without TDD skill |
| Config parse fails | Fallback to default config (tdd.enabled=true) |
| `getSkills()` called without config | Throw error (type-safe; shouldn't happen) |

## Edge Cases

1. **Config toggle during session**: If user changes `tdd.enabled` after plugin init, skill registration won't update until next plugin restart. This is acceptable.
2. **Multiple plan files**: Each plan file processed by enhancer will not get TDD sections, regardless of task count.
3. **Mixed task types in single plan**: Plan-level TDD injection is gone; judgment moves to task delegation time.
4. **Existing plan files with TDD sections**: Static text remains but has no effect; not cleaned up automatically.
