# OpenFlow Issue Workflow Optimization

## Problem
`openflow-issue` previously behaved like a markdown report generator. That made the flow noisy and hard to advance as a workflow node because durable state lived in prose instead of a structured issue record.

## Design
- Persist issue state as `issue-packet.json` inside the issue workspace.
- Render markdown as a projection of the packet, not the source of truth.
- Keep investigation read-only by default until classification exists.
- Treat `--resolve` as a gated record step, not a shortcut that assumes `bugfix`.
- Do not automatically archive; archive remains a separate authority boundary after readiness.

## Files
- `src/types.ts`
- `src/utils/issue-utils.ts`
- `src/commands/issue.ts`
- `src/skills/issue-skill.ts`
- `src/skills/registry.ts`
- `src/commands/manifest.ts`
