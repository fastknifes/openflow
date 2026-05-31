# OpenFlow Issue Workflow Optimization Plan

## Context
- Goal: optimize `openflow-issue` from a markdown-first report command into a state-first issue workflow node.
- Scope: issue packet state, compact report rendering, `--fix`, `--close`, `--resolve` evidence gate, skill registration, and tests.
- Non-goal: automatic archive execution.

## Tasks
- [x] Add structured `IssuePacket` types and workspace persistence via `issue-packet.json`.
- [x] Replace the default long issue report with a compact Issue/Evidence/Classification/Next Step view.
- [x] Gate `--fix` until classification is known.
- [x] Gate `--resolve` until classification, root cause/no-fix reason, required checks, and verification evidence exist.
- [x] Add `--close` to mark an issue packet closed without archiving.
- [x] Register the `openflow-issue` skill through the manifest-driven skill registry.
- [x] Update issue command, chat hook, skill registration, and issue utility tests.

## Verification Evidence
- `lsp_diagnostics` on `src` and `tests`: no diagnostics.
- `bun test tests/hooks/chat-message.test.ts tests/commands/issue.test.ts tests/skills/registration.test.ts tests/utils/issue-utils.test.ts`: 118 pass, 0 fail.
- `bun test`: 1340 pass, 0 fail.
- `bun run typecheck`: passed.
- `bun run build`: passed.
- Manual QA: `handleIssue` with `--write-doc` produced compact issue output; unresolved packet with `--resolve` returned `Resolve Blocked`.
