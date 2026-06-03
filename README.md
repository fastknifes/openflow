# OpenFlow: The Governance Layer for AI-Driven Development

[中文文档](./README_CN.md) · [Full handbook](https://fastknifes.github.io/openflow/)

OpenFlow is a documentation-governed workflow for AI-assisted development on OpenCode. It does not ask the AI to start with “how should we code this?” It first asks:

- What is the exact boundary of the change?
- Which existing constraints must not move?
- What evidence proves the work is actually done?
- Where will the decision live after the chat session disappears?

It is designed for brownfield systems where traceability, verification evidence, and long-term project memory matter more than the fastest first draft.

## Why OpenFlow exists

AI agents can write code quickly, but unmanaged AI-driven changes often create three problems:

1. **Scope drift** — the agent fixes one thing and quietly rewrites another.
2. **Unverifiable completion** — “done” becomes a chat message instead of fresh lint/typecheck/test evidence.
3. **Lost rationale** — months later nobody knows why a file, function, or behavior exists.

OpenFlow turns documentation into an executable constraint system:

- `docs/current/` stores current system facts the AI must obey.
- `docs/changes/` stores active feature workspaces and change boundaries.
- `docs/decisions/` stores cross-feature architectural decisions.
- `docs/archive/` stores immutable completed history and requirement-to-code traceability.

## Core workflow

```text
brainstorm → feature → writing-plan → implement → quality-gate → archive
```

| Stage | What happens | User entrypoint |
|---|---|---|
| Brainstorm | Explore requirements, options, and trade-offs before formalizing work. | Ask the agent to brainstorm, or invoke the `openflow-brainstorm` skill. |
| Feature | Clarify the change boundary and generate design/behavior documents. | `/openflow-feature <description>` |
| Writing plan | Convert design docs into a structured implementation plan. | `/openflow-writing-plan <feature>` |
| Implement | Create an implementation run and delegate execution. | `/openflow-implement <feature>` |
| Quality gate | Verify evidence, risk, freshness, and readiness. | AI calls `openflow-quality-gate` automatically. |
| Archive | Freeze history, promote current facts, and generate traceability. | `/openflow-archive <feature>` |

## What you get

- **Requirement-to-code traceability** — completed features produce an `implementation-mapper.md` mapping requirements to changed files, functions, and symbols.
- **Evidence-led readiness** — completion requires fresh verification, not a verbal claim.
- **Long-term project memory** — project facts survive agent switches, developer handoffs, and lost chat history.
- **Safer AI execution** — current docs, decisions, and behavior constraints are injected back into implementation.
- **Optional orchestration** — works with OpenCode by default and can integrate with oh-my-openagent (omo) and GitNexus for deeper multi-agent/code-intelligence workflows.

## Quick install

For LLM agents such as Claude Code, Cursor, Trae, or OpenCode, paste this instruction into the agent:

```text
Install and configure OpenFlow by following the instructions here:
https://fastknifes.github.io/openflow/getting-started/installation
```

Manual install:

```bash
npm install @fastknife/openflow
```

Then enable the plugin in `~/.config/opencode/opencode.json` or `opencode.jsonc`:

```json
{
  "plugin": ["@fastknife/openflow"]
}
```

Initialize your project in OpenCode:

```text
/openflow-init
```

Then start your first governed feature:

```text
/openflow-feature add user profile page
```

## Learn how to use it

- [10-minute quickstart](https://fastknifes.github.io/openflow/getting-started/quickstart)
- [Installation guide for AI agents](https://fastknifes.github.io/openflow/getting-started/installation)
- [Command reference](https://fastknifes.github.io/openflow/reference/commands)
- [Feature workflow guide](https://fastknifes.github.io/openflow/guide/feature-workflow)

## License

MIT License. Developed by [fastknife](https://github.com/fastknifes).
