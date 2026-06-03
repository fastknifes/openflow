# 网站内容重构 — behavior.md

> Draft · 等待用户确认

## Human Consensus Summary

用户要求精简网站结构，只保留两个导航入口，建立以教学流程为核心的内容架构，强调用户必须 review 约束文档。

## User Context

- **目标用户**: 使用 OpenFlow 的开发者，可能刚接触 AI 驱动开发工作流
- **问题**: 当前网站 53 个页面、7 个分组，内容重复严重，新用户找不到重点，教学流程缺失

## Trigger Rules

**目标**:
- 将网站从 53 页精简至约 20 页
- 建立清晰的「介绍 → 使用指南」两级导航
- 教学流程以用户旅程为核心，每阶段强调约束文档 review

**范围内**:
- 重组所有 website/ 下的 markdown 文件
- 重写 VitePress config.ts 的 sidebar 和 nav 配置
- 重写页面内容（以现有内容为素材参考）
- 将 ASCII art 流程图转为 Mermaid
- 删除所有重复、stub、孤立页面

**必须约束**:
- 顶部导航只有「介绍」和「使用指南」两项
- 教学流程 3 页，每页包含「必须检查的文档」检查点
- 不保留任何 stub 页面
- 亮点机制保留 8 页技术版
- 所有流程图使用 Mermaid
- 构建必须通过（`pnpm docs:build` 无错误）

## Non-Trigger Rules

**范围外**:
- 不改 VitePress 框架、主题、样式
- 不改 Mermaid 插件配置
- 不新增功能主题或内容
- 不涉及部署流程

**非目标**:
- 不做 SEO 优化
- 不做国际化/多语言
- 不新增 Analytics

## User-Visible Scenarios

### 场景 1: 新用户了解 OpenFlow

**Given** 用户首次访问 OpenFlow 官网
**When** 用户点击顶部导航「介绍」
**Then** 用户看到侧边栏包含：概览、快速开始、核心概念、与竞品对比
**And** 概览页包含产品定位、解决的痛点、设计原则和工程哲学
**And** 快速开始页包含安装、配置、10 分钟上手的完整操作步骤
**And** 页面总数 ≤4 页，无重复内容

### 场景 2: 新用户快速上手

**Given** 用户已了解 OpenFlow 是什么
**When** 用户打开「介绍 → 快速开始」页面
**Then** 用户看到从安装到跑通一次完整 Feature 流程的操作步骤
**And** 步骤按顺序排列，包含关键命令和预期输出
**And** 页面内容来自合并后的安装 + 10 分钟上手 + 配置，无重复

### 场景 3: 用户跟着教学流程学习使用

**Given** 用户已安装并配置好 OpenFlow
**When** 用户打开「使用指南 → 教学流程 → 阶段一：需求探索与确认」
**Then** 用户看到：
  - 这一步做什么（简要原理）
  - 操作步骤（带 Mermaid 流程图）
  - **「⚠️ 必须检查的文档」小节**，明确告诉用户打开哪个文件、检查什么
  - 常见场景补充
**And** 阶段一覆盖 Brainstorm 和 Feature 两个节点
**And** 核心检查点：用户必须打开 `behavior.md` 逐条确认行为描述，查看 `design.md` 关键决策

**Given** 用户完成了阶段一
**When** 用户打开「阶段二：开发计划与实现」
**Then** 页面覆盖 Writing Plan 和 Implement 两个节点
**And** 核心检查点：用户确认开发计划的执行波次和约束传播后，才触发实现

**Given** 用户完成了阶段二
**When** 用户打开「阶段三：验证与归档」
**Then** 页面覆盖 Quality Gate 和 Archive 两个节点
**And** 核心检查点：Quality Gate 自动执行，用户需处理 NotReady 决策；确认归档内容

### 场景 4: 用户查看亮点机制

