import type { SkillInfo } from './types.js'

export function getArchiveSkill(): SkillInfo {
  return {
    name: 'openflow/archive',
    description: 'Use when a feature is complete and ready to be archived. Generates an implementation mapper with traceability from Session API.',
    content: `# OpenFlow Archive Skill

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
Find latest design documents (with date prefix):
- \`docs/current/design/{feature}/YYYYMMDD-*.md\` or \`docs/changes/{feature}/design/\` (use latest applicable source)
- Execution plan: \`.sisyphus/plans/{feature}.md\`

### 3. Get Code Symbols (Optional)
Use LSP tools to extract symbols from modified files:
\`\`\`
lsp_symbols(filePath)
\`\`\`

### 4. Generate Archive Mapper
Create:
\`docs/archive/{feature}/implementation-mapper.md\`

Include:
- Feature overview
- Archived design / requirements / plans snapshot
- Code implementation mapping table (from Session + LSP)
- Modified files list
- Acceptance and drift notes

### 5. Copy Documents
Copy to archive:
- Design → \`docs/archive/{feature}/design/\`
- Plans → \`docs/archive/{feature}/plans/\`
- Requirements → \`docs/archive/{feature}/requirements/\` (if exists)

## Example

\`\`\`text
/openflow/archive user-login
\`\`\`

This will create:
\`\`\`
docs/archive/user-login/
├── implementation-mapper.md
├── design/
│   └── *.md
├── requirements/
│   └── *.md
└── plans/
    └── tasks.md
\`\`\`
`,
  }
}
