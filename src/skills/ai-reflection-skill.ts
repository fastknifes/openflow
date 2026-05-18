import type { SkillInfo } from './types.js'

export function getAiReflectionSkill(): SkillInfo {
  return {
    name: 'openflow-ai-reflection',
    description:
      'Use when the AI detects it made or nearly made a repeatable workflow/process mistake and must record a reflection lesson.',
    content: `# OpenFlow AI Reflection Skill

## Overview

This skill is AI-invoked. It is not a user slash command and does not add runtime automation.
When the AI detects it has made or nearly made a repeatable workflow or process mistake,
it self-triggers this skill to record a structured reflection case under
\`docs/current/workflow/ai-reflection/\` so that future sessions can avoid the same category of mistake.

The trigger is AI self-assessment based on the current conversation, visible tool output,
review feedback, and OpenFlow instructions already in context.

## Pre-Work: Check Existing Corrective Rules

Before classifying a mistake or writing a new reflection case, read the smallest relevant set
of existing corrective rules under \`docs/current/workflow/ai-reflection/\`:

1. Read the category \`index.md\` that matches the suspected category
   (e.g., \`docs/current/workflow/ai-reflection/premature-implementation/index.md\`).
2. If the index lists cases clearly related to the current mistake, read those case documents
   to see whether an existing corrective rule already covers the pattern.
3. Existing corrective rules inform the classification, root cause analysis, and corrective rule
   for the new case — a duplicate or near-duplicate should reference the existing rule rather
   than re-derive one from scratch.

Absence of the \`docs/current/workflow/ai-reflection/\` directory or related rules is not a blocker;
proceed with recording the reflection case as usual.

## Trigger Model

The AI self-triggers this skill when it recognizes a repeatable process error during its own work.
This is not a slash command. There is no event listener, hook, guardian, or background task
that activates it. The AI evaluates its own behavior against the rules below and invokes the skill
when a condition is met.

## Must Trigger

The AI must self-trigger openflow-ai-reflection before claiming completion when:

- It violated a hard OpenFlow instruction or governance rule (e.g., skipped quality-gate,
  modified files outside the approved change boundary, committed without verification).
- It implemented code before the design was clarified and approved.
- It modified tests, docs, AGENTS.md, or other protected artifacts that the task explicitly forbade.
- It lost important context (e.g., forgot a constraint from earlier in the session,
  contradicted a previously established fact, or ignored a documented decision).

For must-trigger cases, do not claim completion until the reflection case is recorded
or explicitly classified as must-not-trigger.

User correction is a signal for AI self-triggering — not a request for the user to run a command.
If the user corrects the AI on a process violation, the AI must treat that as a must-trigger signal.

## Should Trigger

The AI should self-trigger reflection, but this does not block completion, when:

- It noticed a near-miss where it almost violated a rule but caught itself in time.
- It followed a suboptimal process that wasted context or tokens but did not cause harm
  (e.g., re-searching information that was already in context, running redundant verification).
- It chose a delegation strategy that was inefficient or unnecessary.
- Use this for repeatable process lessons with recurrence value, not one-off defects.

## Must Not Trigger

The AI must not record reflection for:

- typos or formatting nits that have no process lesson.
- Ordinary code bugs with no AI process lesson (the bug itself is not a reflection trigger;
  what matters is whether the AI's process for preventing it was flawed).
- External tool failures where the AI made no wrong decision.
- Work still being corrected in the same execution loop (wait until the correction is stable).
- Style preferences or subjective judgment calls where no rule was violated.

## Required Case Content

Every reflection case must capture the following fields before being written:

- **category**: One of the canonical categories listed below.
- **summary**: One-sentence description of what went wrong.
- **trigger**: What event or observation caused the AI to recognize the mistake.
- **context**: What the AI was working on when the mistake occurred.
- **what went wrong**: Specific description of the error or near-miss.
- **root cause**: Why the AI made the mistake (not just what happened).
- **correct behavior**: What the AI should have done instead.
- **recurrence signal**: How to recognize this same pattern in future sessions.
- **evidence**: Links to files, tool output, or conversation excerpts that substantiate the case.
- **classification**: must-trigger or should-trigger, matching the sections above.
- **corrective rule**: A concrete rule the AI should follow to avoid recurrence.
- **scope boundary**: What is in scope and out of scope for this reflection.
- **promotion decision**: Whether this lesson is a candidate for promotion to a global rule,
  and the rationale for that decision.

## Canonical Categories

All reflection cases must be classified into exactly one of these categories:

1. **premature-implementation** — The AI started writing code before the design or requirements
   were sufficiently clarified.
2. **verification-skipped** — The AI skipped or shortcut a mandatory verification step
   (quality-gate, typecheck, test, drift check).
3. **docs-misuse** — The AI used docs incorrectly: edited protected artifacts, read stale docs
   as current, or ignored the docs hierarchy.
4. **delegation-misuse** — The AI delegated work incorrectly: dispatched redundant agents,
   failed to delegate when it should have, or violated the anti-duplication rule.
5. **context-loss** — The AI lost or contradicted important context from earlier in the session,
   from documented decisions, or from established facts.

## Markdown Templates

### index.md Template

Each category directory contains an \`index.md\` listing all cases in that category.
Use the following template:

\`\`\`md
# <Category Title> Reflections

| Date | Summary | Classification | Promotion Candidate |
|------|---------|---------------|-------------------|
| <YYYY-MM-DD> | <summary> | <classification> | Yes/No |

## Active Corrective Rules

- **<rule-name>**: <corrective rule text>
\`\`\`

### Category Document Template

Each individual reflection case is stored as a separate document:

\`\`\`md
# <summary>

- **Date**: <YYYY-MM-DD>
- **Category**: <category>
- **Classification**: <classification>
- **Trigger**: <trigger>
- **Context**: <context>

## What Went Wrong

<what went wrong>

## Root Cause

<root cause>

## Correct Behavior

<correct behavior>

## Recurrence Signal

<recurrence signal>

## Evidence

<evidence>

## Corrective Rule

<corrective rule>

## Scope Boundary

<scope boundary>

## Promotion Decision

<promotion decision>
\`\`\`

## Promotion Boundaries

Reflection lessons may identify patterns worth promoting to global rules, but the MVP
does not perform automatic promotion.

- Record promotion candidates in reflection documents only.
- Do not edit AGENTS.md, skill files, tests, workflow docs, or global rules automatically.
- Promotion is recommendation-only. A human or future automation may promote lessons
  after review.

## MVP Scope

This skill is instruction-only for the MVP. It explicitly does NOT include:

- A slash command for reflection or user-facing command handler. The skill is not a slash command.
- A plugin tool registration or runtime hook.
- An event listener, guardian process, or background task.
- Automatic promotion of reflection lessons into global rules or skill content.

The AI records reflections by writing markdown files using normal file tools.
No special infrastructure is required.
`,
  }
}
