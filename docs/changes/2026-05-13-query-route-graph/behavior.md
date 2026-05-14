# query-route-graph - Behavior

## Scope

**In scope:**

- query-route-graph 工程或研发内部使用
- Address the stated problem: 继续收敛：该功能是 OpenFlow Runtime 内部的 Query Route Graph，用于 query-only 后台任务的跨会话复用。第一版不提供用户命令、不提供用户开关、不做用户可见审计、不写专用 debug 日志。普通用户完全无感；AI/agent/runtime 内部自动 lookup、decide、record。它应与 Drift Guardian 共用 singleton/runtime 管理模型，但作为 sibling service 保持职责分离，不并入 drift guardian 语义。后续如果需要调试，另做通用 Diagnostics/Trace Runtime，让多个 OpenFlow 子系统统一接入。
- Persist route records under `.openflow/query-route-graph/`.
- Support exact deterministic reuse only for explicitly query-only tasks.
- Keep the feature internal to OpenFlow runtime code with no user command, user switch, audit UI, or dedicated debug log.
## Behavior Scenarios

- When an explicitly query-only task is recorded, the service stores a structured JSON route record under `.openflow/query-route-graph/`.
- When the same query-only task is looked up later with the same repository/worktree scope and schema version, the service returns an exact hit.
- When the query text, task type, repository fingerprint, dirty-worktree fingerprint, agent identity, or schema version differs, the service returns a miss.
- When task classification is non-query or uncertain, the service does not record or reuse the result.
- Ordinary users receive no command, prompt, switch, audit message, or debug output for this feature.
- Drift Guardian behavior remains unchanged because Query Route Graph is a sibling runtime service, not part of guardian logic.
## Must Not Behaviors

- Unrelated modules or workflows
- Must not add `/openflow-query-routes` or any other user-facing management command.
- Must not add feature-specific debug logging in the MVP.
- Must not implement semantic similarity reuse in the MVP.
- Must not reuse results for mutating tasks, shell/git write operations, browser state, credential-dependent tasks, or uncertain classifications.
- Must not require ordinary users to understand or configure the feature.
## Boundary Scenarios

- [must] Keep the change scope narrow to reduce regression surface area
- [must] Cache files live under `.openflow/query-route-graph/`
- [must] Missing or incomplete scope metadata causes a miss
- [must] Existing command registration remains unchanged
- [must] Existing Drift Guardian responsibilities remain unchanged
- [should] Defer diagnostics to a future generic diagnostics runtime
## Verification Mapping

| Behavior | Evidence Type | Expected Evidence | Status |
|----------|--------------|-------------------|--------|
| Query-only result is recorded and retrieved by exact key | Unit test | Record under `.openflow/query-route-graph/`, recreate service, lookup returns hit | pending |
| Scope mismatch is safe | Unit test | Changed query/scope/schema/agent produces miss | pending |
| Non-query or uncertain task is safe | Unit test | Record is skipped or lookup misses for non-query/uncertain classification | pending |
| No user-facing surface is introduced | Regression test | Command registration contains no query-route command and no public tool is added | pending |
| Drift Guardian remains separate | Regression test | Existing guardian/runtime tests pass without behavior changes | pending |
