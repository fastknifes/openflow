import type { SkillInfo } from './types.js'

export function getBrainstormSkill(): SkillInfo {
  return {
    name: 'openflow/brainstorm',
    description: 'Use when starting or continuing feature design clarification. Drives the OpenFlow brainstorm workflow one question at a time and generates design docs in docs/changes when answers are complete.',
    content: `# OpenFlow Brainstorm Skill

## Overview

Use this as the public entrypoint for new feature design clarification.
This skill should drive the internal OpenFlow \`brainstorm\` tool and keep the workflow one question at a time.

## Public Entry

Start with:

\`/openflow/brainstorm <feature>\`

## Required Behavior

1. Treat the user's message as the feature name or the next brainstorm answer when a brainstorm session is already active in the same chat.
2. Use the internal OpenFlow \`openflow/brainstorm\` tool to execute the workflow.
3. Ask or advance exactly one brainstorm question at a time.
4. Reuse the existing brainstorm session when the same chat already has an active brainstorm.
5. When all required answers are collected, let OpenFlow generate the design document and return the generated path.
6. After brainstorm completion, do not keep the user trapped in brainstorm. They may continue to implementation, verification, or archive.

## Notes

- Brainstorm is a soft workflow entrypoint, not a hard gate.
- Research, reading, and implementation tasks should remain non-blocking.
- Design outputs belong in \`docs/changes/{feature}/\`.
`,
  }
}
