import type { SkillInfo } from './types.js'

export function getIssueSkill(): SkillInfo {
  return {
    name: 'openflow-issue',
    description: 'Issue investigation workflow. Use for uncertain problems, bugs, wrong data, config drift, environment failures, and behavior mismatches before fixing.',
    content: `# OpenFlow Issue Skill

## Purpose

Use this skill when the user reports an uncertain problem: wrong data, errors, broken behavior, config drift, production symptoms, or behavior that may conflict with current semantics.

## Required Flow

1. Treat natural-language problem reports as issue investigation candidates.
2. Start or resume with \`/openflow-issue <problem>\`.
3. Investigate read-only first: inspect relevant code paths, docs/current, docs/decisions, logs/config/test evidence when available.
4. Update the issue packet conceptually before routing: symptom, evidence, hypotheses, classification, required checks, and next action.
5. Do not fix until classification is no longer \`cannot_determine\` and the route is clear.
6. Route by classification: bugfix → fix; data/config/environment → targeted remediation; doc ambiguity or behavior change → ask for decision or use openflow-feature.
7. After implementation, invoke \`openflow-quality-gate\` before claiming completion.
8. Do not auto-archive. Suggest \`/openflow-archive <issue>\` only after readiness is available.

## Critical Rules

- \`/openflow-issue --resolve\` is a close/record step, not an investigation shortcut.
- Do not assume every issue is a bugfix.
- Production or readonly issue contexts remain read-only until explicitly routed.
`,
  }
}
