# work-node-autonomous-quality - Design

**Date**: 2026-05-13  
**Feature**: work-node-autonomous-quality  
**Status**: Design

---

## 1. Problem

OpenFlow currently treats `harden` and `verify` as user-facing manual commands. This creates several problems:

1. **Manual harden/verify is easy to miss**  
   After native OpenCode or OMO code execution, the agent may say the work is done without running the OpenFlow quality gate.

2. **Hook-based OMO detection cannot reliably control `/start-work`**  
   OpenFlow can observe `/start-work`, but cannot control OMO's execution timing. `appendGuardMessage` prompts and `execution-policy.json` are advisory, not a reliable pipeline.

3. **The fast/balanced/strict interaction adds friction**  
   Asking the user whether to harden interrupts implementation flow. For issue fixes, existing future behavior already says hardening should be automatic and risk-based.

4. **Verify should be an evidence gate, not a repeated command ritual**  
   Agents often run tests/typecheck/lint during implementation. OpenFlow should validate whether that evidence is fresh and sufficient, and only rerun missing or stale checks.

---

## 2. Decision

Create an AI-callable Skill named **`openflow-quality-gate`**.

The skill is the standard post-implementation quality node. It is invoked by AI after code changes or bug fixes, regardless of whether execution happened through native OpenCode, OMO `/start-work`, or `/openflow-issue` fix flow.

```text
code implementation or bug fix complete
  → AI invokes openflow-quality-gate skill
    → assess risk and available context
    → run harden only when needed
    → run evidence-aware verify
    → output readiness and evidence summary
```

### 2.1 Command lifecycle decision

The manual commands are removed from the user-facing workflow:

- `/openflow-harden` is no longer a manually recommended user command.
- `/openflow-verify` is no longer a manually recommended user command.
- Existing harden and verify implementation logic may remain as internal building blocks, but should be called by `openflow-quality-gate` rather than exposed as the normal user path.

### 2.2 Skill lifecycle decision

`openflow-quality-gate` is intentionally registered as a Skill, not only as a Command.

This is an explicit exception to the general rule that governance commands should not auto-trigger. The quality gate is designed for AI invocation after implementation, so it must appear in the agent's available skills.

---

## 3. Goals

1. **Unify harden + verify into one AI-callable quality node**
2. **Support both native OpenCode and OMO execution** without relying on controlling `/start-work`
3. **Let AI decide whether harden is needed** based on change risk and available context
4. **Always perform evidence-aware verify** before claiming readiness
5. **Avoid blocking lightweight issue fixes on missing design documents**
6. **Update `/openflow-writing-plan` guidance** so generated plans instruct agents to call `openflow-quality-gate` after implementation

---

## 4. Non-Goals

1. Do not require the user to choose fast/balanced/strict quality mode.
2. Do not require `design.md` or `issue-clarification.md` for every small fix.
3. Do not blindly rerun every check if fresh evidence already exists.
4. Do not make archive automatic; archive remains the authority boundary after readiness.
5. Do not remove the underlying harden/verify code in the first implementation if it is still useful internally.

---

## 5. Quality Gate Behavior

### 5.1 Context detection

The skill first builds a context bundle from the best available source:

| Context source | Use case | Alignment behavior |
|---|---|---|
| `docs/changes/<feature>/design.md` + `behavior.md` | Feature work | Check design/behavior alignment |
| `issue-clarification.md` | Issue investigation/fix | Check issue context alignment |
| `.sisyphus/plans/<feature>.md` | Implementation guidance | Use as supporting context, not the sole truth source |
| User request + git diff only | Lightweight ad-hoc fix | Limited context alignment |
| No semantic context | Emergency/local change | Technical verification only, with limited-confidence warning |

Missing `issue-clarification.md` does **not** skip verify. It only downgrades the semantic alignment portion of verify.

### 5.2 Risk assessment and harden decision

The skill decides whether to run harden.

