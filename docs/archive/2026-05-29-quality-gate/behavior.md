# 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。 - Observable Behavior


## Human Consensus Summary

Feature title: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
Internal slug: openflow-implement-quality-gate
Source intent: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
Problem statement: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。

## User Context

**Target users:** 内部开发者

**Problem statement:** 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
## Trigger Rules

These conditions activate or require the feature behavior:

- Goal-driven: Solve: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
- Goal-driven: Serve target users: 内部开发者
- Goal-driven: Honor priority: 风险最小
- In-scope match: openflow-implement-quality-gate workflow
- In-scope match: Address the stated problem: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
- Must constraint: Keep a rollback path available for the change
- Must constraint: Keep the change scope narrow to reduce regression surface area
- Must constraint: Protect existing behavior with explicit regression coverage
## Non-Trigger Rules

These conditions do NOT activate the feature:

- Out of scope: Large product-surface expansion beyond workflow optimization
- Not a goal: Unrelated product areas or workflows
- Not a goal: Broad product expansion outside the workflow itself
- May constraint (non-trigger): Optimize workflow steps without introducing unnecessary product surface area
## User-Visible Scenarios

Each scenario describes what a user or external caller observes — not how the system produces it internally.

### Scenario: Casual coding low-risk edit uses lightweight verification

**Given:**
- The user is in a normal chat or casual coding conversation.
- The assistant edits code in the target workspace/project.
- No mandatory Full Quality Gate trigger applies.

**When:**
- The assistant finishes the edit and selects verification.

**Then (observable outcome):**
- The assistant verifies the change with basic or lightweight verification appropriate to the target project.
- The assistant does not invoke Full Quality Gate merely because code was edited.
- The assistant may mention that Full Quality Gate was not run because the conversation is not in formal delivery mode.

### Scenario: OpenFlow implement final verification requires Full Quality Gate

**Given:**
- The active workflow is `/openflow-implement`.
- Implementation work has reached final verification.

**When:**
- The workflow performs final readiness verification.

**Then (observable outcome):**
- Full Quality Gate is required.
- The workflow must not downgrade final `/openflow-implement` verification to lightweight verification.

### Scenario: Explicit quality gate request outside implement runs Full Quality Gate

**Given:**
- The user is not necessarily in `/openflow-implement`.
- The user explicitly asks to run quality gate, final verification, or equivalent delivery-readiness validation.

**When:**
- The assistant handles the explicit verification request.

**Then (observable outcome):**
- Full Quality Gate can run outside `/openflow-implement`.
- The assistant treats `/openflow-quality-gate` as an explicit public verification capability, not an implement-only private step.

### Scenario: Public quality gate capability is not default automatic behavior

**Given:**
- `/openflow-quality-gate` is available outside `/openflow-implement`.
- The assistant has edited code during a normal chat.
- The user has not explicitly asked for quality gate or final verification.
- No mandatory Full Quality Gate trigger applies.

**When:**
- The assistant chooses post-edit verification.

**Then (observable outcome):**
- Availability of `/openflow-quality-gate` does not cause automatic Full Quality Gate invocation.
- The assistant uses basic or lightweight verification unless admission upgrades the change.

### Scenario: High-risk or unclear target-project change upgrades verification

**Given:**
- The assistant changed behavior in the target workspace/project.
- The change impact is unclear, formal delivery is intended, or the target project lacks adequate verification for the behavior-changing edit.

**When:**
- The assistant selects the verification level.

**Then (observable outcome):**
- The workflow upgrades to Full Quality Gate when a mandatory trigger applies.
- If no mandatory trigger applies, the assistant asks before invoking Full Quality Gate or clearly recommends it as the next step.

### Scenario: Admission is based on the target workspace, not OpenFlow repository paths

**Given:**
- OpenFlow is being used as a tool for another project.
- The assistant needs to classify verification risk after target-project edits.

**When:**
- The assistant evaluates quality gate admission.

