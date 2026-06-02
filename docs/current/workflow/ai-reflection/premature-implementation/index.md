# Premature Implementation Reflections

This index is the reusable layer for premature-implementation lessons. Keep general rules here; keep detailed failure evidence in the case files below.

## Reusable Rules

| Rule | Applies When | Correct Behavior | Backing Cases |
|------|--------------|------------------|---------------|
| **brainstorm-is-conversational** | Active skill is `/openflow-brainstorm` and the AI is about to edit files, run implementation, or generate workflow artifacts | Stop implementation, continue conversational synthesis, and only transition after explicit user request | [Brainstorm conversation entered implementation mode](./2026-05-25-brainstorm-entered-implementation.md) |
| **proposal-first** | User asks for 方案, approach, proposal, plan, optimization idea, or "how should we handle X" | Respond with a written proposal describing what/why/risks; do NOT edit files until user explicitly approves | [Gave solution by editing code instead of presenting proposal](./2026-05-31-solution-before-confirmation.md) |

## Trigger Patterns

- User invokes `/openflow-brainstorm`, "brainstorm", "讨论", or "探索方案", but the AI starts applying patches or running implementation verification.
- User asks "方案是什么", "怎么优化", "approach", "proposal", "how should we" — these are discussion triggers, not implementation triggers.

## Boundary Rules

- These rules cover brainstorm workflow-boundary violations and proposal-first violations.
- They do not block explicit implementation requests after the user exits brainstorming.
- They do not require a proposal for trivial fixes the user directly asks to make (e.g., "fix this typo").

## Case Samples

| Date | Case | Reusable Lesson | Classification | Promotion Candidate |
|------|------|-----------------|---------------|-------------------|
| 2026-05-25 | [Brainstorm conversation entered implementation mode](./2026-05-25-brainstorm-entered-implementation.md) | Brainstorm must remain conversational until explicit transition | must-trigger | Yes |
| 2026-05-31 | [Gave solution by editing code instead of presenting proposal](./2026-05-31-solution-before-confirmation.md) | Proposal questions require written answers, not code edits | must-trigger | Yes |
