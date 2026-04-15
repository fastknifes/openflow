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

Current architecture and design documents live here:

- `docs/current/design/20260322-openflow-architecture.md` - current system architecture, module boundaries, runtime flows, and migration-state notes
- `docs/current/design/20260322-openflow-design.md` - current technical design, hook responsibilities, archive behavior, and design debt
- `docs/decisions/ADR-001-docs-governance-and-workflow.md` - architecture decision record for docs governance and workflow

These files reflect the implemented codebase more accurately than the older proposal documents under `docs/`.

## Features

| Phase | Feature | Description |
|-------|---------|-------------|
| 1. Brainstorming | Explicit Entry | Detects new feature requests and teaches users to proactively run `/openflow/brainstorm <feature>` before design work |
| 1. Brainstorming | Design Workspace | Writes working design documents into `docs/changes/{feature}/` with `design.md` as the default primary document |
| 1. Brainstorming | Optional Companion Docs | Adds `proposal` / `prd` / `decisions` only when the feature complexity or decision density justifies them |
| 2. Implementation Context | Context Injection | Prepares plan/design/requirements context for host execution without taking over runtime orchestration |
| 2. Plan Enhancement | TDD Hints | Adds TDD (Red-Green-Refactor) guidance to plans |
| 2. Plan Enhancement | Verification Tasks | Auto-generates security and quality checklists |
| 2. Plan Enhancement | Prompt Injection | Injects implementation context and verification requirements into agent tasks |
| 3. Acceptance | Auto Detection | Detects acceptance phase triggers and prompts for doc sync |
| 3. Acceptance | Drift Detection | Tracks changes made during acceptance phase |
| 4. Archive | Implementation Mapper | Creates `implementation-mapper.md` with traceability and code mapping |
| 4. Archive | Snapshot Freeze | Copies design, requirements, and plans into the archive unit |
| 4. Archive | Requirements Archive | Archives PRD documents alongside design and plan documents |

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
4. Write working documents into `docs/changes/{feature}/`
5. Treat `design.md` as the primary document and add `proposal` / `prd` / `decisions` only when needed

**Working Documents:**
- `docs/changes/{feature}/design/YYYYMMDD-design.md` - default primary design document
- `docs/changes/{feature}/design/YYYYMMDD-proposal.md` - optional problem framing and solution exploration
- `docs/changes/{feature}/design/YYYYMMDD-decisions.md` - optional decision log for complex trade-offs
- `docs/changes/{feature}/requirements/YYYYMMDD-prd.md` - optional PRD when user/problem/acceptance detail needs a separate artifact

## Verification Behavior

OpenFlow injects verification requirements when work is nearing completion or when verification-oriented tasks are being prepared.

OpenFlow's recommended verification UX is non-blocking: near completion, the system should first suggest the verification steps, then let the user choose whether to run them immediately or skip for now.

**Security Checks:**
- Secret Scan (trufflehog, gitleaks)
- Vulnerability Scan (npm audit, pip-audit)

**Quality Checks:**
- Lint (ESLint, Ruff)
- Type Check (tsc, mypy)
- Tests (jest, pytest)

## Archive Command

Use `/openflow/archive <feature-name>` when a feature is complete and ready to be archived.

**Generates:**
- `implementation-mapper.md` with code mapping and traceability
- Frozen copy of change-workspace design / requirements / plans
- Archive snapshot for historical traceability
- Current-state updates only after archive-time review of completed changes

## Hooks

### chat.message
Detects likely new feature requests and prepends a soft reminder to run `/openflow/brainstorm <feature>`.

### tool.execute.before
Injects verification requirements and implementation context into agent tasks.

### tool.execute.after
- Enhances Prometheus plans with TDD hints and verification tasks
- Generates PRD when current design docs are written
- Tracks file changes for archive generation

### acceptance.trigger
Detects acceptance phase triggers.

### acceptance.prompt
Prompts for document synchronization during acceptance.

## OpenFlow Tool

```bash
# Start a brainstorm explicitly
/openflow/brainstorm user-login

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
│   └── {feature}/
│       ├── design/         # working design docs, with design.md as the default primary doc
│       ├── requirements/   # optional working PRD / requirement docs
│       └── plans/          # feature execution plans
├── archive/
│   └── {feature}/
│       ├── implementation-mapper.md
│       ├── design/
│       ├── requirements/
│       └── plans/
├── decisions/
│   └── ADR-*.md            # architecture decision records (global rules)
└── references/
    ├── raw/                # external reference materials
    ├── notes/              # AI-generated summaries and indexes
    └── research/           # structured research on specific topics
```

For current project-level architecture and design references, see `docs/current/design/` and `docs/decisions/`.

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
  -> If run, working docs are written under docs/changes/{feature}/ with design.md as the default primary document
  -> Continue implementation through the host runtime using the change workspace as the development source of truth
```

## Templates

OpenFlow includes templates for:

- **Design Documents**: `templates/design/`
  - `proposal.md` - Problem statement and success criteria
  - `design.md` - Architecture and component design
  - `decisions.md` - Design decisions with trade-offs

- **Requirements Documents**: `templates/requirements/`
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
