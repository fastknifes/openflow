# openflow-archive-design Feature State

- Status: `complete`
- Feature: `openflow-archive-design`
- Updated At: 2026-06-01T01:37:41.990Z

## Feature Brief

Not specified

## Constraints

- 优化归档工作流，支持两种使用场景：\(1\) 计划驱动的开发工作流归档 \(2\) 用户直接提出的 ad-hoc 问题修复后归档
- 用户使用开发计划进行编码落地，验证通过后执行归档。这是当前的正式工作流路径。
- 用户经过多轮 bug 修复后，想把解决问题的办法记录下来，直接调用归档命令。不需要经过完整的 feature 工作流。
- 职责解耦 — 当前 archive.ts 是 1000+ 行的单一函数，需要拆分为独立模块/阶段
- 必须保持向后兼容：现有 archive 目录结构、acceptance state 格式、命令调用方式不变

## Assumptions

- None recorded.

## Generated Documents

- `F:\\ai-code\\openflow\\docs\\changes\\2026-06-01-openflow-archive-design\\design.md`
- `F:\\ai-code\\openflow\\docs\\changes\\2026-06-01-openflow-archive-design\\behavior.md`

## Next Steps

- [x] Review `design.md` and `behavior.md` for constraint sufficiency
- [ ] Address remaining 4 non-critical gaps (ArchiveBlocker type, ad-hoc change sources, cleanup ops, SC-003 baseline)
- [ ] Run `/openflow-writing-plan openflow-archive-design` when ready for implementation
