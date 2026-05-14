# ai-reflection - Behavior

## Behavior Responsibility

This document describes externally observable behavior: when AI reflection should happen, what users provide, what the command returns, and what must not happen.

Implementation details such as file helper names, TypeScript interfaces, and write algorithms belong in `design.md`.

## Scope

**In scope:**

- Internal developers and AI agents can explicitly record meaningful AI process mistakes.
- Reflection output is organized by failure category under `docs/current/workflow/ai-reflection/`.
- Repeated mistakes of the same type accumulate in the same category document.
- Each reflection produces a future-facing lesson: category, corrective rule, recurrence signal, and promotion decision.

**Out of scope:**

- Background monitoring.
- Automatic reflection for every failed command.
- Automatic edits to `AGENTS.md`, skills, tests, or workflow docs.
- Per-incident markdown files.
- Replacing issue-resolution, verify, harden, quality-gate, or archive.

## Trigger Rules

### Should trigger reflection

Reflection should be recorded when at least one is true:

- **User correction**: the user points out an AI process mistake or unsafe assumption.
- **AI self-detection**: the AI realizes it violated instructions or OpenFlow workflow rules.
- **Review/verification finding**: tests, typecheck, verify, harden, quality gate, or review reveals an AI decision/process failure.
- **Repeated pattern**: the current mistake matches an existing category and adds useful evidence.
- **High-risk near miss**: no damage occurred, but the same decision pattern is likely to recur.

### Should not trigger reflection

Reflection should not be recorded for:

- typos or formatting nits;
- ordinary code bugs with no AI process lesson;
- external tool failures where AI made no wrong decision;
- user preference changes that were not knowable earlier;
- work still being corrected in the same execution loop;
- issues already fully handled by issue-resolution or archive docs without recurrence value.

## User-Visible Scenarios

### Scenario: initialize reflection docs

Given:
- The workspace has no `docs/current/workflow/ai-reflection/` directory.

When:
- The user or AI invokes `/openflow-reflect` without case details.

Then:
- The command reports that reflection docs are ready.
- The command shows the target directory.
- The command lists the canonical categories.
- No unrelated docs or workflow files are changed.

### Scenario: record user-corrected mistake

Given:
- The user says the AI made a process mistake.
- The caller provides a complete reflection case.

When:
- `/openflow-reflect` is invoked with a canonical category.

Then:
- The command records the case under the selected category.
- The command reports the category file that was updated.
- The command summarizes the corrective rule and recurrence signal.
- Existing cases remain available.

### Scenario: record AI self-detected mistake

Given:
- The AI notices it skipped a required workflow step, made an unsupported assumption, duplicated delegated work, or relied on unread code.

When:
- The AI invokes `/openflow-reflect` with complete details.

Then:
- The mistake is captured as a reflection case.
- The case explains what future AI should do differently.
- The reflection does not claim the original task is fixed; normal verification still applies.

### Scenario: record review or verification finding

Given:
- A review, harden, verify, test, build, or typecheck result exposes a recurring AI behavior problem.

When:
- The finding is submitted as reflection evidence.

Then:
- The reflection stores the evidence reference.
- The output records whether the lesson should be reviewed for promotion.
- The system does not automatically change global rules.

### Scenario: repeated mistake category

Given:
- A new incident belongs to an existing category such as `verification-skipped`.

When:
- The case is recorded.

Then:
- The existing category document receives the new case.
- No new incident-specific markdown file is created.
- The index remains the overview for categories and case counts.

### Scenario: invalid category

Given:
- The caller supplies a category outside the canonical set.

When:
- `/openflow-reflect` is invoked.

Then:
- The command rejects the request.
- The response lists allowed categories.
- No reflection files are changed.

### Scenario: incomplete reflection case

Given:
- The caller supplies some case details but omits required content.

When:
- `/openflow-reflect` is invoked.

Then:
- The command rejects the request.
- The response names the missing fields.
- No incomplete case is written.

### Scenario: promotion candidate

Given:
- A case is marked `promoteToRule: yes` or `needs-review`.

When:
- The case is recorded.

Then:
- The reflection output identifies it as a review candidate.
- The command does not edit `AGENTS.md`, skill files, tests, or workflow docs automatically.

## Required Case Content

Users or agents must provide these fields when recording a case:

- category
- summary
- trigger
- context
- what went wrong
- root cause
- correct behavior next time
- recurrence signal
- evidence
- promotion decision
- classification
- corrective rule
- scope boundary

Optional useful context:

- severity
- related files
- related command
- follow-up action

## Required Result

After a successful case write, the user-visible response must include:

- updated category;
- updated file path;
- classification;
- corrective rule;
- recurrence signal;
- promotion decision;
- reminder that promotion is not automatic.

## Must Not Behaviors

- Must not create a new top-level docs directory.
- Must not start a background watcher.
- Must not infer reflection from every tool failure.
- Must not write one file per incident.
- Must not accept unsafe category names as file paths.
- Must not silently promote reflection lessons into global rules.
- Must not claim reflection replaces verification or issue-resolution.

## Verification Mapping

| Behavior | Evidence | Expected Result |
|---|---|---|
| Initialize docs | command/unit test | Ready message, target directory, canonical category list |
| Record complete case | command/unit test | one case added to selected category and response summarizes conclusion |
| Reject invalid category | command/unit test | allowed categories shown, no files changed |
| Reject incomplete case | command/unit test | missing fields shown, no files changed |
| Preserve existing workflows | regression test | existing OpenFlow tool registration and command tests still pass |
| Avoid auto-promotion | unit/review | `AGENTS.md` and skill files unchanged after case recording |
