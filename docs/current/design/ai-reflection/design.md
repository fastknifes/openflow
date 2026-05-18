# ai-reflection - Design

## Design Responsibility

This document describes the implementation design for an AI self-triggered reflection skill: architecture, skill contract, reflection data model, document layout, write rules, and integration boundaries.

Observable behavior and trigger semantics belong in `behavior.md`.

## Architecture Summary

`ai-reflection` is an AI self-governance skill, not a user-facing command.

The MVP provides a registered skill named `openflow-ai-reflection`. The skill teaches the AI when it must stop and record a reflection, how to classify the mistake, and how to update reflection markdown documents under `docs/current/workflow/ai-reflection/`.

The AI triggers the skill by self-assessment during a normal conversation or implementation session. The system does not add a background listener, event subscription, resident guardian, or slash command in the MVP.

## Architecture Layers

1. **Skill registration layer**
   - Adds `src/skills/ai-reflection-skill.ts`.
   - Registers it from `src/skills/registry.ts`.
   - Exposes instructions through the existing OpenFlow skill system.

2. **Reflection protocol layer**
   - The skill content defines must-trigger, should-trigger, and must-not-trigger rules.
   - The skill content defines required reflection fields and output format.
   - The skill tells AI to use normal file-editing tools to update markdown docs.

3. **Documentation layer**
   - Reflection records live under `docs/current/workflow/ai-reflection/`.
   - `index.md` is the overview.
   - One category document stores repeated cases for each canonical failure mode.

No command handler, plugin tool, hook, scheduler, or automatic event bridge is required for MVP.

## Proposed File Changes

```text
src/skills/ai-reflection-skill.ts
src/skills/registry.ts
README.md
```

Runtime reflection content, created or updated by the AI when the skill is triggered:

```text
docs/current/workflow/ai-reflection/
  index.md
  premature-implementation.md
  verification-skipped.md
  docs-misuse.md
  delegation-misuse.md
  context-loss.md
```

## Skill Contract

Skill name: `openflow-ai-reflection`

The skill must instruct the AI to:

1. detect whether a must-trigger or should-trigger condition occurred;
2. avoid reflection for must-not-trigger cases;
3. stabilize any broken workspace before writing reflection;
4. classify the mistake into one canonical category;
5. create `docs/current/workflow/ai-reflection/` if missing;
6. create `index.md` and category docs if missing;
7. append one case to the matching category document;
8. update `index.md` case counts and promotion candidates;
9. record promotion recommendations without editing `AGENTS.md`, skills, tests, or workflow docs automatically.

The skill must not ask the user to run a command before reflecting. If the AI determines that a must-trigger condition occurred, the AI loads/follows the skill and records the reflection itself.

## Trigger Mechanism

The trigger is **AI self-assessment**, not an external event listener.

Supported trigger signals:

- user says the AI made a process/workflow mistake;
- AI notices it violated a hard instruction or OpenFlow rule;
- review, harden, verify, test, or typecheck output exposes an AI decision/process failure;
- the mistake matches an existing reflection category;
- a near miss would be costly if repeated.

Implementation boundary:

- No `chat.message` listener is added.
- No tool hook is added.
- No verify/harden/test event subscription is added.
- No `/openflow-reflect` command is added in MVP.
- No background guardian is added.

The AI decides to invoke the skill based on the current conversation and tool outputs available in its context.

## Reflection Data Model

Canonical categories:

```ts
type ReflectionCategoryId =
  | 'premature-implementation'
  | 'verification-skipped'
  | 'docs-misuse'
  | 'delegation-misuse'
  | 'context-loss'
```

Required case fields:

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
  classification: string
  correctiveRule: string
  scopeBoundary: string
  promoteToRule: 'yes' | 'no' | 'needs-review'
  severity?: 'low' | 'medium' | 'high' | 'critical'
  relatedFiles?: string
  relatedCommand?: string
  followUpAction?: string
}
```

The skill should require the AI to fill these fields before writing a case. If the AI cannot fill a field, it should continue investigating the mistake until it can write a useful reflection, or skip reflection if the case is not actually reflection-worthy.

## Markdown Format

### `index.md`

```md
# AI Reflection

