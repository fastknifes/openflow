# writing-plan-optimization - Implementation Mapper

**Date**: 2026-05-18
**Status**: Archived

## 1. 概述

本次变更解决了与 `writing-plan-optimization` 相关的实现追溯需求。

**归档时间**: 2026-05-18
**追溯范围**: 本次变更覆盖需求到实现的完整追溯链。

## 2. 需求到实现映射

> 未发现 requirements / proposal 追溯项，已回退使用 design 文档生成追溯关系。

| 追溯来源 | 需求/决策 | 代码文件 | 关键符号 | 关联说明 | 验证证据 |
|----------|-----------|----------|----------|----------|----------|
| design: docs/changes/2026-05-14-writing-plan-optimization/design.md → Goals \(goal-1\) | 修正 openflow-writing-plan 的保存路径，补全 docs/changes/\*/plan.md 和 OMO 双存 | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md; F:/ai-code/openflow/docs/changes/2026-05-14-ai-reflection/behavior.md; F:/ai-code/openflow/src/index.ts | file-level fallback | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md \(modified\); F:/ai-code/openflow/docs/changes/2026-05-14-ai-reflection/behavior.md \(modified\); F:/ai-code/openflow/src/index.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/2026-05-14-writing-plan-optimization/design.md → Goals \(goal-2\) | 将任务拆分策略从 maximum parallel 改为 bounded work packages | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md; F:/ai-code/openflow/src/index.ts; F:/ai-code/openflow/src/command-registration.ts | file-level fallback | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md \(modified\); F:/ai-code/openflow/src/index.ts \(modified\); F:/ai-code/openflow/src/command-registration.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/2026-05-14-writing-plan-optimization/design.md → Goals \(goal-3\) | 消除 enhancer TDD expansion 和 Verification Phase 与 quality-gate 的重复 | F:/ai-code/openflow/src/skills/quality-gate-skill.ts | file-level fallback | F:/ai-code/openflow/src/skills/quality-gate-skill.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/2026-05-14-writing-plan-optimization/design.md → Goals \(goal-4\) | 增加 plan budget 自检防止保存前计划已爆炸 | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md | file-level fallback | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md \(modified\) | no verification evidence recorded |
| design: docs/changes/2026-05-14-writing-plan-optimization/design.md → Goals \(goal-5\) | 保持 Task 段落 parser 兼容、enhancer hook 不破坏、quality-gate 指令保留 | F:/ai-code/openflow/src/skills/quality-gate-skill.ts | file-level fallback | F:/ai-code/openflow/src/skills/quality-gate-skill.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/2026-05-14-writing-plan-optimization/design.md → Constraints \(c-compat-format\) | Task 段落格式兼容：\#\# Tasks 下仍使用 - \[ \] / 1. 格式，parser 不变 | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md; F:/ai-code/openflow/src/index.ts; F:/ai-code/openflow/src/command-registration.ts | file-level fallback | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md \(modified\); F:/ai-code/openflow/src/index.ts \(modified\); F:/ai-code/openflow/src/command-registration.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/2026-05-14-writing-plan-optimization/design.md → Constraints \(c-compat-hook\) | enhancer hook 不破坏：tool-after.ts 对 .sisyphus/plans/\*.md 的写入拦截继续触发 | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md; F:/ai-code/openflow/src/index.ts; F:/ai-code/openflow/src/command-registration.ts | file-level fallback | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md \(modified\); F:/ai-code/openflow/src/index.ts \(modified\); F:/ai-code/openflow/src/command-registration.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/2026-05-14-writing-plan-optimization/design.md → Constraints \(c-compat-qg\) | quality-gate 指令保留：Step 7 invoke openflow-quality-gate 不能删除 | F:/ai-code/openflow/src/skills/quality-gate-skill.ts; F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md; F:/ai-code/openflow/src/index.ts | file-level fallback | F:/ai-code/openflow/src/skills/quality-gate-skill.ts \(modified\); F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md \(modified\); F:/ai-code/openflow/src/index.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/2026-05-14-writing-plan-optimization/design.md → Constraints \(c-compat-api\) | SkillInfo 接口不变：getWritingPlanSkill\(\) 返回类型不修改 | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md; F:/ai-code/openflow/src/index.ts; F:/ai-code/openflow/src/command-registration.ts | file-level fallback | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md \(modified\); F:/ai-code/openflow/src/index.ts \(modified\); F:/ai-code/openflow/src/command-registration.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/2026-05-14-writing-plan-optimization/design.md → Constraints \(c-compat-dual\) | OMO 双存不重复：两份 plan.md 内容完全一致 | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md | file-level fallback | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md \(modified\) | no verification evidence recorded |
| design: docs/changes/2026-05-14-writing-plan-optimization/design.md → Constraints \(c-scope-no-exec\) | 不引入新的执行依赖：不改 /start-work 或 Atlas 的代码 | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md; F:/ai-code/openflow/src/index.ts; F:/ai-code/openflow/src/command-registration.ts | file-level fallback | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md \(modified\); F:/ai-code/openflow/src/index.ts \(modified\); F:/ai-code/openflow/src/command-registration.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/2026-05-14-writing-plan-optimization/design.md → Constraints \(c-scope-tdd\) | TDD expansion 不删除：只改输出格式（非 checkbox），不删功能 | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md; F:/ai-code/openflow/src/index.ts; F:/ai-code/openflow/src/command-registration.ts | file-level fallback | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md \(modified\); F:/ai-code/openflow/src/index.ts \(modified\); F:/ai-code/openflow/src/command-registration.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/2026-05-14-writing-plan-optimization/design.md → Constraints \(c-maintain-budget\) | Plan budget 自检阈值可配置 | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md | file-level fallback | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md \(modified\) | no verification evidence recorded |
| design: docs/changes/2026-05-14-writing-plan-optimization/design.md → Acceptance Criteria \(ac-dual-path\) | 运行 /openflow-writing-plan \<feature\> 后输出双路径 | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md; F:/ai-code/openflow/src/index.ts; F:/ai-code/openflow/src/command-registration.ts | file-level fallback | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md \(modified\); F:/ai-code/openflow/src/index.ts \(modified\); F:/ai-code/openflow/src/command-registration.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/2026-05-14-writing-plan-optimization/design.md → Acceptance Criteria \(ac-omo-dual\) | OMO 安装时 skill 指导保存两份内容一致的 plan.md | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md; F:/ai-code/openflow/src/skills/quality-gate-skill.ts | file-level fallback | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md \(modified\); F:/ai-code/openflow/src/skills/quality-gate-skill.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/2026-05-14-writing-plan-optimization/design.md → Acceptance Criteria \(ac-tdd-format\) | 写入 plan 后 enhancer 不再注入 checkbox 格式的 TDD expansion | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md | file-level fallback | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md \(modified\) | no verification evidence recorded |
| design: docs/changes/2026-05-14-writing-plan-optimization/design.md → Acceptance Criteria \(ac-verify-dedup\) | 写入 plan 后 enhancer 不再注入 Verification Phase checkbox | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md | file-level fallback | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md \(modified\) | no verification evidence recorded |
| design: docs/changes/2026-05-14-writing-plan-optimization/design.md → Acceptance Criteria \(ac-budget\) | Plan budget 超过阈值时输出警告 | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md | file-level fallback | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md \(modified\) | no verification evidence recorded |
| design: docs/changes/2026-05-14-writing-plan-optimization/design.md → Acceptance Criteria \(ac-parser\) | Task 段落 parser 兼容性不变 | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md; F:/ai-code/openflow/src/index.ts; F:/ai-code/openflow/src/command-registration.ts | file-level fallback | F:/ai-code/openflow/docs/changes/2026-05-14-writing-plan-optimization/behavior.md \(modified\); F:/ai-code/openflow/src/index.ts \(modified\); F:/ai-code/openflow/src/command-registration.ts \(modified\) | no verification evidence recorded |


## 3. 行为到实现映射

| Behavior Scenario | Type | Expected Behavior | Evidence | Code Files | Key Symbols | Notes |
|------------------|------|-------------------|----------|------------|-------------|-------|
| 运行 \`/openflow-writing-plan \<feature\>\` 后输出双路径 | scenario | Not specified. | — | — | — | Critical behavior scenario. |
| OMO 安装时 skill 指导保存两份内容一致的 plan.md | scenario | Not specified. | — | — | — | Critical behavior scenario. |
| 写入 plan 后 enhancer 不再注入 checkbox 格式的 TDD expansion | scenario | Not specified. | — | — | — | Critical behavior scenario. |
| 写入 plan 后 enhancer 不再注入 Verification Phase checkbox | scenario | Not specified. | — | — | — | Critical behavior scenario. |
| Plan budget 超过阈值时输出警告 | scenario | Not specified. | — | — | — | Critical behavior scenario. |
| Task 段落 parser 兼容性不变 | scenario | Not specified. | — | — | — | Critical behavior scenario. |


## 4. 验证与结论

**验证证据**: no verification evidence recorded


