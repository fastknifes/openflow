# Plan: website-content-and-information-architecture-restructure

## Overview

重组 website 的内容与信息架构：删除 18 个占位页和 5 个空壳目录，将 website 从松散的 7 目录混合结构重构为三层清晰导航（nav bar → 子目录 → 页面）。guide 聚焦概念与原理（19 页），tutorial 聚焦纯实操（10 页），reference 独立承载查阅材料（4 页）。所有流程图使用 Mermaid 内联代码块替代 SVG 图片。

## Design Context

- 设计文档：`docs/changes/2026-06-01-website-content-and-information-architecture-restructure/design.md`
- 行为文档：`docs/changes/2026-06-01-website-content-and-information-architecture-restructure/behavior.md`
- Brainstorm 记录：`.openflow/brainstorm/context-packets/website-restructure.md`

## Planning Strategy

### 目标目录树（最终状态）

```
website/
├─ index.md
├─ guide/
│   ├─ index.md .............................. 指南概览（改写）
│   ├─ understanding/
│   │   ├─ index.md ......................... 从 guide/index.md 原内容迁移
│   │   └─ core-concepts.md ................. 从 guide/core-concepts.md 移动
│   ├─ architecture/
│   │   ├─ diagrams.md ..................... 从 guide/diagrams.md 移动（SVG→Mermaid）
│   │   ├─ directory-conventions.md ......... 从 guide/directory-conventions.md 移动
│   │   └─ comparison.md ................... 从 guide/comparison.md 移动
│   ├─ how-it-works/
│   │   ├─ brainstorm.md ................... 新建
│   │   ├─ feature.md ...................... 新建
│   │   ├─ writing-plan.md ................. 新建
│   │   ├─ implement.md .................... 新建
│   │   ├─ quality-gate.md ................. 新建
│   │   └─ archive.md ...................... 新建
│   └─ highlights/
│       ├─ tdd.md .......................... 新建
│       ├─ pyramid.md ...................... 新建
│       ├─ ai-reflection.md ................ 新建
│       ├─ drift-detection.md .............. 新建
│       ├─ contract-scanning.md ............ 新建
│       ├─ code-map.md ..................... 新建
│       ├─ harden.md ....................... 新建
│       └─ bdd.md ......................... 新建
├─ tutorial/
│   ├─ index.md ............................. 更新
│   ├─ getting-started/
│   │   ├─ installation.md ................. 合并 installation + installation-for-agents
│   │   ├─ quickstart.md ................... 从 tutorial/quickstart.md 移动
│   │   └─ configuration.md ................ 从 tutorial/configuration.md 移动
│   ├─ walkthrough/
│   │   ├─ design-and-planning.md .......... 新建
│   │   └─ implement-and-complete.md ....... 新建
│   └─ advanced/
│       ├─ issue-context.md ................ 从 tutorial/issue-context.md 移动
│       ├─ mid-development-change.md ....... 从 tutorial/mid-development-change.md 移动
│       └─ migrate-docs.md ................. 从 tutorial/migrate-docs.md 移动
├─ reference/
│   ├─ index.md ............................. 新建
│   ├─ commands.md ......................... 从 tutorial/commands.md 移动
│   ├─ faq.md .............................. 从 tutorial/faq.md 移动
│   └─ troubleshooting.md .................. 从 tutorial/troubleshooting.md 移动
```

### 删除清单

```
website/introduction/ ........................ 整个目录（4 占位页）
website/getting-started/ ..................... 整个目录（3 占位页）
website/highlights/ .......................... 整个目录（4 占位页）
website/misc/ ............................... 整个目录（2 占位页）
website/workflow/ ........................... 整个目录
website/public/diagrams/*.svg ................ 所有 SVG 文件
website/guide/highlights.md ................. 旧单页亮点（内容拆散到 highlights/ 子目录）
website/guide/feature-workflow.md ............ 占位页
website/guide/implement-workflow.md .......... 占位页
website/guide/mid-development-change.md ...... 占位页
website/guide/migrate-existing-docs.md ....... 占位页
website/guide/behavior-document-guide.md ..... 占位页
website/guide/archive-and-traceability.md .... 占位页
website/tutorial/installation-for-agents.md .. 合并到 installation.md
website/tutorial/feature-workflow.md ......... 内容迁移后删除
website/tutorial/implementation.md ........... 内容迁移后删除
website/tutorial/quality-gate-and-archive.md . 内容迁移后删除
```

