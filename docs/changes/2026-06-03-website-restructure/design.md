# 网站内容重构 — design.md

> Draft · 等待用户确认

## Human Consensus Summary

用户对 OpenFlow 官网当前内容结构不满意，认为内容太分散、不够聚焦。经过头脑风暴确认：顶部导航只保留「介绍」和「使用指南」两个入口；教学流程按阶段分为 3 页，核心强调用户必须 review 约束文档；删除所有冗余/重复页面；内容以重写为主，现有页面仅作素材参考。

## Identity And Assumptions

- **Feature Identity**: website-restructure
- **工作区**: `docs/changes/2026-06-03-website-restructure/`
- **影响范围**: `website/` 目录下全部 markdown 文件和 `website/.vitepress/config.ts`
- **假设**: VitePress + Mermaid 插件不变，不涉及框架迁移或样式重构

## Overview

对 OpenFlow 官网进行内容架构重构。核心目标：从当前 53 个 markdown 文件、7 个侧边栏分组、5 个顶部导航项，精简为 2 个顶部导航入口下的清晰层级结构，消除重复内容，突出教学流程的约束文档 review 机制。

## Problem

1. **内容分散**：相同主题出现在多处（FAQ ×2、Troubleshooting ×2、核心概念 ×2、目录约定 ×2、亮点 ×12 页）
2. **导航臃肿**：顶部 5 个入口、侧边栏 7 个分组，用户找不到重点
3. **教学缺失**：tutorial 目录 7 页未接入侧边栏，核心流程页 6 个是空壳 stub
4. **原理/操作割裂**：how-it-works（原理）和核心流程（操作）分离，但操作页反而是空壳

## Goals

1. 顶部导航精简为 2 项：「介绍」和「使用指南」
2. 消除所有重复内容页面
3. 建立以用户旅程为核心的教学流程（3 阶段），强调每阶段的约束文档 review 检查点
4. 删除所有 stub 页面和未接入的孤立页面
5. 内容重写为主，确保语言质量和信息架构一致性

## Non-Goals

- 不改 VitePress 框架、主题或样式系统
- 不修改 VitePress/Mermaid 插件配置
- 不新增功能或新增内容主题
- 不涉及 SEO、Analytics 或部署流程

## Behavior Alignment

| 用户场景 | 设计对应 |
|----------|----------|
| 新用户想了解 OpenFlow 是什么 | 介绍 → 概览（What/Why + 工程哲学） |
| 新用户想快速上手 | 介绍 → 快速开始（安装 → 配置 → 跑通一次） |
| 用户想深入理解核心概念 | 介绍 → 核心概念 |
| 用户想跟着教程学会使用 | 使用指南 → 教学流程（3 阶段） |
| 用户想查命令或配置 | 使用指南 → 参考 |
| 用户想了解某个亮点机制 | 使用指南 → 亮点机制 |
| 用户想迁移已有项目 | 使用指南 → 迁移已有文档 |
| 用户想看竞品对比 | 介绍 → 与竞品对比 |

## Design Constraints

| # | 约束 | 严重度 |
|---|------|--------|
| C1 | 所有流程图统一使用 Mermaid 格式，不使用 ASCII art | must |
| C2 | 教学流程每页必须包含「⚠️ 必须检查的文档」小节 | must |
| C3 | 顶部导航只有「介绍」和「使用指南」两个入口 | must |
| C4 | 不保留任何 stub/🚧 页面 | must |
| C5 | 亮点机制保留技术详细版（guide/highlights/ 8 页内容），删除营销着陆页 | must |
| C6 | 每页保持一致的文档结构模板 | should |
| C7 | 进阶主题只有 1 页（迁移已有文档），不单独分组 | must |
| C8 | 工程哲学并入概览，不独立成页 | must |

## Success Criteria

1. 顶部导航只有 2 项
2. 页面总数从 53 降至 ≤25
3. 无任何重复内容页面
4. 无 stub/空壳页面
5. 教学流程 3 页均包含用户 review 检查点
6. 所有 Mermaid 流程图可正常渲染
7. 侧边栏层级不超过 3 层

## Risks And Mitigations

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 重写内容质量不如原文 | 中 | 保留原文作为参考素材，逐页对照确认无信息丢失 |
| 合并页面导致信息遗漏 | 中 | 使用 behavior.md 的验收标准逐项检查 |
| 教学流程 3 页内容过长 | 低 | 如超过合理长度，可拆分子页面但保持在同一阶段下 |

## Testing Strategy

- 逐页检查：每个新页面内容完整、Mermaid 渲染正常、内部链接有效
- 对比检查：确保被删除页面的有价值内容已迁移到新页面
- 导航测试：从顶部导航和侧边栏能到达所有页面，无死链
- 构建测试：`pnpm docs:build` 无错误

## 最终目录结构

```
website/
├── index.md                          # 首页（保留，可微调）
├── .vitepress/config.ts              # 重新配置 sidebar + nav
│
├── 介绍/
│   ├── index.md                      # 概览（合并现有概览 + 工程哲学）
│   ├── quickstart.md                 # 快速开始（重写，合并安装/10分钟/配置）
│   ├── concepts.md                   # 核心概念（合并 introduction/concepts + guide/understanding/core-concepts）
│   └── comparison.md                 # 与竞品对比（重写）
│
└── 使用指南/
    ├── index.md                      # 使用指南概览
    ├── tutorial-phase1.md            # 阶段一：需求探索与确认（Brainstorm → Feature）
    ├── tutorial-phase2.md            # 阶段二：开发计划与实现（Writing Plan → Implement）
    ├── tutorial-phase3.md            # 阶段三：验证与归档（Quality Gate → Archive）
    ├── migrate-existing-docs.md      # 迁移已有文档（重写）
    ├── highlights/                   # 亮点机制（8 页，基于现有 guide/highlights/ 重写）
    │   ├── tdd.md
    │   ├── bdd.md
    │   ├── pyramid.md
    │   ├── harden.md
    │   ├── code-map.md
    │   ├── drift-detection.md
    │   ├── contract-scanning.md
    │   └── ai-reflection.md
    └── reference/                    # 参考
        ├── commands.md               # 命令速查（重写，ASCII 流程图转 Mermaid）
        └── config-options.md         # 配置项（重写）
```

**总计约 20 个内容页面**（从 53 降至 20）

### 删除清单

| 删除目标 | 原因 |
|----------|------|
| `getting-started/` (3 页) | 并入 介绍/quickstart.md |
| `highlights/` (4 页) | 营销着陆页，与 guide/highlights/ 重复 |
| `misc/` (2 页) | FAQ + Troubleshooting 重复 |
| `guide/核心流程` 6 个 stub | 无实质内容 |
| `guide/how-it-works/` (6 页) | 并入教学流程 3 阶段 |
| `guide/understanding/` (2 页) | 并入 介绍/concepts.md |
| `guide/architecture/` (3 页) | directory-conventions 重复、diagrams 和 comparison 删除 |
| `guide/implement-workflow.md` stub | 并入教学流程 |
| `guide/feature-workflow.md` stub | 并入教学流程 |
| `guide/behavior-document-guide.md` stub | 并入教学流程 |
| `guide/mid-development-change.md` stub | 删除 |
| `guide/archive-and-traceability.md` stub | 并入教学流程 |
| `tutorial/` (7 页) | 被教学流程覆盖 |
| `reference/directory-conventions.md` | 重复 |
| `reference/faq.md` | 重复 |
| `reference/troubleshooting.md` | 重复 |
| `introduction/philosophy.md` | 并入概览 |
| `guide/index.md` | 替换为 使用指南/index.md |
