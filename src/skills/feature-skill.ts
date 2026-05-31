import type { SkillInfo } from './types.js'

export function getFeatureSkill(): SkillInfo {
  return {
    name: 'openflow-feature',
    description: 'Feature design clarification. Derives feature identity from natural-language input or session context, collects design constraints through free-form dialogue, and generates design.md + behavior.md when ready.',
    content: `# OpenFlow Feature Command Reference

## Overview

This help text documents the \`/openflow-feature\` command for feature design clarification.
OpenFlow drives the internal \`openflow-feature\` tool as a lightweight design assistant.

## Entry Examples

- \`/openflow-feature\`
- \`/openflow-feature add SSH MCP server connection support\`
- A natural-language answer in an active feature session

## Core Behavior

1. **Feature identity comes from the user.** When \`openflow-feature\` returns an error asking for a feature description, you MUST ask the user what feature they want to design. Do NOT guess a feature name from context, skill descriptions, or message history.
2. Use the internal OpenFlow \`openflow-feature\` tool to execute the workflow.
3. **You decide what to ask.** There is no fixed question template. Based on the template section requirements returned by the tool, ask the user whatever questions are needed to fill the gaps. One question at a time. Only ask when the answer would change the design direction.
4. Reuse the existing feature session when the same chat already has an active feature workflow; do not scan unrelated unfinished feature sessions or active plans.

## Collecting Facts

- When the user answers a question, record it via \`action='collect' facts={...}\`.
- Fact keys are free-form. Use whatever keys make sense for the feature (e.g., \`problem\`, \`scope\`, \`target-users\`, \`priority\`, \`constraints\`, or domain-specific keys like \`auth-method\`, \`api-style\`).
- To correct a collected fact, call \`action='collect'\` with the same key and a new value.
- To delete a fact, call \`action='collect'\` with \`facts={"_remove": "key"}\` or \`facts={"_remove": "key1,key2"}\` for multiple keys.

## Readiness Judgment

Every \`action='status'\` or \`action='collect'\` response includes a **Template Section Requirements** section listing all sections that design.md and behavior.md will contain.

**YOU judge readiness** by comparing the collected facts against these template sections:

- If a section can be meaningfully filled from the user's natural-language descriptions — even without an explicit fact key — the design context may be sufficient.
- If critical sections (Problem, Goals, Design Constraints) cannot be filled, ask the user for more information before calling \`action='generate'\`.
- Do NOT keep asking questions once you have enough context. Proceed to generate.

## Generation

When you have enough context, call \`action='generate'\`. The system will automatically derive constraints, goals, non-goals, and acceptance criteria from the collected facts and brainstorm context.

**Optional enhancement**: To override or refine the auto-derived content, inject structured data via \`action='collect'\` with \`_\`-prefixed keys before generating:

- \`_constraints\`: JSON array of \`{ "description": "...", "category": "scope|security|performance|compatibility|maintainability|time", "severity": "must|should|may", "rationale": "...", "verificationMethod": "..." }\`
- \`_goals\`: JSON array of goal strings
- \`_nonGoals\`: JSON array of non-goal strings
- \`_acceptanceCriteria\`: JSON array of acceptance criterion strings

Example:
\`\`\`
action='collect' facts={
  "_constraints": '[{"description":"DRG tasks must be isolated per DAG","category":"security","severity":"must"}]',
  "_goals": '["Refactor harden to async DRG","Preserve backward compatibility"]'
}
\`\`\`

If you do not inject these keys, the system will still generate meaningful documents from the collected facts.

## After Design Is Complete

Present a confirmation-style next-step choice:

1. **进入开发计划** — suggest \`/openflow-writing-plan <feature>\` but do NOT invoke it automatically.
2. **检查约束充分性** — review the generated documents for constraint sufficiency.
3. **查看文档** — inspect the generated documents first.

Regardless of which option is selected, do not invoke \`openflow-writing-plan\` automatically. The user must explicitly request an implementation plan.

## Feature Naming Constraints

- **No hash fallback**: Never generate or suggest \`feature-{hash}\` style names.
- **Same name, same feature**: Identical feature slugs refer to the same feature session.
- **Deterministic derivation**: The same natural-language input must always produce the same slug.

## Notes

- Feature design is a soft workflow entrypoint, not a hard gate.
- Design outputs belong in \`docs/changes/YYYY-MM-DD-{feature}/\`.
- If feature interaction is stuck, do not invoke \`openflow-writing-plan\` or create \`plan.md\` unless the user explicitly requests it.
`,
  }
}
