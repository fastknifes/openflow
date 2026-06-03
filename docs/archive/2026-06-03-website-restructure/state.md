# website-restructure Feature State

- Status: `complete`
- Feature: `website-restructure`
- Updated At: 2026-06-03

## Feature Brief

重构 OpenFlow 官网内容架构：顶部导航精简为「介绍 / 使用指南」，删除重复与 stub 页面，合并教学流程为 3 个阶段，并以重写方式统一内容质量。

## Constraints

- 顶部导航只有「介绍」和「使用指南」
- 教学流程 3 阶段页必须包含「⚠️ 必须检查的文档」
- 所有流程图统一使用 Mermaid
- 不保留任何 stub / 🚧 页面
- 亮点机制保留 8 页技术详细版
- 进阶主题只保留「迁移已有文档」
- 内容以重写为主，现有页面仅作素材参考

## Generated Documents

- `docs/changes/2026-06-03-website-restructure/design.md`
- `docs/changes/2026-06-03-website-restructure/behavior.md`
- `docs/changes/2026-06-03-website-restructure/plan.md`

## Notes

- 本次为纯文档重构，未生成 `implementation-mapper.md`。
- 构建验证已通过（VitePress build success）。
