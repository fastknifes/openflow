# OpenFlow: The Governance Layer for AI-Driven Development

[中文文档](./README_CN.md) | [Architecture](./docs/decisions/ADR-001-docs-governance-and-workflow.md)

## 📍 Document Portal

| You want to… | Go here |
|---|---|
| 🚀 **Get started now** — 10-minute hands-on tutorial | [English Tutorial](./docs/current/workflow/openflow-usage-tutorial.en.md) · [中文教程](./docs/current/workflow/openflow-usage-tutorial.md) |
| 📋 **Look up a command** — syntax, parameters, examples | [User Manual ↓](#-user-manual) |
| 🏗️ **Understand the architecture** — docs model, governance, workflow design | [ADR-001: Docs Governance](./docs/decisions/ADR-001-docs-governance-and-workflow.md) · [Config reference](#%EF%B8%8F-configuration) |
| ❓ **Avoid mistakes** — common pitfalls and FAQ | [Tutorial §10 (Mistakes)](./docs/current/workflow/openflow-usage-tutorial.en.md#10-common-mistakes) · [Tutorial §15 (FAQ)](./docs/current/workflow/openflow-usage-tutorial.en.md#15-faq) |

---

## 💎 Why OpenFlow?

OpenFlow is not the lightest AI workflow, and it is not the fastest one to start with.

It is built for a different class of problem:

- You are working in a **brownfield system**, not a throwaway demo
- The hard part is **clarifying the problem boundary**, not just generating code
- You cannot accept AI changes that only look plausible without leaving a reliable trail
- You need a governed chain from requirement to implementation to verification to archive
- You want project knowledge to survive people changes, session loss, and agent turnover instead of living in handoff conversations

One-line definition:

> OpenFlow does not start with “how should we write this?” It starts with “what exactly is the boundary of the problem, which constraints must not move, and what evidence counts as done?”

That is the real difference between OpenFlow and projects like OpenSpec, GSD, or Superpowers.

---

## 🧭 Who It Fits, And Who It Doesn't

### A Better Fit For

- Brownfield projects with production traffic, legacy behavior, and historical constraints
- Teams that want one loop for requirement clarification, issue investigation, verification evidence, and archival traceability
- Architects, tech leads, and platform teams that care about governance, reviewability, and handoff quality
- Real engineering situations where the symptom might be a bug, bad data, config drift, environment breakage, or semantic ambiguity

### Not Always A Good Fit For

- Personal prototypes where speed of first output matters most
- Teams that just want a lightweight spec layer before implementation
- Teams that do not intend to maintain `docs/current`, `docs/changes`, and `docs/archive`
- Workflows where “the code runs” is enough and formal evidence/archive authority is unnecessary

If your primary goal is “start faster,” OpenSpec or GSD will often feel lighter.
If your primary goal is “clarify the boundary first, then let AI land the change safely,” OpenFlow is the better fit.

---

## 🧠 The Engineering Philosophy

OpenFlow is closer to a Socratic engineering method:

- Do not rush into code generation
- Clarify the problem definition first
- Draw the change boundary first
- Make explicit which facts, semantics, and constraints must not silently change
- Define what evidence is sufficient before claiming completion

Most tools assume the user already knows what should be built.
OpenFlow explicitly handles a more realistic question:

> The user described a symptom. Does that symptom mean a bug, bad data, broken config, environment failure, or simply an unclear requirement?

Until that boundary is clear, writing code is often just a faster way to inject uncertainty into the system.

---

## 🧬 Project-Scale Long-Term Memory

OpenFlow does not just maintain documents. It maintains a **project-scale long-term memory layer**:

- `docs/current/*`: facts, design, and workflow conventions that are still in force
- `docs/current/workflow/ai-reflection/*`: AI self-reflection records — repeatable workflow/process mistakes captured by the AI itself
- `docs/decisions/*`: key architectural decisions and why the system looks the way it does
- `docs/changes/*`: how a change was proposed, clarified, implemented, and verified
- `docs/archive/*`: frozen historical context and official records

That means:

- New team members do not need to rely on verbal handoff to understand the system
- Critical design intent does not leave with the people who knew it best
- When AI sessions, models, or execution contexts change, project knowledge does not reset with them
- The team depends on shared memory instead of “the one person who knows everything”

For a team, this is more than “having docs.” It is an externalized memory layer that can actually be maintained over time.

---

## ⚖️ Why Not Just Pick OpenSpec / GSD?

These projects are not really the same category of tool. They only look similar from a distance because all of them operate around AI development workflows.

| Dimension | OpenSpec / GSD Stronger At | OpenFlow Stronger At |
|-----------|----------------------------|----------------------|
| Startup speed | Faster, lighter, easier to adopt in 5 minutes | Higher setup cost because the governance model matters |
| Best-fit scenario | Feature development when the goal is already known | Ambiguous problem investigation + governed implementation |
| User mindset | “Define what to build first” | “Define the boundary first, then decide how to change” |
| Definition of done | Plan, execute, implement | Evidence, readiness, archive authority |
| Brownfield governance | Helpful, but not the main pitch | One of the core reasons to adopt it |
| Team continuity | More focused on single-change flow | Builds durable shared memory through `current` / `decisions` / `archive` |

So the more accurate framing is not “OpenFlow replaces OpenSpec / GSD,” but:

- OpenSpec / GSD help organize implementation for already-understood goals
- OpenFlow helps organize problem boundaries, verification evidence, and archival traceability for governed change

---

## 🎯 Two Workflow Modes

OpenFlow has two workflows not because it wants to be complex, but because real projects contain two fundamentally different kinds of work:

1. You already know what should change
2. You only know that something is wrong, but you do not yet know what category of problem it is

If you force both into the same workflow, AI usually starts coding too early.

### 🛠️ Mode 1: Feature/Change Workflow (Similar to OpenSpec)

For **clear-boundary** work: new features, requirement changes, refactors.

```
[brainstorm →] feature → writing-plan → implement → quality-gate → archive
     ↑  optional                          ↑
  conversational only          Two implementation paths:
  explore intent first          1. OpenCode: plan → build
  when requirements unclear     2. omo: Prometheus → /startwork
```

- **[brainstorm]**: Conversational exploration (optional) — when requirements are unclear, use `openflow-brainstorm` Skill for collaborative discussion before formalizing. No documents generated.
- **feature**: Generate formal design proposal and constraints with `/openflow-feature`
- **writing-plan**: Generate a structured implementation plan from design
- **implement**: Execute only after the change boundary is clear
- **quality-gate**: AI invokes `openflow-quality-gate` after implementation to decide whether adversarial hardening is needed, then verify evidence and readiness
- **archive**: Turns the change into official, traceable project history

### 🔍 Mode 2: Issue Investigation Workflow (Unique to OpenFlow)

For **unclear-boundary** work. Here the user is not giving you a clean requirement, but a symptom:

- “The data looks wrong”
- “The behavior is not what we expected”
- “Something seems broken in production”
- “The implementation does not match the docs”

These inputs should not automatically become bugfixes, and they should not immediately trigger code changes.

```
issue → investigate → classify → decide → next step
              ↑
         read-only evidence gathering
         No code/data modification
```

**Typical scenarios**:
- "API returning strange data" → Investigate first, don't assume it's a bug
- "User can't see expected info" → Align semantics first, then decide on fix
- "Online data seems off" → Classify as code bug vs. data issue first
- "Behavior doesn't match docs" → Determine if docs issue or implementation issue

**Core principles**:
- **Don't assume issue type**: An issue report is not automatically a bugfix
- **Investigation is read-only**: Agent can inspect, but not change, before classification
- **Semantics before repair**: Decide what the system is actually supposed to mean first
- **Classification before implementation**: Identify the class of problem before writing code
- **Escalate only after the boundary is clear**: Move into feature / implement / quality-gate / archive when warranted

**Commands**:
```text
/openflow-issue <problem description>          # Start investigation
/openflow-issue <problem> --readonly          # Read-only investigation (no file modifications)
/openflow-issue <problem> --write-doc         # Output investigation doc to docs/changes/
/openflow-issue <problem> --resolve           # Fix and generate resolution artifacts (quality-gate handles harden/verify)
```

### 📋 Which Mode to Use?

| Scenario | Use This Workflow |
|----------|-----------------|
| Fuzzy idea, need to explore before committing | **`brainstorm`** → then `feature` |
| Add new feature (clear boundary) | `feature` → `implement` → `quality-gate` → `archive` |
| Modify existing feature with a clear boundary | `feature` → `implement` → `quality-gate` → `archive` |
| Uncertain problem discovered | **`issue`** |
| Online data anomaly | **`issue`** (might be data issue, not necessarily code) |
| Not sure whether it is a bug | Start with **`issue`**, do not patch immediately |
| Bug confirmed and the fix boundary is clear | Use **`issue`** first to confirm classification, then follow feature workflow |
| Bug confirmed, want to fix and verify in one step | **`issue --resolve`** |

---

## 🚀 Core Differentiators

### 🗺️ Requirement→Code Traceability
Every archived feature generates `implementation-mapper.md`—an implementation index for your codebase:
- Requirements precisely mapped to specific files, functions, symbols
- Never wonder "why does this code exist?" again

### 🧠 Current Facts + Global Decisions = Shared Team Memory
OpenFlow maintains more than feature docs. It continuously maintains global facts and architectural decisions:
- `current` records what is still true about the system
- `decisions` records key architectural judgments and their rationale
- Team changes, session loss, and context switches no longer wipe out system knowledge

### 🛡️ Quality Governance, Not Last-Minute Cleanup
OpenFlow controls code quality through a unified quality gate:
- **Front-loaded constraints**: TDD plan enhancement is enabled by default, pushing testing and verification requirements into the implementation plan
- **AI-driven quality gate**: After implementation, the AI invokes `openflow-quality-gate`, which decides whether adversarial hardening is needed based on change complexity, then performs evidence-aware verification
- **Final gate**: readiness classification (`Ready`, `ReadyWithDocUpdates`, `NotReady`, `NeedsDecision`) before the change can count as complete

That means quality is not something checked casually at the end. It is constrained before implementation, during implementation, and after implementation

### 🔍 Checkpoint-Based Drift Guardian

OpenFlow prevents documentation-code drift through a checkpoint-based Drift Guardian, not constant background monitoring:

- **Contract markers**: During feature design, `design.md` and `behavior.md` generate stable contract markers — explicit assertions about what the code must satisfy
- **Plan-embedded checkpoints**: `/openflow-writing-plan` reads contract markers and embeds Drift Guardian checkpoint tasks into the implementation plan
- **Write/edit phase**: Only light file-change recording during coding — no LLM calls, no blocking
- **Milestone semantic checks**: After each plan milestone completes, an async semantic drift review runs (using the configured model, falling back to omo librarian), comparing code against contract markers
- **Advisory only**: Semantic checks produce advisory evidence and pending findings — they never replace `quality-gate`/`verify` as the final readiness judge
- **Closed-loop traceability**: `archive`/`implementation-mapper` uses marker IDs to build a complete trace: `marker → plan task → checkpoint evidence → verify result → code`

This means drift is detected at natural checkpoints (not randomly mid-coding), never blocks AI execution, and always preserves verify's independent final authority.

### 🧠 Intelligent Constraint Derivation

Not a simple checklist. OpenFlow auto-derives technical constraints from your business priorities:
- "Fast delivery" → Auto-derives minimum viable scope constraints
- "Easy to maintain" → Auto-derives code clarity verification requirements
- "Minimize risk" → Auto-derives rollback path and regression coverage requirements

### 🪞 AI Self-Governance via Reflection

OpenFlow includes a self-governance mechanism for the AI itself. When the AI detects it made a repeatable workflow or process mistake, it self-triggers the `openflow-ai-reflection` skill:

- **Self-assessment trigger**: No user command, no background listener — the AI decides based on conversation context and tool output whether a mistake has recurrence value
- **Canonical categories**: `premature-implementation`, `verification-skipped`, `docs-misuse`, `delegation-misuse`, `context-loss`
- **Structured record**: Each reflection captures trigger, context, root cause, correct behavior, recurrence signal, corrective rule, and whether it should be promoted to a global rule
- **Accumulated learning**: Repeated mistakes of the same type accumulate in the same category document under `docs/current/workflow/ai-reflection/`, forming a persistent anti-pattern knowledge base
- **Promotion path**: Reflection lessons marked for promotion become candidates for `AGENTS.md`, skill updates, or global rules — but require human review before taking effect

This turns AI mistakes from "hope it doesn't happen again" into an explicit, searchable, improvable memory layer.

### 🧪 Evidence Gates, Not Verbal Completion
OpenFlow treats verify as a formal gate:
- Not “I think it is fixed”
- Not “the agent said it ran”
- But evidence, readiness, and an explicit decision about whether the change may enter archive

### 📦 Archive Is An Authority Boundary, Not A Dump Folder
OpenFlow treats archive as a formal closing stage:
- `verify` produces evidence and readiness
- `archive` freezes history, updates current facts, and generates implementation mapping
- That makes “done” an explicit engineering state, not just a conversational claim

### 🏗️ Better Fit For Brownfield Systems Than Demo-First Workflows
OpenFlow is structured for long-lived systems:
- Problems may be clarified before they are implemented
- High-risk changes receive automatic adversarial hardening via `openflow-quality-gate`
- Documentation, design, verification, and archive all constrain AI behavior together
- The model fits systems that already have history, constraints, and production reality

---

## ✨ See it in action

### Feature Development Workflow

```
You: /openflow-feature add dark mode
AI:  ✓ Clarified the change boundary: theme switching, localStorage persistence, component compatibility
     ✓ Generated design.md, requirements.md
     Design saved to docs/changes/2026-05-10-dark-mode/

You: [implement executes according to plan...]
AI:  [invokes openflow-quality-gate automatically]
     Drift detection: ✓ Passed
     Evidence: ✓ lint ✓ typecheck ✓ test
     Readiness: Ready

You: /openflow-archive dark mode
AI:  ✓ Archived to docs/archive/2026-05-10-dark-mode/
     ✓ Generated implementation-mapper.md (requirement→code traceability)
```

### Issue Investigation Workflow

```
You: /openflow-issue "API returning strange data"
AI:  ✓ Investigating...
     ✓ Similar historical issue found: 2026-04-28-api-data-format
     ✓ Classification: bugfix
     ✓ Recommended next step: Use --resolve to fix and verify

You: /openflow-issue "API returning strange data" --resolve
AI:  ✓ Generated issue-resolution.md (root cause, fix summary, recurrence signature)
     ✓ Generated promotion-candidate.md
     ✓ Complexity: trivial — quality-gate skipped harden
     ✓ Quality gate: Ready
```

---

## 🛠️ User Manual

Need a practical walkthrough instead of a command list? Read the step-by-step tutorial: [`docs/current/workflow/openflow-usage-tutorial.md`](./docs/current/workflow/openflow-usage-tutorial.md)

### 🎯 You Only Need Five Core Commands

```text
//openflow-brainstorm                    # Explore unclear requirements (optional)
/openflow-feature <feature>           # Design a feature (Mode 1)
/openflow-writing-plan <feature>      # Generate implementation plan
/openflow-issue <problem>            # Investigate a problem (Mode 2)
openflow-quality-gate                # AI-invoked post-implementation quality gate
```

---

### Core Workflow Commands

#### Brainstorm (Optional): `openflow-brainstorm` (AI-Invoked)
When requirements are unclear and the idea needs exploratory discussion before formal design:
- **What it does**: Conversational exploration — compare approaches, weigh trade-offs, clarify scope. Does NOT generate documents.
- **Typical use**: Before `/openflow-feature` when the problem space is still ambiguous. The AI invokes this Skill and guides the discussion. When ready, it suggests running `/openflow-feature` to formalize.
- **Boundary**: This is conversational only. It does not create files, manage state, or enforce a workflow.

#### 1. Initiation: `/openflow-init`
Start here for any new project. It sets up the `AGENTS.md` guide and prepares your workspace for governed development.

#### 2. Design Phase: `/openflow-feature <feature>`
- **What it does**: Explores intent, asks clarifying questions, and proposes 2-3 approaches.
- **Intelligent Output**: Based on the complexity of the feature, it generates a tailored set of documents in `docs/changes/YYYY-MM-DD-feature/`, which may include:
  - `design.md`: Core architecture and technical solution (Primary).
  - `prd.md`: Product requirements and user scenarios (for high complexity features).
  - `requirements.md`: Explicit requirement definitions and constraints.
  - `proposal.md`: Initial problem framing and solution exploration.
  - `decisions.md`: Log of key architectural decisions and trade-offs.

#### 3. Planning: `/openflow-writing-plan <feature>`
Once the design is clear, generate a structured implementation plan:
- **What it does**: Reads the design context and writes a parser-compatible development plan to both `docs/changes/{YYYY-MM-DD-feature}/plan.md` and `.sisyphus/plans/{feature}.md` (dual-save).
- **Typical use**: After `/openflow-feature` when you need a structured plan before implementation. The plan uses bounded work packages (not unlimited parallel decomposition) and includes budget warnings for oversized plans.
- **Important**: Stops after saving the plan. Does NOT automatically start implementation.

#### 4. Planning & Execution
Once the design is finalized, you can bridge design to code in more than one way:
- **With omo**: Use **Prometheus** to generate a development plan, then run `/startwork` to execute it with omo's agent workflow.
- **With native OpenCode flow**: Use `/openflow-writing-plan` to generate a structured plan, then rely on OpenCode's native **plan** and **build** workflow. OpenFlow's core role is still the same: keep design, requirements, decisions, verification, and archive constraints attached to implementation.

#### 5. Mid-Development Changes: `/openflow-change <feature> "<change description>"`
When requirements shift during active development (after feature design is done but before archive):
- **What it does**: Updates active design docs and constraints before code changes, then applies associated implementation changes.
- **Typical use**: A feature is in development, but requirements change. You don't want to start a whole new feature design cycle.

#### 6. Issue Clarification: `/openflow-issue <issue-name-or-description>`
Use this when the problem is still ambiguous and you do **not** want to assume it is a bug yet.
- **What it does**: Clarifies expectations, constraints, evidence, and current semantics before implementation.
- **Typical use**: Investigating wrong data, strange behavior, unclear business rules, config/environment issues, or cases where you first need to decide whether the next step is fix, further investigation, or feature.
- **Helpful flags**: `--readonly`, `--write-doc`, `--continue`, `--resolve`.
  - `--resolve` auto-generates `issue-resolution.md` and `promotion-candidate.md` after confirmed bugfix, then routes through quality-gate.

#### 7. Quality Gate: `openflow-quality-gate` (AI-Invoked)
After implementation, the AI invokes the `openflow-quality-gate` Skill automatically. See [Quality Governance ↓](#-quality-governance-not-last-minute-cleanup) for details.
- **What it does**: Decides whether risk-based adversarial hardening is needed, then performs evidence-aware verification.
- **Typical use**: Invoked automatically after any code change. You review the output for readiness classification.
- **Not a user command**: This is a Skill invoked by the AI, not a slash command users enter manually.

> **Internal capabilities**: The harden adversarial review and verify evidence collection capabilities are now coordinated internally by `openflow-quality-gate`. `/openflow-harden` and `/openflow-verify` are no longer normal user-facing workflow entrypoints. See ADR-004 for the decision.

#### 8. AI Reflection: `openflow-ai-reflection` (AI-Invoked, Internal)

When the AI detects it has made or nearly made a repeatable workflow or process mistake, it self-triggers the `openflow-ai-reflection` skill to record a reflection lesson. Users do not normally run a command for this. The trigger is AI self-assessment, not user invocation.

- **What it does**: Records a structured reflection case under `docs/current/workflow/ai-reflection/` so that future sessions can avoid the same category of mistake.
- **Canonical categories**: `premature-implementation`, `verification-skipped`, `docs-misuse`, `delegation-misuse`, `context-loss`.
- **Not a user command**: This is an internal skill.

#### 9. Closure: `/openflow-archive <feature>`
The final authority.
- **Canonicalization**: Moves working docs to `docs/archive/`.
- **Promotion**: Updates `docs/current/` to reflect the new system state.
- **Mapping**: Generates the `implementation-mapper.md` for permanent traceability.

---

### Advanced Commands

#### 10. Document Migration: `/openflow-migrate-docs --sourceDir <source-docs-dir> [--targetDir <target-dir>] [--dryRun]`
Use this when you need to migrate an existing docs tree from another workflow or project into the OpenFlow structure.
- **What it does**: Detects source doc structure, scans files, classifies them into `docs/current/`, `docs/changes/`, `docs/archive/`, `docs/decisions/`, and `docs/references/`, then asks for clarification before applying changes.
- **Typical use**: Migrating from OpenSpec, Spec Kit, Kiro, Cursor/Trae conventions, or a hand-maintained legacy `docs/` folder.
- **Important behavior**: Default flow is report-first and clarification-first; deleting originals is never automatic.

#### 11. Maintenance: `/openflow-status` & `/openflow-config`
- **Status**: Check the current state of all active feature sessions and their readiness.
- **Config**: View or update your OpenFlow settings on the fly.

---

## 🔌 Deep Integration: OpenCode + omo

OpenFlow runs as a governance layer in **OpenCode**, with optional deep integration with **oh-my-openagent (omo)**:

| Component | Responsibility |
|-----------|---------------|
| **omo** | Multi-agent orchestration, task execution, tooling |
| **OpenFlow** | Documentation governance, drift detection, acceptance constraints, archival traceability |

No omo? OpenFlow's core constraint model still works independently.

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
    "feature": {
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
    },
    "writingPlan": {
      "enabled": true
    },
    "guardian": {
      "enabled": true,
      "auto_fix": true
    }
  }
}
```

---

## 📈 What OpenFlow Delivers

| Metric | Without OpenFlow | With OpenFlow |
|--------|-----------------|---------------|
| Requirement traceability time | Manual search + guesswork | Open implementation-mapper.md, locate in 5 seconds |
| Drift detection timing | Discovered after user complaints | Checkpoint-based detection at plan milestones, verified at quality-gate |
| TDD execution rate | Depends on developer discipline | Auto-injected into execution plans |
| Issue handling | Default to bugfix, may misclassify | Triage classification, no assumption |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenCode IDE                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │ oh-my-openagent │  │         OpenFlow Plugin         │  │
│  │    (Runtime)    │◄─┤      (Governance Layer)         │  │
│  │                 │  │                                 │  │
│  │  - Context      │  │  - Contract Markers             │  │
│  │  - Execution    │  │  - Drift Guardian (checkpoint)  │  │
│  │  - Tooling      │  │  - Evidence Collection          │  │
│  │                 │  │  - AI Reflection                │  │
│  │                 │  │  - Implementation Mapping       │  │
│  └─────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📄 License

MIT License. Developed by [fastknife](https://github.com/fastknifes).
