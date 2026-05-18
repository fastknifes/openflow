# Context Loss Reflections

| Date | Summary | Classification | Promotion Candidate |
|------|---------|---------------|-------------------|
| 2026-05-18 | AI auto-invoked `openflow-feature` after a feature prompt despite ADR-003 forbidding automatic interactive governance command execution. | must-trigger | Yes |

## Active Corrective Rules

- **no-auto-governance-command-after-prompt**: When a Feature Question or command recommendation appears, do not call interactive OpenFlow governance tools such as `openflow-feature` unless the user explicitly requested that command; answer conversationally or ask/offer next steps instead.
