# query-route-graph - Design

## Overview

Feature: query-route-graph
Target users: 工程或研发内部使用
In scope: query-route-graph 工程或研发内部使用; Address the stated problem: 继续收敛：该功能是 OpenFlow Runtime 内部的 Query Route Graph，用于 query-only 后台任务的跨会话复用。第一版不提供用户命令、不提供用户开关、不做用户可见审计、不写专用 debug 日志。普通用户完全无感；AI/agent/runtime 内部自动 lookup、decide、record。它应与 Drift Guardian 共用 singleton/runtime 管理模型，但作为 sibling service 保持职责分离，不并入 drift guardian 语义。后续如果需要调试，另做通用 Diagnostics/Trace Runtime，让多个 OpenFlow 子系统统一接入。
## Problem

继续收敛：该功能是 OpenFlow Runtime 内部的 Query Route Graph，用于 query-only 后台任务的跨会话复用。第一版不提供用户命令、不提供用户开关、不做用户可见审计、不写专用 debug 日志。普通用户完全无感；AI/agent/runtime 内部自动 lookup、decide、record。它应与 Drift Guardian 共用 singleton/runtime 管理模型，但作为 sibling service 保持职责分离，不并入 drift guardian 语义。后续如果需要调试，另做通用 Diagnostics/Trace Runtime，让多个 OpenFlow 子系统统一接入。
## Goals

- Solve: 继续收敛：该功能是 OpenFlow Runtime 内部的 Query Route Graph，用于 query-only 后台任务的跨会话复用。第一版不提供用户命令、不提供用户开关、不做用户可见审计、不写专用 debug 日志。普通用户完全无感；AI/agent/runtime 内部自动 lookup、decide、record。它应与 Drift Guardian 共用 singleton/runtime 管理模型，但作为 sibling service 保持职责分离，不并入 drift guardian 语义。后续如果需要调试，另做通用 Diagnostics/Trace Runtime，让多个 OpenFlow 子系统统一接入。
- Serve target users: 工程或研发内部使用
- Honor priority: 风险最小
## Non-Goals

- Unrelated modules or workflows
## Architecture

Query Route Graph is an internal OpenFlow Runtime service for reusing query-only background task results across sessions. It is not a user-facing command, not a user-configurable feature, and not a dedicated audit/debug surface.

### Runtime placement

- Add Query Route Graph as a sibling service under the same singleton/runtime management style used by Drift Guardian and Contract Runtime.
- Do not merge it into Drift Guardian semantics. Drift Guardian remains responsible for design/contract drift; Query Route Graph is responsible only for query-task result reuse.
- First version may expose an internal TypeScript service API, but must not register new OpenCode commands or user-visible tools.

### Persistence

- Store route/index files under `.openflow/`.
- Recommended first-version path: `.openflow/query-route-graph/`.
- Store structured JSON records, not raw transcripts as the primary artifact.
- Keep file writes atomic where practical: write temp file then rename, or write a full index snapshot safely.

### First-version reuse model

- Support exact deterministic lookup only.
- Do not implement semantic similarity lookup in the first version.
- Do not implement user-facing audit, explain, status, or clear commands.
- Do not write dedicated debug logs for this feature. Future debug should be handled by a separate, generic diagnostics runtime.
- Do not automatically intercept every OpenCode task call in the first version. Provide the internal service and connect only narrowly selected OpenFlow-owned query paths if implementation requires a call site.

### Query-only boundary

A route is cacheable only when all conditions are true:

- The task is explicitly classified as query-only/read-only.
- The task uses only approved read/search tools or agent flows.
- The result does not depend on credentials, browser state, external mutable side effects, or local write operations.
- The result can be invalidated by repository/worktree scope changes.

First version should prefer an explicit allowlist over inference. If classification is uncertain, treat the task as non-cacheable.

### Cache key and scope

Exact lookup keys should include:

