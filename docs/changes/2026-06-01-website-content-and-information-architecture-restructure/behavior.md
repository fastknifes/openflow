# website-content-and-information-architecture-restructure - Observable Behavior

## User Context

- **用户角色：** 阅读 OpenFlow 文档的开发者
- **当前状态：** 网站有大量占位页、导航不清晰、guide/tutorial 职责混合
- **期望状态：** 三层清晰导航（指南/教程/参考），每个页面职责明确，无占位残留

## Trigger Rules

- 用户访问 website 时，nav bar 应显示三项：指南、教程、参考
- 用户进入 `/guide/` 路径时，sidebar 应显示 4 个分组：了解 OpenFlow、设计与架构、工作原理、功能亮点
- 用户进入 `/tutorial/` 路径时，sidebar 应显示 3 个分组：开始使用、实操指南、进阶场景
- 用户进入 `/reference/` 路径时，sidebar 应平铺显示命令速查、FAQ、问题排查

## Non-Trigger Rules

- 不应出现指向已删除目录（introduction/、getting-started/顶层、highlights/顶层、misc/、workflow/）的链接
- 不应在 guide 页面中出现 step-by-step 操作步骤（如命令行指令序列）
- 不应在 tutorial 页面中出现概念原理阐述（如"为什么质量门重要"）
- 不应在任何页面中引用 `public/diagrams/*.svg`

## User-Visible Scenarios

### Scenario 1: 新用户从首页导航到安装指南
**Actor:** 开发者

**Given:** 用户访问 website 首页

**When:** 点击 hero 区域的"开始教程"按钮

**Then:**
- 导航到 `/tutorial/` 页面
- sidebar 显示"开始使用"分组，包含安装、10 分钟上手、最小配置
- 点击"安装"进入合并后的安装页，包含手动安装和 LLM 自动安装两个 section

### Scenario 2: 用户查找 Feature 工作流原理
**Actor:** 开发者

**Given:** 用户想理解 Feature 节点的工作原理

**When:** 通过 nav bar 进入"指南"→ sidebar "工作原理"→"Feature"

**Then:**
- 页面展示 Feature 节点的原理阐述（边界定义、行为约束）
- 页面包含合约与约束扫描的相关说明（作为 Feature 的关联内容）
- 页面不包含具体的命令行操作步骤

### Scenario 3: 用户实操完整工作流
**Actor:** 开发者

**Given:** 用户已安装 OpenFlow，想跑一次完整工作流

**When:** 通过 nav bar 进入"教程"→ sidebar "实操指南"→"设计与规划"

**Then:**
- 页面包含从头脑风暴到生成计划的完整实操步骤
- 包含具体命令（如 `/openflow-feature`、`/openflow-writing-plan`）
- 包含 Mermaid 流程图展示阶段之间的流转

**When:** 继续点击"实施与完成"

**Then:**
- 页面包含从执行到质量门到归档的完整实操步骤
- 与"设计与规划"页衔接，形成完整的工作流实操链路

### Scenario 4: 用户查阅命令速查
**Actor:** 开发者

**Given:** 用户想快速查找某个命令

**When:** 通过 nav bar 进入"参考"→"命令速查"

**Then:**
- 页面显示所有用户命令和 AI 命令的速查表
- 不包含教程式的步骤引导

### Scenario 5: 构建网站无错误
**Actor:** 开发者/CI

**Given:** 所有文件变更已完成

**When:** 在 `website/` 目录下运行 `npm run build`

**Then:**
- 构建成功，无 404、无 broken link
- 所有 Mermaid 代码块正常渲染
- 不生成任何指向已删除页面的链接

## Required Content

### guide/understanding/index.md（概览）
- 来源：现有 `guide/index.md` 的内容，可原样保留或微调
- 必须包含：OpenFlow 是什么、三大问题（边界/事实/证据）

### guide/understanding/core-concepts.md（核心概念）
- 来源：现有 `guide/core-concepts.md` 的内容
- 必须包含：文档即约束、主工作流表、完成的定义

### guide/architecture/diagrams.md（架构图解）
- 来源：现有 `guide/diagrams.md` 的内容
- 变更：将 SVG 图片引用替换为 Mermaid 内联代码块

### guide/architecture/directory-conventions.md（目录约定）
- 来源：现有 `guide/directory-conventions.md` 的内容，可原样保留

### guide/architecture/comparison.md（适用场景与对比）
- 来源：现有 `guide/comparison.md` 的内容，可原样保留

### guide/how-it-works/brainstorm.md（头脑风暴）
- 新建
- 来源素材：`src/skills/brainstorm-skill.ts`、`.openflow/brainstorm/` 目录结构
- 必须包含：brainstorm 原理、适用场景、范围控制说明
- 必须包含 Mermaid 流程图

### guide/how-it-works/feature.md（Feature）
- 新建
- 来源素材：`src/skills/feature-skill.ts`、`src/contracts/` 目录
- 必须包含：Feature 边界定义、行为约束、合约与约束扫描说明
- 必须包含 Mermaid 流程图

### guide/how-it-works/writing-plan.md（开发计划）
- 新建
- 来源素材：`src/skills/writing-plan-skill.ts`、`src/plan/` 目录
- 必须包含：计划生成逻辑、计划内容结构
- 必须包含 Mermaid 流程图

### guide/how-it-works/implement.md（执行）
- 新建
- 来源素材：`src/utils/implementation-backend.ts`、`src/utils/agent-router.ts`、`src/utils/implementation-worktree.ts`、`src/utils/omo-detection.ts`
- 必须包含：多后端执行机制、工作树隔离、OMO/OpenCode 原生路径、生态集成说明
- 必须包含 Mermaid 流程图

