# Promotion Candidate

## Source Issue
quality-gate-scope-contamination

## Clarified Requirement
The resolved issue must preserve the clarified behavior captured in `issue-clarification.md`.

## Clarified Constraints
- Issue fixes remain plan-optional.
- Harden is selected automatically through risk-based Work Node policy.
- Global promotion is only a candidate until explicitly confirmed.

## Proposed Current Update
Candidate created: quality-gate behavior should be understood as feature/issue-scoped when context evidence exists, with full-workspace behavior reserved for limited/none context.

## Proposed Decision
Future similar bugfix investigations should first inspect this issue's clarification and resolution archive before changing quality-gate scope, risk, or evidence freshness behavior.

## Approval Needed
User approval required before promoting this candidate into docs/current or docs/decisions.

## Rationale
Durable issue memory prevents repeated diagnosis and keeps issue-specific fixes from silently becoming global rules.
