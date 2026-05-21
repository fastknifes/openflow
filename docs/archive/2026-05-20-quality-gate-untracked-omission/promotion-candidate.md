# Promotion Candidate

## Source Issue
quality-gate-untracked-omission

## Clarified Requirement
The resolved issue must preserve the clarified behavior captured in `issue-clarification.md`.

## Clarified Constraints
- Issue fixes remain plan-optional.
- Harden is selected automatically through risk-based Work Node policy.
- Global promotion is only a candidate until explicitly confirmed.

## Proposed Current Update
No automatic docs/current update is applied by /openflow-issue --resolve.

## Proposed Decision
Future similar bugfix investigations should first inspect this issue's clarification and resolution archive before changing code.

## Approval Needed
User approval required before promoting this candidate into docs/current or docs/decisions.

## Rationale
Durable issue memory prevents repeated diagnosis and keeps issue-specific fixes from silently becoming global rules.