### guide/how-it-works/quality-gate.md（质量门）
- 新建
- 来源素材：`src/skills/quality-gate-skill.ts`、`src/utils/risk-assessment.ts`、`src/utils/evidence-freshness.ts`
- 必须包含：证据门控原理、风险分级、证据新鲜度检查
- 必须包含 Mermaid 流程图

### guide/how-it-works/archive.md（归档）
- 新建
- 来源素材：`src/skills/archive-skill.ts`
- 必须包含：归档流程、冻结/提升/映射机制
- 必须包含 Mermaid 流程图

### guide/highlights/tdd.md（TDD 指导）
- 新建
- 来源素材：`src/skills/tdd-skill.ts`

### guide/highlights/pyramid.md（金字塔编程）
- 新建
- 来源素材：`src/skills/pyramid-skill.ts`

### guide/highlights/ai-reflection.md（AI 自我反思）
- 新建
- 来源素材：`src/skills/ai-reflection-skill.ts`

### guide/highlights/drift-detection.md（设计漂移检测）
- 新建
- 来源素材：`src/drift/` 目录（5 个文件）

### guide/highlights/contract-scanning.md（合约与约束扫描）
- 新建
- 来源素材：`src/contracts/` 目录（5 个文件）

### guide/highlights/code-map.md（Code Map）
- 新建
- 来源素材：归档产物 `implementation-mapper.md` 的结构说明

### guide/highlights/harden.md（Harden 对抗审查）
- 新建
- 来源素材：`src/utils/harden-utils.ts`、`src/utils/harden-ledger.ts`

### guide/highlights/bdd.md（BDD 与集成测试）
- 新建
- 来源素材：`src/skills/quality-gate-skill.ts` 中 BDD 相关逻辑

### tutorial/getting-started/installation.md（安装）
- 来源：合并现有 `tutorial/installation.md` + `tutorial/installation-for-agents.md`
- 必须包含两个清晰的 section：手动安装、LLM 自动安装

### tutorial/getting-started/quickstart.md（10 分钟上手）
- 来源：现有 `tutorial/quickstart.md`，路径变更但内容可原样保留

### tutorial/getting-started/configuration.md（最小配置）
- 来源：现有 `tutorial/configuration.md`，路径变更但内容可原样保留

### tutorial/walkthrough/design-and-planning.md（设计与规划实操）
- 新建
- 来源素材：`workflow/index.md` 的 brainstorm/feature/plan 部分、`tutorial/feature-workflow.md` 的操作步骤
- 必须包含：brainstorm → feature → writing-plan 的实操步骤和命令

### tutorial/walkthrough/implement-and-complete.md（实施与完成实操）
- 新建
- 来源素材：`workflow/index.md` 的 implement/quality-gate/archive 部分、`tutorial/implementation.md` 和 `tutorial/quality-gate-and-archive.md` 的操作步骤
- 必须包含：implement → quality-gate → archive 的实操步骤和命令

### tutorial/advanced/issue-context.md（Issue 上下文处理）
- 来源：现有 `tutorial/issue-context.md`，路径变更但内容可原样保留

### tutorial/advanced/mid-development-change.md（开发中需求变更）
- 来源：现有 `tutorial/mid-development-change.md`，路径变更但内容可原样保留

### tutorial/advanced/migrate-docs.md（迁移已有文档）
- 来源：现有 `tutorial/migrate-docs.md`，路径变更但内容可原样保留

### reference/index.md
- 新建，简要说明参考区域的内容

### reference/commands.md
- 来源：现有 `tutorial/commands.md`，移入新位置

### reference/faq.md
- 来源：现有 `tutorial/faq.md`，移入新位置

### reference/troubleshooting.md
- 来源：现有 `tutorial/troubleshooting.md`，移入新位置

## Success Responses

- 用户通过 nav bar 可一键到达指南/教程/参考三个区域
- 用户在 guide 中看到的工作原理页包含 Mermaid 流程图，清晰展示节点逻辑
- 用户在 tutorial 中可跟随实操页完成从头脑风暴到归档的完整流程
- 用户在 reference 中可快速查阅命令和 FAQ

## Must Not Behavior

- 必须不保留任何"页面已迁移"占位页
- 必须不出现指向不存在路径的链接（404）
- 必须不在 guide 页面中包含 step-by-step 操作步骤
- 必须不在 tutorial 页面中包含概念原理阐述
- 必须不引用 SVG 图片文件
- 必须不修改 `.vitepress/theme/index.ts`
- 必须不添加新的 npm 依赖
- 必须不删除任何现有活跃内容（只迁移和重组）

## Acceptance / Verification Mapping

| 验收标准 | 验证方式 | 证据类型 |
|----------|----------|----------|
| `npm run build` 成功无报错 | 在 website/ 目录执行构建命令 | build-log |
| 无占位页残留 | 搜索所有 .md 文件，不存在"页面已迁移"内容 | grep-result |
| 旧目录已删除 | 验证 introduction/、getting-started/顶层、highlights/顶层、misc/、workflow/ 目录不存在 | file-check |
| 无 SVG 引用 | 搜索所有 .md 文件，不包含 `/diagrams/*.svg` | grep-result |
| nav bar 三项 | 检查 config.ts 的 nav 配置 | config-review |
| sidebar 覆盖所有页面 | 每个子目录下的 .md 文件都在对应 sidebar 配置中出现 | config-review |
| guide 页无操作步骤 | 抽查 guide/ 下页面，无命令行指令序列 | manual-review |
| tutorial 页无概念阐述 | 抽查 tutorial/ 下页面，无"为什么"类原理说明 | manual-review |
| Mermaid 图正常渲染 | `npm run dev` 本地验证 | visual-check |
