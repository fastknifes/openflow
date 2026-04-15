import type { SkillInfo } from './types.js'

export function getVerifySkill(): SkillInfo {
  return {
    name: 'openflow/verify',
    description: 'Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims.',
    content: `# OpenFlow Verification Skill

## Overview
Claiming work is complete without verification is dishonesty, not efficiency.

**Core principle:** Evidence before claims, always.

## The Iron Law

\`\`\`
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
\`\`\`

If you haven't run the verification command in this message, you cannot claim it passes.

## The Gate Function

\`\`\`
BEFORE claiming any status:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
5. ONLY THEN: Make the claim WITH evidence

Skip any step = lying, not verifying
\`\`\`

## Security Checks

### Secret Scan
Check for accidentally committed secrets:
\`\`\`bash
trufflehog git file://. --only-verified
gitleaks detect --source .
grep -rE "(password|secret|api_key|token)\\s*=\\s*['\"].+['\"]" --include="*.ts" --include="*.js"
\`\`\`

### Vulnerability Scan
\`\`\`bash
npm audit
pip-audit
govulncheck ./...
\`\`\`

## Quality Checks

### Lint
\`\`\`bash
npm run lint
ruff check .
golangci-lint run
\`\`\`

### Type Check
\`\`\`bash
tsc --noEmit
mypy .
go vet ./...
\`\`\`

### Test Suite
\`\`\`bash
npm test
pytest
go test ./...
\`\`\`

## Red Flags - STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification
- About to commit/push/PR without verification
- Trusting agent success reports
- Relying on partial verification

## Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Tests pass | Test output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |

## Report Format
If the project persists verification notes, keep them aligned with the active change workspace or archive context instead of introducing a parallel execution workflow.
`,
  }
}
