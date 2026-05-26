# Delegation Misuse Reflections

This index is the reusable layer for delegation-misuse lessons. Keep general rules here; keep detailed failure evidence in the case files below. A new reflection should update this index only when it changes a reusable rule, trigger pattern, or boundary condition.

## Reusable Rules

| Rule | Applies When | Correct Behavior | Backing Cases |
|------|--------------|------------------|---------------|
| **Do not poll running Oracle tasks** | Oracle or delegated background work is still running and the result is not required for safe non-overlapping work | Stop work that depends on the result and wait for the system completion notification before calling `background_output` | [Polled running Oracle review task](./2026-05-25-polled-running-oracle-review-task.md) |

## Trigger Patterns

- A background Oracle task returns `Status: running`.
- The assistant is tempted to “quickly check” Oracle output before the completion notification.
- Final delivery depends on Oracle review, but unrelated validation is already complete.

## Boundary Rules

- This rule covers polling or re-checking running delegated background tasks, especially Oracle.
- This rule does not prohibit collecting output after a system completion notification.
- This rule does not prohibit doing non-overlapping local validation while Oracle is running.

## Case Samples

| Date | Case | Reusable Lesson | Classification | Promotion Candidate |
|------|------|-----------------|---------------|-------------------|
| 2026-05-25 | [Polled running Oracle review task](./2026-05-25-polled-running-oracle-review-task.md) | Wait for completion notification before collecting Oracle output | should-trigger | No |
