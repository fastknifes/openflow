# Requirements: VitePress Documentation Site

## Functional Requirements

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-1 | 使用 VitePress 构建静态文档站点 | Must | 技术选型决策 |
| FR-2 | 站点源码位于本项目 `website/` 目录下 | Must | 架构决策 |
| FR-3 | 支持中文内容，首页、导航、侧边栏均为中文 | Must | 用户需求 |
| FR-4 | 预留 VitePress i18n 结构，后续可扩展英文 | Should | 用户需求 |
| FR-5 | 生成可搜索的文档站点（VitePress 内置本地搜索） | Must | 用户体验 |
| FR-6 | 通过 GitHub Actions 自动构建并部署到 GitHub Pages | Must | 部署策略 |
| FR-7 | `docs/guide/installation.md` 内容迁移到站点 `guide/installation.md` | Must | 内容迁移 |
| FR-8 | README 内容按用户场景重组修正后，分散到站点各章节 | Must | 内容策略 |
| FR-9 | 包含首页（Hero）、导航栏、侧边栏、页脚 | Must | 站点基础 |
| FR-10 | 站点大纲覆盖：介绍、快速开始、场景指南、命令参考、产品亮点、FAQ | Must | 内容规划 |
| FR-11 | `website/` 构建不影响主项目 `npm run build` 和 `npm publish` | Must | 隔离性要求 |

## Non-Goals

| ID | Description |
|---|---|
| NG-1 | 不自动生成 API 文档（如从 TypeScript 源码生成） |
| NG-2 | 不自动生成全文内容，内容骨架生成后由用户手动完善 |
| NG-3 | 不包含贡献者开发手册（Developer Handbook） |
| NG-4 | 不迁移 OpenFlow 内部治理文档（`docs/current/`、`docs/changes/` 等）到站点 |
| NG-5 | 不在本次 feature 中完成英文版内容 |

## Constraints

| ID | Constraint |
|---|---|
| C-1 | 不影响 `package.json` 的 `files` 字段（当前只包含 `dist`、`templates`、`README.md`） |
| C-2 | 不影响现有 `docs/` 目录的治理结构（current/changes/archive/decisions/guide） |
| C-3 | 不增加主项目的运行时依赖 |
| C-4 | GitHub Pages 部署使用免费配额，无额外成本 |
| C-5 | 构建产物（`website/.vitepress/dist`）不提交到 git |

## Acceptance Criteria

- [ ] `npm run dev` 在 `website/` 目录下可本地预览站点
- [ ] `npm run build` 在 `website/` 目录下成功生成 `website/.vitepress/dist`
- [ ] GitHub Actions workflow 在 push 到 master 时自动构建并部署
- [ ] GitHub Pages 访问正常，首页、导航、搜索功能可用
- [ ] `guide/installation.md` 已迁移，原 `docs/guide/installation.md` 已删除
- [ ] 站点大纲中所有章节文件已创建（至少包含 frontmatter 和占位内容）
- [ ] 主项目 `npm run build` 和 `npm run typecheck` 不受影响
