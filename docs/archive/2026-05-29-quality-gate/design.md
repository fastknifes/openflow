# 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。 - Design


## Human Consensus Summary

Feature title: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
Internal slug: openflow-implement-quality-gate
Source intent: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
Problem or improvement target: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
Expected result: Solve: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。; Serve target users: 内部开发者; Honor priority: 风险最小
## Identity And Assumptions

- Feature slug: openflow-implement-quality-gate
- Feature title: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
- Source intent: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
- Assumptions:
  - Not specified.
- Pending confirmations:
  - Not specified.
## Overview

Feature: openflow-implement-quality-gate
Target users: 内部开发者
In scope: openflow-implement-quality-gate workflow; Address the stated problem: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
Out of scope: Large product-surface expansion beyond workflow optimization
## Problem

质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。

## Goals

- Solve: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
- Serve target users: 内部开发者
- Honor priority: 风险最小
## Non-Goals

- Unrelated product areas or workflows
- Broad product expansion outside the workflow itself
## Behavior Alignment

| Behavior Scenario | Design Response | Risk |
|------------------|-----------------|------|
| openflow-implement-quality-gate addresses the stated problem: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。 | Captured as observable product/workflow behavior; implementation structure is deferred until planning. | Medium |
| openflow-implement-quality-gate works for the target users: 内部开发者 | Captured as observable product/workflow behavior; implementation structure is deferred until planning. | Medium |
| openflow-implement-quality-gate implementation reflects the selected priority: 风险最小 | Captured as observable product/workflow behavior; implementation structure is deferred until planning. | Medium |
## Design Constraints

- [may] Optimize workflow steps without introducing unnecessary product surface area
- [must] Code edits must still be verified, but code edits alone must not automatically trigger Full Quality Gate.
- [must] Full Quality Gate must remain mandatory after `/openflow-implement` final implementation work.
- [must] Full Quality Gate must run when the user explicitly requests quality gate, final verification, or equivalent delivery-readiness validation.
- [must] Full Quality Gate must run when the current task is clearly a formal feature or bugfix delivery.
- [must] `/openflow-quality-gate` must remain available outside `/openflow-implement` as an explicit verification capability.
- [must] Making `/openflow-quality-gate` available outside `/openflow-implement` must not make it the default automatic response to all code edits.
- [must] In casual coding conversations, the assistant must not invoke Full Quality Gate merely because it edited code.
- [must] In casual coding conversations, the assistant may autonomously perform lightweight verification appropriate to the change.
- [should] In casual coding conversations, the assistant should ask before invoking Full Quality Gate unless a mandatory trigger applies.
- [must] The workflow must distinguish Full Quality Gate from lightweight verification.
- [must] Lightweight verification may include diff review, targeted tests, typecheck, lint, build, or change-risk summary depending on the target project.
- [must] Full Quality Gate represents final/formal verification and readiness assessment, not the default verification path for every edit.
- [must] Quality gate admission must evaluate the target workspace/project being modified, not assume changes are inside the OpenFlow repository.
- [must] Admission rules must avoid hard-coding OpenFlow repository paths as the basis for target-project risk classification.
- [must] Admission must upgrade to Full Quality Gate when change impact is unclear, formal delivery is intended, or the target project lacks adequate verification for behavior-changing edits.
- [should] Admission should treat security, permission, data, deployment, dependency, public API, shared infrastructure, and cross-module changes as Full Quality Gate candidates.
- [must] Keep a rollback path available for the change
- [must] Keep the change scope narrow to reduce regression surface area
- [must] Protect existing behavior with explicit regression coverage
## Success Criteria

- [ ] openflow-implement-quality-gate addresses the stated problem: 质量门准入策略：完整质量门开放给其他对话使用，但不再作为任何代码修改后的默认自动动作；随心编程默认轻量验证，/openflow-implement、用户显式要求、正式交付或高风险准入时才运行完整质量门。
- [ ] openflow-implement-quality-gate works for the target users: 内部开发者
- [ ] openflow-implement-quality-gate implementation reflects the selected priority: 风险最小
- [ ] Casual coding code edits use basic or lightweight verification by default instead of automatically invoking Full Quality Gate.
- [ ] `/openflow-implement` final verification still requires Full Quality Gate.
- [ ] User-explicit quality gate or final-verification requests can invoke Full Quality Gate outside `/openflow-implement`.
- [ ] Admission decisions are based on the target workspace/project context rather than OpenFlow repository path assumptions.
## Risks And Mitigations

