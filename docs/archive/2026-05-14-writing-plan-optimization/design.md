# writing-plan-optimization - Design

## Overview

Feature: writing-plan-optimization

Target users: 内部开发者

In scope: 修正 writing-plan 保存路径和 OMO 双存逻辑; 任务拆分策略从 maximum parallel 改为 bounded work packages; TDD expansion 降级为非 checkbox 格式; 废弃 enhancer Verification Phase checkbox; 增加 plan budget 自检

Out of scope: 修改 /start-work 或 Atlas 执行器; 删除 TDD 功能; 修改 openflow-quality-gate 逻辑; 修改 SkillInfo 接口签名

## Problem

`openflow-writing-plan` 存在三层放大导致 subagent 爆炸：skill 里的 "maximum parallel execution" + "one file per task" + "dispatch as subagent" 指令导致计划被过度分解（10 个 task → 50+ subagent session），执行时间不可控。同时保存路径只指向 `.sisyphus/plans/{feature}.md`，缺失 `docs/changes/*/plan.md` 且没有 OMO 双存逻辑，与 change workspace 制品体系不一致。enhancer 的 TDD expansion 为每个 implementation task 生成 6 个 checkbox 进一步放大，Verification Phase 与 quality-gate 存在重复验证层。

## Goals

- 修正 `openflow-writing-plan` 的保存路径，补全 `docs/changes/*/plan.md` 和 OMO 双存
- 将任务拆分策略从 "maximum parallel" 改为 "bounded work packages"
- 消除 enhancer TDD expansion 和 Verification Phase 与 quality-gate 的重复
- 增加 plan budget 自检，防止保存前计划已爆炸
- 保持 Task 段落 parser 兼容、enhancer hook 不破坏、quality-gate 指令保留

## Non-Goals

- 修改 `/start-work` 或 Atlas 执行器代码
- 删除 TDD expansion 功能
- 删除 `openflow-quality-gate` 或手动验证功能
- 修改 `SkillInfo` 接口签名
- 修改 `getPlanPath()` / `getChangePlansPath()` 函数签名

## Architecture

### Component: Writing-Plan Skill Content

- Location: `src/skills/writing-plan-skill.ts`
- `getWritingPlanSkill()` (function) — Skill content 文案，包含 Step 4 的路径和拆分规则
- 改动：路径从单一 `.sisyphus/plans/` 改为双路径 + OMO 检测；拆分从 "maximum parallel" 改为 "bounded work packages"

### Component: Writing-Plan Command Handler

- Location: `src/commands/writing-plan.ts`
- `handleWritingPlan()` (function) — 生成 plan-writing packet，输出路径和格式规则
- 改动：Packet 增加 `### Plan Output Paths` 双路径 + OMO 说明；去掉 "Dispatch each same-wave task as a subagent"

### Component: Plan Enhancer

- Location: `src/plan/enhancer.ts`
- `enhancePlan()` (function) — 对 `.sisyphus/plans/*.md` 和 `docs/changes/*/plan.md` 写入后自动注入 TDD expansion、Verification Phase 和 Plan Budget Notice
- 改动：TDD expansion 输出改为 guidance 格式（bold heading + prose），不再生成 checkbox；Verification Phase 改为 plain bullet 参考；增加 idempotent `## Plan Budget Notice` section

### Component: Enhancer Trigger Hook

- Location: `src/hooks/tool-after.ts`
- tool-after hook — 检测 `.sisyphus/plans/*.md` 和 `docs/changes/*/plan.md` 写入，调用 `enhancePlan()`
- 改动：`isPlanFile()` 扩展支持 `docs/changes/*/plan.md` 路径检测

### Component: Plan Parser

- Location: `src/plan/parser.ts`
- `extractPlanName()` (function) — 从 plan 文件路径提取 plan 名称
- 改动：扩展支持 `docs/changes/YYYY-MM-DD-{feature}/plan.md` 格式，自动剥离日期前缀

### Component: Verification Checks

- Location: `src/utils/verification-checks.ts`
- `formatPrefix()` (function) — 格式化 verification check 前缀
- 改动：`formatPrefix('plan')` 从 `- [ ]` 改为 `-`（plain bullet），统一 plan mode 下 verification 不使用 checkbox

