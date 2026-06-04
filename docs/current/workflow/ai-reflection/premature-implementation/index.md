# Premature Implementation Reflections

This index is the reusable layer for premature-implementation lessons. Keep general rules here; keep detailed failure evidence in the case files below.

## Reusable Rules

| Rule | Applies When | Correct Behavior | Backing Cases |
|------|--------------|------------------|---------------|
| **brainstorm-is-conversational** | Active skill is `/openflow-brainstorm` and the AI is about to edit files, run implementation, or generate workflow artifacts | Stop implementation, continue conversational synthesis, and only transition after explicit user request | [Brainstorm conversation entered implementation mode](./2026-05-25-brainstorm-entered-implementation.md) |

## Trigger Patterns

- User invokes `/openflow-brainstorm`, “brainstorm”, “讨论”, or “探索方案”, but the AI starts applying patches or running implementation verification.

## Boundary Rules

- This rule covers brainstorm workflow-boundary violations.
- It does not block explicit implementation requests after the user exits brainstorming.

## Case Samples

| Date | Case | Reusable Lesson | Classification | Promotion Candidate |
|------|------|-----------------|---------------|-------------------|
| 2026-05-25 | [Brainstorm conversation entered implementation mode](./2026-05-25-brainstorm-entered-implementation.md) | Brainstorm must remain conversational until explicit transition | must-trigger | Yes |