### 内容迁移映射

| 源文件 | 目标 | 处理方式 |
|--------|------|----------|
| guide/index.md | guide/understanding/index.md | 原内容迁移到 understanding/，guide/index.md 改写为概览导航页 |
| guide/core-concepts.md | guide/understanding/core-concepts.md | 原样移动 |
| guide/diagrams.md | guide/architecture/diagrams.md | 移动 + SVG 引用替换为 Mermaid |
| guide/directory-conventions.md | guide/architecture/directory-conventions.md | 原样移动 |
| guide/comparison.md | guide/architecture/comparison.md | 原样移动 |
| guide/highlights.md | guide/highlights/*.md（8 页） | 内容拆散到 8 个独立页 |
| tutorial/installation.md + installation-for-agents.md | tutorial/getting-started/installation.md | 合并为单页 |
| tutorial/quickstart.md | tutorial/getting-started/quickstart.md | 移动 |
| tutorial/configuration.md | tutorial/getting-started/configuration.md | 移动 |
| tutorial/feature-workflow.md | guide/how-it-works/feature.md + tutorial/walkthrough/design-and-planning.md | 概念→guide，操作→walkthrough |
| tutorial/implementation.md | guide/how-it-works/implement.md + tutorial/walkthrough/implement-and-complete.md | 同上 |
| tutorial/quality-gate-and-archive.md | guide/how-it-works/quality-gate.md + guide/how-it-works/archive.md + tutorial/walkthrough/implement-and-complete.md | 三路拆分 |
| tutorial/issue-context.md | tutorial/advanced/issue-context.md | 移动 |
| tutorial/mid-development-change.md | tutorial/advanced/mid-development-change.md | 移动 |
| tutorial/migrate-docs.md | tutorial/advanced/migrate-docs.md | 移动 |
| tutorial/commands.md | reference/commands.md | 移动 |
| tutorial/faq.md | reference/faq.md | 移动 |
| tutorial/troubleshooting.md | reference/troubleshooting.md | 移动 |

### 约束传递

以下约束从 design.md 携带到所有相关任务：

- **[must] Mermaid 图**：所有流程图使用 ` ```mermaid ` 代码块，不使用 SVG。风格参考原 workflow/index.md（flowchart LR + classDef 样式）
- **[must] 内容职责**：guide 页不含 step-by-step 操作步骤；tutorial 页不含概念原理阐述
- **[must] 禁止变更**：不修改 `.vitepress/theme/index.ts`，不添加 npm 依赖，不修改 `docs/` 目录
- **[must] 安装页合并**：手动安装和 LLM 自动安装为同一页的两个清晰 section

## Execution Strategy

### Parallel Execution Waves

**Wave 1**（基础设施，无依赖）：
- Task 1: 创建目录结构 + 更新 config.ts
- Task 2: 创建 reference/ 并移动文件

**Wave 2**（guide 现有内容迁移，依赖 Wave 1）：
- Task 3: 移动 guide 现有活跃文件到子目录
- Task 4: 移动 tutorial 现有活跃文件到子目录 + 合并安装页

**Wave 3**（新页面内容编写，依赖 Wave 2）：
- Task 5: 编写 guide/understanding/index.md
- Task 6: 编写 guide/how-it-works/ 6 个页面
- Task 7: 编写 guide/highlights/ 8 个页面
- Task 8: 编写 tutorial/walkthrough/ 2 个页面

**Wave 4**（清理与收尾，依赖 Wave 3）：
- Task 9: 更新首页 index.md + 删除旧目录和文件
- Task 10: 更新 guide/index.md 为概览导航页
- Task 11: 更新 tutorial/index.md

**Wave 5**（验证，依赖 Wave 4）：
- Task 12: 构建验证 + 内容职责检查

### Dependency Matrix

| Task | Blocked By | Blocks |
|------|-----------|--------|
| T1 | — | T3, T4, T5, T6, T7, T8 |
| T2 | — | T9 |
| T3 | T1 | T5, T6, T7 |
| T4 | T1 | T8 |
| T5 | T3 | T10 |
| T6 | T3 | T10 |
| T7 | T3 | T10 |
| T8 | T4 | T11 |
| T9 | T2, T3, T4 | T12 |
| T10 | T5, T6, T7 | T12 |
| T11 | T8 | T12 |
| T12 | T9, T10, T11 | — |

## Tasks

- [ ] 1. 创建目录结构 + 更新 VitePress 配置 (Agent: fixer | Blocks: T3,T4 | Blocked By: —)
  - 创建以下目录（如不存在）：
    - `website/guide/understanding/`
    - `website/guide/architecture/`
    - `website/guide/how-it-works/`
    - `website/guide/highlights/`
    - `website/tutorial/getting-started/`
    - `website/tutorial/walkthrough/`
    - `website/tutorial/advanced/`
    - `website/reference/`
  - 更新 `website/.vitepress/config.ts`：
    - nav 改为 3 项：`{ text: '指南', link: '/guide/' }`、`{ text: '教程', link: '/tutorial/' }`、`{ text: '参考', link: '/reference/' }`
    - sidebar 重写为 3 个路径前缀：
      - `/guide/`：4 个 sidebar group（了解 OpenFlow、设计与架构、工作原理、功能亮点），每个 group 的 items 包含对应子目录下所有页面
      - `/tutorial/`：3 个 sidebar group（开始使用、实操指南、进阶场景）
      - `/reference/`：平铺（命令速查、FAQ、问题排查）
  - 验证：`cd website && npm run build` 构建无报错（此时会有 broken links，但 config 语法正确）

- [ ] 2. 创建 reference/ 目录并移动文件 (Agent: fixer | Blocks: T9 | Blocked By: —)
  - 创建 `website/reference/index.md`：简要说明参考区域包含命令速查、FAQ、问题排查
  - 将 `website/tutorial/commands.md` 复制到 `website/reference/commands.md`
  - 将 `website/tutorial/faq.md` 复制到 `website/reference/faq.md`
  - 将 `website/tutorial/troubleshooting.md` 复制到 `website/reference/troubleshooting.md`
  - 检查移动后的文件内部链接，更新指向新路径的引用
  - 验证：3 个文件存在于 `website/reference/` 下且内容完整

- [ ] 3. 移动 guide 现有活跃文件到子目录 (Agent: fixer | Blocks: T5,T6,T7 | Blocked By: T1)
  - 将 `website/guide/index.md` 的**当前内容**复制到 `website/guide/understanding/index.md`（原 guide/index.md 的内容变成 understanding 的概览页）
  - 将 `website/guide/core-concepts.md` 移动到 `website/guide/understanding/core-concepts.md`
  - 将 `website/guide/diagrams.md` 移动到 `website/guide/architecture/diagrams.md`，并将所有 `![...](/diagrams/*.svg)` 图片引用替换为等效的 Mermaid 内联代码块（参考原 workflow/index.md 的 Mermaid 风格：flowchart LR + classDef 样式）
  - 将 `website/guide/directory-conventions.md` 移动到 `website/guide/architecture/directory-conventions.md`
  - 将 `website/guide/comparison.md` 移动到 `website/guide/architecture/comparison.md`
  - 删除 `website/guide/highlights.md`（内容将在 Task 7 中拆散到 guide/highlights/ 子目录的 8 个新页面）
  - 删除 guide/ 下 6 个占位页：feature-workflow.md、implement-workflow.md、mid-development-change.md、migrate-existing-docs.md、behavior-document-guide.md、archive-and-traceability.md
  - 约束 **[must] Mermaid 图**：diagrams.md 中的 SVG 引用必须全部替换为 Mermaid 代码块
  - 验证：`website/guide/understanding/` 下有 index.md + core-concepts.md；`website/guide/architecture/` 下有 diagrams.md + directory-conventions.md + comparison.md；diagrams.md 中无 `.svg` 引用

- [ ] 4. 移动 tutorial 现有活跃文件到子目录 + 合并安装页 (Agent: fixer | Blocks: T8 | Blocked By: T1)
  - 合并安装页：将 `website/tutorial/installation.md` 和 `website/tutorial/installation-for-agents.md` 的内容合并为 `website/tutorial/getting-started/installation.md`，分为两个清晰的 section（"手动安装"和"LLM 自动安装"）
  - 将 `website/tutorial/quickstart.md` 移动到 `website/tutorial/getting-started/quickstart.md`
  - 将 `website/tutorial/configuration.md` 移动到 `website/tutorial/getting-started/configuration.md`
  - 将 `website/tutorial/issue-context.md` 移动到 `website/tutorial/advanced/issue-context.md`
  - 将 `website/tutorial/mid-development-change.md` 移动到 `website/tutorial/advanced/mid-development-change.md`
  - 将 `website/tutorial/migrate-docs.md` 移动到 `website/tutorial/advanced/migrate-docs.md`
  - 不删除 `website/tutorial/feature-workflow.md`、`website/tutorial/implementation.md`、`website/tutorial/quality-gate-and-archive.md`——它们的操作内容将在 Task 8 中被提取到 walkthrough 页，之后再在 Task 9 中删除
  - 约束 **[must] 安装页合并**：手动安装和 LLM 自动安装为同一页的两个 section，无信息丢失
  - 验证：`website/tutorial/getting-started/` 下有 3 个文件；`website/tutorial/advanced/` 下有 3 个文件；installation.md 包含两个完整 section

- [ ] 5. 编写 guide/understanding/index.md 概览页 (Agent: fixer | Blocks: T10 | Blocked By: T3)
  - `guide/understanding/index.md` 已在 Task 3 中从原 guide/index.md 复制过来。此任务检查并确保内容完整：
    - 包含 OpenFlow 是什么、三大核心问题（边界/事实/证据）
    - 包含指向 core-concepts 的链接
  - 约束 **[must] 内容职责**：此页为概念性内容，不含操作步骤
  - 验证：文件内容完整，无"页面已迁移"占位文本

- [ ] 6. 编写 guide/how-it-works/ 6 个页面 (Agent: general | Blocks: T10 | Blocked By: T3)
  - 阅读源码，为每个工作流节点创建独立的原理阐述页：
    - `brainstorm.md`：来源 `src/skills/brainstorm-skill.ts`、`.openflow/brainstorm/` 目录结构。内容：brainstorm 原理、适用场景、范围控制说明。含 Mermaid 流程图
    - `feature.md`：来源 `src/skills/feature-skill.ts`、`src/contracts/`。内容：Feature 边界定义、行为约束、合约与约束扫描说明。含 Mermaid 流程图
    - `writing-plan.md`：来源 `src/skills/writing-plan-skill.ts`、`src/plan/`。内容：计划生成逻辑、计划内容结构。含 Mermaid 流程图
    - `implement.md`：来源 `src/utils/implementation-backend.ts`、`src/utils/agent-router.ts`、`src/utils/implementation-worktree.ts`、`src/utils/omo-detection.ts`。内容：多后端执行机制、工作树隔离、OMO/OpenCode 路径、生态集成说明。含 Mermaid 流程图
    - `quality-gate.md`：来源 `src/skills/quality-gate-skill.ts`、`src/utils/risk-assessment.ts`、`src/utils/evidence-freshness.ts`。内容：证据门控原理、风险分级、证据新鲜度检查。含 Mermaid 流程图
    - `archive.md`：来源 `src/skills/archive-skill.ts`。内容：归档流程、冻结/提升/映射机制。含 Mermaid 流程图
  - 每个页面格式：
    ```markdown
    ---
    layout: doc
    ---
    # {节点名称}
    {原理阐述}
    ## 流程
    ```mermaid
    flowchart LR
        ...
    ```
    {详细说明}
    ```
  - 约束 **[must] Mermaid 图**：每个页面包含 Mermaid 流程图，风格参考原 workflow/index.md
  - 约束 **[must] 内容职责**：只放原理，不放操作步骤
  - 验证：`website/guide/how-it-works/` 下有 6 个 .md 文件，每个包含 Mermaid 代码块

- [ ] 7. 编写 guide/highlights/ 8 个页面 (Agent: general | Blocks: T10 | Blocked By: T3)
  - 阅读源码，为每个功能亮点创建独立页面：
    - `tdd.md`：来源 `src/skills/tdd-skill.ts`
    - `pyramid.md`：来源 `src/skills/pyramid-skill.ts`
    - `ai-reflection.md`：来源 `src/skills/ai-reflection-skill.ts`
    - `drift-detection.md`：来源 `src/drift/` 目录（5 个文件）
    - `contract-scanning.md`：来源 `src/contracts/` 目录（5 个文件）
    - `code-map.md`：来源归档产物 implementation-mapper.md 的结构说明
    - `harden.md`：来源 `src/utils/harden-utils.ts`、`src/utils/harden-ledger.ts`
    - `bdd.md`：来源 `src/skills/quality-gate-skill.ts` 中 BDD 相关逻辑
  - 每个页面格式：
    ```markdown
    ---
    layout: doc
    ---
    # {亮点名称}
    {功能说明}
    ## 适用场景
    {...}
    ## 与其他功能的关系
    {指向相关页面链接}
    ```
  - 可参考原 `guide/highlights.md` 中的相关内容作为起点
  - 约束 **[must] 内容职责**：只放概念和功能说明，不放操作步骤
  - 验证：`website/guide/highlights/` 下有 8 个 .md 文件

- [ ] 8. 编写 tutorial/walkthrough/ 2 个实操页面 (Agent: general | Blocks: T11 | Blocked By: T4)
  - 从现有活跃内容中提取操作步骤，编写两页实操指南：
    - `design-and-planning.md`：来源素材——`workflow/index.md` 的 brainstorm/feature/plan 部分、`tutorial/feature-workflow.md` 的操作步骤。包含 brainstorm → feature → writing-plan 的完整实操步骤和命令
    - `implement-and-complete.md`：来源素材——`workflow/index.md` 的 implement/quality-gate/archive 部分、`tutorial/implementation.md` 和 `tutorial/quality-gate-and-archive.md` 的操作步骤。包含 implement → quality-gate → archive 的完整实操步骤和命令
  - 每个页面格式：
    ```markdown
    ---
    layout: doc
    ---
    # {标题}
    {简介}
    ## 流程概览
    ```mermaid
    flowchart LR
        ...
    ```
    ## Step 1: ...
    ## Step 2: ...
    ```
  - 约束 **[must] 内容职责**：只放实操步骤，不放概念原理
  - 约束 **[must] Mermaid 图**：包含 Mermaid 流程图
  - 验证：`website/tutorial/walkthrough/` 下有 2 个 .md 文件，每个包含 Mermaid 代码块和命令行指令

- [ ] 9. 更新首页 + 删除旧目录和文件 (Agent: fixer | Blocks: T12 | Blocked By: T2,T3,T4)
  - 更新 `website/index.md`：
    - hero actions 更新为：`开始教程 → /tutorial/`、`了解亮点 → /guide/highlights/tdd`（或任一亮点页）、`安装 OpenFlow → /tutorial/getting-started/installation`
    - 底部"该从哪里开始"部分的链接更新到新路径
  - 删除旧目录：
    - `website/introduction/` 整个目录
    - `website/getting-started/` 整个目录
    - `website/highlights/` 整个目录
    - `website/misc/` 整个目录
    - `website/workflow/` 整个目录
    - `website/public/diagrams/` 目录下所有 `.svg` 文件
  - 删除已迁移内容的源文件（如果仍存在于旧位置）：
    - `website/tutorial/installation-for-agents.md`
    - `website/tutorial/feature-workflow.md`（内容已在 Task 8 中提取）
    - `website/tutorial/implementation.md`（内容已在 Task 8 中提取）
    - `website/tutorial/quality-gate-and-archive.md`（内容已在 Task 8 中提取）
    - `website/tutorial/commands.md`、`website/tutorial/faq.md`、`website/tutorial/troubleshooting.md`（已移到 reference/）
  - 验证：`website/` 下不存在 `introduction/`、`getting-started/`（顶层）、`highlights/`（顶层）、`misc/`、`workflow/` 目录；`website/public/diagrams/` 下无 `.svg` 文件

- [ ] 10. 更新 guide/index.md 为概览导航页 (Agent: fixer | Blocks: T12 | Blocked By: T5,T6,T7)
  - 将 `website/guide/index.md` 改写为概览导航页（原内容已在 Task 3 中复制到 understanding/index.md）
  - 内容结构：
    ```markdown
    ---
    layout: doc
    ---
    # 指南
    OpenFlow 的完整指南分为四个部分：
    ## [了解 OpenFlow](/guide/understanding/) — 是什么、核心概念
    ## [设计与架构](/guide/architecture/) — 架构图解、目录约定、适用场景
    ## [工作原理](/guide/how-it-works/) — 从头脑风暴到归档的每个节点
    ## [功能亮点](/guide/highlights/) — TDD、金字塔编程、漂移检测等特性
    ```
  - 约束 **[must] 内容职责**：概览导航，不含操作步骤
  - 验证：guide/index.md 为概览导航页，4 个链接指向正确的子目录

- [ ] 11. 更新 tutorial/index.md (Agent: fixer | Blocks: T12 | Blocked By: T8)
  - 更新 `website/tutorial/index.md` 以反映新的子目录结构
  - 内容结构：
    ```markdown
    ---
    layout: doc
    ---
    # 教程
    ## [开始使用](/tutorial/getting-started/) — 安装、上手、配置
    ## [实操指南](/tutorial/walkthrough/) — 完整工作流实操
    ## [进阶场景](/tutorial/advanced/) — Issue、需求变更、文档迁移
    ```
  - 验证：tutorial/index.md 反映新的三级分组

- [ ] 12. 构建验证 + 内容职责检查 (Agent: general | Blocks: — | Blocked By: T9,T10,T11)
  - 在 `website/` 目录下执行 `npm run build`，确认构建成功无报错
  - 搜索所有 `website/**/*.md` 文件，确认不存在"页面已迁移"占位文本
  - 搜索所有 `website/**/*.md` 文件，确认不存在 `.svg` 图片引用（`/diagrams/` 路径下）
  - 抽查 guide/ 下 3 个页面（how-it-works/ 任一 + highlights/ 任一），确认无 step-by-step 操作步骤
  - 抽查 tutorial/ 下 2 个页面（walkthrough/ 任一 + advanced/ 任一），确认无概念原理阐述
  - 检查 sidebar 配置覆盖：所有子目录下的 .md 文件都在 config.ts 的 sidebar 中有对应条目
  - 验证：`cd website && npm run build` 成功；grep 搜索无占位文本和 SVG 引用

- [ ] 13. Quality Gate (Agent: — | Blocked By: T12)
  - After formal implementation is complete and Full Quality Gate admission criteria are met, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.


---
## Verification Phase

### Security Checks
- **Secret Scan**: Check for accidentally committed secrets
- **Vulnerability Scan**: Run dependency vulnerability check

### Quality Checks
- **Lint Check**: Run linter
- **Type Check**: Run type checker
- **Test Suite**: Run all tests

### Final Verification Authority

**After all implementation tasks are complete, invoke `openflow-quality-gate` as the final readiness authority.**

The quality gate performs:
- Adversarial hardening assessment (risk-based)
- Evidence collection and verification
- Readiness classification (`Ready`, `ReadyWithDocUpdates`, `NotReady`, `NeedsDecision`)

Do not claim completion until `openflow-quality-gate` returns `Ready` or `ReadyWithDocUpdates`.

### Failure Handling
- Quality failure: fix implementation and rerun verification.
- Security failure: block archive until fixed.
- Consistency failure: sync docs and implementation, then rerun verification.

> Auto-generated by OpenFlow. `openflow-quality-gate` is the final verification authority.

---
## Plan Budget Warning

> This plan exceeds recommended task density. The warning is non-blocking —
> implementation may proceed, but consider splitting into smaller waves.

- **Same-wave tasks**: 13 (recommended max: 4)
- **Estimated execution units**: 25 (recommended max: 20)

**Suggestion**: Split large waves across multiple `/openflow-implement` invocations
or reduce per-wave task count to keep execution feedback loops short.
