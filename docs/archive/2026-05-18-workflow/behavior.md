# OpenFlow Issue Workflow Behavior

## Expected Behavior
- `/openflow-issue <problem>` returns a compact issue report.
- `--write-doc` writes both `issue-clarification.md` and `issue-packet.json`.
- `--fix` is blocked while classification is `cannot_determine`.
- `--resolve` is blocked until packet evidence includes classification, root cause or no-fix reason, required checks, and verification evidence.
- `--close` marks the packet closed and does not archive automatically.

## Verification
- Targeted issue workflow tests cover compact report output, packet writing, fix blocking, close behavior, resolve blocking, and resolve success with a complete packet.
- Full project tests, typecheck, build, LSP diagnostics, and manual QA were run after implementation.
