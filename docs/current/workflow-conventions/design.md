# Workflow Conventions

## Purpose

This document records the current organizational conventions for OpenFlow's documentation structure and workflow entry points. It does not contain feature-specific design; each feature's design lives in its own bounded-context directory under `docs/current/`.

## Documentation Layout

```
docs/current/
  workflow-conventions/   — this directory: layout conventions, entry-point index
  ai-self-governance/     — AI reflection and self-governance rules
  archive-authority/      — implementation-mapper, current promotion, archive authority
  drift-guardian/         — checkpoint-based drift detection
  feature-lifecycle/      — feature workflow design (brainstorm → feature → plan → implement → quality-gate → archive)
  issue-investigation/    — issue investigation workflow design
  quality-governance/     — quality gate, TDD, evidence verification
  workflow/               — tutorials, AI reflection cases, operational guides
```

## Naming Conventions

- Bounded-context directories use kebab-case: `feature-lifecycle`, `drift-guardian`.
- Each bounded context contains zero or more of: `design.md`, `spec.md`, `facts.md`.
- `requirements.md` is no longer used; requirements are captured in `design.md` or `spec.md` directly.
- Historical source annotations from docs restructuring are considered stale and should be removed on contact.

## Entry Points

- Tutorial (Chinese): `docs/current/workflow/openflow-usage-tutorial.md`
- Tutorial (English): `docs/current/workflow/openflow-usage-tutorial.en.md`
- Command reference: see README "User Manual" section.
