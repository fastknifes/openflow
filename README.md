# OpenFlow

[中文](./README_CN.md)

---

## Overview

OpenFlow is an OpenCode plugin that enhances the development workflow from requirements to archiving. It integrates best practices from oh-my-openagent, Superpowers, and OpenSpec into a unified workflow.

## Features

| Phase | Feature | Description |
|-------|---------|-------------|
| 1. Brainstorming | Auto Detection | Detects new feature requirements and suggests brainstorming |
| 2. Plan Enhancement | TDD Hints | Adds TDD (Red-Green-Refactor) guidance to plans |
| 2. Plan Enhancement | Verification Tasks | Auto-generates security and quality checklists |
| 3. Archive | SRS Generation | Creates Software Requirements Specification with code mapping |

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

## Installation

### Step 1: Install the package

```bash
npm install @fastknife/openflow
```

### Step 2: Configure opencode.json

Create or update `opencode.json` in your project root:

```json
{
  "plugins": ["@fastknife/openflow"],
  "openflow": {
    "brainstorming": {
      "enabled": true,
      "output_dir": "docs/design",
      "auto_trigger": true
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
    "archive": {
      "enabled": true,
      "output_dir": "docs/archive"
    }
  }
}
```

### Step 3: Restart OpenCode

After configuration, restart OpenCode or reload the configuration. The plugin will:
- Auto-register skills to `.opencode/skills/openflow/`
- Enable hooks for brainstorming detection and plan enhancement

## Configuration Options

Add to your `opencode.json`:

```json
{
  "plugins": ["@fastknife/openflow"],
  "openflow": {
    "brainstorming": {
      "enabled": true,
      "output_dir": "docs/design",
      "auto_trigger": true
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
    "archive": {
      "enabled": true,
      "output_dir": "docs/archive"
    }
  }
}
```

## Usage

### 1. Brainstorming (Automatic)

When you mention a new feature, OpenFlow suggests running the brainstorming skill:

```
User: "Implement user login feature"
→ OpenFlow: Consider running openflow-brainstorm skill
```

### 2. Plan Enhancement (Automatic)

When Prometheus generates a plan, OpenFlow automatically:
- Adds TDD guidance for implementation tasks
- Appends verification checklist

### 3. Archive (Manual)

When a feature is complete:

```
skill(name="openflow-archive", feature="user-login")
```

This creates:
```
docs/archive/user-login/
├── srs/
│   └── srs.md          # Software Requirements Specification
├── design/             # Design documents (copied)
└── plan/               # Execution plan (copied)
```

## Available Skills

| Skill | Trigger | Purpose |
|-------|---------|---------|
| `openflow-brainstorm` | New feature | Clarify requirements, generate design docs |
| `openflow-verify` | Before archive | Run security and quality checks |
| `openflow-archive` | Feature complete | Generate SRS and archive artifacts |

## Commands

| Command | Description |
|---------|-------------|
| `openflow archive <feature>` | Archive a completed feature |
| `openflow status` | Show plugin status |
| `openflow config` | Display current configuration |

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@opencode-ai/plugin` | latest | OpenCode plugin API |
| `typescript` | ^5.9.3 | TypeScript compiler |
| `zod` | (peer) | Schema validation |

## Requirements

- Node.js >= 18.0.0
- OpenCode with oh-my-openagent

## Project Structure

```
openflow/
├── src/
│   ├── index.ts           # Plugin entry point
│   ├── config.ts          # Configuration loader
│   ├── types.ts           # Type definitions
│   ├── skills/            # Skill definitions
│   │   └── index.ts
│   └── utils/             # Utilities
│       ├── security.ts    # Path validation, input sanitization
│       ├── session.ts     # Session API integration
│       ├── errors.ts      # Error handling
│       └── logger.ts      # Logging
├── dist/                  # Compiled output
├── docs/
│   └── srs/               # SRS documentation
└── package.json
```

## License

MIT
