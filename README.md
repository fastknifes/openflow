# OpenFlow

[![npm version](https://img.shields.io/npm/v/@fastknife/openflow.svg)](https://www.npmjs.com/package/@fastknife/openflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

[中文文档](./README_CN.md)

**OpenFlow is a governance layer for AI-driven development.** It doesn't start with "how should we write this?" — it starts with **"what exactly is the boundary of the problem, which constraints must not move, and what evidence counts as done?"**

Built for brownfield systems where requirement traceability, verification evidence, and archival authority matter more than speed of first output.

## Key Features

| Feature | Description |
|---------|-------------|
| **Requirement ↔ Code Traceability** | Each archived feature generates `implementation-mapper.md` — requirements precisely mapped to files, functions, and symbols |
| **Evidence-Based Quality Gates** | Quality gate isn't "I think it's fixed" — lint, typecheck, test must all pass, plus explicit readiness classification (Ready / NotReady) |
| **Project-Level Long-Term Memory** | Three-layer document structure (current / decisions / archive) preserves project knowledge across staff changes, session losses, and agent switches |
| **Dual Workflow Modes** | Feature workflow for clear-boundary changes; Issue workflow for boundary-ambiguous problems |

## Quick Start

### Prerequisites

- **Node.js** >= 18.0.0
- **OpenCode** with plugin support (configured via `opencode.json`)

### For LLM Agents (Claude Code, Cursor, Trae, etc.)

```
Install and configure OpenFlow:
1. Run: npm install @fastknife/openflow
2. Add to opencode.json: { "plugins": ["@fastknife/openflow"] }
3. Restart the agent session

Full installation guide: https://fastknifes.github.io/openflow/getting-started/installation
```

### Manual Installation

```bash
npm install @fastknife/openflow
```

Then enable the plugin in your `opencode.json`:

```json
{
  "plugins": ["@fastknife/openflow"]
}
```

## Core Workflows

### Feature Workflow (Mode 1)

For boundary-clear changes: new features, requirement modifications, refactoring.

```
brainstorm → feature → writing-plan → implement → quality-gate → archive
```

### Issue Workflow (Mode 2)

For boundary-ambiguous problems: investigate first, classify, then decide next steps.

```
issue → investigate → classify → decide → next step
```

## Documentation

**Full documentation: [https://fastknifes.github.io/openflow/](https://fastknifes.github.io/openflow/)**

| Section | Description |
|---------|-------------|
| [Getting Started](https://fastknifes.github.io/openflow/getting-started/quickstart) | 10-minute quick start guide |
| [Core Concepts](https://fastknifes.github.io/openflow/introduction/concepts) | Behavioral documentation constraints, directory structure, workflow patterns |
| [Quality Gates](https://fastknifes.github.io/openflow/highlights/quality-gate) | Evidence verification and readiness classification |
| [Comparison](https://fastknifes.github.io/openflow/introduction/comparison) | How OpenFlow differs from OpenSpec, GSD, etc. |

## Project Structure

```
project/
├── docs/
│   ├── current/           # Currently valid facts, designs, specifications
│   ├── decisions/         # Cross-feature architectural decisions
│   ├── changes/           # In-progress feature/change workspaces
│   └── archive/           # Frozen historical context and formal records
├── .sisyphus/             # Internal state (plans, builds, acceptance) - not committed
└── opencode.json          # Plugin configuration
```

## When to Use OpenFlow

| Your Scenario | Recommendation |
|--------------|----------------|
| Brownfield project with production traffic and legacy constraints | **OpenFlow is ideal** |
| Need unified cycle: requirement clarification → investigation → evidence → archive | **OpenFlow is ideal** |
| Team lead or architect caring about governance and auditability | **OpenFlow is ideal** |
| Personal prototype where first-output speed matters most | Consider lighter tools |
| Team only wants a lightweight specification layer | Consider lighter tools |

## License

MIT License. Developed by [fastknife](https://github.com/fastknifes).
