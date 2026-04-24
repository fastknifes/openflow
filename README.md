# OpenFlow

[中文](./README_CN.md)

---

## Overview

OpenFlow is an OpenCode plugin that enhances the development workflow from requirements to archiving. It integrates best practices from oh-my-openagent, Superpowers, and OpenSpec into a unified workflow.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenCode IDE                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │ oh-my-openagent │  │         OpenFlow Plugin         │  │
│  │    (Built-in)   │  │                                 │  │
│  │                 │  │  ┌─────────┐ ┌─────────┐        │  │
│  │  - Prometheus   │  │  │Brainstorm│ │  TDD    │        │  │
│  │  - Sisyphus     │  │  │  Hook   │ │Enhancer │        │  │
│  │  - Explore      │  │  └─────────┘ └─────────┘        │  │
│  │  - Librarian    │  │  ┌─────────────────────────┐   │  │
│  │                 │  │  │     Archive Skill        │   │  │
│  └─────────────────┘  │  └─────────────────────────┘   │  │
│                        └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Reference Docs

Current architecture and design references live here:

- `docs/changes/openflow-init/design.md` - current shipped design for the OpenFlow init/docs workflow
- `docs/archive/openflow-init/implementation-mapper.md` - implementation traceability and archived delivery snapshot
- `docs/decisions/ADR-001-docs-governance-and-workflow.md` - architecture decision record for docs governance and workflow

These files currently reflect the implemented codebase more accurately than older proposal-style documents under `docs/`.

## Features

| Phase | Feature | Description |
|-------|---------|-------------|
| 1. Brainstorming | Explicit Entry | Detects new feature requests and teaches users to proactively run `/openflow/brainstorm <feature>` before design work |
| 1. Brainstorming | Design Workspace | Writes working design documents into dated change workspaces such as `docs/changes/2026-04-17-feature-name/`, with `design.md` as the default primary document |
| 1. Brainstorming | Optional Companion Docs | Adds `proposal` / `prd` / `decisions` only when the feature complexity or decision density justifies them |
| 2. Implementation Context | Context Injection | Prepares plan/design/requirements context for host execution without taking over runtime orchestration |
| 2. Plan Enhancement | TDD Hints | Adds TDD (Red-Green-Refactor) guidance to plans |
| 2. Plan Enhancement | Prompt Injection | Injects implementation context and verification requirements into agent tasks |
| 3. Verify | Evidence | Produces checks/results, observed behavior, intent-vs-actual deltas, doc alignment, conflicts, and missing evidence |
| 3. Verify | Readiness | Reports one of `ready`, `ready_with_doc_updates`, `not_ready`, or `needs_decision` before closure |
| 4. Archive | Final Authority | Performs canonicalization, current promotion, and archive freeze after a valid readiness state |
| 4. Archive | Implementation Mapper | Creates `implementation-mapper.md` with traceability and code mapping |
| 4. Archive | Snapshot Freeze | Copies design, requirements, and plans into the archive unit |

## Installation

```bash
npm install @fastknife/openflow
```

Add to your `opencode.json`:

```json
{
  "plugins": ["@fastknife/openflow"]
}
```

## Configuration

Configure in your `opencode.json`:

```json
{
  "openflow": {
    "brainstorming": {
      "enabled": true,
      "output_dir": "docs/changes",
      "auto_trigger": true,
      "generate_prd": true,
      "prd_output_dir": "docs/changes"
    },
    "tdd": {
      "enabled": true,
      "expand_threshold": 3
    },
    "verification": {
      "in_plan": true,
      "security": ["secret", "vuln"],
      "quality": ["lint", "typecheck", "test"],
      "auto_fix": false
    },
    "acceptance": {
      "enabled": true,
      "trigger_words_zh": ["调整", "改一下", "测试发现", "验收"],
      "trigger_words_en": ["adjust", "fix", "test found", "acceptance"],
      "doc_sync_prompt": true,
      "drift_detection": true
    },
    "archive": {
      "enabled": true,
      "output_dir": "docs/archive",
      "drift_check": true
    }
  }
}
```

## User-Facing Entry

### openflow/brainstorm

Use when starting a new feature implementation to clarify requirements and generate design documents.

Primary workflow entrypoint for new feature work:

```text
/openflow/brainstorm <feature-name>
```

If the user already knows they are starting a new feature, they should run this skill proactively instead of waiting for a reminder.

OpenFlow may still suggest this skill when it detects a new feature request, but it does not block research or implementation tools.

