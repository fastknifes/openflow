# Proposal: VitePress Documentation Site

## Problem Framing

OpenFlow 项目的用户文档目前分散在：
- `README.md` — 内容过于庞大（570+ 行），且存在夸大和过时的描述
- `docs/guide/installation.md` — 单独的安装指南，与 README 有重复
- `docs/current/workflow/*.md` — 教程文档，嵌在治理目录中，不易被发现
- `docs/decisions/ADR-*.md` — 架构决策，对用户不透明

这导致两个问题：
1. **新用户难以快速找到信息**：README 太长，结构扁平，没有导航
2. **文档与代码版本不同步**：README 的夸大和过时内容无法快速迭代修正

## Goal

建立一个独立的、可导航的、可搜索的文档站点，用于承载 OpenFlow 的用户手册。站点使用 GitHub Pages 部署，保持与代码仓库的版本同步。

## Approaches Considered

| 方案 | 描述 | 优劣 |
|---|---|---|
| A. 独立仓库 | 新建 `openflow-docs` 仓库 | 隔离性好，但维护两个仓库，版本同步成本高 |
| B. 单独分支 (`gh-pages`) | 构建产物推送到 `gh-pages` 分支 | 主分支干净，但构建推送流程繁琐 |
| C. **本项目 `website/` 目录** | 源码放 `website/`，GitHub Actions 部署 | 版本天然同步，维护简单，不影响 npm 包 |

**选定方案 C。** 项目尚未对外发布，无外部硬链接依赖，可安全迁移 `docs/guide/installation.md`。

## Content Strategy

- **定位**：用户手册（面向使用 OpenFlow 的终端用户），不是贡献者开发手册
- **视角**：站在用户使用角度，按场景组织，不解释内部实现
- **语言**：中文优先，VitePress 预留 i18n 结构，后续补充英文
- **内容来源**：
  - `docs/guide/installation.md` → 迁移到 `website/guide/installation.md`
  - `README.md` → 内容重组修正后，分散到 `introduction/`、`guide/`、`reference/`
  - 新增 `highlights/` 章节，突出产品差异化卖点

## Key Design Decisions (Preliminary)

1. `docs/` 目录保持为 OpenFlow 内部治理文档（current/changes/archive/decisions），不与公开站点混用
2. `website/` 有独立的 `package.json`，不影响主项目的 `npm run build`
3. GitHub Pages 使用 "GitHub Actions" 部署源，不依赖 `gh-pages` 分支
4. 站点构建触发条件：`website/**` 或 `.github/workflows/deploy-handbook.yml` 变更时
