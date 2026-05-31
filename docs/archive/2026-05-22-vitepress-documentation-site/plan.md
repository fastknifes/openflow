# Plan: vitepress-documentation-site

## Overview

建立 OpenFlow 的 VitePress 用户文档站点，源码位于 `website/` 目录，通过 GitHub Actions 部署到 GitHub Pages。站点面向终端用户，中文优先，预留 i18n 结构，内容从现有 README 和 `docs/guide/installation.md` 迁移修正。

## Design Context

设计文档位于 `docs/changes/2026-05-22-vitepress-documentation-site/`：
- `proposal.md` — 问题框架、方案对比、内容策略
- `requirements.md` — 11 项功能需求、5 项非目标、5 项约束、7 条验收标准
- `design.md` — 架构图、VitePress 配置草案、GitHub Actions 部署流程、内容迁移矩阵、与主项目的隔离策略

## Execution Strategy

### Parallel Execution Waves

- **Wave 1**: 初始化站点基础结构 + 迁移 installation.md + 配置部署工作流（三者无依赖，可并行）
- **Wave 2**: 创建全部内容骨架（依赖 Wave 1 的 VitePress 配置和目录结构）
- **Wave 3**: README 精简（依赖 Wave 2 知道站点结构，以及 Task 2 完成迁移）
- **Wave 4**: 构建验证（依赖 Wave 2 和 Wave 3）
- **Wave 5**: OpenFlow Quality Gate（依赖 Wave 4）

### Dependency Matrix

| Task | Blocked By | Blocks |
|---|---|---|
| 1. 初始化 VitePress 站点结构与配置 | — | 3, 4, 5 |
| 2. 迁移 installation.md 并清理引用 | — | 7 |
| 3. 创建核心内容骨架（首页 + introduction + getting-started） | 1 | 8 |
| 4. 创建使用指南骨架（guide/） | 1 | 8 |
| 5. 创建参考与亮点骨架（reference + highlights + misc） | 1 | 8 |
| 6. 配置 GitHub Actions 部署工作流 | — | 8 |
| 7. README.md 精简 | 2, 3, 4, 5 | 8 |
| 8. 本地构建与隔离验证 | 3, 4, 5, 6, 7 | 9 |
| 9. OpenFlow Quality Gate | 8 | — |

## Tasks

- [ ] 1. 初始化 VitePress 站点结构与配置 (Agent: quick | Blocks: [3, 4, 5] | Blocked By: [])
  - 创建 `website/package.json`：添加 `vitepress` 为 devDependency，配置 `scripts: { dev: "vitepress dev", build: "vitepress build", preview: "vitepress preview" }`
  - 创建 `website/.vitepress/config.ts`：中文主导航栏、侧边栏分组（introduction/getting-started/guide/reference/highlights/misc）、本地搜索、footer、预留 `locales` 结构
  - 创建 `website/.vitepress/theme/index.ts`：空自定义主题入口（后续如需覆盖样式）
  - 更新 `.gitignore`：新增 `website/.vitepress/dist` 和 `website/.vitepress/cache`
  - 验证 `tsconfig.json` 的 `exclude` 已包含 `website/` 或不包含 `website/**/*.ts`（避免主项目 typecheck 检查站点依赖）
  - **验证**: `cd website && npm install` 成功安装 vitepress；`ls website/node_modules/vitepress` 存在

- [ ] 2. 迁移 installation.md 并清理引用 (Agent: quick | Blocks: [7] | Blocked By: [])
  - 将 `docs/guide/installation.md` 复制到 `website/getting-started/installation.md`，顶部添加 VitePress frontmatter（`---\nlayout: doc\n---` 或等效配置）
  - 删除 `docs/guide/installation.md`；若 `docs/guide/` 目录为空，一并删除该目录
  - 全局搜索全仓库对 `docs/guide/installation.md` 或 `raw.githubusercontent.com/.../docs/guide/installation.md` 的硬链接引用，记录待更新位置（供 Task 7 处理）
  - **验证**: `Test-Path "docs/guide/installation.md"` 返回 False；`Test-Path "website/getting-started/installation.md"` 返回 True

- [ ] 3. 创建核心内容骨架（首页 + introduction + getting-started） (Agent: quick | Blocks: [8] | Blocked By: [1])
  - `website/index.md`：VitePress `layout: home`，包含 Hero 标题、一句话描述、三个快速入口按钮（快速开始 / 命令参考 / 核心概念）
  - `website/introduction/index.md`：OpenFlow 简介总览
  - `website/introduction/concepts.md`：核心概念占位（行为文档约束、目录划分、工作流模式）
  - `website/introduction/comparison.md`：竞品对比占位（修正夸大表述）
  - `website/introduction/philosophy.md`：工程哲学占位（含行为文档约束的 rationale）
  - `website/getting-started/quickstart.md`：快速开始占位
  - `website/getting-started/configuration.md`：配置说明占位
  - **验证**: `cd website && npm run build` 成功；产物中存在 `dist/index.html`、`dist/introduction/index.html` 等

