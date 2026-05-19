import type { SkillInfo } from './types.js'

export function getFeatureSkill(): SkillInfo {
  return {
    name: 'openflow-feature',
    description: 'Manual command reference for /openflow-feature when the user wants to start or continue natural-language feature design clarification. The command derives feature identity from context or description, asks only useful follow-up questions, and generates design.md and behavior.md when converged or as a draft with assumptions.',
    content: `# OpenFlow Feature Command Reference

## Overview

This help text documents the manual \`/openflow-feature\` command for feature design clarification.
When the user runs that command, OpenFlow should drive the internal \`openflow-feature\` tool as a gentle natural-language design assistant.

## Public Entry

Valid entry examples:

- \`/openflow-feature\`
- \`/openflow-feature 为 quality gate 引入 evidence-ledger 机制\`
- A natural-language answer in an active feature session

## Required Behavior

1. Do not require the user to provide a feature slug; derive internal feature identity from active session context or natural-language description.
2. Use the internal OpenFlow \`openflow-feature\` tool to execute the workflow.
3. Ask at most one valuable feature-design question at a time, only when the answer can change the design direction.
4. Reuse the existing feature session when the same chat already has an active feature workflow.
5. When the feature is converged, let OpenFlow generate the design document and return the generated path.
6. If the user asks to skip or proceed before full convergence, generate a Draft with Assumptions and keep assumptions separate from confirmed facts.
7. After feature design is complete, do not keep the user trapped in feature design. They may continue to implementation, verification, or archive.
8. If feature interaction is stuck, continue feature clarification or create/update only feature design artifacts; do not invoke \`openflow-writing-plan\`, and do not create \`plan.md\` or \`.sisyphus/plans/*.md\` unless the user explicitly requests an implementation plan.

## Notes

- Feature design is a soft workflow entrypoint, not a hard gate.
- OpenFlow may suggest this command, but it should not be auto-executed just because feature work was mentioned.
- Completing or unsticking feature design may suggest \`/openflow-writing-plan <feature>\`, but must not invoke it automatically.
- Research, reading, and implementation tasks should remain non-blocking.
- Design outputs belong in a dated workspace such as \`docs/changes/2026-04-17-{feature}/\`.
`,
  }
}