- Risk: The change could accidentally weaken `/openflow-implement` final verification.
  - Mitigation: Treat `/openflow-implement` final verification as a mandatory Full Quality Gate trigger and protect it with regression coverage.
- Risk: Casual coding could still over-trigger Full Quality Gate if prompt wording remains too broad.
  - Mitigation: Explicitly state that code edits require verification, but do not by themselves require Full Quality Gate.
- Risk: Target-project risk could be misclassified by OpenFlow-repository-specific path rules.
  - Mitigation: Define admission around target workspace context, verification capability, formal-delivery intent, and risk categories rather than fixed OpenFlow paths.
- Risk: Opening `/openflow-quality-gate` outside `/openflow-implement` could be confused with making it automatic everywhere.
  - Mitigation: Document it as an explicit public verification capability whose automatic use is still governed by admission rules.
## Architecture Decision: State Machine + Pyramid Layering

### Decision

Refactor `handleQualityGate` from a monolithic "god function" into a **state machine** with four explicit phases. Each phase is a self-contained state with single responsibility.

### Pyramid Structure

```
Top:    Quality Gate = Readiness Assessment Only (not execution, not command)
        └── Must NOT command retry; must NOT auto-loop

Layer 1: Detect  → Risk assessment + applicability classification
Layer 2: Harden  → Adversarial review + code fixes (changes visible to user)
Layer 3: Verify  → Evidence checks + test execution (changes visible to user)
Layer 4: Assess  → Final readiness classification based on Harden+Verify results
```

### State Machine Transitions

```
Detect ──[harden required]──→ Harden ──[complete]──→ Verify ──[complete]──→ Assess
   ↑                                                              │
   └──────────────────[NotReady, retry < 2]───────────────────────┘
   └──────────────────[NotReady, retry >= 2]──→ STOP, escalate to user
```

### Design Patterns Applied

1. **State Pattern**: Each phase (Detect/Harden/Verify/Assess) is an independent state class.
2. **Template Method**: Each state follows `enter → execute → exit` skeleton; shared logic (code-change capture) lives in base class.
3. **Observer Pattern**: State transitions notify `ImplementationRunStore`, `AcceptanceState`, `Logger`.
4. **Chain of Responsibility**: Admission strategy evaluation uses strategy chain (`Formal → Explicit → HighRisk → Casual`).

### Dead Loop Fix

- Remove unconditional "re-invoke the gate" from skill instruction.
- Remove `nextCommand: openflow-quality-gate` from NotReady/NeedsDecision output.
- Add max-retry guard (2 rounds); third NotReady forces escalation to user.

### Code Change Visibility

- Harden state captures `git diff --stat` before and after execution.
- Verify state captures file changes during verification.
- Quality Gate report includes aggregated "Code Changes" section.
- Changes are persisted to `acceptance-state` via observer.

## Testing Strategy

Use targeted tests and review to verify: 风险最小

- Regression test that `/openflow-implement` still requires Full Quality Gate at final verification.
- Regression test that an explicit user request for quality gate/final verification can run Full Quality Gate outside `/openflow-implement`.
- Regression test or prompt-behavior fixture that casual coding with a low-risk edit selects lightweight verification and does not automatically invoke Full Quality Gate.
- Regression test or scenario review that high-risk or unclear target-project changes upgrade to Full Quality Gate or ask before invoking it when no mandatory trigger applies.
- Review that admission wording avoids OpenFlow-repository-specific path assumptions for target-project risk classification.
- **New**: Test that quality gate output does NOT contain `nextCommand: openflow-quality-gate` when NotReady.
- **New**: Test that quality gate report contains "Code Changes" section when harden/verify modify files.
- **New**: Test that retry counter stops at 2 and escalates to user on third NotReady.

<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:BEGIN -->
## Cross-Validation Summary

- Status: Passed
- Documents checked in order:

- Non-blocking gaps: 0
<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:END -->