- [ ] 4. 创建使用指南骨架（guide/） (Agent: quick | Blocks: [8] | Blocked By: [1])
  - `website/guide/feature-workflow.md`：Feature 工作流占位
  - `website/guide/behavior-document-guide.md`：如何阅读 behavior.md 占位
  - `website/guide/implement-workflow.md`：omo vs opencode 实现方式占位
  - `website/guide/mid-development-change.md`：中途改需求占位
  - `website/guide/migrate-existing-docs.md`：迁移现有文档占位
  - `website/guide/archive-and-traceability.md`：归档与追溯占位
  - **验证**: 产物中存在 `dist/guide/feature-workflow.html` 等文件

- [ ] 5. 创建参考与亮点骨架（reference + highlights + misc） (Agent: quick | Blocks: [8] | Blocked By: [1])
  - `website/reference/commands.md`：命令速查占位
  - `website/reference/config-options.md`：配置项参考占位
  - `website/reference/directory-conventions.md`：目录约定占位
  - `website/highlights/quality-gate.md`：质量门 + Harden 占位
  - `website/highlights/drift-guardian.md`：漂移检测 + SDD 占位
  - `website/highlights/smart-archive.md`：DDD 限界上下文 + 异步归档占位
  - `website/highlights/tdd-bdd-sdd.md`：测试分层理念占位
  - `website/misc/faq.md`：FAQ 占位
  - `website/misc/troubleshooting.md`：问题排查占位
  - **验证**: 产物中存在 `dist/reference/commands.html`、`dist/highlights/quality-gate.html` 等

- [ ] 6. 配置 GitHub Actions 部署工作流 (Agent: quick | Blocks: [8] | Blocked By: [])
  - 创建 `.github/workflows/deploy-handbook.yml`
  - 触发条件：`push` 到 `master` 或 `develop` 分支，且路径为 `website/**` 或 `.github/workflows/deploy-handbook.yml`
  - Build job：`actions/checkout@v4` → `actions/setup-node@v4` (node 20) → `cd website && npm ci` → `cd website && npm run build` → `actions/upload-pages-artifact@v3` (path: `website/.vitepress/dist`)
  - Deploy job：依赖 build，`actions/deploy-pages@v4`，环境 `github-pages`
  - **验证**: Workflow 文件 YAML 语法通过 GitHub 编辑器验证或本地 `actionlint`；无语法错误

- [ ] 7. README.md 精简 (Agent: quick | Blocks: [8] | Blocked By: [2, 3, 4, 5])
  - 保留项目标题、一句话描述、徽章、许可证声明
  - 添加指向文档站点的链接（如 `https://fastknifes.github.io/openflow/`）
  - 删除已迁移到站点的详细内容：命令手册、配置说明、详细工作流步骤、FAQ 等
  - 更新 Task 2 中记录的对 `docs/guide/installation.md` 的硬链接引用（如有）
  - **验证**: README.md 长度从 ~570 行缩减到 ~50 行以内；`npm run typecheck` 通过（README 不影响类型检查）

- [ ] 8. 本地构建与隔离验证 (Agent: quick | Blocks: [9] | Blocked By: [3, 4, 5, 6, 7])
  - `cd website && npm install`：安装站点依赖
  - `cd website && npm run build`：成功生成静态文件，`website/.vitepress/dist/index.html` 存在且非空
  - `cd .. && npm run typecheck`：主项目 TypeScript 检查通过，`website/` 不参与检查
  - `npm run build`：主项目 `dist/` 构建成功，不受 `website/` 影响
  - `npm run test`：主项目测试通过（或记录预存失败，确认非本次变更引入）
  - **验证**: 以上四条命令全部返回 exit code 0

- [ ] 9. OpenFlow Quality Gate (Agent: openflow-quality-gate skill | Blocks: [] | Blocked By: [8])
  - After implementation is complete, invoke the `openflow-quality-gate` skill.
  - The skill decides whether harden is required and performs evidence-aware verify.
  - Do not claim completion until the quality gate reports readiness.

---
## Plan Budget Warning

> This plan exceeds recommended task density. The warning is non-blocking — implementation may proceed, but consider splitting into smaller waves.

- **Same-wave tasks**: 3 in Wave 1, 3 in Wave 2 (recommended max: 4)
- **Estimated execution units**: ~33 (recommended max: 20)

**Suggestion**: Wave 2 的骨架文件创建任务（Task 3, 4, 5）虽文件数量多，但均为同质 Markdown 占位文件（frontmatter + 章节标题 + 简短说明），无复杂逻辑，可作为一个连续操作批量完成。若执行反馈循环过长，可拆分为多次提交。


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
