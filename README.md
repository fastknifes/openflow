# OpenFlow: The Governance Layer for AI-Driven Development

[中文文档](./README_CN.md) | [Architecture](./docs/decisions/ADR-001-docs-governance-and-workflow.md)

## 📍 Document Portal

| You want to… | Go here |
|---|---|
| 🚀 **Get started now** — 10-minute hands-on tutorial | [English Tutorial](./docs/current/workflow/openflow-usage-tutorial.en.md) · [中文教程](./docs/current/workflow/openflow-usage-tutorial.md) |
| 📋 **Look up a command** — syntax, parameters, examples | [User Manual ↓](#-user-manual) |
| 🏗️ **Understand the architecture** — docs model, governance, workflow design | [ADR-001: Docs Governance](./docs/decisions/ADR-001-docs-governance-and-workflow.md) · [Config reference](#%EF%B8%8F-configuration) |
| ❓ **Avoid mistakes** — common pitfalls and FAQ | [Tutorial §10 (Mistakes)](./docs/current/workflow/openflow-usage-tutorial.en.md#10-common-mistakes) · [Tutorial §15 (FAQ)](./docs/current/workflow/openflow-usage-tutorial.en.md#15-faq) |

> **The 3 commands you will use most often:**
> ```text
> /openflow-brainstorm <feature>       # design a feature
> /openflow-issue <problem>            # investigate a problem
> /openflow-verify <feature>           # produce evidence & readiness
> ```

OpenFlow is an industrial-grade development workflow engine for **OpenCode**. It can work well with **oh-my-openagent (omo)**, but its core value does not depend on omo: **document programming is constraint programming**. Design docs, current facts, decisions, verification evidence, and archive records are not passive notes; they are executable governance constraints that force AI coding to stay inside the approved engineering boundary.

OpenFlow transforms AI coding from "random generations" into a "governed engineering process." While other plugins focus on *how* to write code, OpenFlow focuses on *how to constrain* the change, ensuring that every line of AI-generated code is **traceable, verified, and consistent** with documented requirements and design.

---

## 💎 Why OpenFlow?

In the age of AI, the bottleneck isn't writing code—it's **maintaining it**. OpenFlow addresses the three biggest risks of AI-driven development:

1.  **The Black Box Risk**: AI writes code, but you don't know exactly which requirements it satisfied.
2.  **The Drift Risk**: As the project evolves, your documentation and code stop matching.
3.  **The Quality Risk**: AI might "hallucinate" that a task is finished without actual evidence.

**OpenFlow** provides a "Hard Gate" workflow that guarantees engineering integrity by turning documentation into enforceable constraints for AI agents. When omo is present, OpenFlow can use it as an execution companion; when it is not, the documentation-governance model still stands on its own.

---

## 🚀 Core Capabilities

### 🛡️ Governance & Hard Gates
OpenFlow isn't just a set of suggestions; it's a workflow engine. It enforces a strict lifecycle: **Brainstorm → Implement → Verify → Archive**. You cannot "Archive" a feature unless it has passed the "Verify" gate with concrete evidence.

### 🗺️ Implementation Mapping (Traceability)
Every archived feature automatically generates an `implementation-mapper.md`. This is a "GPS" for your codebase, mapping requirements to specific files, functions, and symbols. Never wonder "why does this code exist?" again.

### 🔍 Automated Drift Detection
OpenFlow monitors your workspace in real-time. If an Agent modifies the implementation in a way that deviates from the approved `design.md`, OpenFlow flags the "drift" immediately during the verification phase.

### 🧪 TDD Plan Enhancement
OpenFlow automatically injects **Red-Green-Refactor** tasks into your Agent's execution plans. It provides test templates and execution commands, turning TDD from a "best practice" into a default behavior.

---

## 🛠️ User Manual

Need a practical walkthrough instead of a command list? Read the step-by-step tutorial: [`docs/current/workflow/openflow-usage-tutorial.md`](./docs/current/workflow/openflow-usage-tutorial.md)

### 1. Initiation: `/openflow-init`
Start here for any new project. It sets up the `AGENTS.md` guide and prepares your workspace for governed development.

### 2. Design Phase: `/openflow-brainstorm <feature>`
- **What it does**: Explores intent, asks clarifying questions, and proposes 2-3 approaches.
- **Intelligent Output**: Based on the complexity of the feature, it generates a tailored set of documents in `docs/changes/YYYY-MM-DD-feature/`, which may include:
  - `design.md`: Core architecture and technical solution (Primary).
  - `prd.md`: Product requirements and user scenarios (for high complexity features).
  - `requirements.md`: Explicit requirement definitions and constraints.
  - `proposal.md`: Initial problem framing and solution exploration.
  - `decisions.md`: Log of key architectural decisions and trade-offs.

### 3. Planning & Execution: `Prometheus` & `/startwork`
Once the design is finalized, you can bridge design to code in more than one way:
- **With omo**: Use **Prometheus** to generate a development plan, then run `/startwork` to execute it with omo's agent workflow.
- **With native OpenCode flow**: You can also rely on OpenCode's native **plan** and **build** style workflow without omo. OpenFlow's core role is still the same: keep design, requirements, decisions, verification, and archive constraints attached to implementation.

### 4. Issue Clarification: `/openflow-issue <issue-name-or-description>`
Use this when the problem is still ambiguous and you do **not** want to assume it is a bug yet.
- **What it does**: Clarifies expectations, constraints, evidence, and current semantics before implementation.
- **Typical use**: Investigating wrong data, strange behavior, unclear business rules, config/environment issues, or cases where you first need to decide whether the next step is fix, further investigation, or brainstorm.
- **Helpful flags**: `--readonly`, `--write-doc`, `--continue`.

### 5. Hardening Phase: `/openflow-harden <feature>`
Run this between implementation and verify when a change is complex, risky, or cross-cutting.
- **What it does**: Performs adversarial quality hardening through reviewer/executor style inspection loops.
- **Typical use**: Multi-file logic changes, state/permission/data-flow changes, public interface changes, or any implementation that may pass tests but still hide regressions.
- **Helpful flags**: `--full`, `--mode quick|standard|deep`, `--max-rounds N`.

### 6. Verification Phase: `/openflow-verify <feature>`
The gatekeeper. Before claiming success, you must run verify.
- **Drift Detection**: Automatically checks if the implementation has "drifted" from the approved design and requirements.
- **Evidence Phase**: Runs tests, security scans (secrets/vulns), and linting.
- **Readiness Phase**: Classifies the state as `Ready`, `ReadyWithDocUpdates`, `NotReady`, or `NeedsDecision`.
- **The Iron Law**: No completion claims without fresh verification evidence.

### 7. Closure: `/openflow-archive <feature>`
The final authority.
- **Canonicalization**: Moves working docs to `docs/archive/`.
- **Promotion**: Updates `docs/current/` to reflect the new system state.
- **Mapping**: Generates the `implementation-mapper.md` for permanent traceability.

### 8. Document Migration: `/openflow-migrate-docs --sourceDir <source-docs-dir> [--targetDir <target-dir>] [--dryRun]`
Use this when you need to migrate an existing docs tree from another workflow or project into the OpenFlow structure.
- **What it does**: Detects source doc structure, scans files, classifies them into `docs/current/`, `docs/changes/`, `docs/archive/`, `docs/decisions/`, and `docs/references/`, then asks for clarification before applying changes.
- **Typical use**: Migrating from OpenSpec, Spec Kit, Kiro, Cursor/Trae conventions, or a hand-maintained legacy `docs/` folder.
- **Important behavior**: Default flow is report-first and clarification-first; deleting originals is never automatic.

### 9. Maintenance: `/openflow-status` & `/openflow-config`
- **Status**: Check the current state of all active feature sessions and their readiness.
- **Config**: View or update your OpenFlow settings on the fly.

---

## 📦 Installation

```bash
npm install @fastknife/openflow
```

Then enable the plugin in your `opencode.json`:

```json
{
  "plugins": ["@fastknife/openflow"]
}
```

---

## ⚙️ Configuration

Customize the behavior further in your `opencode.json`:

```json
{
  "openflow": {
    "brainstorming": {
      "enabled": true,
      "auto_trigger": true,
      "trigger_mode": "smart"
    },
    "tdd": {
      "enabled": true,
      "expand_threshold": 3
    },
    "verification": {
      "in_plan": true,
      "security": ["secret", "vuln"],
      "quality": ["lint", "typecheck", "test"]
    },
    "archive": {
      "enabled": true,
      "auto_promote_current": true
    }
  }
}
```

---

## 🏗️ Architecture

OpenFlow runs as a governance layer in **OpenCode**. It can collaborate closely with **omo (oh-my-openagent)** when present, but the workflow model itself is not tied to omo.

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenCode IDE                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │ oh-my-openagent │  │         OpenFlow Plugin         │  │
│  │    (Runtime)    │◄─┤      (Governance Layer)         │  │
│  │                 │  │                                 │  │
│  │  - Context      │  │  - Drift Detection               │  │
│  │  - Execution    │  │  - Evidence Collection          │  │
│  │  - Tooling      │  │  - Implementation Mapping       │  │
│  └─────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📄 License

MIT License. Developed by [fastknife](https://github.com/fastknifes).
