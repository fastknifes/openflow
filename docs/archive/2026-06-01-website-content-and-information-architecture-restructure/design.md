# website-content-and-information-architecture-restructure - Design

## Human Consensus Summary

通过 brainstorm 讨论达成共识：website 当前存在大量占位页残留和职责模糊问题，需要彻底重组信息架构。最终确定三层导航结构（nav bar → 子目录 → 页面），guide 聚焦概念与原理，tutorial 聚焦纯实操，reference 独立承载查阅材料。详细讨论记录保存在 `.openflow/brainstorm/context-packets/website-restructure.md`。

## Identity And Assumptions

- **Feature slug:** `website-content-and-information-architecture-restructure`
- **影响范围：** `website/` 目录下的所有 `.md` 文件和 `.vitepress/config.ts`
- **假设：**
  - 当前 `introduction/`、`getting-started/`、`highlights/`（顶层）、`misc/`、`workflow/` 目录下的占位页和活跃页均可删除或迁移
  - 当前 `guide/` 下 6 个占位页（feature-workflow、implement-workflow 等）可安全删除
  - 当前活跃内容页（guide/ 6 页、tutorial/ 14 页）的内容可作为新页面的素材基础
  - `public/diagrams/*.svg` 可删除（替换为 Mermaid 内联代码块）

## Overview

将 website 从当前松散的 7 目录混合结构重组为三层清晰的信息架构：

1. **一级导航（nav bar）：** 指南 / 教程 / 参考
2. **二级导航（子目录）：** guide 下 4 个、tutorial 下 3 个
3. **三级（页面）：** 具体内容页

```
website/
├─ index.md .................................. 首页
├─ guide/
│   ├─ index.md .............................. 指南概览
│   ├─ understanding/ ....................... 了解 OpenFlow
│   │   ├─ index.md ......................... 概览
│   │   └─ core-concepts.md ................. 核心概念
│   ├─ architecture/ ....................... 设计与架构
│   │   ├─ diagrams.md ..................... 架构图解
│   │   ├─ directory-conventions.md ......... 目录约定
│   │   └─ comparison.md ................... 适用场景与对比
│   ├─ how-it-works/ ....................... 工作原理
│   │   ├─ brainstorm.md ................... 头脑风暴（含范围控制）
│   │   ├─ feature.md ...................... Feature（含合约约束）
│   │   ├─ writing-plan.md ................. 开发计划
│   │   ├─ implement.md .................... 执行（含工作树隔离、生态集成）
│   │   ├─ quality-gate.md ................. 质量门（含证据新鲜度）
│   │   └─ archive.md ...................... 归档
│   └─ highlights/ ........................ 功能亮点
│       ├─ tdd.md .......................... TDD 指导
│       ├─ pyramid.md ...................... 金字塔编程
│       ├─ ai-reflection.md ................ AI 自我反思
│       ├─ drift-detection.md .............. 设计漂移检测
│       ├─ contract-scanning.md ............ 合约与约束扫描
│       ├─ code-map.md ..................... Code Map
│       ├─ harden.md ....................... Harden 对抗审查
│       └─ bdd.md ......................... BDD 与集成测试
├─ tutorial/
│   ├─ index.md ............................. 教程概览
│   ├─ getting-started/ .................... 开始使用
│   │   ├─ installation.md ................. 安装（合并手动 + LLM 自动）
│   │   ├─ quickstart.md ................... 10 分钟上手
│   │   └─ configuration.md ................ 最小配置
│   ├─ walkthrough/ ........................ 实操指南
│   │   ├─ design-and-planning.md .......... 设计与规划实操
│   │   └─ implement-and-complete.md ....... 实施与完成实操
│   └─ advanced/ ........................... 进阶场景
│       ├─ issue-context.md ................ Issue 上下文处理
│       ├─ mid-development-change.md ....... 开发中需求变更
│       └─ migrate-docs.md ................. 迁移已有文档
├─ reference/
│   ├─ index.md ............................. 参考概览
│   ├─ commands.md ......................... 命令速查
│   ├─ faq.md .............................. FAQ
│   └─ troubleshooting.md .................. 问题排查
```

## Problem

1. **占位页残留：** 18 个"页面已迁移"占位页散布在 4 个空壳目录（`introduction/`、`getting-started/`、`highlights/`、`misc/`），增加维护负担且对用户无价值
2. **guide/tutorial 职责模糊：** guide 里混有操作步骤（如 feature-workflow），tutorial 里混有概念解释（如质量门原理），用户不清楚该去哪里找信息
3. **sidebar 配置不完整：** `workflow/` 路由匹配语法有误，`misc/` 为空组，`highlights/` 和 `getting-started/` 未出现在 sidebar 中
4. **内容重叠：** `workflow/index.md`、`tutorial/feature-workflow.md`、`guide/diagrams.md` 三处包含相似的工作流 Mermaid 图
5. **亮点页缺失：** 当前只有 1 个 highlights 页笼统概述，TDD、金字塔编程、AI 反思、漂移检测、合约扫描等功能特性没有独立阐述

## Goals

