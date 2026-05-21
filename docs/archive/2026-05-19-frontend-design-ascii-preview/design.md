# frontend-design-ascii-preview - Design

## Human Consensus Summary

Feature title: 前端需求 design.md ASCII 预览
Internal slug: frontend-design-ascii-preview
Problem or improvement target: `/openflow-feature` 生成前端类 `design.md` 时，用户缺少页面结构与交互方式的直观预览。
Expected result: 当前端需求被识别时，`design.md` 自动包含 ASCII 页面与交互预览；非前端需求不增加该段落。

## Scope

- In scope: `src/phases/feature/design-renderer.ts` 的前端需求识别与 ASCII 预览渲染。
- In scope: `tests/phases/feature/design-renderer.test.ts` 的前端/非前端覆盖。
- Out of scope: 修改 OpenFlow command 注册方式或交互式 `/openflow-feature` 状态机。

## Design Constraints

- [must] 预览必须由 renderer 生成，保证所有 feature 文档生成路径行为一致。
- [must] 非前端需求不能出现 `## UI / Interaction ASCII Preview`，避免污染后端/流程类设计文档。
- [should] ASCII 预览应包含页面结构、主要动作和交互反馈路径，供用户实现前确认。

## Success Criteria

- [ ] 前端需求生成的 `design.md` 包含 ASCII 页面与交互预览。
- [ ] 非前端需求生成的 `design.md` 不包含该预览段落。
- [ ] renderer 单测、typecheck、build 通过。

## Verification

- `npx bun test tests/phases/feature/design-renderer.test.ts`
- `rtk npm build`
- `openflow-quality-gate frontend-design-ascii-preview`
