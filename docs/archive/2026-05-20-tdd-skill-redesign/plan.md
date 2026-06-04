# Plan: TDD Skill Redesign

## Overview

将 TDD 从 plan enhancer 静态注入改为 AI skill 动态注册。

## Design Context

- Design workspace: `docs/changes/2026-05-20-tdd-skill-redesign/`
- Primary design: `docs/changes/2026-05-20-tdd-skill-redesign/design.md`
- Observable behavior: `docs/changes/2026-05-20-tdd-skill-redesign/behavior.md`
- Requirements: `docs/changes/2026-05-20-tdd-skill-redesign/requirements.md`

## Execution Strategy

### Wave 1: Foundation (可以并行)

**Task 1: 创建 TDD Skill 内容**
- Agent: `deep`
- Skills: [`gitnexus-impact-analysis`]
- File: `src/skills/tdd-skill.ts`
- 内容要求：
  - 基于 superpowers TDD skill 精华（Red-Green-Refactor、anti-patterns）
  - 适配 OpenFlow：提到 `openflow-quality-gate` 作为最终验证
  - 核心业务判断标准：算法、数据模型、业务规则、状态机才走 TDD
  - 豁免机制：配置/胶水/工具函数可跳过，需简要说明
  - 不包含用户交互（AI-invoked skill）
- 验收：`bun test tests/skills/tdd-skill.test.ts` 能验证 skill 内容包含关键章节

**Task 2: 简化 Config 和 Type**
- Agent: `quick`
- Skills: [`gitnexus-impact-analysis`]
- Files: `src/types.ts`, `src/config.ts`, `src/commands/config-cmd.ts`
- 变更：
  - `TddConfig` 移除 `expand_threshold`，保留 `enabled: boolean`
  - Zod schema 移除 `expand_threshold`
  - Config 展示移除 `expand_threshold`
- 验收：
  - `npm run typecheck` 通过
  - 现有 config 测试通过（带/不带 `expand_threshold`）

### Wave 2: 核心重构 (依赖 Wave 1)

**Task 3: 修改 Skill 注册系统**
- Agent: `deep`
- Skills: [`gitnexus-impact-analysis`]
- Files: `src/skills/registry.ts`, `src/skills/registration.ts`, `src/commands/manifest.ts`, `src/index.ts`
- 变更：
  - `registry.ts`: `getSkills()` 接收 `OpenFlowConfig` 参数，根据 `tdd.enabled` 过滤
  - `registration.ts`: 传递 `ctx.config` 给 `getSkills()`
  - `manifest.ts`: `OPENFLOW_REGISTERED_SKILL_NAMES` 新增 `'openflow-tdd'`
  - `index.ts`: 确保注册调用正常
- 验收：
  - `tdd.enabled=true` 时 `getSkills()` 返回包含 TDD skill
  - `tdd.enabled=false` 时 `getSkills()` 返回不包含 TDD skill

**Task 4: 清理 Plan Enhancer**
- Agent: `deep`
- Skills: [`gitnexus-impact-analysis`]
- Files: `src/plan/enhancer.ts`, `src/hooks/tool-after.ts`
- 变更：
  - `enhancer.ts`: 删除 `addTddExpansionComment()`, `TDD_EXPANDED_HEADER` 常量，及相关调用
  - `enhancer.ts`: 保留 Design Context, Verification Phase, Budget Warning
  - `tool-after.ts`: 从 trigger 条件中移除 `ctx.config.tdd.enabled`
- 验收：
  - `bun test tests/plan/enhancer.test.ts` 通过
  - 计划文件不再包含 `## TDD Expanded Tasks`
  - 其他 enhancer 功能正常工作

### Wave 3: 测试和验证 (依赖 Wave 2)

**Task 5: 更新/新增测试**
- Agent: `quick`
- Skills: [`openflow-quality-gate`]
- Files: `tests/plan/enhancer.test.ts`, `tests/skills/tdd-skill.test.ts`
- 变更：
  - `enhancer.test.ts`: 删除 TDD 展开相关测试用例
  - 新增 `tdd-skill.test.ts`: 测试 skill 内容包含关键章节；测试条件注册逻辑
  - 如有需要，更新 `tool-after.test.ts`
- 验收：所有测试通过

**Task 6: 最终验证**
- Agent: `quick`
- Skills: [`openflow-quality-gate`]
- 步骤：
  1. `bun test` 全量测试
  2. `npm run typecheck`
  3. `gitnexus_impact` 确认修改范围
  4. `gitnexus_detect_changes` 确认改动文件
  5. 调用 `openflow-quality-gate`
- 验收：
  - 所有测试通过
  - typecheck 通过
  - quality gate 报告 readiness

## Dependency Matrix

| Task | Blocked By | Blocks |
|------|------------|--------|
| 1. TDD Skill 内容 | None | 3 |
| 2. Config 简化 | None | 3, 4 |
| 3. Skill 注册系统 | 1, 2 | 5 |
| 4. Plan Enhancer 清理 | 2 | 5 |
| 5. 测试更新 | 3, 4 | 6 |
| 6. 最终验证 | 5 | None |

## Self-Check

- No placeholders: PASS
- Concrete file paths: PASS
- Verification commands: PASS
- Bounded complexity: PASS
- Task count: 6 tasks
- Execution units estimate: 15 units
- Same-wave concurrency: max 2 tasks (Wave 1)
