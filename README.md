# OpenFlow: The Governance Layer for AI-Driven Development

[中文文档](./README_CN.md) | [Architecture](./docs/changes/openflow-init/design.md)

OpenFlow is an industrial-grade development workflow engine designed specifically for **OpenCode** and **oh-my-openagent (omo)**. It transforms AI coding from "random generations" into a "governed engineering process."

While other plugins focus on *how* to write code, OpenFlow focuses on *how to manage* the change, ensuring that every line of AI-generated code is **traceable, verified, and consistent** with your design.

---

## 💎 Why OpenFlow?

In the age of AI, the bottleneck isn't writing code—it's **maintaining it**. OpenFlow addresses the three biggest risks of AI-driven development:

1.  **The Black Box Risk**: AI writes code, but you don't know exactly which requirements it satisfied.
2.  **The Drift Risk**: As the project evolves, your documentation and code stop matching.
3.  **The Quality Risk**: AI might "hallucinate" that a task is finished without actual evidence.

**OpenFlow + omo** provides a "Hard Gate" workflow that guarantees engineering integrity.

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

### 1. Initiation: `/openflow/init`
Start here for any new project. It sets up the `AGENTS.md` guide and prepares your workspace for governed development.

### 2. Design Phase: `/openflow/brainstorm <feature>`
- **What it does**: Explores intent, asks clarifying questions, and proposes 2-3 approaches.
- **Intelligent Output**: Based on the complexity of the feature, it generates a tailored set of documents in `docs/changes/YYYY-MM-DD-feature/`, which may include:
  - `design.md`: Core architecture and technical solution (Primary).
  - `prd.md`: Product requirements and user scenarios (for high complexity features).
  - `requirements.md`: Explicit requirement definitions and constraints.
  - `proposal.md`: Initial problem framing and solution exploration.
  - `decisions.md`: Log of key architectural decisions and trade-offs.

### 3. Planning & Execution: `Prometheus` & `/startwork`
Once the design is finalized, use **omo's** native capabilities to bridge design to code:
- **Plan Generation**: Invoke omo's **Prometheus** agent to generate a detailed development plan based on the OpenFlow design workspace. OpenFlow will automatically **intercept** this plan to inject TDD tasks and design context.
- **Task Execution**: Run `/startwork` to trigger omo's execution engine. omo will work through the tasks while OpenFlow ensures the implementation context is always present.

### 4. Verification Phase: `/openflow/verify <feature>`
The gatekeeper. Before claiming success, you must run verify.
- **Drift Detection**: Automatically checks if the implementation has "drifted" from the approved design and requirements.
- **Evidence Phase**: Runs tests, security scans (secrets/vulns), and linting.
- **Readiness Phase**: Classifies the state as `Ready`, `ReadyWithDocUpdates`, `NotReady`, or `NeedsDecision`.
- **The Iron Law**: No completion claims without fresh verification evidence.

### 5. Closure: `/openflow/archive <feature>`
The final authority.
- **Canonicalization**: Moves working docs to `docs/archive/`.
- **Promotion**: Updates `docs/current/` to reflect the new system state.
- **Mapping**: Generates the `implementation-mapper.md` for permanent traceability.

### 6. Maintenance: `/openflow/status` & `/openflow/config`
- **Status**: Check the current state of all active feature sessions and their readiness.
- **Config**: View or update your OpenFlow settings on the fly.

---

## ⚙️ Configuration

Add this to your `opencode.json`:

```json
{
  "plugins": ["@fastknife/openflow"],
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

OpenFlow is deeply integrated with the **omo (oh-my-openagent)** runtime.

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

## 🤝 Comparison: OpenFlow vs. Superpowers

| Feature | OpenFlow + omo | Superpowers |
| :--- | :--- | :--- |
| **Integration** | Deep Native (Hook-level) | Generic (Prompt-level) |
| **Workflow** | Hard Gate (Strict Enforcement) | Soft Guidance (Suggestions) |
| **Traceability** | Auto-generated Mapping Table | Manual Documentation |
| **Context** | Zero-Config Auto-Injection | Manual Context Loading |
| **Maintenance** | Designed for long-term governance | Designed for fast execution |

---

## 📄 License

MIT License. Developed by [fastknife](https://github.com/fastknifes).
