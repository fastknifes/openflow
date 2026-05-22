# workflow-conventions Specification

## Overview

This document specifies the organizational rules for OpenFlow's `docs/current/` documentation tree. It covers layout, naming, and content ownership boundaries between bounded-context directories.

## Content Ownership

| Topic | Owner Directory | What goes there |
|-------|-----------------|-----------------|
| Feature workflow (brainstorm, feature, plan, implement, quality-gate, archive) | `feature-lifecycle/` | Design and spec for the feature development cycle |
| Issue investigation (classify, resolve, issue-packet) | `issue-investigation/` | Design and spec for the issue triage cycle |
| AI reflection (self-trigger, categories, promotion) | `ai-self-governance/` | Design, spec, and facts for AI self-governance |
| Archive authority (implementation-mapper, current promotion, archive) | `archive-authority/` | Design for archive-time traceability |
| Drift detection (checkpoint, contract markers) | `drift-guardian/` | Design and spec for drift detection |
| Quality gate (TDD, evidence, harden, verify) | `quality-governance/` | Design and spec for quality verification |
| Tutorials, reflection cases, operational guides | `workflow/` | User-facing tutorials and AI reflection case files |

## Layout Rules

1. Each bounded-context directory is the sole authority for its topic.
2. No bounded-context directory should contain detailed design or spec for another context's topic.
3. Cross-references between directories are allowed via relative links; content duplication is not.
4. `requirements.md` files are no longer maintained. Requirements are expressed within `design.md` or `spec.md`.
5. Stub files (near-empty placeholder documents) should be deleted rather than kept.

## Migration Marker Policy

Historical migration markers from the initial docs restructuring are stale artifacts. They should be removed on contact during normal edits. No new migration markers should be added.

## Constraints

- This document does not define feature behavior, AI behavior, or command semantics.
- For those, see the owning bounded-context directory.
