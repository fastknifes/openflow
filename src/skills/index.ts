import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { OpenFlowContext } from '../types.js'
import { createSafePath, escapeMarkdown, addDatePrefix } from '../utils/security.js'
import { logger } from '../utils/logger.js'

interface SkillInfo {
  name: string
  description: string
  content: string
}

function getBrainstormingSkill(): SkillInfo {
  const datePrefix = addDatePrefix('')
  return {
    name: 'openflow-brainstorm',
    description: 'Use when starting a new feature implementation to clarify requirements and generate design documents.',
    content: `# OpenFlow Brainstorming Skill

## Overview
Guide users through requirement clarification and design exploration before implementation.

## When to Use
- User mentions a new feature for the first time
- No existing design documents in \`docs/design/{feature}/\`
- No existing plan in \`.sisyphus/plans/{feature}.md\`

## Process

### 1. Requirement Clarification
Ask ONE question at a time:
- What problem does this solve?
- Who are the primary users?
- What are the success criteria?
- What constraints exist?

### 2. Solution Exploration
Propose 2-3 approaches with trade-offs.

### 3. Design Document Generation
Generate with date prefix (YYYYMMDD-*.md):
- \`docs/design/{feature}/${datePrefix}proposal.md\`
- \`docs/design/{feature}/${datePrefix}design.md\`
- \`docs/design/{feature}/${datePrefix}decisions.md\`

## Guardrails
- One question at a time
- Always propose multiple approaches
- Get user confirmation before generating documents
- All custom documents MUST have date prefix
`,
  }
}

function getVerifySkill(): SkillInfo {
  const datePrefix = addDatePrefix('')
  return {
    name: 'openflow-verify',
    description: 'Use when executing verification tasks to perform security and quality checks.',
    content: `# OpenFlow Verification Skill

## Overview
Execute security and quality checks on the codebase.

## Security Checks
1. Secret Scan - Check for committed secrets
2. Vulnerability Scan - Run \`npm audit\` or equivalent

## Quality Checks
1. Lint - Run linter
2. Type Check - Run \`tsc --noEmit\` or equivalent
3. Test Suite - Run all tests

## Report Format
Generate report with date prefix:
- \`docs/verification/{feature}/${datePrefix}{type}-report.md\`
`,
  }
}

function getArchiveSkill(): SkillInfo {
  const datePrefix = addDatePrefix('')
  return {
    name: 'openflow-archive',
    description: 'Use when a feature is complete and ready to be archived. Generates SRS with code mapping from Session API.',
    content: `# OpenFlow Archive Skill

## Overview
Archive completed features with full SRS documentation including code mapping.

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
- \`docs/design/{feature}/YYYYMMDD-*.md\` (use latest)
- Execution plan: \`.sisyphus/plans/{feature}.md\`

### 3. Get Code Symbols (Optional)
Use LSP tools to extract symbols from modified files:
\`\`\`
lsp_symbols(filePath)
\`\`\`

### 4. Generate SRS Document
Create with date prefix:
\`docs/archive/{feature}/srs/${datePrefix}srs.md\`

Include:
- Feature overview
- Business flow (from plan)
- Code implementation table (from Session + LSP)
- Modified files list
- Links to design and plan

### 5. Copy Documents
Copy to archive:
- Design → \`docs/archive/{feature}/design/\`
- Plan → \`docs/archive/{feature}/plan/\`

## SRS Template

\`\`\`markdown
# {feature} - Software Requirements Specification

## 1. 概述
{从设计文档提取}

## 2. 业务流程
{从计划文档提取}

## 3. 代码实现

| 业务步骤 | 实现位置 | 关键代码 |
|----------|----------|----------|
| {从 LSP 或手动填写} | | |

## 4. 修改的文件

| 文件 | 变更类型 |
|------|----------|
| {从 Session API 获取} | |

## 5. 相关文档
- [设计文档](../design/)
- [执行计划](../plan/)
\`\`\`

## Example

\`\`\`
skill(name="openflow-archive", feature="user-login")
\`\`\`

This will create:
\`\`\`
docs/archive/user-login/
├── srs/
│   └── ${datePrefix}srs.md
├── design/
│   └── *.md
└── plan/
    └── tasks.md
\`\`\`
`,
  }
}

const skills: SkillInfo[] = [
  getBrainstormingSkill(),
  getVerifySkill(),
  getArchiveSkill(),
]

export async function registerSkills(ctx: OpenFlowContext): Promise<void> {
  const skillsDir = createSafePath(ctx.directory, '.opencode', 'skills', 'openflow')

  try {
    await fs.mkdir(skillsDir, { recursive: true })

    for (const skill of skills) {
      const skillPath = path.join(skillsDir, `${skill.name}.md`)
      const frontMatter = `---
name: ${escapeMarkdown(skill.name)}
description: ${escapeMarkdown(skill.description)}
---

`
      await fs.writeFile(skillPath, frontMatter + skill.content, 'utf-8')
      logger.debug('Registered skill', { name: skill.name })
    }

    logger.info('Skills registered', { count: skills.length })
  } catch (error) {
    logger.error('Failed to register skills', error instanceof Error ? error : undefined)
  }
}

export async function unregisterSkills(ctx: OpenFlowContext): Promise<void> {
  const skillsDir = createSafePath(ctx.directory, '.opencode', 'skills', 'openflow')

  try {
    await fs.rm(skillsDir, { recursive: true, force: true })
    logger.info('Skills unregistered')
  } catch {
    void 0
  }
}

export function getAvailableSkills(): string[] {
  return skills.map(s => s.name)
}

export function getSkillContent(name: string): string | undefined {
  const skill = skills.find(s => s.name === name)
  return skill?.content
}

export { getBrainstormingSkill, getVerifySkill, getArchiveSkill }
