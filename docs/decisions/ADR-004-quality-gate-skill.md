# ADR-004: AI-callable Quality Gate Skill

**Date**: 2026-05-13  
**Status**: Accepted  
**Applies to**: `openflow-quality-gate`, harden/verify lifecycle, writing-plan guidance, archive readiness evidence

---

## 1. Context

OpenFlow previously exposed quality governance as manual commands:

```text
/openflow-harden <feature>
/openflow-verify <feature>
```

This created two problems:

1. Native OpenCode and OMO agents could complete code work without reliably running the OpenFlow quality gate.
2. Hook-based prompts could suggest harden/verify, but could not reliably control external execution flows such as OMO `/start-work`.

At the same time, normal AI development already runs some checks during implementation. Therefore the quality gate should not blindly repeat all checks; it should validate and complete the evidence chain.

---

## 2. Decision

OpenFlow introduces **`openflow-quality-gate`** as an AI-callable Skill.

The quality gate is the standard post-implementation path:

```text
AI completes code or bug fix
  → AI invokes openflow-quality-gate
    → decide whether harden is needed
    → perform evidence-aware verify
    → report readiness
  → archive may proceed only after readiness allows it
```

### 2.1 Manual command lifecycle

`/openflow-harden` and `/openflow-verify` are no longer documented as normal manual workflow commands.

Their underlying implementation may remain as internal building blocks, but the user-facing and AI-facing workflow should route through `openflow-quality-gate`.

### 2.2 Skill registration exception

`openflow-quality-gate` is intentionally a Skill, despite ADR-003's general rule against registering governance commands as Skills.

This exception is intentional because the quality gate must be invoked by AI after code changes. It is not an interactive design command; it is a post-implementation responsibility of the executor.

---

## 3. Quality Gate Semantics

The quality gate contains two logical stages:

1. **Risk-based harden**
   - Run harden for complex or high-risk changes.
   - Skip harden for trivial/simple low-risk changes.
   - The AI does not ask the user whether to harden.

2. **Evidence-aware verify**
   - Always run verification as an evidence gate.
   - Reuse fresh evidence produced after the last code change.
   - Rerun missing, stale, failed, or insufficiently scoped checks.
   - Downgrade semantic alignment when design/issue context is missing instead of skipping verify.

---

## 4. Context Handling

The quality gate uses the best available context:

| Available context | Behavior |
|---|---|
| Feature `design.md` / `behavior.md` | Check feature alignment |
| `issue-clarification.md` | Check issue alignment |
| Plan only | Use as supporting implementation context |
| User request + diff | Limited context alignment |
| No semantic context | Technical verification only, with limited-context warning |

Missing `issue-clarification.md` does not skip verify.

---

## 5. Writing Plan Integration

`/openflow-writing-plan` must instruct implementation agents to call `openflow-quality-gate` after code changes.

Plans should not tell users to manually run `/openflow-harden` or `/openflow-verify`.

---

## 6. Consequences

### Positive

- Works for both native OpenCode and OMO execution.
- Avoids unreliable hook-based control of `/start-work`.
- Removes fast/balanced/strict user friction from the normal path.
- Preserves governance evidence while avoiding unnecessary repeated checks.

### Trade-offs

- AI must reliably invoke the Skill after implementation.
- Documentation and plan generation must strongly reinforce quality-gate usage.
- Archive must consume quality-gate readiness instead of expecting a separate manual verify command.

---

## 7. Migration Notes

1. Register `openflow-quality-gate` as a Skill.
2. Stop advertising `/openflow-harden` and `/openflow-verify` as normal manual commands.
3. Update workflow tutorials and writing-plan guidance.
4. Treat existing `execution-policy.json` fast/balanced/strict state as deprecated historical context.
5. Keep internal harden/verify handlers temporarily if needed by the quality gate implementation.
