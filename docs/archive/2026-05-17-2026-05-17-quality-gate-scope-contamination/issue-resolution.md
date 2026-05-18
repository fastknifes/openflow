# Issue Resolution

## Symptom

quality-gate-scope-contamination

## Root Cause

`handleQualityGate()` used the full workspace diff (`git diff HEAD`) and all untracked files for risk assessment, report output, and evidence freshness. That made unrelated local changes count toward quality-gate risk thresholds and stale-evidence decisions.

`handleHarden()` already had feature-aware diff scoping, but that logic was private to the harden command, so quality-gate could trigger harden because of files that harden itself would later omit.

## Fix Summary

Shared the feature diff-scoping logic through `src/utils/diff-scope.ts` and reused it from both harden and quality-gate. Quality-gate now scopes tracked diffs and untracked files to the active feature context before risk assessment and evidence freshness, while reporting scoped-out files separately for transparency.

## Files Involved

- `src/utils/diff-scope.ts` — shared feature diff/path scoping helper extracted from harden
- `src/utils/change-units.ts` — resolves existing dated change directories when the change-unit index is absent
- `src/commands/harden.ts` — imports shared scoping helper; preserves existing scoped harden behavior
- `src/commands/quality-gate.ts` — scopes changed files before risk assessment, freshness, and report output
- `tests/quality-gate/quality-gate.test.ts` — regression test for unrelated workspace changes
- `tests/utils/change-units.test.ts` — regression test for dated issue workspace fallback resolution
- `docs/changes/2026-05-17-quality-gate-scope-contamination/issue-clarification.md` — investigation record
- `docs/changes/2026-05-17-quality-gate-scope-contamination/issue-resolution.md` — resolution record

## Verification Evidence

- LSP diagnostics: no diagnostics for `src/commands/quality-gate.ts`, `src/commands/harden.ts`, `src/utils/diff-scope.ts`, `tests/quality-gate/quality-gate.test.ts`
- Targeted test: `bun test "tests/quality-gate/quality-gate.test.ts" "tests/utils/change-units.test.ts"` → 22 pass, 0 fail
- Typecheck: `rtk npm typecheck` → pass
- Build: `rtk npm build` → pass
- Full test suite: `rtk npm test` → 1335 pass, 0 fail

## Recurrence Signature

Look for quality-gate reports where changed-file counts, high-risk triggers, or evidence freshness include files unrelated to the active feature or issue workspace.

## Future AI Guidance

Before changing quality-gate risk or evidence freshness logic, verify whether the change should use feature-scoped files or full-workspace files. Full-workspace behavior should be limited to `limited`/`none` context where no reliable feature scope exists.
