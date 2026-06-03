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
9. After design documents are generated and the feature session is complete, the tool output includes a Next Step Options section. Do NOT render interactive pickers or button lists for this — instead, present the next-step choices in the user's language as natural-language text and let the user reply naturally. The AI must adapt the phrasing to match the language the user is speaking (e.g. Chinese users see Chinese options, English users see English options). Regardless of which option the user selects, do not invoke \`openflow-writing-plan\` automatically. The user must explicitly request an implementation plan.

## Feature Identity Naming Constraints (Global Rule)

- **No hash fallback**: Never generate or suggest \`feature-{hash}\` style names. If the user's description is too vague, ask for clarification instead of fabricating a hashed placeholder.
- **Same name, same feature**: Identical feature slugs refer to the same feature session and workspace. The date prefix in \`docs/changes/YYYY-MM-DD-{feature}/\` is storage organization only; the identity is \`{feature}\` itself.
- **Deterministic derivation**: The same natural-language input must always produce the same slug. No randomness, timestamps, or session IDs may enter slug generation.
- **Chinese-to-English mapping is intentional**: Common Chinese terms are mapped to English equivalents via a curated dictionary so that Chinese-first users can use natural-language input without being forced to type English slugs.

## Document Generation Rules

When generating \`design.md\` and \`behavior.md\`, the renderer produces structured documents from the collected requirement model. If the renderer is bypassed (e.g. the AI writes documents directly instead of calling the internal tool), these rules are mandatory.

### design.md Structure

Must contain these sections (in order):
1. Title + draft notice (if applicable)
2. Human Consensus Summary
3. Identity And Assumptions
4. Overview
5. Problem
6. Goals
7. Non-Goals
8. Behavior Alignment (scenario-to-design mapping table)
9. Design Constraints (with severity: must/should/may)
10. Success Criteria
11. Risks And Mitigations
12. Testing Strategy

### behavior.md Structure

Must contain these sections (in order):
1. Title + draft notice (if applicable)
2. Human Consensus Summary
3. User Context (target users, problem statement)
4. Trigger Rules (goals, in-scope items, must constraints)
5. Non-Trigger Rules (out-of-scope items, non-goals)
6. User-Visible Scenarios (Given/When/Then for each acceptance criterion)
7. Required Content
8. Success Responses
9. Must Not Behavior
10. Acceptance / Verification Mapping

### Abstraction Level Rules (Critical)

behavior.md describes **what a user or external caller observes** — not how the system produces it internally. This is the single most important quality rule for behavior documents.

**Permitted vocabulary** (observable, user-level):
- User actions: "用户点击购买", "管理员新增规则", "系统返回成功"
- Observable outcomes: "卖家收到米粒", "订单状态更新为已完成", "返回 409 错误"
- Business rules: "发放量必须为阈值的整数倍", "分账金额不超过订单金额"
- Data entities as domain concepts: "订单", "规则", "抵扣券"

**Forbidden vocabulary** (implementation-level):
- Function/method names: \`settleSeller()\`, \`CreditNowMoney\`, \`IssueExact()\`
- Internal variable/parameter names: \`is_need_divide\`, \`SettleByMimi\`, \`allot_data\`
- Code branch references: "走 SettleBySplit 分支", "CreditNowMoney 路径"
- Internal architecture coupling: "Go 调 PHP initiatePay()", "PHP 写 detail 表 status=0"
- Framework/library specifics: "gorm.DB tx", "SELECT ... FOR UPDATE", "HMAC 签名"

**Exception**: implementation details are allowed ONLY in \`design.md\`, never in \`behavior.md\`.

**Self-check before writing behavior.md**:
- Scan every Given/When/Then clause for backtick-wrapped function calls (\`xxx()\`).
- Scan every clause for camelCase/snake\_case identifiers that are not domain terms.
- If any clause reveals *which function* produces the outcome or *which branch* is taken, rewrite it to describe only the observable outcome.
- Example fix — Before: "Go \`settleSeller()\` 走 \`SettleByMimi\` 分支" → After: "卖家收到米粒，金额按收入与折算比计算".

### Cross-Document Consistency

- Every constraint in \`design.md\` with severity \`must\` must have a corresponding scenario in \`behavior.md\`.
- \`behavior.md\` must not contradict \`design.md\` on any factual claim (e.g. fallback behavior, error handling, ordering guarantees).
- If the renderer produces both documents, consistency is automatic. If the AI writes them manually, verify consistency before writing files.

## Notes

- Feature design is a soft workflow entrypoint, not a hard gate.
- OpenFlow may suggest this command, but it should not be auto-executed just because feature work was mentioned.
- Completing or unsticking feature design returns a Next Step Options section in the tool output. The AI should present these options to the user in their language. When the user picks the plan option, suggest \`/openflow-writing-plan <feature>\` but do not invoke it automatically.
- Research, reading, and implementation tasks should remain non-blocking.
- Design outputs belong in a dated workspace such as \`docs/changes/2026-04-17-{feature}/\`.
`,
  }
}
