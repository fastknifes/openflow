import type { SkillInfo } from './types.js'

export function getFeatureSkill(): SkillInfo {
  return {
    name: 'openflow-feature',
    description: 'Manual command reference for /openflow-feature when the user wants to start or continue natural-language feature design clarification. The command derives feature identity from explicit input or current session context, asks only useful follow-up questions, and generates design.md when converged or as a draft with assumptions.',
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

1. Do not require the user to provide a feature slug; derive internal feature identity from explicit natural-language description or current session context.
2. Use the internal OpenFlow \`openflow-feature\` tool to execute the workflow.
3. Ask at most one valuable feature-design question at a time, only when the answer can change the design direction.
4. Reuse the existing feature session when the same chat already has an active feature workflow; do not scan unrelated unfinished feature sessions or active plans.
5. When the feature is converged, let OpenFlow generate the design document and return the generated path.
6. If the user asks to skip or proceed before full convergence, generate a Draft with Assumptions and keep assumptions separate from confirmed facts.
7. After feature design is complete, do not keep the user trapped in feature design. They may continue to implementation, verification, or archive.
8. If feature interaction is stuck, continue feature clarification or create/update only feature design artifacts; do not invoke \`openflow-writing-plan\`, and do not create \`plan.md\` or \`.sisyphus/plans/*.md\` unless the user explicitly requests an implementation plan.
9. After design documents are generated and the feature session is complete, present a confirmation-style next-step choice to guide the user forward:
   - **When the question picker is available**: offer three options for the user to pick one:
     1. \`进入开发计划\` — proceed to implementation planning. Recommend \`/openflow-writing-plan\` as the next command, but do NOT invoke it automatically.
     2. \`检查约束充分性\` — review \`design.md\` and transitional \`behavior.md\` for constraint sufficiency (this is a design/behavior document review, not an implementation-plan review). The AI should re-read those documents and assess whether constraints are complete and unambiguous.
     3. \`查看文档\` — inspect the generated documents first before deciding on next steps.
   - **Non-interactive fallback**: if the question picker is unavailable, append the same three options as a text block after the generation result and wait for the user's natural-language continuation (e.g. "go ahead with the plan" or "let me review first").
   - **Hard rule preserved**: regardless of which option is selected, do not invoke \`openflow-writing-plan\` automatically. The user must explicitly request an implementation plan.

## Feature Identity Naming Constraints (Global Rule)

- **No hash fallback**: Never generate or suggest \`feature-{hash}\` style names. If the user's description is too vague, ask for clarification instead of fabricating a hashed placeholder.
- **Same name, same feature**: Identical feature slugs refer to the same feature session and workspace. The date prefix in \`docs/changes/YYYY-MM-DD-{feature}/\` is storage organization only; the identity is \`{feature}\` itself.
- **Deterministic derivation**: The same natural-language input must always produce the same slug. No randomness, timestamps, or session IDs may enter slug generation.
- **Chinese-to-English mapping is intentional**: Common Chinese terms are mapped to English equivalents via a curated dictionary so that Chinese-first users can use natural-language input without being forced to type English slugs.

## Notes

- Feature design is a soft workflow entrypoint, not a hard gate.
- OpenFlow may suggest this command, but it should not be auto-executed just because feature work was mentioned.
- Completing or unsticking feature design presents a confirmation-style next-step choice (see rule 9). When the user picks \`进入开发计划\`, suggest \`/openflow-writing-plan <feature>\` but do not invoke it automatically.
- Research, reading, and implementation tasks should remain non-blocking.
- Design outputs belong in a dated workspace such as \`docs/changes/2026-04-17-{feature}/\`.
`,
  }
}
