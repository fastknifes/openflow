import type { SkillInfo } from './types.js'

export function getBrainstormSkill(): SkillInfo {
  return {
    name: 'openflow-brainstorm',
    description: 'Manual command reference for /openflow-brainstorm when the user wants to start or continue feature design clarification. The command advances one brainstorm question at a time and generates design.md and behavior.md in docs/changes when answers are complete.',
    content: `# OpenFlow Brainstorm Command Reference

## Overview

This help text documents the manual \`/openflow-brainstorm\` command for new feature design clarification.
When the user runs that command, OpenFlow should drive the internal \`brainstorm\` tool and keep the workflow one question at a time.

## Public Entry

Start with:

\`/openflow-brainstorm <feature>\`

## Required Behavior

1. Treat the user's message as the feature name or the next brainstorm answer when a brainstorm session is already active in the same chat.
2. Use the internal OpenFlow \`openflow-brainstorm\` tool to execute the workflow.
3. Ask or advance exactly one brainstorm question at a time.
4. Reuse the existing brainstorm session when the same chat already has an active brainstorm.
5. When all required answers are collected, let OpenFlow generate the design document and return the generated path.
6. After brainstorm completion, do not keep the user trapped in brainstorm. They may continue to implementation, verification, or archive.

## Notes

- Brainstorm is a soft workflow entrypoint, not a hard gate.
- OpenFlow may suggest this command, but it should not be auto-executed just because brainstorm work was mentioned.
- Research, reading, and implementation tasks should remain non-blocking.
- Design outputs belong in a dated workspace such as \`docs/changes/2026-04-17-{feature}/\`.
`,
  }
}
