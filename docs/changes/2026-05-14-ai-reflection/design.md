# ai-reflection - Design

## Design Responsibility

This document describes how `ai-reflection` is implemented: command boundary, data model, file layout, write strategy, validation rules, and integration points.

Observable user behavior belongs in `behavior.md`; this file should not duplicate Given/When/Then scenarios except where they inform implementation choices.

## Architecture Summary

`ai-reflection` is an explicit OpenFlow command/tool for recording AI process mistakes as durable workflow knowledge.

The MVP has three implementation layers:

1. **Command layer**: `openflow-reflect` parses user input, validates required fields, and returns a markdown result packet.
2. **Reflection document layer**: pure file helpers initialize and update markdown files under `docs/current/workflow/ai-reflection/`.
3. **Skill/documentation layer**: a manual command reference explains when to use reflection and which fields are required.

No background consumer, hook, guardian, scheduler, database, or automatic promotion mechanism is part of the MVP.

## Proposed File Changes

```text
src/commands/reflect.ts
src/commands/index.ts
src/index.ts
src/phases/ai-reflection/reflection-docs.ts
src/skills/reflect-skill.ts
src/skills/registry.ts
tests/commands/reflect.test.ts
tests/phases/ai-reflection/reflection-docs.test.ts
tests/skills/registration.test.ts
tests/index-runtime-registration.test.ts
docs/current/workflow/openflow-usage-tutorial.md
README.md
```

Generated runtime content:

```text
docs/current/workflow/ai-reflection/
  index.md
  premature-implementation.md
  verification-skipped.md
  docs-misuse.md
  delegation-misuse.md
  context-loss.md
```

## Command Interface

Tool name: `openflow-reflect`

Empty invocation initializes the reflection docs:

```ts
handleReflect(ctx, {})
```

Case invocation appends one reflection entry:

```ts
interface ReflectInput {
  category?: ReflectionCategoryId
  summary?: string
  trigger?: string
  context?: string
  whatWentWrong?: string
  rootCause?: string
  correctBehavior?: string
  recurrenceSignal?: string
  evidence?: string
  promoteToRule?: 'yes' | 'no' | 'needs-review'
  classification?: string
  correctiveRule?: string
  scopeBoundary?: string
  severity?: 'low' | 'medium' | 'high' | 'critical'
  relatedFiles?: string
  relatedCommand?: string
  followUpAction?: string
}
```

Validation rules:

- If no case fields are provided, initialize docs only.
- If any case field is provided, all required case fields must be present.
- `category` must be one of the canonical category ids.
- `promoteToRule` must be `yes`, `no`, or `needs-review`.
- Optional fields may be omitted without blocking the write.

## Data Model

Canonical categories:

```ts
type ReflectionCategoryId =
  | 'premature-implementation'
  | 'verification-skipped'
  | 'docs-misuse'
  | 'delegation-misuse'
  | 'context-loss'
```

Required case model:

```ts
interface ReflectionCase {
  category: ReflectionCategoryId
  summary: string
  trigger: string
  context: string
  whatWentWrong: string
  rootCause: string
  correctBehavior: string
  recurrenceSignal: string
  evidence: string
  promoteToRule: 'yes' | 'no' | 'needs-review'
  classification: string
  correctiveRule: string
  scopeBoundary: string
  severity?: 'low' | 'medium' | 'high' | 'critical'
  relatedFiles?: string
  relatedCommand?: string
  followUpAction?: string
}
```

The model deliberately stores conclusions as fields rather than deriving them implicitly from prose. This makes future agents able to scan for category, corrective rule, recurrence signal, and promotion candidates.

## Markdown Format

### `index.md`

The index file is a machine-readable overview with stable sections:

```md
# AI Reflection

## Purpose

## When To Reflect

## When Not To Reflect

## Categories
| Category | File | Cases | Current Rule |

## Promotion Candidates
| Date | Category | Summary | Suggested Target |
```

`Cases` is recalculated or updated by the document layer. Promotion candidates are listed only when case input uses `yes` or `needs-review`.

### Category Documents

Each category file uses stable headings:

```md
# <Category Title>

## Rule
<Current corrective rule for this category.>

## Trigger Signals
- <Signal>

## Failure Cases

### <YYYY-MM-DD> - <summary>
- Trigger:
- Context:
- What went wrong:
- Root cause:
- Correct behavior next time:
- Recurrence signal:
- Evidence:
- Classification:
- Corrective rule:
- Scope boundary:
- Promote to AGENTS.md/skill/test/workflow docs:
- Severity:
- Related files:
- Related command:
- Follow-up action:
```

The command appends to `## Failure Cases`; it does not create one file per incident.

## Write Strategy

- Use `fs/promises` and `path.join(ctx.directory, ...)` like existing OpenFlow commands.
- Create missing parent directories with `recursive: true`.
- Initialization is idempotent:
  - create missing files;
  - preserve existing files;
  - do not duplicate required headings;
  - do not remove existing cases.
- Append one case to exactly one category document per command call.
- Update `index.md` after append to reflect case counts and promotion candidates.
- Reject unknown categories before any write.
- Reject partial input before any write.

## Integration Points

### Plugin tool registration

Add `openflow-reflect` to `src/index.ts` next to other OpenFlow tools. The tool should call `handleReflect(openflowCtx, args)` and return user-facing markdown.

### Command barrel

Export `handleReflect` from `src/commands/index.ts`.

### Skill registry

Add `getReflectSkill()` and include it in `getSkills()` so agents can load command usage instructions.

### Documentation

Update workflow tutorial and README with the command purpose and boundaries. These docs should point to the behavior document concepts, not duplicate implementation internals.

## Security And Safety Constraints

- Do not accept category ids as file paths.
- Do not allow custom categories in the MVP.
- Do not write outside `docs/current/workflow/ai-reflection/` for reflection content.
- Do not edit `AGENTS.md`, skill files, tests, or workflow docs automatically based on `promoteToRule`.
- Do not register hooks or background listeners.
- Do not treat every failed test as a reflection-worthy event.

## Compatibility Constraints

- Existing OpenFlow tools must remain registered with the same names.
- Existing feature, issue, archive, writing-plan, verify, harden, and quality workflows must not change behavior.
- Current docs governance remains intact: active workflow knowledge lives under `docs/current/workflow/`; change design remains under `docs/changes/` until archive.

## Testing Strategy

- Unit test document initialization from an empty workspace.
- Unit test idempotent initialization with existing category content.
- Unit test appending a complete case.
- Unit test invalid category produces no write.
- Unit test partial input produces no write.
- Integration test plugin registration exposes `openflow-reflect`.
- Regression test existing tool registration remains unchanged.
- Skill registry test confirms `openflow-reflect` instructions are discoverable.

## Risks And Mitigations

- **Noisy reflection log**: mitigate with behavior-level non-trigger rules and required fields.
- **Premature automation**: mitigate by excluding hooks, guardians, and auto-promotion from design.
- **Markdown drift**: mitigate with stable headings and tests asserting generated structure.
- **Unsafe file writes**: mitigate with canonical category ids and fixed file mapping.
- **Rule conflicts**: mitigate by recording promotion candidates for human review instead of editing global rules.
