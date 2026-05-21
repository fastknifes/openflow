import type { SkillInfo } from './types.js'

export function getArchiveSkill(): SkillInfo {
  return {
    name: 'openflow-archive',
    description: 'Manual command reference for /openflow-archive when a verified feature is ready to be archived and mapped for traceability.',
    content: `# OpenFlow Archive Command Reference

## Overview
Archive completed features with copied source artifacts and promoted current facts.

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

### 4. Copy Documents
Copy to archive (only if source files exist):
- Design -> \`docs/archive/{YYYY-MM-DD-feature}/design.md\`
- Proposal -> \`docs/archive/{YYYY-MM-DD-feature}/proposal.md\` (conditional)
- Decisions -> \`docs/archive/{YYYY-MM-DD-feature}/decisions.md\` (conditional)
- Plan -> \`docs/archive/{YYYY-MM-DD-feature}/plan.md\` (conditional)
- Requirements / PRD -> \`docs/archive/{YYYY-MM-DD-feature}/prd.md\` (conditional)
- \`implementation-mapper.md\` -> copied from changes workspace if generated during quality-gate

## Example

\`\`\`text
/openflow-archive user-login
\`\`\`

This will create:
\`\`\`
docs/archive/2026-04-17-user-login/
- implementation-mapper.md  (if generated during quality-gate)
- design.md                 (if design exists)
- proposal.md               (conditional)
- decisions.md              (conditional)
- prd.md                    (conditional)
- plan.md                   (conditional)
\`\`\`
`,
  }
}