### Component: User-Facing SKILL.md

- Location: `C:\Users\Administrator\.config\opencode\skills\openflow-writing-plan\SKILL.md`
- 用户侧 skill 文案
- 改动：路径、拆分策略、budget 自检说明同步更新

## Design Constraints

- [must] Task 段落格式兼容：`## Tasks` 下仍使用 `- [ ]` / `1.` 格式，parser 不变
- [must] enhancer hook 不破坏：`tool-after.ts` 对 `.sisyphus/plans/*.md` 的写入拦截继续触发
- [must] quality-gate 指令保留：Step 7 "invoke openflow-quality-gate" 不能删除
- [must] SkillInfo 接口不变：`getWritingPlanSkill()` 返回类型不修改
- [must] OMO 双存不重复：两份 `plan.md` 内容完全一致
- [should] 不引入新的执行依赖：不改 `/start-work` 或 Atlas 的代码
- [should] TDD expansion 不删除：只改输出格式（非 checkbox），不删功能
- [may] Plan budget 自检阈值可配置：先使用硬编码默认值，后续考虑加入 config

## Behavior Alignment

| Behavior Scenario | Design Response | Files / Modules | Risk |
|------------------|-----------------|-----------------|------|
| 计划写入后路径正确 | writing-plan command 输出双路径 | src/commands/writing-plan.ts | High |
| OMO 双存内容一致 | skill 文案明确 "内容相同的一份计划保存到两个位置" | src/skills/writing-plan-skill.ts | High |
| 不再生成 TDD checkbox | enhancer 输出改为 bold heading + prose guidance | src/plan/enhancer.ts | Medium |
| Verification Phase 不再 checkbox | verification-checks formatPrefix('plan') 返回 `-` | src/utils/verification-checks.ts | Medium |
| Plan budget 超阈值警告 | enhancer 添加 idempotent `## Plan Budget Notice` section | src/plan/enhancer.ts | Low |
| parser 兼容 | 不改 `## Tasks` 下的 checkbox 格式，扩展 `extractPlanName()` | src/plan/parser.ts | High |
| enhancer hook 双路径触发 | `isPlanFile()` 支持 `docs/changes/*/plan.md` 和 `.sisyphus/plans/*.md` | src/hooks/tool-after.ts | High |

## Proposed Design

Address the problem statement: `openflow-writing-plan` 存在三层放大和路径缺失问题。Primary scope: 修正路径和双存; 拆分策略改为 bounded; TDD expansion 降级; Verification Phase 废弃; 增加 budget 自检

## Risks And Mitigations

- Risk: 修改 writing-plan 文案后，现有计划文件被新解析器误解。Mitigation: parser 不变，只改 skill 文案中的指导语
- Risk: TDD expansion 格式改变后，执行引擎找不到可执行任务。Mitigation: 改为 bullet guidance 保留语义，执行引擎原本不解析 `## TDD Expanded Tasks` 段
- Risk: 双存逻辑导致两份文件不一致。Mitigation: skill 文案明确要求内容完全一致，非两份独立计划
- Risk: budget 自检误判导致大型合理计划被拒绝。Mitigation: budget 仅做警告提示，不硬阻断

## Testing Strategy

tests-after: 修改后运行 `bun test` 确认现有 tests 通过；新增 plan budget 自检的单元测试；验证 enhancer 输出格式变化后测试仍然通过。

## Success Criteria

- [ ] `writing-plan` command 输出包含 `docs/changes/*/plan.md` 和 `.sisyphus/plans/*.md` 双路径
- [ ] OMO 检测逻辑在 command 中正确判断并输出双存说明
- [ ] Skill 文案不再包含 "maximum parallel" 和 "dispatch each same-wave task as a subagent"
- [ ] Enhancer TDD expansion 不再生成 checkbox 格式
- [ ] Enhancer Verification Phase checkbox 已移除或改为参考说明
- [ ] Plan budget 自检在写入前估算 execution units 并超过阈值时警告
- [ ] `bun test` 全部通过
- [ ] Task 段落 parser 兼容性验证通过
