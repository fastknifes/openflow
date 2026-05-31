# frontend-design-ascii-preview Plan

## Goal

当 `/openflow-feature` 生成的需求属于前端页面、组件或交互类需求时，`design.md` 必须自动包含 ASCII 页面与交互预览，帮助用户在实现前确认布局和交互路径。

## Work Packages

1. Locate the feature design document generation path.
2. Add deterministic frontend detection and ASCII preview rendering in `src/phases/feature/design-renderer.ts`.
3. Add renderer tests for frontend inclusion and non-frontend exclusion.
4. Verify with targeted tests, typecheck/build, and OpenFlow quality gate.

## Acceptance Checks

- `## UI / Interaction ASCII Preview` appears only for frontend-like requirement models.
- The preview includes an ASCII page frame and an interaction flow.
- Existing required design headings remain stable.