**Process:**
1. Explore project context
2. Ask clarifying questions (one at a time)
3. Propose 2-3 approaches with trade-offs
4. Write working documents into a dated change workspace such as `docs/changes/2026-04-17-{feature}/`
5. Treat `design.md` as the primary document and add `proposal.md` / `prd.md` / `decisions.md` only when needed

**Working Documents:**
- `docs/changes/{YYYY-MM-DD-feature}/design.md` - default primary design document
- `docs/changes/{YYYY-MM-DD-feature}/proposal.md` - optional problem framing and solution exploration
- `docs/changes/{YYYY-MM-DD-feature}/decisions.md` - optional decision log for complex trade-offs
- `docs/changes/{YYYY-MM-DD-feature}/prd.md` - optional PRD when user/problem/acceptance detail needs a separate artifact

## Verify Command

Use `/openflow/verify <feature-name>` as the single completion-readiness entrypoint before archive.

`Verify` does not make a change canonical and does not promote `current`. It establishes readiness through two internal phases:

### Evidence Phase

Produces an evidence packet with:

- Checks run / result
- Observed behavior summary
- Intent vs actual delta
- Doc alignment summary
- `current` / `decisions` conflict summary
- Known risks / missing evidence

Evidence can include security and quality checks such as secret scans, vulnerability scans, lint, type check, and tests.

### Readiness Phase

Reports one of four readiness states:

- `ready` - evidence is sufficient and the change may proceed to Archive
- `ready_with_doc_updates` - closure-ready, but Archive must confirm and apply explicit doc updates before canonicalization
- `not_ready` - evidence is insufficient or constraints are not met
- `needs_decision` - a rule-level, `current`-level, or explicit business decision is required

> **Principle:** Verify establishes readiness; Archive makes the change canonical.

## Init Command

Use `/openflow/init` when starting a new project or to refresh the OpenFlow docs guide in `AGENTS.md`.

**Behavior:**
- Creates or updates the root `AGENTS.md` file
- First run: Creates file with OpenFlow base template and managed docs guide block
- Re-run: Refreshes only the OpenFlow managed block, preserving all other content
- Safe repair: If markers are corrupted, appends a fresh valid block without rewriting corrupted areas

**Managed Block:**
Uses fixed markers `<!-- OPENFLOW DOCS GUIDE:BEGIN -->` and `<!-- OPENFLOW DOCS GUIDE:END -->` to wrap a Chinese-language guide explaining the `docs/current/*`, `docs/decisions/`, `docs/changes/`, and `docs/archive/` directory semantics and on-demand reading principles.

## Archive Command

Use `/openflow/archive <feature-name>` when a feature is complete and ready to be archived.

Archive is the final authority in the closure flow. It consumes the Verify readiness result, performs canonicalization, executes current promotion, and freezes the historical archive.

Only these readiness states may enter Archive:

- `ready`
- `ready_with_doc_updates`

The following states cannot proceed to Archive until resolved:

- `not_ready`
- `needs_decision`

**Generates:**
- `implementation-mapper.md` with code mapping and traceability
- Frozen copy of flat change-workspace documents (`design.md`, `proposal.md`, `decisions.md`, `prd.md`, `plan.md` when present)
- Archive snapshot for historical traceability
- Current-state updates through archive-time canonicalization and promotion

## Hooks

### chat.message
Detects likely new feature requests and prepends a soft reminder to run `/openflow/brainstorm <feature>`.

### tool.execute.before
Injects verification requirements and implementation context into agent tasks.

### tool.execute.after
- Enhances Prometheus plans with TDD hints and verification tasks
- Generates PRD when current design docs are written
- Tracks file changes for archive generation

### verify.readiness
Builds the Evidence packet and reports the Readiness state before archive.

### archive.authority
Uses the Verify readiness result to perform canonicalization, current promotion, and archive freeze.

## OpenFlow Tool

```bash
# Initialize AGENTS.md with OpenFlow docs guide
/openflow/init

# Start a brainstorm explicitly
/openflow/brainstorm user-login

# Verify readiness before archive
/openflow/verify <feature-name>

# Archive a feature
/openflow/archive <feature-name>

# Show OpenFlow status
/openflow/status

# Show current configuration
/openflow/config
```

## Directory Structure

