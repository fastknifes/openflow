# Plan: website-restructure

## Overview

对 OpenFlow 官网进行内容架构重构。将 53 个页面精简至约 20 个，顶部导航从 5 项精简至 2 项（「介绍」+「使用指南」），建立以教学流程为核心的内容架构，消除所有重复内容。

## Design Context

- 设计工作区: `docs/changes/2026-06-03-website-restructure/`
- 设计文档: `design.md`, `behavior.md`
- 影响范围: `website/` 全部 markdown 文件 + `website/.vitepress/config.ts`

### 关键约束（来自 design.md）

| 约束 | 严重度 |
|------|--------|
| 顶部导航只有「介绍」和「使用指南」两项 | must |
| 教学流程每页包含「⚠️ 必须检查的文档」小节 | must |
| 所有流程图使用 Mermaid，不用 ASCII art | must |
| 不保留任何 stub/🚧 页面 | must |
| 亮点机制保留 8 页技术版，删营销版 | must |
| 进阶主题只有迁移已有文档，不单独分组 | must |
| 工程哲学并入概览，不独立成页 | must |
| 内容以重写为主，现有内容作素材参考 | must |
| `pnpm docs:build` 构建无错误 | must |

## Execution Strategy

### Parallel Execution Waves

**Wave 1** — 创建全部新内容页面（4 个任务并行，无依赖）
- Task 1: 介绍/（4 页）
- Task 2: 教学流程（4 页）
- Task 3: 亮点机制（8 页）
- Task 4: 迁移 + 参考（3 页）

**Wave 2** — 配置与清理（依赖 Wave 1）
- Task 5: 重写 config.ts + 删除旧页面

**Wave 3** — 验证
- Task 6: 构建验证 + Quality Gate

### Dependency Matrix

| Task | Blocked By | Blocks |
|------|------------|--------|
| Task 1: 介绍/ | — | Task 5 |
| Task 2: 教学流程 | — | Task 5 |
| Task 3: 亮点机制 | — | Task 5 |
| Task 4: 迁移 + 参考 | — | Task 5 |
| Task 5: 配置 + 清理 | Task 1, 2, 3, 4 | Task 6 |
| Task 6: 验证 | Task 5 | — |

## Tasks

- [ ] 1. 重写「介绍」板块（4 页）（Agent: fixer | Blocks: [5] | Blocked By: []）

  创建 `website/介绍/` 目录，写入 4 个页面：
  
  - `website/介绍/index.md` — **概览**
    - 合并现有 `introduction/index.md`（概览）+ `introduction/philosophy.md`（工程哲学）
    - 结构：产品定位 → 解决的痛点 → 设计原则 → 工程哲学
    - 参考素材：`website/introduction/index.md`, `website/introduction/philosophy.md`
  
  - `website/介绍/quickstart.md` — **快速开始**
    - 合并 `getting-started/installation.md` + `getting-started/quickstart.md` + `getting-started/configuration.md`
    - 结构：安装 → 可选依赖 → 配置 → 10 分钟上手流程
    - 参考素材：`website/getting-started/` 目录下 3 个文件
  
  - `website/介绍/concepts.md` — **核心概念**
    - 合并 `introduction/concepts.md` + `guide/understanding/core-concepts.md` + `guide/understanding/index.md`
    - 结构：行为文档约束 → 目录模型 → 工作流模式 → 合约标记 → OpenFlow 中"完成"的定义
    - 参考素材：`website/introduction/concepts.md`, `website/guide/understanding/`
  
  - `website/介绍/comparison.md` — **与竞品对比**
    - 基于现有 `introduction/comparison.md` 重写
    - 保持诚实对比风格
    - 参考素材：`website/introduction/comparison.md`
  
  **验收标准**:
  - 4 个 .md 文件内容完整，无 🚧 标记
  - 概览页包含工程哲学内容
  - 快速开始页包含安装 + 配置 + 10 分钟流程
  - 核心概念页无与概览重复的内容
  - 每页 frontmatter 正确（title, description 等）

- [ ] 2. 重写「教学流程」（4 页）（Agent: fixer | Blocks: [5] | Blocked By: []）

  创建 `website/使用指南/` 目录，写入教学流程 4 个页面：
  
  - `website/使用指南/index.md` — **使用指南概览**
    - OpenFlow 使用指南的入口页
    - 简述教学流程 3 阶段 + 其他可用内容（亮点、参考）
    - 参考素材：`website/guide/index.md`
  
  - `website/使用指南/tutorial-phase1.md` — **阶段一：需求探索与确认**
    - 覆盖 Brainstorm → Feature 两个节点
    - 合并 `guide/how-it-works/brainstorm.md` + `guide/how-it-works/feature.md` 内容
    - 页面结构：
      1. 这一阶段做什么（1-2 段原理）
      2. 操作步骤（带 Mermaid 流程图）
      3. **⚠️ 必须检查的文档**：明确 `behavior.md` 和 `design.md` 的检查点
      4. 常见场景
    - 参考素材：`website/guide/how-it-works/brainstorm.md`, `website/guide/how-it-works/feature.md`
  
  - `website/使用指南/tutorial-phase2.md` — **阶段二：开发计划与实现**
    - 覆盖 Writing Plan → Implement 两个节点
    - 合并 `guide/how-it-works/writing-plan.md` + `guide/how-it-works/implement.md` 内容
    - 页面结构同上
    - **⚠️ 必须检查的文档**：`plan.md` 的执行波次和约束传播
    - 参考素材：`website/guide/how-it-works/writing-plan.md`, `website/guide/how-it-works/implement.md`
  
  - `website/使用指南/tutorial-phase3.md` — **阶段三：验证与归档**
    - 覆盖 Quality Gate → Archive 两个节点
    - 合并 `guide/how-it-works/quality-gate.md` + `guide/how-it-works/archive.md` 内容
    - 页面结构同上
    - **⚠️ 必须检查的文档**：质量报告、归档内容
    - 参考素材：`website/guide/how-it-works/quality-gate.md`, `website/guide/how-it-works/archive.md`
  
  **验收标准**:
  - 4 个 .md 文件内容完整，无 🚧 标记
  - 每个教学阶段页包含「⚠️ 必须检查的文档」小节
  - 每页包含至少 1 个 Mermaid 流程图
  - 阶段一覆盖 Brainstorm + Feature，阶段二覆盖 Writing Plan + Implement，阶段三覆盖 Quality Gate + Archive