1. **g-0001:** 删除所有占位页和空壳目录，清理网站内容残留
2. **g-0002:** 建立清晰的三层导航结构（nav bar → 子目录 → 页面），每层职责明确
3. **g-0003:** guide 只放概念、原理、亮点，不含操作步骤
4. **g-0004:** tutorial 只放纯实操内容，内部工作流节点不在 tutorial 独立成页
5. **g-0005:** reference 独立承载命令速查、FAQ、问题排查
6. **g-0006:** 为 6 个工作流节点（头脑风暴到归档）创建独立的原理阐述页
7. **g-0007:** 为 8 个功能亮点创建独立的特性页
8. **g-0008:** 所有流程图使用 Mermaid 内联代码块，不使用 SVG 图片

## Non-Goals

- 不改视觉主题、交互体验或自定义样式
- 不换技术栈（保持 VitePress）
- 不做 i18n（保留已注释的 i18n 预留结构不动）
- 不改 `docs/` 目录本身的文档结构
- 不重写已有活跃内容页的文本（只迁移、重组、拆分，不大幅改写内容）
- 不新增自定义 VitePress 组件或插件

## Behavior Alignment

- **VitePress 约定：** sidebar 按路径前缀匹配（`/guide/`、`/tutorial/`、`/reference/`），子目录通过 sidebar group 的 `text` 字段呈现为二级导航
- **现有 Mermaid 插件：** `vitepress-plugin-mermaid` 已安装，新 Mermaid 代码块无需额外配置
- **首页链接：** `index.md` 中的 hero action links 需更新到新路径（如 `/tutorial/` 保持不变，新增 `/reference/`）
- **SEO/URL：** 新页面路径变更后，旧路径无外部引用（项目为私有仓库），不需要重定向机制

## Design Constraints

### [must] 目录结构
- guide/ 必须包含 4 个物理子目录：`understanding/`、`architecture/`、`how-it-works/`、`highlights/`
- tutorial/ 必须包含 3 个物理子目录：`getting-started/`、`walkthrough/`、`advanced/`
- reference/ 平铺结构，无子目录
- 不再存在 `introduction/`、`getting-started/`（顶层）、`highlights/`（顶层）、`misc/`、`workflow/` 目录

### [must] Sidebar 配置
- `.vitepress/config.ts` 的 `sidebar` 对象必须包含 3 个路径前缀：`/guide/`、`/tutorial/`、`/reference/`
- 每个 sidebar 下用 `text` 字段定义二级分组，对应物理子目录
- nav bar 包含 3 项：指南、教程、参考

### [must] Mermaid 图
- 所有流程图和架构图使用 ` ```mermaid ` 代码块
- 删除 `public/diagrams/*.svg`
- Mermaid 图风格参考原 `workflow/index.md`：使用 `flowchart LR`、带 `classDef` 样式

### [must] 内容迁移规则
- 现有活跃内容页的内容作为新页面的素材基础，可拆分、合并、重组
- 不删除任何活跃内容，只移动和重组
- 合并 `installation.md` + `installation-for-agents.md` 为单页
- `tutorial/feature-workflow.md`、`tutorial/implementation.md`、`tutorial/quality-gate-and-archive.md` 的操作步骤部分合并到 `walkthrough/` 的两页中，概念部分移到 guide 的对应工作原理页

### [must] 禁止变更
- 不修改 `docs/` 目录结构
- 不修改 `.vitepress/theme/` 的自定义主题代码
- 不添加新的 npm 依赖

## Success Criteria

- [ ] `vitepress build` 成功，无报错
- [ ] 所有页面可通过 sidebar 导航到达（无孤立页）
- [ ] 不存在任何"页面已迁移"占位页
- [ ] `introduction/`、`getting-started/`（顶层）、`highlights/`（顶层）、`misc/`、`workflow/` 目录不存在
- [ ] `public/diagrams/` 目录下无 `.svg` 文件
- [ ] guide/ 下所有页面为概念性内容（无 step-by-step 操作步骤）
- [ ] tutorial/ 下所有页面为实操内容（无概念原理阐述）
- [ ] 所有流程图使用 Mermaid 代码块（无 SVG 引用）
- [ ] nav bar 显示三项：指南、教程、参考

## Risks And Mitigations

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 新页面内容不足（工作原理页和亮点页需要从源码提取信息） | 部分页面可能内容单薄 | 先创建骨架页，内容从源码注释和现有文档提取，可迭代补充 |
| 合并安装页时丢失 LLM 自动安装的细节 | 用户无法自动安装 | 合并时保留两个 tab/section，确保 LLM 自动安装的完整步骤都在 |
| VitePress 子目录路由与 sidebar 匹配不一致 | 页面无法通过导航到达 | 按 VitePress 文档验证路径前缀匹配规则 |
| 首页 hero action links 指向旧路径 | 404 | 更新 index.md 中所有链接 |

## Testing Strategy

- **构建验证：** `npm run build`（在 website/ 目录下）无错误
- **导航完整性：** 手动验证 sidebar 中每个链接可点击且不 404
- **内容职责验证：** 人工抽查 guide 页不含操作步骤、tutorial 页不含概念阐述
- **Mermaid 渲染：** 本地 `npm run dev` 验证所有 Mermaid 图正常渲染