```
.sisyphus/
├── plans/
│   └── {feature}.md          # Enhanced execution plans
├── builds/
│   └── {build-id}/
│       └── changes.json      # File change tracking
└── acceptance.local.md       # Acceptance state

docs/
├── current/
│   ├── design/             # authoritative completed-state design facts
│   ├── requirements/       # authoritative completed-state requirement facts
│   ├── spec/               # authoritative specifications
│   └── workflow/           # current workflow rules and guidelines
├── changes/
│   └── {YYYY-MM-DD-feature}/
│       ├── design.md       # stable primary design document
│       ├── proposal.md     # optional: problem framing and solution exploration
│       ├── decisions.md    # optional: decision log for complex trade-offs
│       ├── prd.md          # optional: created when a real PRD exists
│       └── plan.md         # optional: user-facing workspace mirror of the active plan
├── archive/
│   └── {YYYY-MM-DD-feature}/
│       ├── implementation-mapper.md  # mandatory: traceability and code mapping
│       ├── design.md       # conditional: copied if source exists
│       ├── proposal.md     # conditional: copied if source exists
│       ├── decisions.md    # conditional: copied if source exists
│       ├── prd.md          # conditional: copied if source exists
│       └── plan.md         # conditional: copied if source exists
├── decisions/
│   └── ADR-*.md            # architecture decision records (global rules)
└── references/
    ├── raw/                # external reference materials
    ├── notes/              # AI-generated summaries and indexes
    └── research/           # structured research on specific topics
```

**Conditional Workspace Files**: under `changes/` and `archive/`, `proposal.md` / `decisions.md` / `prd.md` / `plan.md` appear only when real documents exist. `design.md` remains the stable primary document. Historical migration is deferred; compatibility reads remain enabled for older nested files.

For current project-level architecture and design references in this repository, see `docs/changes/2026-04-15-openflow-init/design.md`, `docs/archive/2026-04-15-openflow-init/implementation-mapper.md`, and `docs/decisions/`.

## Brainstorm Workflow

For any new feature, the recommended habit is to start with the brainstorm command yourself:

```text
/openflow/brainstorm <feature-name>
```

Do not wait for OpenFlow to enforce this step. OpenFlow is intentionally non-blocking; the user is expected to enter brainstorm explicitly when they want to begin structured design work in the change workspace.

This is the primary workflow. The hook-based reminder is only a secondary assist for cases where the user starts with natural language instead of entering the brainstorm command directly.

When OpenFlow detects a likely new feature request, it suggests an explicit brainstorm step instead of enforcing a lock.

```text
User request about a new feature
  -> OpenFlow reminds user to run: /openflow/brainstorm <feature>
  -> User proactively enters brainstorm when ready to design
  -> If run, working docs are written under a dated workspace like docs/changes/2026-04-17-{feature}/ with design.md as the default primary document
  -> Continue implementation through the host runtime using the change workspace as the development source of truth
  -> Run /openflow/verify <feature>
     -> Evidence phase: collect checks, behavior, deltas, alignment, conflicts, and missing evidence
     -> Readiness phase: output ready / ready_with_doc_updates / not_ready / needs_decision
  -> Run /openflow/archive <feature-name> only when readiness is ready or ready_with_doc_updates
     -> Archive performs canonicalization, current promotion, and historical freeze
```

## Templates

OpenFlow includes templates for:

- **Design Documents**: `templates/`
  - `proposal.md` - Problem statement and success criteria
  - `design.md` - Architecture and component design
  - `decisions.md` - Design decisions with trade-offs

- **Requirements Documents**: `templates/`
  - `prd.md` - Product Requirements Document template with user stories and acceptance criteria


## API

### Exports

```typescript
export { OpenFlowPlugin, OpenFlowContext, OpenFlowConfig }
export { loadConfig }
export * from './utils'
export * from './phases/archive'
```

### Change Tracker

```typescript
import { createChangeTracker } from '@fastknife/openflow'

const tracker = await createChangeTracker({ projectDir: '/path/to/project' })
await tracker.trackChange({ filePath: 'src/file.ts', tool: 'write' })
const changes = await tracker.getChanges()
await tracker.flush()
```

### Build Cleaner

```typescript
import { cleanBuild, cleanAllBuilds } from '@fastknife/openflow'

// Clean specific build
await cleanBuild({ projectDir: '/path', buildId: 'build-xxx' })

// Clean old builds, keep recent 5
await cleanAllBuilds({ projectDir: '/path', keepRecent: 5 })
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Type check
npm run typecheck

# Run tests
bun test
```

## License

MIT
