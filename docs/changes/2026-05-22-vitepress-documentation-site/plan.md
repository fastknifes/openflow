# Plan: vitepress-documentation-site

## Overview

重构 OpenFlow VitePress 官网，将早期骨架站点升级为双导航、可直接面向用户的文档站。当前实施以用户确认的新方向为准：指南 / 教程、安装双路径、可选 OMO/GitNexus、Issue 上下文合并到质量门/归档链路，以及六张机制图解。

## Tasks

- [x] 1. 重构 `website/.vitepress/config.ts` 为“指南 / 教程”双导航。
- [x] 2. 新增 `website/guide/` canonical 页面：概览、核心概念、亮点、图解、对比、目录约定。
- [x] 3. 新增 `website/tutorial/` canonical 页面：安装、LLM 自动安装、快速上手、Feature、Implement、质量门归档、Issue 上下文、迁移、命令、FAQ、排查。
- [x] 4. 新增 `website/public/diagrams/` 六张 SVG 图。
- [x] 5. 将旧路径页面改为迁移提示，避免 stale docs 被搜索命中。
- [x] 6. 更新 README / README_CN，引用新安装文档。
- [x] 7. 运行 `lsp_diagnostics` 检查 VitePress config。
- [x] 8. 运行旧路径/占位内容 grep 检查。
- [x] 9. 运行 `cd website && npm run build`。
- [ ] 10. 运行 OpenFlow quality gate 并解决 readiness issue。

## Verification Evidence

- `lsp_diagnostics website/.vitepress/config.ts`: no diagnostics.
- `grep` 检查 `🚧|正在建设中|旧导航硬链接`: no matches.
- `cd website && npm run build`: passed.
- `gitnexus_detect_changes(scope=all)`: low risk, documentation-only affected flows.

## Quality Gate Alignment

此前 quality gate 发现 design 与实现不一致，是因为 active design 仍记录旧五段式骨架站点。本计划与 `design.md`、`requirements.md` 已同步为用户确认的新大重构方向。后续 quality gate 应以当前文件为实现基线。
