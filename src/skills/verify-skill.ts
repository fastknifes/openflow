import type { SkillInfo } from './types.js'

export function getVerifySkill(): SkillInfo {
  return {
    name: 'openflow-verify',
    description: 'Manual command reference for /openflow-verify when the user wants Evidence and Readiness before any completion claim.',
    content: `# OpenFlow Verify Command Reference

## Overview

Verify is a command-driven workflow that produces **Evidence** and determines **Readiness** before you claim work is complete.

**Core principle:** Evidence before claims, always.

## The Verify Flow

Run the verify command explicitly:

\`\`\`
/openflow-verify <feature-name>
\`\`\`

The command produces two outputs:

### 1. Evidence Phase
Collects concrete verification data:
- **checks_run**: Active feature resolution, plan existence, change workspace, constraint baselines
- **check_results**: Quality checks (test, typecheck, lint, format), security checks, consistency checks
- **observed_behavior_summary**: What actually happened when checks ran
- **intended_vs_actual_delta**: Gap between expected and observed behavior
- **doc_alignment_summary**: Whether change workspace exists for document review
- **current_decisions_conflict_summary**: Constraint baseline availability
- **known_risks_or_missing_evidence**: Specific gaps or blocking issues

### 2. Readiness Phase
Classifies whether the feature can proceed:

| Status | Meaning | Next Step |
|--------|---------|-----------|
| \`NotReady\` | Verification incomplete or checks failed | Fix failing checks, then rerun /openflow-verify |
| \`NeedsDecision\` | Rule conflict, current conflict, or business decision required | Resolve the blocking decision, then rerun /openflow-verify |
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

If you haven't run /openflow-verify in this conversation, you cannot claim the feature passes.

## The Gate Function

\`\`\`
BEFORE claiming any status:

1. IDENTIFY: Run /openflow-verify <feature-name>
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full Evidence and Readiness output
4. CHECK: Does Readiness status confirm the claim?
5. ONLY THEN: Make the claim WITH evidence citation

Skip any step = claiming without evidence
\`\`\`

## Red Flags - STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before running /openflow-verify
- About to commit/push/PR without verification
- Trusting agent success reports instead of verify output
- Relying on partial or stale verification

## Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Verify passed | Readiness: Ready or ReadyWithDocUpdates | Evidence shows failed checks |
| Tests pass | Evidence check_results: test passed | Previous run, "should pass" |
| Linter clean | Evidence check_results: lint passed | Partial check, extrapolation |
| Build succeeds | Actual command exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passed | Code changed, assumed fixed |

## After Verify

When Readiness is Ready or ReadyWithDocUpdates:
- Archive will accept the feature: \`/openflow-archive <feature-name>\`
- Archive checks the acceptance state that Verify produced
- Archive performs final canonicalization, not Verify

## Report Format
Verification results are stored in the acceptance state. Reference the Evidence and Readiness sections from the verify command output when reporting status.
`,
  }
}