**Then (observable outcome):**
- The assistant evaluates the target workspace/project context, verification capability, delivery intent, and risk category.
- The assistant does not rely on hard-coded OpenFlow repository paths to classify target-project risk.

### Scenario: Full Quality Gate and lightweight verification remain distinguishable

**Given:**
- A code edit needs post-change verification.

**When:**
- The assistant reports or selects the verification path.

**Then (observable outcome):**
- Lightweight verification is described as targeted checks such as diff review, relevant tests, typecheck, lint, build, or risk summary.
- Full Quality Gate is described as final/formal verification and readiness assessment.
- The assistant does not use the two terms interchangeably.

### Scenario: Quality gate does not loop indefinitely on NotReady

**Given:**
- The quality gate returns NotReady or NeedsDecision.

**When:**
- The assistant reviews the quality gate output.

**Then (observable outcome):**
- The quality gate output does NOT contain an automatic command to re-invoke itself (e.g. `nextCommand: openflow-quality-gate`).
- The output provides specific blocker descriptions and fix suggestions.
- The skill instruction tells the assistant to fix blockers and only re-verify when resolved, with a 2-round limit before escalating to the user.

### Scenario: Code changes during harden and verify are visible to user

**Given:**
- Harden or verify modifies code during quality gate execution.

**When:**
- The quality gate generates its report.

**Then (observable outcome):**
- The harden output includes a "Code Changes" section listing files modified by the harden executor.
- The verify output includes a "Code Changes Detected During Verify" section listing files modified during verification.
- The quality gate summary includes a pointer to these change sections when changes exist.
- The user can review what changed before archive readiness is assessed.

### Scenario: openflow-implement-quality-gate addresses the stated problem: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。

**Given:**
- The target user is: 内部开发者
- The problem context is: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- openflow-implement-quality-gate addresses the stated problem: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
- The outcome is visible to the user or caller without inspecting implementation internals

### Scenario: openflow-implement-quality-gate works for the target users: 内部开发者

**Given:**
- The target user is: 内部开发者
- The problem context is: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- openflow-implement-quality-gate works for the target users: 内部开发者
- The outcome is visible to the user or caller without inspecting implementation internals

### Scenario: openflow-implement-quality-gate implementation reflects the selected priority: 风险最小

**Given:**
- The target user is: 内部开发者
- The problem context is: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- openflow-implement-quality-gate implementation reflects the selected priority: 风险最小
- The outcome is visible to the user or caller without inspecting implementation internals
## Required Content

The following content or outcomes must be present in any successful response:

- Must include: openflow-implement-quality-gate workflow
- Must include: Address the stated problem: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
- Must include: Code edits require verification, but code edits alone do not require Full Quality Gate.
- Must include: `/openflow-implement` final verification remains a mandatory Full Quality Gate trigger.
- Must include: Explicit user requests can invoke Full Quality Gate outside `/openflow-implement`.
- Must include: Casual coding defaults to basic or lightweight verification unless admission requires escalation.
- Must include: Admission evaluates the target workspace/project rather than assuming edits are inside the OpenFlow repository.
- Must include: Full Quality Gate and lightweight verification are distinct verification levels.
- Required outcome: Solve: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
- Required outcome: Serve target users: 内部开发者
- Required outcome: Honor priority: 风险最小
- Must satisfy constraint: Keep a rollback path available for the change (verify by: Confirm the rollout can be disabled or reverted without manual data repair)
- Must satisfy constraint: Keep the change scope narrow to reduce regression surface area (verify by: Review the touched files and modules for unnecessary breadth)
- Must satisfy constraint: Protect existing behavior with explicit regression coverage (verify by: Run targeted regression tests around existing behavior)
## Success Responses

**Success:** openflow-implement-quality-gate addresses the stated problem: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。

**Success:** openflow-implement-quality-gate works for the target users: 内部开发者

**Success:** openflow-implement-quality-gate implementation reflects the selected priority: 风险最小

**Success:** Solve: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。

**Success:** Serve target users: 内部开发者

**Success:** Honor priority: 风险最小
## Must Not Behavior

