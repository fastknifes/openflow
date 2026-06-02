# Website Restructure — Brainstorm Context Packet

## 目标
重构 website 的内容与信息架构：消除重复占位页、建立清晰的三层导航结构、按职责重新分区。

## 最终架构

### Nav bar
指南 | 教程 | 参考

### 目录结构
```
website/
├─ index.md .................................. 首页
├─ guide/
│   ├─ index.md .............................. 指南概览
│   ├─ understanding/ ....................... 了解 OpenFlow
│   │   ├─ index.md ........................ 概览
│   │   └─ core-concepts.md ................ 核心概念
│   ├─ architecture/ ....................... 设计与架构
│   │   ├─ diagrams.md ..................... 架构图解
│   │   ├─ directory-conventions.md ........ 目录约定
│   │   └─ comparison.md ................... 适用场景与对比
│   ├─ how-it-works/ ....................... 工作原理
│   │   ├─ brainstorm.md ................... 头脑风暴（含范围控制）
│   │   ├─ feature.md ...................... Feature（含合约约束）
│   │   ├─ writing-plan.md ................. 开发计划
│   │   ├─ implement.md .................... 执行（含工作树、生态集成）
│   │   ├─ quality-gate.md ................. 质量门（含证据新鲜度）
│   │   └─ archive.md ...................... 归档
│   └─ highlights/ ......................... 功能亮点
│       ├─ tdd.md .......................... TDD 指导
│       ├─ pyramid.md ...................... 金字塔编程
│       ├─ ai-reflection.md ................ AI 自我反思
│       ├─ drift-detection.md .............. 设计漂移检测
│       ├─ contract-scanning.md ............ 合约与约束扫描
│       ├─ code-map.md ..................... Code Map
│       ├─ harden.md ....................... Harden 对抗审查
│       └─ bdd.md .......................... BDD 与集成测试
├─ tutorial/
│   ├─ index.md .............................. 教程概览
│   ├─ getting-started/ ..................... 开始使用
│   │   ├─ installation.md .................. 安装（手动 + LLM 自动合并）
│   │   ├─ quickstart.md .................... 10 分钟上手
│   │   └─ configuration.md ................. 最小配置
│   ├─ walkthrough/ ........................ 实操指南
│   │   ├─ design-and-planning.md ........... 设计与规划实操
│   │   └─ implement-and-complete.md ........ 实施与完成实操
│   └─ advanced/ ........................... 进阶场景
│       ├─ issue-context.md ................. Issue 上下文处理
│       ├─ mid-development-change.md ........ 开发中需求变更
│       └─ migrate-docs.md .................. 迁移已有文档
├─ reference/
│   ├─ index.md .............................. 参考概览
│   ├─ commands.md .......................... 命令速查
│   ├─ faq.md ............................... FAQ
│   └─ troubleshooting.md ................... 问题排查
```

### Sidebar 分组
- guide: 了解 OpenFlow / 设计与架构 / 工作原理 / 功能亮点
- tutorial: 开始使用 / 实操指南 / 进阶场景
- reference: 平铺（无需分组）

## 关键决策

1. **guide = 概念 + 工作原理 + 亮点**，不做操作步骤
2. **tutorial = 纯实操**，内部节点（如质量门）不独立成 tutorial 页
3. **highlights 拆为独立页**（8 页），去掉的可选集成/证据新鲜度/范围控制/工作树隔离融入工作原理节点页
4. **reference 独立**（命令速查、FAQ、问题排查从 tutorial 移出）
5. **安装页合并**（手动 + LLM 自动合一页）
6. **实操指南按阶段分两页**（设计与规划 / 实施与完成）
7. **workflow 目录删除**
8. **所有流程图使用 Mermaid**（不用 SVG 图片）
9. **物理子目录**（guide 下 4 个、tutorial 下 3 个）

## 删除清单
- `introduction/` 整个目录（4 个占位页）
- `getting-started/` 整个目录（3 个占位页）
- `highlights/` 顶层目录（4 个占位页）
- `misc/` 整个目录（2 个占位页）
- `workflow/` 整个目录
- `guide/` 下 6 个占位页（feature-workflow、implement-workflow 等）
- `guide/highlights.md`（拆散到子目录）
- `public/diagrams/*.svg`

## 新建清单（13 页）
- guide/understanding/index.md（概览，从 guide/index.md 改写）
- guide/how-it-works/brainstorm.md
- guide/how-it-works/feature.md
- guide/how-it-works/writing-plan.md
- guide/how-it-works/implement.md
- guide/how-it-works/quality-gate.md
- guide/how-it-works/archive.md
- guide/highlights/tdd.md
- guide/highlights/pyramid.md
- guide/highlights/ai-reflection.md
- guide/highlights/drift-detection.md
- guide/highlights/contract-scanning.md
- guide/highlights/code-map.md
- guide/highlights/harden.md
- guide/highlights/bdd.md
- tutorial/walkthrough/design-and-planning.md
- tutorial/walkthrough/implement-and-complete.md
- reference/index.md

## 非目标
- 不改视觉/主题/交互体验
- 不换技术栈
- 不做 i18n
- 不改 docs/ 目录本身的文档结构
