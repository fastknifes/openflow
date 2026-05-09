import type { SkillInfo } from './types.js'

export function getInitSkill(): SkillInfo {
  return {
    name: 'openflow-init',
    description: 'Manual command reference for /openflow-init when the user wants to initialize or refresh the root AGENTS.md with OpenFlow docs navigation guidance.',
    content: `# OpenFlow Init Command Reference

## Overview

This help text documents the manual \`/openflow-init\` command for initializing or refreshing the root \`AGENTS.md\` file with OpenFlow's managed docs guide.
When the user runs that command, OpenFlow should execute the internal \`openflow-init\` tool immediately.

## Public Entry

Start with:

\`/openflow-init\`

## Required Behavior

1. Treat the user's message as a direct request to run the init workflow.
2. Use the internal OpenFlow \`openflow-init\` tool immediately instead of asking the user to restate the task.
3. Operate only on the repository root \`AGENTS.md\` file.
4. Preserve user-authored content outside the OpenFlow managed block.
5. Refresh the managed docs guide block when it already exists.
6. Return the command result directly after the internal tool completes.
7. Keep the docs guide lightweight: describe docs directory semantics and on-demand reading guidance without preloading all docs content.

## Notes

- This is a command-oriented entrypoint, not an auto-trigger.
- Do not respond by asking what task the user wants. The command itself is the task.
- The docs guide explains how to inspect \`docs/current\`、\`docs/decisions\`、\`docs/changes\` and \`docs/archive\` on demand.
- The command does not require \`docs/\` to exist before initialization.
`,
  }
}
