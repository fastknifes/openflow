# Polled running Oracle review task

- **Date**: 2026-05-25
- **Category**: delegation-misuse
- **Classification**: should-trigger
- **Trigger**: `background_output` returned `Status: running` for an Oracle review task.
- **Context**: The assistant was revising OpenFlow workflow documentation and had launched Oracle for a final read-only review.

## What Went Wrong

The assistant called `background_output` while the Oracle task was still running instead of waiting for the system completion notification.

## Root Cause

The assistant treated Oracle like a normal short background check and optimized for immediacy, forgetting that Oracle-dependent final delivery must wait for completion notification and collected output.

## Correct Behavior

After launching Oracle, continue only with non-overlapping local validation. When those checks are done, stop and wait for the system completion notification. Collect Oracle output only after the notification arrives.

## Recurrence Signal

The same pattern is present when a background Oracle task has not completed and the assistant wants to “just check” its status or output before final delivery.

## Evidence

- Background task: `bg_aa730e7c` (`审查详细文档`).
- Tool output showed `Status: running` after the assistant called `background_output`.

## Corrective Rule

Do not call `background_output` for a running Oracle task. If final delivery depends on Oracle, finish non-overlapping work, then wait for the system completion notification before collecting the result.

## Scope Boundary

In scope: Oracle or delegated background-task polling before completion. Out of scope: collecting output after the system reports completion, or running local validation while the Oracle task is still pending.

## Promotion Decision

No. The global instruction already exists; this case records a concrete recurrence signal rather than requiring a new global rule.
