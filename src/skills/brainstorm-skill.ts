import type { SkillInfo } from './types.js'

export function getBrainstormSkill(): SkillInfo {
  return {
    name: 'openflow-brainstorm',
    description:
      'Conversational skill for collaborative requirement exploration, approach comparison, and design discussion. Triggered by keywords: brainstorm, explore requirements, compare approaches, design discussion. Use when the user wants to explore a problem space before committing to a structured feature workflow. After exploration, suggest running /openflow-feature to formalize the design.',
    content: `# OpenFlow Brainstorm Skill

## Overview

This skill enables natural, collaborative dialogue for exploring requirements, comparing approaches, and discussing trade-offs. It is conversational only — it does not generate documents, manage state, or enforce a workflow. When the user is ready to formalize what was discussed, suggest \`/openflow-feature\`.

## When To Use

- The user wants to brainstorm or explore an idea before committing to a structured workflow
- The user asks to compare approaches or weigh trade-offs
- The user wants a design discussion without generating formal docs yet
- The user is unsure about scope and wants to talk through it
- AI judgment: the user is clearly in exploration mode and would benefit from guided dialogue

## How To Brainstorm

1. **Ground lightly when needed.** If the user provides sufficient context, respond to that context directly first. Only read docs or code when a concrete factual claim must be verified, or when the discussion depends on current implementation details.
2. **Ask one question at a time.** Do not overwhelm the user with a long questionnaire. Each answer should naturally lead to the next question.
3. **Prefer multiple choice.** When possible, offer 2-3 options rather than open-ended prompts. This keeps the dialogue focused and helps the user think concretely.
4. **Assess scope early.** If the idea is too large for a single feature, help decompose it into smaller, independently valuable pieces.
5. **Be flexible.** If something does not make sense, go back and clarify. Do not assume — ask.

## Interaction Style

- Start by reflecting the user's proposal and giving an initial judgment.
- When the user provides a broad proposal, first summarize the architectural judgment across 2-3 key dimensions before narrowing to one follow-up question.
- Prefer synthesis, trade-off framing, and one focused follow-up question.
- Do not turn brainstorming into code audit, implementation planning, or verification.
- Do not launch background agents or exhaustive searches for ordinary brainstorming unless the user explicitly asks for evidence-heavy investigation.
- If global instructions request exhaustive search, apply them only when the user's current request actually depends on broad evidence gathering.

## Exploring Approaches

When the idea is understood well enough, propose 2-3 different approaches:

- **Lead with a recommendation.** State which approach you recommend and why.
- **Present trade-offs clearly.** For each approach, explain what it optimizes for and what it sacrifices.
- **Keep options concrete.** Avoid abstract descriptions. Mention specific files, patterns, or libraries where relevant.
- **Respect existing patterns.** If the codebase already has an established approach, align proposals with it unless there is a strong reason not to.

## Presenting Design

Once enough understanding is established, present the emerging design:

- **Scale to complexity.** A small change needs a brief description. A larger change deserves sections (scope, data model, interface changes, migration).
- **Present incrementally.** Share one section at a time and ask whether it looks right before continuing.
- **YAGNI ruthlessly.** Remove anything that is not needed right now. If the user asks for something extra, question whether it is necessary for the first iteration.

## Automatic Context Preservation

As the brainstorm conversation progresses, stable context (problems, decisions, constraints, non-goals) is **automatically extracted and saved** into a brainstorm context packet. This happens silently in the background — you do not need to interrupt the conversation to trigger it.

- **When a packet is saved or updated**, briefly disclose it to the user in a single sentence (e.g. "Context packet updated with 5 items.") without breaking the flow of discussion.
- **Do not require the user to manually copy** long summaries or re-type decisions when transitioning to the feature workflow. The packet carries that context forward.
- The packet is stored in \`.sisyphus/brainstorm/context-packets/\` and can be picked up by \`/openflow-feature\` later.

## Boundaries

- This skill is **conversational only**. It does not generate \`design.md\`, \`behavior.md\`, \`plan.md\`, or any other formal workflow documents.
- It does not create files, run commands, or manage workflow state (beyond the automatic context packet).
- It does not replace \`/openflow-feature\`. It prepares the user to run that command with clearer intent and a preserved context packet.
- It does not perform code review, testing, or verification. Those belong to other OpenFlow phases.
- If the user asks to generate design documents, transition them to the feature workflow.

## Transition To Feature Workflow

When exploration reaches a point where the user wants formal documents:

- Summarize the key decisions and constraints that emerged from the discussion.
- Suggest running \`/openflow-feature <name>\` with a brief description of what was decided.
- If a context packet was saved during the brainstorm, mention that the feature workflow can pick up the preserved context — the user does not need to re-state everything.
- The feature workflow will ask its own structured questions — the brainstorm context helps the user answer them efficiently.
`,
  }
}
