# AI Self-Governance Facts

## Current Rules

- AI reflection is an AI self-governance skill (`openflow-ai-reflection`), not a user-facing command.
- The AI self-triggers reflection when it detects a repeatable workflow or process mistake. No event listener or background watcher exists.
- Reflection records are organized under `docs/current/workflow/ai-reflection/`, one category document per canonical failure mode.
- Repeated mistakes of the same type accumulate in the same category document (no per-incident files).

## Canonical Categories

| Category | File | Meaning |
|----------|------|---------|
| Premature implementation | `premature-implementation.md` | AI started coding before the problem boundary or design constraints were clear |
| Verification skipped | `verification-skipped.md` | AI claimed completion without required evidence or quality gate |
| Docs misuse | `docs-misuse.md` | AI put information in the wrong OpenFlow docs layer or violated docs governance |
| Delegation misuse | `delegation-misuse.md` | AI delegated poorly, duplicated delegated searches, or used the wrong agent |
| Context loss | `context-loss.md` | AI forgot prior decisions, lost constraints across turns, or contradicted established facts |

## Trigger Model

The MVP trigger is AI self-assessment. The AI decides based on conversation context and tool output whether a mistake has recurrence value. No external event, hook, or listener drives the trigger.

### Must-trigger conditions

1. User points out an AI workflow/process error (e.g., "you skipped verification", "you started too early").
2. AI notices it violated a hard instruction or OpenFlow rule.
3. Review, harden, verify, test, or typecheck reveals an AI decision/process failure.
4. Same category of mistake repeats.
5. High-risk near miss (e.g., almost overwrote a plan, almost archived without readiness).

### Must-not-trigger conditions

- Typos or formatting nits
- Ordinary code bugs with no AI process lesson
- External tool failures where AI made no wrong decision
- User preference changes that were not knowable earlier
- Work still being corrected in the same execution loop

## Required Case Fields

Each reflection case must include: category, summary, trigger, context, what went wrong, root cause, correct behavior next time, recurrence signal, evidence, classification, corrective rule, scope boundary, promotion decision.

Optional: severity, related files, related command, follow-up action.

## Safety Boundaries

- Reflection must not automatically edit `AGENTS.md`, skill files, tests, or global workflow docs.
- Promotion candidates are recorded but require human review before taking effect.
- Reflection does not replace verification, issue-resolution, or archive workflows.
- Custom categories are out of scope for the MVP.

## Source Documents

- Design: `docs/current/ai-self-governance/design.md`
- Skill: `openflow-ai-reflection`
- Reflection cases: `docs/current/workflow/ai-reflection/`