| Change risk | Harden behavior |
|---|---|
| Trivial documentation/formatting/small localized fix | Skip harden |
| Simple single-module code fix | Usually skip harden |
| Multi-file logic change, state change, command lifecycle change, public API change | Run harden |
| Security, auth, permission, payment, archive, verify, harden, config, hooks | Run harden |
| Production or data-loss risk | Run harden |

The user is not asked whether to harden. The skill reports the decision and rationale.

### 5.3 Evidence-aware verify

Verify becomes an evidence gate:

```text
collect existing evidence
  → check freshness after last code change
  → check coverage against changed files/symbols
  → reuse fresh sufficient evidence
  → rerun only missing, stale, or insufficient checks
  → output readiness
```

Fresh evidence may include typecheck, test, lint, security scan, or other verification outputs already produced by the implementing agent. If evidence is stale, missing, or not scoped to the changed area, the quality gate reruns the necessary checks.

---

## 6. Readiness Semantics

The quality gate outputs readiness with evidence and confidence.

| Status | Meaning |
|---|---|
| `Ready` | Evidence is fresh and sufficient; context alignment passed or is not required |
| `ReadyWithLimitedContext` | Technical evidence passed, but no design/issue context was available for full semantic alignment |
| `ReadyWithWarnings` | Evidence passed but there are non-blocking risks or skipped checks with reasons |
| `NotReady` | Blocking evidence failed or required harden found unresolved issues |
| `NeedsHumanDecision` | Design ambiguity, unclear issue semantics, or unresolvable harden finding |

If the existing implementation does not yet support new status enums, the first implementation may encode limited context and warnings in the report body while preserving backward-compatible readiness values.

---

## 7. `/openflow-writing-plan` Integration

The writing-plan skill must instruct agents to call `openflow-quality-gate` after implementation.

Generated plans should not add `/openflow-harden`, `/openflow-verify`, or `/start-work` command blocks. Instead, the final implementation/QA task should say:

```text
After all code changes are complete, invoke the `openflow-quality-gate` skill.
The skill decides whether harden is required and performs evidence-aware verify.
Do not claim completion until the quality gate reports readiness.
```

---

## 8. Compatibility and Migration

1. Existing `handleHarden` and `handleVerify` code can remain as internal functions during migration.
2. Command registration should stop advertising `/openflow-harden` and `/openflow-verify` as normal manual workflow commands.
3. Existing `execution-policy.json` fast/balanced/strict state should no longer drive the primary workflow. If present, it may be read only as historical context and reported as deprecated.
4. Existing docs/tutorials that instruct users to manually run harden/verify must be updated to reference `openflow-quality-gate`.
5. Archive should depend on quality-gate readiness evidence rather than requiring a manually invoked verify command.

---

## 9. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| AI forgets to invoke the skill | Put `openflow-quality-gate` in available skills and update writing-plan instructions to require it after implementation |
| AI runs harden too often | Provide explicit risk rules and require rationale when harden runs |
| AI skips harden on complex changes | Quality gate skill must document mandatory harden triggers |
| Missing design/issue docs blocks small fixes | Verify degrades to limited context instead of failing solely due to missing docs |
| Duplicate typecheck/test/lint wastes time | Evidence-aware verify reuses fresh evidence and reruns only stale/missing checks |
| Removing manual commands surprises users | Document migration and keep internal APIs during transition if needed |

---

## 10. Success Criteria

- [ ] `openflow-quality-gate` exists as an AI-callable Skill.
- [ ] The skill runs after code changes in both native OpenCode and OMO workflows.
- [ ] The skill decides whether harden is needed without asking the user.
- [ ] The skill always performs evidence-aware verify.
- [ ] Lightweight issue fixes without `issue-clarification.md` still run technical verify with limited context.
- [ ] `/openflow-writing-plan` tells AI to invoke `openflow-quality-gate` after implementation.
- [ ] `/openflow-harden` and `/openflow-verify` are no longer documented as manual workflow commands.
- [ ] Global workflow docs and ADRs describe the quality gate skill as the standard post-implementation path.
