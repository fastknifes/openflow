# Brainstorm conversation entered implementation mode

- **Date**: 2026-05-25
- **Category**: premature-implementation
- **Classification**: must-trigger
- **Trigger**: User corrected the AI: “不是正在执行头脑风暴吗？为什么改代码了？”
- **Context**: The user invoked `/openflow-brainstorm` to discuss optimizing `openflow-feature`.

## What Went Wrong

The AI treated a brainstorm discussion as an implementation request and modified code, tests, and workflow documentation before the user explicitly transitioned from brainstorming to implementation.

## Root Cause

The AI over-prioritized global execution and verification instructions over the active brainstorm skill boundary, which explicitly says brainstorming is conversational and must not generate documents, manage workflow state, or perform implementation.

## Correct Behavior

During `/openflow-brainstorm`, stay in synthesis, trade-off framing, and one-question-at-a-time clarification. If implementation seems useful, summarize the emerging design and ask the user to move to `/openflow-feature` or an explicit implementation command instead of editing code.

## Recurrence Signal

If the active command is `/openflow-brainstorm` and the next action would write files, run tests, or change source code, stop and return to conversation unless the user explicitly requests implementation.

## Evidence

- User request: “本次对话的目的是去优化命令\"openflow-feature\"。” under `/openflow-brainstorm`.
- User correction: “不是正在执行头脑风暴吗？为什么改代码了？既然改了就改了。回到头脑风暴。”

## Corrective Rule

When the active skill is `/openflow-brainstorm`, do not edit files or run implementation workflows. Produce conversational analysis only, and transition to implementation only after an explicit user request.

## Scope Boundary

In scope: brainstorm sessions where the AI prematurely edits code or workflow artifacts. Out of scope: explicit implementation requests or `/openflow-implement` runs.

## Promotion Decision

Promotion candidate: Yes. This is a reusable workflow-boundary rule for all brainstorm sessions.
