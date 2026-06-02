# 2026-05-brainstorm-refactor - Implementation Mapper
**Date**: 2026-05-29
**Status**: ready

## Behavior to Code Mapping

| Scenario | Behavior | Key Code Files | Test File |
|----------|----------|----------------|-----------|
| SC-BR-01 | Opportunistic save on assistant turn (fire-and-forget) | `src/hooks/chat-message.ts:57-78` | `tests/hooks/chat-message.test.ts` |
| SC-BR-02 | Transition save before `/openflow-feature` (short-timeout, non-blocking) | `src/hooks/chat-command-dispatch.ts:110-131` | — |
| SC-BR-03 | Fingerprint deduplication | `src/phases/feature/brainstorm-auto-save.ts:28-36,62-65` | `tests/phases/feature/brainstorm-auto-save.test.ts` |
| SC-BR-04 | Throttling (≥1 turn or ≥30s) | `src/phases/feature/brainstorm-auto-save.ts:38-48` | `tests/phases/feature/brainstorm-auto-save.test.ts` |
| SC-BR-05 | context-harvest split compatibility | `src/phases/feature/context-harvest.ts` (barrel) | `tests/phases/feature/context-harvest.test.ts` |
| SC-BR-06 | Brainstorm session detection (metadata-based) | `src/utils/brainstorm-session.ts:10-36` | `tests/phases/feature/brainstorm-auto-save.test.ts` |
| SC-BR-07 | packet-save rename | `src/phases/feature/packet-save.ts` | `tests/phases/feature/brainstorm-packet-save.test.ts` |
| SC-BR-08 | Save result handling (saved/skipped/failed) | `src/phases/feature/brainstorm-auto-save.ts:50-88` | `tests/phases/feature/brainstorm-auto-save.test.ts` |

## Module Responsibilities

- `brainstorm-auto-save.ts` — Orchestration: session flag check, stability, fingerprint, throttle, result policy
- `packet-save.ts` — Persistence: extraction + threshold + disk write
- `harvest-discovery.ts` — Packet listing, matching, similarity, summary rendering
- `harvest-choice.ts` — Interactive user choice (use/edit/ignore) + parsing
- `harvest-injection.ts` — Inject chosen items into `FeatureSession` and `RequirementModel`
- `context-harvest.ts` — Barrel re-export preserving existing import paths
- `brainstorm-session.ts` — Metadata-based session detection + message fetch + feature hint derivation

## Known Limitations

- Transition save (`chat-command-dispatch.ts`) currently passes `isBrainstormSession: true` directly because retrospective session-type detection across the full conversation history requires a persistent session marker that is not implemented in Phase 1. The `tryAutoSaveBrainstormPacket` stability threshold acts as a fallback filter.
- Opportunistic save does not append the optional success line to chat output; failures are silently suppressed per constraints.
