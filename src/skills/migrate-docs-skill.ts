import type { SkillInfo } from './types.js'

export function getMigrateDocsSkill(): SkillInfo {
  return {
    name: 'openflow-migrate-docs',
    description: 'Use when migrating documentation from other workflow projects (OpenSpec, Spec Kit, Kiro, Cursor, Trae) or non-standard doc directories into OpenFlow\'s standard docs structure. Examples: \'Migrate my OpenSpec docs\', \'Import docs from .kiro directory\', \'Migrate docs from another project\'',
    content: `# OpenFlow Migrate-Docs Skill

## Overview

Use this as the public entrypoint when you need to migrate documentation from another workflow tool or non-standard directory into OpenFlow's standard \`docs/\` structure.
This skill should drive the internal OpenFlow \`openflow-migrate-docs\` tool through the full migration lifecycle.

## Public Entry

Start with:

\`/openflow-migrate-docs --sourceDir <path>\`

## Required Behavior

1. Treat the user's message as a request to migrate documentation from a source directory.
2. Use the internal OpenFlow \`openflow-migrate-docs\` tool to execute the migration workflow.
3. The migration follows a staged lifecycle: detect → scan → classify → clarify → plan → apply → cleanup.
4. Each stage advances automatically; clarification questions are asked one at a time.
5. Resume interrupted migrations by running the command again without \`--sourceDir\`.
6. Do not ask the user to restate the task — the command itself is the task.

## Migration Stages

1. **detect** — Analyze source directory to identify the document framework (OpenSpec, Spec Kit, Kiro, etc.)
2. **scan** — Inventory all Markdown files in the source directory
3. **classify** — Map source files to OpenFlow target categories with confidence scoring
4. **clarify** — Present ambiguous classifications for user review
5. **plan** — Generate a complete migration plan with operation details
6. **apply** — Execute the plan: create directories and copy files with atomic writes
7. **cleanup** — Handle source file disposal and generate migration reports

## Parameters

- \`--sourceDir\`: Path to the source documentation directory (required to start)
- \`--targetDir\`: Target project root directory (defaults to source parent)
- \`--dryRun\`: Preview migration plan without executing file changes
- \`--answer\`: Answer to current migration clarification question

## Notes

- Supported source frameworks: OpenSpec, Spec Kit, Kiro, Cursor, Trae, and generic Markdown directories.
- \`--dryRun\` stops after the plan stage — no files are modified.
- During clarification, provide answers to \`--answer\` one at a time.
- Migration state is persisted and resumable across sessions.
`,
  }
}
