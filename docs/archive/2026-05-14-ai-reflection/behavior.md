# ai-reflection - Behavior

## Behavior Responsibility

This document describes externally observable behavior for AI self-triggered reflection: when the AI should invoke the reflection skill, what it records, what users can expect to see afterward, and what must not happen.

Implementation details and skill registration belong in `design.md`.

## Scope

**In scope:**

- AI self-triggers reflection when it detects a repeatable workflow/process mistake.
- User correction acts as a signal for AI self-triggering, not as a user-operated command requirement.
- Reflection records are organized under `docs/current/workflow/ai-reflection/`.
- Repeated mistakes of the same type accumulate in the same category document.
- Each reflection produces a future-facing lesson: classification, corrective rule, recurrence signal, promotion decision, and scope boundary.

**Out of scope:**

- Asking the user to run a reflection command.
- Providing `/openflow-reflect` as the MVP entry.
- Background monitoring or event listeners.
- Automatic reflection for every failed command.
- Automatic edits to `AGENTS.md`, skills, tests, or workflow docs.
- Per-incident markdown files.
- Replacing issue-resolution, verify, harden, quality-gate, or archive.

## Trigger Model

The MVP trigger is **AI self-assessment**.

The AI should invoke the `openflow-ai-reflection` skill when it recognizes that its own behavior exposed a repeatable process lesson. The user does not need to run a command. There is no event listener; the AI decides based on the current conversation, tool output, and review feedback already visible in context.

Decision rule:

```text
If the AI made, or nearly made, a repeatable workflow/process mistake,
and the lesson would help future AI avoid the same mistake,
then the AI should invoke openflow-ai-reflection and record a case.

If the event is only a code defect, typo, tool failure, or still-active correction,
do not record reflection.
```

## Must Trigger

The AI must self-trigger `openflow-ai-reflection` before claiming completion when any condition below occurs.

1. **User points out an AI workflow/process error**
   - Example user signals: "you skipped verification", "you put this in the wrong docs directory", "you started implementing too early", "you duplicated the delegated search".
   - Expected AI behavior: acknowledge the signal, stabilize any active work if needed, invoke the reflection skill, and record the case before final completion.

2. **AI notices it violated a hard instruction or OpenFlow rule**
   - Examples: claimed completion without evidence, edited before required context checks, relied on unread code, ignored active issue/feature context, skipped quality gate.
   - Expected AI behavior: invoke the reflection skill without waiting for the user to ask.

3. **Review, harden, verify, test, or typecheck reveals an AI decision/process failure**
   - Examples: verify drift caused by ignoring design; harden finding caused by skipping acceptance criteria; test failure caused by implementing a different behavior than agreed.
   - Expected AI behavior: treat the finding as evidence and record a reflection if the failure is process-related, not merely a code defect.

4. **Same category of mistake repeats**
   - If the mistake maps to `premature-implementation`, `verification-skipped`, `docs-misuse`, `delegation-misuse`, or `context-loss`, and it is not trivial noise, the AI records another case in that category.

5. **High-risk near miss**
   - Examples: almost overwrote an existing plan, almost archived without readiness, almost auto-promoted a lesson into `AGENTS.md`, almost made a broad change without impact analysis.
   - Expected AI behavior: record reflection if recurrence would be costly.

## Should Trigger

The AI should self-trigger reflection, but this does not block completion, when:

- the mistake caused noticeable rework but did not violate a hard rule;
- the AI made a wrong assumption future agents are likely to repeat;
- the user had to clarify a process boundary that existing docs already implied;
- a near miss suggests a useful recurrence signal for future AI.

## Must Not Trigger

The AI must not record reflection for:

- typos or formatting nits;
- ordinary code bugs with no AI process lesson;
- external tool failures where AI made no wrong decision;
- user preference changes that were not knowable earlier;
- work still being corrected in the same execution loop;
- issues already fully handled by issue-resolution or archive docs without recurrence value.

## Timing