The following outcomes must not occur as user-visible behavior:

- Must not: Invoke Full Quality Gate merely because any code edit occurred.
- Must not: Downgrade `/openflow-implement` final verification from Full Quality Gate to lightweight verification.
- Must not: Make `/openflow-quality-gate` implement-only or unavailable to explicit requests from other conversations.
- Must not: Treat availability of `/openflow-quality-gate` outside `/openflow-implement` as permission to run it automatically after every edit.
- Must not: Use OpenFlow repository path assumptions as the basis for target-project risk classification.
- Must not: Conflate lightweight verification with Full Quality Gate.
- Must not: Unrelated product areas or workflows
- Must not: Broad product expansion outside the workflow itself
- Excluded: Large product-surface expansion beyond workflow optimization
## Acceptance / Verification Mapping

Each acceptance criterion maps to an observable scenario and verification approach:

| Acceptance Criterion | Scenario | Evidence Type | Expected Evidence | Status |
|---------------------|----------|--------------|-------------------|--------|
| openflow-implement-quality-gate addresses the stated problem: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。 | openflow-implement-quality-gate addresses the stated problem: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。 | Use targeted tests and review to verify: 风险最小 | User-observable confirmation that "openflow-implement-quality-gate addresses the stated problem: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。" occurs | pending |
| openflow-implement-quality-gate works for the target users: 内部开发者 | openflow-implement-quality-gate works for the target users: 内部开发者 | Use targeted tests and review to verify: 风险最小 | User-observable confirmation that "openflow-implement-quality-gate works for the target users: 内部开发者" occurs | pending |
| openflow-implement-quality-gate implementation reflects the selected priority: 风险最小 | openflow-implement-quality-gate implementation reflects the selected priority: 风险最小 | Use targeted tests and review to verify: 风险最小 | User-observable confirmation that "openflow-implement-quality-gate implementation reflects the selected priority: 风险最小" occurs | pending |
| Casual coding low-risk edit uses lightweight verification | Casual coding low-risk edit uses lightweight verification | Prompt-behavior fixture or scenario review | Assistant performs basic/lightweight verification and does not invoke Full Quality Gate only because code was edited | pending |
| `/openflow-implement` final verification requires Full Quality Gate | OpenFlow implement final verification requires Full Quality Gate | Regression test | Final implement verification cannot be completed by lightweight verification alone | pending |
| Explicit quality gate request outside implement runs Full Quality Gate | Explicit quality gate request outside implement runs Full Quality Gate | Regression test or command-flow review | User-explicit quality gate/final verification request can run Full Quality Gate outside `/openflow-implement` | pending |
| Public quality gate capability is not default automatic behavior | Public quality gate capability is not default automatic behavior | Prompt-behavior fixture or scenario review | Availability outside implement does not cause automatic Full Quality Gate after every edit | pending |
| High-risk or unclear target-project change upgrades verification | High-risk or unclear target-project change upgrades verification | Scenario review | Mandatory triggers run Full Quality Gate; non-mandatory high-risk cases ask or recommend before running | pending |
| Admission is based on the target workspace, not OpenFlow repository paths | Admission is based on the target workspace, not OpenFlow repository paths | Design review | Admission wording and implementation plan avoid hard-coded OpenFlow path assumptions for target-project risk classification | pending |
| Full Quality Gate and lightweight verification remain distinguishable | Full Quality Gate and lightweight verification remain distinguishable | Documentation/prompt review | The two levels have separate definitions and are not used interchangeably | pending |
| Quality gate does not loop indefinitely on NotReady | Quality gate does not loop indefinitely on NotReady | Regression test or prompt review | Quality gate output does not contain automatic re-invoke command; skill instruction has retry limit | pending |
| Code changes during harden and verify are visible to user | Code changes during harden and verify are visible to user | Regression test | Harden/verify output contains Code Changes section; quality gate summary references it | pending |

<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:BEGIN -->
## Cross-Validation Summary

- Status: Passed
- Documents checked in order:

- Non-blocking gaps: 0
<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:END -->