- [ ] 3. 重写「亮点机制」（8 页）（Agent: fixer | Blocks: [5] | Blocked By: []）

  创建 `website/使用指南/highlights/` 目录，重写 8 个亮点页面：
  
  基于 `website/guide/highlights/` 下现有 8 页技术内容重写（不改变主题，确保语言一致性）：
  
  - `tdd.md` — TDD
  - `bdd.md` — BDD 与集成测试
  - `pyramid.md` — 金字塔原则编程
  - `harden.md` — 对抗性硬化
  - `code-map.md` — 代码地图
  - `drift-detection.md` — 漂移检测
  - `contract-scanning.md` — 契约扫描
  - `ai-reflection.md` — AI 反思
  
  每页结构：
  1. 该机制是什么
  2. 为什么需要它
  3. 如何使用
  4. 与其他机制的关系
  
  **验收标准**:
  - 8 个 .md 文件内容完整
  - 每页结构一致（是什么/为什么/怎么用/关系）
  - 无与 guide/highlights/ 原文相同的措辞（重写，不是复制）

- [ ] 4. 重写「迁移已有文档」+「参考」（3 页）（Agent: fixer | Blocks: [5] | Blocked By: []）

  写入 3 个页面：
  
  - `website/使用指南/migrate-existing-docs.md` — **迁移已有文档**
    - 基于现有 `guide/migrate-existing-docs.md`（stub）+ `tutorial/advanced/migrate-docs.md` 重写
    - 操作导向：如何将已有项目文档迁移到 OpenFlow 结构
    - 参考素材：`website/guide/migrate-existing-docs.md`, `website/tutorial/advanced/migrate-docs.md`
  
  - `website/使用指南/reference/commands.md` — **命令速查**
    - 基于现有 `reference/commands.md` 重写
    - 将 ASCII art 流程图转为 Mermaid
    - 参考素材：`website/reference/commands.md`
  
  - `website/使用指南/reference/config-options.md` — **配置项**
    - 基于现有 `reference/config-options.md` 重写
    - 参考素材：`website/reference/config-options.md`
  
  **验收标准**:
  - 3 个 .md 文件内容完整
  - commands.md 的流程图使用 Mermaid（非 ASCII art）
  - config-options.md 覆盖 openflow.jsonc 中的所有配置段

- [ ] 5. 重写 VitePress 配置 + 删除旧页面（Agent: fixer | Blocks: [6] | Blocked By: [1, 2, 3, 4]）

  **5a. 重写 `website/.vitepress/config.ts`**
  
  - nav 配置为 2 项：
    ```ts
    { text: '介绍', link: '/介绍/' },
    { text: '使用指南', link: '/使用指南/' },
    ```
  - sidebar 配置：
    ```
    /介绍/ — [概览, 快速开始, 核心概念, 与竞品对比]
    /使用指南/ — [概览, 教学流程(3阶段), 迁移已有文档, 亮点机制(8页), 参考(2页)]
    ```
  
  **5b. 删除以下旧文件和目录**：
  
  | 删除目标 | 路径 |
  |----------|------|
  | getting-started/ | `website/getting-started/` |
  | highlights/ 营销版 | `website/highlights/` |
  | misc/ | `website/misc/` |
  | guide/ 全部 | `website/guide/` |
  | reference/ 旧版 | `website/reference/` |
  | tutorial/ | `website/tutorial/` |
  | introduction/ 旧版 | `website/introduction/` |
  
  删除前确认所有有价值内容已迁移到新页面。
  
  **验收标准**:
  - config.ts 的 nav 只有 2 项
  - sidebar 层级不超过 3 层
  - 删除后 website/ 下只有：index.md, .vitepress/, 介绍/, 使用指南/
  - 无残留的空目录

- [ ] 6. 构建验证 + Quality Gate（Agent: fixer | Blocks: [] | Blocked By: [5]）

  - 运行 `pnpm docs:build`，确认构建无错误
  - 检查所有内部链接可达
  - 检查 Mermaid 代码块语法正确
  - 全文搜索 `🚧` 和 `TODO` 确认无残留 stub
  - 统计页面总数，确认 ≤25
  - 验证教学流程 3 页均包含「必须检查」小节
  - 验证亮点机制 8 页均存在
  - After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.
  
  **验收标准**:
  - `pnpm docs:build` 零错误
  - 页面总数 ≤25
  - 零 stub/🚧 标记
  - 教学流程 review 检查点完整