When a must-trigger condition occurs, the AI should record reflection after the immediate mistake is understood and before claiming completion.

If the workspace is broken, the AI should stabilize or fix the immediate problem first, then invoke reflection before the final success message.

## User-Visible Scenarios

### Scenario: user correction triggers AI reflection

Given:
- The user tells the AI it made a workflow/process mistake.

When:
- The AI recognizes the message as a must-trigger signal.

Then:
- The AI invokes `openflow-ai-reflection` itself.
- The AI records a case in the matching category document.
- The AI does not ask the user to run a reflection command.

### Scenario: AI self-detects a hard-rule violation

Given:
- The AI notices it violated a hard instruction or OpenFlow rule.

When:
- The AI has enough context to describe what went wrong.

Then:
- The AI invokes `openflow-ai-reflection`.
- The AI records root cause, correct behavior, recurrence signal, and scope boundary.
- The AI does not claim completion until reflection is recorded or explicitly skipped as non-trigger.

### Scenario: review finding exposes AI process mistake

Given:
- Review, harden, verify, test, or typecheck output reveals a process failure caused by AI behavior.

When:
- The AI determines the finding has recurrence value.

Then:
- The AI records the finding as evidence in the reflection case.
- The AI does not automatically edit global rules.

### Scenario: reflection docs are missing

Given:
- The AI has triggered reflection.
- `docs/current/workflow/ai-reflection/` or required category files are missing.

When:
- The AI follows the reflection skill.

Then:
- The AI creates the missing reflection docs using the standard templates.
- The AI appends the new case to the selected category document.

### Scenario: repeated mistake category

Given:
- The mistake belongs to an existing category such as `verification-skipped`.

When:
- The AI records reflection.

Then:
- The AI appends the case to `verification-skipped.md`.
- The AI does not create a standalone incident file.
- The index remains the overview of category counts and promotion candidates.

### Scenario: promotion candidate

Given:
- The reflection lesson appears important enough to become a stronger rule.

When:
- The AI records the case.

Then:
- The AI marks `promoteToRule` as `yes` or `needs-review`.
- The AI may list a follow-up action.
- The AI does not edit `AGENTS.md`, skill files, tests, or workflow docs automatically.

## Required Case Content

Each recorded case must include:

- category;
- summary;
- trigger;
- context;
- what went wrong;
- root cause;
- correct behavior next time;
- recurrence signal;
- evidence;
- classification;
- corrective rule;
- scope boundary;
- promotion decision.

Optional useful context:

- severity;
- related files;
- related command;
- follow-up action.

## Expected Result After Reflection

After reflection is recorded, the AI's response should mention:

- the category used;
- the file updated;
- the corrective rule;
- whether the lesson is a promotion candidate;
- that no automatic global-rule change was made.

## Must Not Behaviors

- Must not ask the user to manually trigger the MVP reflection flow.
- Must not provide `/openflow-reflect` as the MVP entry.
- Must not create a background watcher.
- Must not infer reflection from every tool failure.
- Must not write one file per incident.
- Must not accept unsafe category names as file paths.
- Must not silently promote reflection lessons into global rules.
- Must not claim reflection replaces verification or issue-resolution.

## Verification Mapping

| Behavior | Evidence Type | Expected Evidence | Status |
|---|---|---|---|---|
| user correction triggers AI reflection | behavior review | user correction leads to AI-triggered skill, not user command requirement | verified |
| AI self-detects a hard-rule violation | skill content test/review | skill says AI invokes reflection itself when must-trigger conditions occur | verified |
| review finding exposes AI process mistake | review | harden/verify/test findings treated as evidence, no automatic rule edits | verified |
| reflection docs are missing | manual/skill scenario | AI creates standard docs before appending case | verified |
| repeated mistake category | manual/skill scenario | case appended to existing category doc, no per-incident file | verified |
| promotion candidate | review | lesson marked as promotion candidate, no automatic AGENTS.md/skill edits | verified |
