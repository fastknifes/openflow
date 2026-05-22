# Design: VitePress Documentation Site

## Overview

使用 VitePress 为本项目构建用户文档站点，源码位于 `website/` 目录，通过 GitHub Actions 部署到 GitHub Pages。站点面向 OpenFlow 终端用户，按使用场景组织内容。

## Architecture

```
openflow/                          # 主仓库
├── src/                           # 插件源码（不受影响）
├── docs/                          # OpenFlow 内部治理文档（保持现状）
│   ├── current/
│   ├── changes/
│   ├── archive/
│   ├── decisions/
│   └── guide/installation.md      # ← 待删除，内容已迁移
├── website/                       # 【新增】VitePress 站点源码
│   ├── .vitepress/
│   │   ├── config.ts              # 站点配置（中文主导航、搜索、侧边栏）
│   │   ├── theme/                 # 自定义主题（如需）
│   │   └── locales/               # 预留 i18n 配置
│   ├── index.md                   # 首页（Hero + 特性展示 + 快速链接）
│   ├── introduction/
│   │   ├── index.md
│   │   ├── concepts.md            # 核心概念：行为文档约束、目录划分、工作流
│   │   ├── comparison.md          # 与竞品对比修正版
│   │   └── philosophy.md          # 工程哲学（含行为文档约束 rationale）
│   ├── getting-started/
│   │   ├── installation.md        # ← 从 docs/guide/installation.md 迁移
│   │   ├── quickstart.md          # 10 分钟上手
│   │   └── configuration.md       # 最小配置
│   ├── guide/
│   │   ├── feature-workflow.md    # 场景：开发新功能
│   │   ├── behavior-document-guide.md # 如何阅读、判断和确认 behavior.md
│   │   ├── implement-workflow.md  # omo vs opencode 两种实现方式
│   │   ├── mid-development-change.md
│   │   ├── migrate-existing-docs.md
│   │   └── archive-and-traceability.md
│   ├── reference/
│   │   ├── commands.md            # 命令速查
│   │   ├── config-options.md      # 配置项完整参考
│   │   └── directory-conventions.md
│   ├── highlights/
│   │   ├── quality-gate.md        # 质量门 + Harden 对抗
│   │   ├── drift-guardian.md      # 文档漂移检测 + SDD
│   │   ├── smart-archive.md       # DDD 限界上下文 + 异步归档
│   │   └── tdd-bdd-sdd.md         # 测试分层理念
│   └── public/                    # 静态资源（logo、截图等）
│   └── package.json               # 站点独立依赖（vitepress）
├── .github/
│   └── workflows/
│       ├── publish.yml            # 现有：npm 发布
│       └── deploy-handbook.yml    # 【新增】构建并部署到 GitHub Pages
└── package.json                   # 主项目（不受影响）
```

## Technology Stack

| Component | Choice | Version |
|---|---|---|
| Static Site Generator | VitePress | ^1.6.0 |
| Deployment | GitHub Actions + GitHub Pages | — |
| Search | VitePress Built-in Local Search | — |
| Theme | VitePress Default Theme + 自定义 CSS | — |

## VitePress Configuration

### `website/.vitepress/config.ts`

```typescript
import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'OpenFlow',
  description: '面向 AI 驱动开发的文档治理工作流',
  lang: 'zh-CN',
  base: '/openflow/',
  
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: '介绍', link: '/introduction/' },
      { text: '快速开始', link: '/getting-started/installation' },
      { text: '使用指南', link: '/guide/feature-workflow' },
      { text: '参考', link: '/reference/commands' },
    ],
    sidebar: {
      '/introduction/': [...],
      '/getting-started/': [...],
      '/guide/': [...],
      '/reference/': [...],
      '/highlights/': [...],
    },
    search: {
      provider: 'local'
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © fastknife'
    }
  },
  
  // 预留 i18n 结构
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN'
    }
    // en: { label: 'English', lang: 'en' } // 后续补充
  }
})
```

## Deployment Architecture

GitHub Pages 配置：`Settings → Pages → Source: GitHub Actions`

### `.github/workflows/deploy-handbook.yml`

```yaml
name: Deploy Handbook to GitHub Pages

on:
  push:
    branches: [master, develop]
    paths:
      - 'website/**'
      - '.github/workflows/deploy-handbook.yml'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: cd website && npm ci
      - run: cd website && npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: website/.vitepress/dist

  deploy:
    needs: build
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

## Content Migration Strategy

| Source | Target | Action |
|---|---|---|
| `docs/guide/installation.md` | `website/getting-started/installation.md` | 迁移内容，删除原文件 |
| `README.md`（介绍部分） | `website/introduction/index.md` | 重组修正 |
| `README.md`（Why OpenFlow / Philosophy） | `website/introduction/philosophy.md` | 重组修正 |
| `README.md`（Comparison） | `website/introduction/comparison.md` | 重组修正，修正夸大表述 |
| `README.md`（Workflow / Commands） | `website/guide/`、`website/reference/` | 按场景拆分 |
| `README.md`（Configuration） | `website/getting-started/configuration.md` | 迁移修正 |
| `docs/decisions/ADR-001` | `website/introduction/concepts.md` | 提取核心概念，不直接复制 |

## Isolation from Main Project

- `website/package.json` 独立管理，依赖 `vitepress` 不进入主项目 `node_modules`
- `.gitignore` 新增 `website/.vitepress/dist` 和 `website/.vitepress/cache`
- 主项目 `tsconfig.json` 的 `include` 排除 `website/`
- 主项目 `package.json` 的 `files`、`scripts` 均不引用 `website/`

## Key Design Decisions

1. **不使用 `gh-pages` 分支**：使用 GitHub Actions 直接部署，避免构建产物分支的管理负担
2. **`website/` 而非 `docs/` 作为站点源**：避免与 OpenFlow 内部治理文档 `docs/` 冲突
3. **中文为 `root` locale**：VitePress 默认语言为中文，后续添加英文时在 `locales` 中补充 `en`
4. **内容骨架优先**：本次 feature 只生成骨架文件（frontmatter + 章节标题 + 简要说明），具体内容由用户后续手动完善
5. **不迁移内部治理文档**：`docs/current/`、`docs/changes/` 等保持现状，不在站点中呈现

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `website/` 依赖与主项目冲突 | Low | Medium | 完全隔离的 package.json，无共享依赖 |
| GitHub Actions 部署失败 | Low | High | 先在本地 `npm run build` 验证，确保产物正确 |
| 内容迁移遗漏外部引用 | Medium | Medium | 删除 `docs/guide/installation.md` 前检查全仓库引用 |
| 搜索对中文支持不佳 | Low | Low | VitePress 内置本地搜索支持中文分词 |