- normalized task type
- normalized query text
- repository root path
- git commit or equivalent repository fingerprint
- dirty-worktree fingerprint when available
- agent/subsystem identity
- route schema version

If any required scope component is unavailable, the service should miss rather than reuse.

### Core service API

The first implementation should center around an internal API shaped like:

```ts
lookup(input): Promise<miss | hit>
record(record): Promise<void>
invalidate(scope): Promise<void>
```

`invalidate` may be minimal in the first version; stale records can also be rejected by scope mismatch during lookup.
## Behavior Alignment

| Behavior Scenario | Design Response | Files / Modules | Risk |
|------------------|-----------------|-----------------|------|
| Query-only task result can be reused across sessions when the exact key and scope match. | Internal service reads `.openflow/query-route-graph/`, returns a hit only for exact deterministic matches, and records structured JSON results. | `src/runtime/*`, `.openflow/query-route-graph/`, tests for route lookup/record | Medium |
| Non-query or uncertain tasks are never reused. | Classification is allowlist-first; uncertain tasks miss by default. | query-route service tests, task classification integration if used | Low |
| Ordinary users do not see or manage this feature. | No command registration, no user-facing tools, no dedicated debug or audit output. | command registration tests, runtime tests | Low |
| Drift Guardian remains separate. | Query Route Graph is a sibling runtime service and does not change guardian responsibilities. | runtime module layout, existing guardian tests | Medium |
## Design Constraints

- [must] Keep a rollback path available for the change
- [must] Keep the change scope narrow to reduce regression surface area
- [must] Protect existing behavior with explicit regression coverage
- [must] Persist Query Route Graph data under `.openflow/query-route-graph/`
- [must] Do not add user-facing commands, switches, audit UI, or dedicated debug logs in the first version
- [must] Support exact deterministic lookup only in the first version; semantic lookup is out of scope
- [must] Treat uncertain query-only classification as non-cacheable
- [must] Keep Drift Guardian semantics unchanged
- [should] Prefer an internal runtime service API that can later be connected to a generic diagnostics runtime
## Success Criteria

- [ ] A query-only record can be written to `.openflow/query-route-graph/` and retrieved by exact key in a later service instance.
- [ ] A different query, repository fingerprint, dirty-worktree fingerprint, agent identity, or schema version produces a miss.
- [ ] Non-query or uncertain tasks are not recorded or reused.
- [ ] No new OpenCode command, public tool, user-facing audit surface, or dedicated debug log is introduced.
- [ ] Existing Drift Guardian, Contract Runtime, command registration, and verification tests keep passing.
## Proposed Design

Implement the first version as a conservative internal runtime service. The service stores structured route records under `.openflow/query-route-graph/`, computes exact keys from normalized query-only task metadata, and returns hits only when scope fingerprints match. It should be usable by OpenFlow-owned internals but should not expose a user command or visible workflow.

The MVP should focus on the data model, deterministic keying, persistence, and safe miss behavior. Automatic broad interception of all OpenCode background tasks, semantic similarity routing, dedicated auditing, and feature-specific debug logs are intentionally deferred.
## Risks And Mitigations

- Risk: stale or context-incompatible reuse. Mitigation: exact key only, scope fingerprint required, miss on missing scope.
- Risk: accidentally caching mutating tasks. Mitigation: allowlist query-only classification and default-deny uncertain tasks.
- Risk: confusing users with an internal optimization. Mitigation: no user commands, no user-facing output, no public switch.
- Risk: coupling with Drift Guardian. Mitigation: shared runtime style but separate service/module and tests that existing guardian behavior remains unchanged.
- Risk: cache files becoming corrupt. Mitigation: structured JSON validation and safe write strategy.
## Testing Strategy

- Unit test exact lookup/record persistence under `.openflow/query-route-graph/`.
- Unit test scope mismatch produces a miss.
- Unit test uncertain/non-query classification is not cacheable.
- Regression test command registration to ensure no user-facing command is added.
- Regression test existing Drift Guardian/Contract Runtime behavior remains unchanged.
