import type { SkillInfo } from './types.js'

export function getArchiveSkill(): SkillInfo {
  return {
    name: 'openflow-archive',
    description: 'Manual command reference for /openflow-archive when a verified feature is ready to be archived and mapped for traceability.',
    content: `# OpenFlow Archive Command Reference

## Overview
Archive completed features with a frozen implementation mapper and copied source artifacts.

## When to Use
- Feature implementation is complete
- All tests are passing
- Ready to create final documentation

## Process

### 1. Get File Changes from Session
Use OpenCode Session API to retrieve all file changes:
\`\`\`
client.session.messages({ sessionID })
\`\`\`
Extract write/edit tool calls to get the list of modified files.

### 2. Read Source Documents
Find current source documents:
- Primary: \`docs/changes/{YYYY-MM-DD-feature}/design.md\` (current working workspace)
- Optional companions: \`proposal.md\`, \`decisions.md\`, \`prd.md\`, \`plan.md\` in the same feature directory
- Fallback: promoted docs under \`docs/current/design/{feature}/\` and \`docs/current/requirements/{feature}/\`
- Legacy: older nested or legacy layouts remain readable for backward compatibility
- Execution plan: \`.sisyphus/plans/{feature}.md\`

### 2.5 Maintain Current Docs During Archive
- Default behavior promotes current docs automatically (\`auto_promote_current: true\`)
- Promotion first looks for reliable same-area historical current docs using markdown heading/body token overlap
- When a reliable match exists, refresh that current doc by replacing matched sections from the archived doc while preserving unrelated historical sections
- When no reliable match exists, fall back to direct archive-to-current migration

### 3. Get Code Symbols (Optional)
Use LSP tools to extract symbols from modified files:
\`\`\`
lsp_symbols(filePath)
\`\`\`

### 4. Generate Archive Mapper
Create:
\`docs/archive/{YYYY-MM-DD-feature}/implementation-mapper.md\`

Include:
- Feature overview
- Archived design / requirements / plans snapshot
- Code implementation mapping table (from Session + LSP)
- Modified files list
- Acceptance and drift notes

### 5. Copy Documents
Copy to archive (only if source files exist):
- Design 鈫?\`docs/archive/{YYYY-MM-DD-feature}/design.md\`
- Proposal 鈫?\`docs/archive/{YYYY-MM-DD-feature}/proposal.md\` (conditional)
- Decisions 鈫?\`docs/archive/{YYYY-MM-DD-feature}/decisions.md\` (conditional)
- Plan 鈫?\`docs/archive/{YYYY-MM-DD-feature}/plan.md\` (conditional)
- Requirements / PRD 鈫?\`docs/archive/{YYYY-MM-DD-feature}/prd.md\` (conditional)
- \`implementation-mapper.md\` is always generated.

## Example

\`\`\`text
/openflow-archive user-login
\`\`\`

This will create:
\`\`\`
docs/archive/2026-04-17-user-login/
鈹溾攢鈹€ implementation-mapper.md  (always)
鈹溾攢鈹€ design.md                 (if design exists)
鈹溾攢鈹€ proposal.md               (conditional)
鈹溾攢鈹€ decisions.md              (conditional)
鈹溾攢鈹€ prd.md                    (conditional)
鈹斺攢鈹€ plan.md                   (conditional)
\`\`\`
`,
  }
}
