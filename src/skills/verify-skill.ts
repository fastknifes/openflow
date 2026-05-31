import type { SkillInfo } from './types.js'

export function getVerifySkill(): SkillInfo {
  return {
    name: 'openflow-verify',
    description: 'Legacy/internal reference for /openflow-verify evidence and readiness behavior used by openflow-quality-gate; not a normal manual workflow entrypoint.',
    content: `# OpenFlow Verify — Internal Reference

**This skill documents the internal verify capability used by \`openflow-quality-gate\`. Do NOT invoke \`/openflow-verify\` manually — the quality gate orchestrates verification automatically after implementation.**

## Overview

The verify mechanism produces **Evidence** and determines **Readiness** as part of the quality-gate workflow.

**Core principle:** Evidence before claims, always.

## How Verification Is Triggered

After implementation, the AI invokes \`openflow-quality-gate\` automatically. The quality gate decides whether adversarial hardening is needed, then runs the verify evidence collection and readiness classification. No manual command is required.

## Evidence Phase

When verify runs, it collects concrete verification data:
- **checks_run**: Active feature resolution, plan existence, change workspace, constraint baselines
- **check_results**: Quality checks (test, typecheck, lint, format), security checks, consistency checks
- **observed_behavior_summary**: What actually happened when checks ran
- **intended_vs_actual_delta**: Gap between expected and observed behavior
- **doc_alignment_summary**: Whether change workspace exists for document review
- **current_decisions_conflict_summary**: Constraint baseline availability
- **known_risks_or_missing_evidence**: Specific gaps or blocking issues

## Readiness Phase

Verify classifies whether the feature can proceed:

| Status | Meaning | Next Step |
|--------|---------|-----------|
| \`NotReady\` | Verification incomplete or checks failed | Fix failing checks, then re-run the quality gate |
| \`NeedsDecision\` | Rule conflict, current conflict, or business decision required | Resolve the blocking decision, then re-run the quality gate |
| \`ReadyWithDocUpdates\` | All checks passed but document updates remain | Sync pending documentation before archiving |
| \`Ready\` | Evidence complete, no blocking follow-up | Continue to acceptance or archive workflow |

## Authority Boundaries

**Verify establishes readiness. Archive makes canonical.**

- Verify writes to acceptance state and produces the evidence packet
- Verify does NOT write current/ or archive/ docs
- Archive consumes the readiness state from Verify
- Archive performs canonicalization (implementation-mapper.md, frozen copies)
- Archive may apply current/ promotions after review

## The Iron Law

\`\`\`
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
\`\`\`

If the quality gate has not produced fresh verify evidence in this conversation, you cannot claim the feature passes.

## The Gate Function

\`\`\`
BEFORE claiming any status:

1. IDENTIFY: The quality gate will verify the implementation automatically
2. WAIT: Let the quality gate run (fresh, complete)
3. READ: Full Evidence and Readiness output from the quality gate
4. CHECK: Does Readiness status confirm the claim?
5. ONLY THEN: Make the claim WITH evidence citation

Skip any step = claiming without evidence
\`\`\`

## Red Flags - STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before the quality gate completes
- About to commit/push/PR without quality-gate verification
- Trusting agent success reports instead of quality-gate output
- Relying on partial or stale verification

## Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Verify passed | Readiness: Ready or ReadyWithDocUpdates | Evidence shows failed checks |
| Tests pass | Evidence check_results: test passed | Previous run, "should pass" |
| Linter clean | Evidence check_results: lint passed | Partial check, extrapolation |
| Build succeeds | Actual command exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passed | Code changed, assumed fixed |

## After Quality Gate

When Readiness is Ready or ReadyWithDocUpdates:
- Archive will accept the feature: \`/openflow-archive <feature-name>\`
- Archive checks the acceptance state that verify produced via the quality gate
- Archive performs final canonicalization, not the quality gate

## Report Format
Verification results are stored in the acceptance state. Reference the Evidence and Readiness sections from the verify command output when reporting status.
`,
  }
}
