# Quality Gate Scope Contamination Resolution Plan

## Scope

Fix quality-gate scope contamination for issue `quality-gate-scope-contamination`.

## Implementation Files

- `src/commands/quality-gate.ts`
- `src/commands/harden.ts`
- `src/utils/diff-scope.ts`
- `src/utils/change-units.ts`
- `tests/quality-gate/quality-gate.test.ts`
- `tests/utils/change-units.test.ts`
- `docs/changes/2026-05-17-quality-gate-scope-contamination/issue-clarification.md`
- `docs/changes/2026-05-17-quality-gate-scope-contamination/issue-resolution.md`
- `docs/changes/2026-05-17-quality-gate-scope-contamination/promotion-candidate.md`

## Verification

- Run targeted quality-gate regression tests.
- Run change-unit fallback regression test.
- Run TypeScript typecheck.
- Run build.
- Run full test suite.