## Purpose

## Trigger Rules

## Categories
| Category | File | Cases | Current Rule |

## Promotion Candidates
| Date | Category | Summary | Suggested Target |
```

### Category Document

```md
# <Category Title>

## Rule
<Current corrective rule for this category.>

## Trigger Signals
- <Observable signal that should make future AI pause.>

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

## Canonical Categories

| Category | File | Meaning |
|---|---|---|
| Premature implementation | `premature-implementation.md` | AI started coding, planning, or changing files before the problem boundary or design constraints were clear. |
| Verification skipped | `verification-skipped.md` | AI claimed completion or readiness without required evidence, tests, typecheck, build, verify, or quality gate. |
| Docs misuse | `docs-misuse.md` | AI put information in the wrong OpenFlow docs layer, treated archive as current truth, or violated docs governance. |
| Delegation misuse | `delegation-misuse.md` | AI delegated poorly, duplicated delegated searches, used the wrong agent/category/skill, or ignored required specialist review. |
| Context loss | `context-loss.md` | AI forgot prior decisions, ignored active feature/issue context, lost constraints across turns, or contradicted established facts. |

Custom categories are out of scope for the MVP.

## Write Strategy

Because this is skill-driven, writes are performed by the AI using normal file tools while following the skill contract.

Rules:

- Create `docs/current/workflow/ai-reflection/` if missing.
- Create missing `index.md` or category files using the documented templates.
- Preserve existing cases.
- Append one case to exactly one category document.
- Do not create one file per incident.
- Update `index.md` after appending a case.
- If a case is marked `yes` or `needs-review`, list it under promotion candidates.
- Do not automatically edit the promoted target.

## Skill Registration

Add `getAiReflectionSkill()` returning a `SkillInfo`:

```ts
{
  name: 'openflow-ai-reflection',
  description: 'Use when the AI detects it made or nearly made a repeatable workflow/process mistake and must record a reflection lesson.',
  content: '<trigger rules, required fields, templates, write rules>'
}
```

Register it from `src/skills/registry.ts`.

## Security And Safety Constraints

- Do not accept arbitrary category names as paths.
- Do not create custom categories in MVP.
- Do not write reflection content outside `docs/current/workflow/ai-reflection/`.
- Do not edit `AGENTS.md`, skill files, tests, or workflow docs automatically.
- Do not add command/tool/hook/background listener behavior in MVP.
- Do not treat every failed test or user correction as reflection-worthy unless it exposes an AI process lesson.

## Compatibility Constraints

- Existing OpenFlow commands and tools remain unchanged.
- Existing feature, issue, archive, writing-plan, verify, harden, and quality workflows remain unchanged.
- The skill is additive to the existing skill registry.
- OpenFlow docs governance remains intact: active workflow knowledge lives under `docs/current/workflow/`.

## Testing Strategy

- Skill registry test confirms `openflow-ai-reflection` is discoverable.
- Skill content test confirms must-trigger, should-trigger, and must-not-trigger rules are present.
- Skill content test confirms canonical categories and target directory are present.
- Skill content test confirms no command/hook/background listener is promised.
- Documentation review confirms behavior and design agree that MVP is skill-driven.

## Risks And Mitigations

- **Risk: AI forgets to self-trigger.** Mitigation: skill description and docs must state clear must-trigger conditions.
- **Risk: reflection becomes noisy.** Mitigation: include must-not-trigger rules and require recurrence value.
- **Risk: lack of command makes formatting inconsistent.** Mitigation: stable templates in the skill and docs.
- **Risk: premature automation.** Mitigation: explicitly exclude hooks, commands, guardian, and auto-promotion from MVP.
- **Risk: rule conflicts.** Mitigation: record promotion candidates only; human review is required for global rule changes.
