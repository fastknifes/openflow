import type { SkillInfo } from './types.js'

export function getChangeSkill(): SkillInfo {
  return {
    name: 'openflow-change',
    description:
      'Manual command reference for /openflow-change when requirements shift during active development before a feature has been verified or archived. It updates design docs first, then guides associated code changes to prevent drift.',
    content: `# OpenFlow Change Command Reference

## Overview

Use this command when an active feature's requirements change before verification or archive. The workflow is document-first: update the active design and constraints before changing implementation code.

## Public Entry

Start with:

\`/openflow-change <feature> "<change description>"\`

## When to Use

- A feature already has active docs under \`docs/changes/{feature}/\`
- The feature has not been archived
- The requested change affects requirements, constraints, design, or implementation behavior

## Required Behavior

1. Use the internal OpenFlow \`openflow-change\` tool to request a change packet.
2. Read every design document listed in the change packet before editing.
3. Update the active \`docs/changes/{feature}/design.md\` or equivalent resolved design document first.
4. Update \`decisions.md\` when the change introduces or reverses trade-offs.
5. Update \`prd.md\` when product requirements or user scenarios changed.
6. Modify associated code only after the active docs match the new requirement.
7. Run relevant tests, then run \`/openflow-verify <feature>\` before archive.

## Guardrails

- Do not modify \`docs/current/\` or \`docs/archive/\` from this workflow.
- Do not use this command for archived features; start a new \`/openflow-brainstorm\` instead.
- Do not skip verification after changing docs or code.
- Keep diffs minimal and scoped to the changed requirement.

## Output Report

After completing the change, report:

- Documents modified
- Code files modified
- Tests run and results
- Drift status relative to the updated design
- Next step: \`/openflow-verify <feature>\`
`,
  }
}