**Given** 用户想了解 OpenFlow 的某个亮点机制（如 TDD）
**When** 用户在侧边栏点击「亮点机制 → TDD」
**Then** 用户看到该机制的技术详细说明
**And** 亮点机制下有 8 个独立页面（TDD, BDD, 金字塔原则, 对抗性硬化, 代码地图, 漂移检测, 契约扫描, AI反思）
**And** 不存在营销向的精简版重复页面

### 场景 5: 用户查看命令参考

**Given** 用户想查看某个命令的用法
**When** 用户在侧边栏点击「参考 → 命令速查」
**Then** 用户看到所有命令的完整参考
**And** 流程图使用 Mermaid 格式（非 ASCII art）

### 场景 6: 用户迁移已有项目

**Given** 用户想把已有项目的文档迁移到 OpenFlow 结构
**When** 用户在侧边栏点击「迁移已有文档」
**Then** 用户看到迁移的完整操作指导
**And** 该页面是使用指南下的独立页面，不在单独的「进阶主题」分组中

## Required Content

### 介绍/概览（index.md）

必须包含：
- OpenFlow 的产品定位（文档治理工作流）
- 解决的 4 个核心痛点
- 设计原则（boundary-first, evidence-as-completion, archive-as-authority, docs-as-contracts）
- 工程哲学（从 philosophy.md 合并：为什么文档是合约、为什么证据 > 声明、为什么归档重要、为什么基于检查点的漂移检测）

### 介绍/快速开始（quickstart.md）

必须包含：
- 安装步骤（npm install + register plugin）
- 可选依赖（omo、GitNexus）
- Windows 特殊说明
- 配置方式（openflow.json 优先级、最小配置示例）
- 10 分钟上手流程（brainstorm → feature → writing-plan → implement → quality-gate → archive）

### 介绍/核心概念（concepts.md）

必须包含：
- 行为文档约束概念
- 目录模型（current/changes/archive/decisions）
- 两种工作流模式（Feature 和 Issue）
- 合约标记和基于检查点的漂移检测
- 来自 guide/understanding/ 的补充内容（OpenFlow 回答的 3 个核心问题、Issue 作为上下文能力、OpenFlow 中"完成"的定义）

### 教学流程三阶段

每阶段页面必须包含：
1. **这一阶段做什么** — 1-2 段简要原理
2. **操作步骤** — 具体命令和操作
3. **⚠️ 必须检查的文档** — 明确文件名、检查内容
4. **常见场景** — 补充说明

### 亮点机制（8 页）

保留现有 guide/highlights/ 8 页的技术内容，重写以确保语言一致性。每页保持：
- 该机制是什么
- 为什么需要它
- 如何使用
- 与其他机制的关系

## Success Responses

- `pnpm docs:build` 构建成功，无错误
- 所有内部链接可达，无死链
- 页面总数 ≤ 25
- 顶部导航只有 2 项
- 教学流程 3 页均有「必须检查的文档」小节

## Must Not Behavior

- 不能保留任何 stub/🚧 页面
- 不能在「介绍」和「使用指南」之外设置顶部导航入口
- 不能保留重复内容页面（同一主题出现 2 次）
- 教学流程页面不能缺少「必须检查的文档」检查点
- 不能使用 ASCII art 流程图（必须用 Mermaid）
- 不能保留 tutorial/、misc/、getting-started/ 独立目录
- 不能保留 highlights/ 营销着陆页

## Acceptance / Verification Mapping

| 验收标准 | 验证方式 |
|----------|----------|
| 顶部导航只有 2 项 | 检查 config.ts 的 nav 数组 |
| 页面总数 ≤ 25 | 统计 website/ 下 .md 文件数（不含 index.md） |
| 无 stub 页面 | 全文搜索 🚧 或 TODO 标记 |
| 教学流程有 review 检查点 | 检查 3 个 tutorial-phase*.md 包含「必须检查」小节 |
| 无重复内容 | 确认每个主题只出现 1 次 |
| 构建成功 | 运行 `pnpm docs:build` |
| Mermaid 渲染正常 | 检查所有 mermaid 代码块的语法 |
| 无死链 | VitePress 构建时检查 internal links |
