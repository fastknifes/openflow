# writing-plan-optimization - Observable Behavior

## User Context

**Target users:** 内部开发者

**Problem statement:** `openflow-writing-plan` 存在三层放大导致 subagent 爆炸和路径缺失

## Trigger Rules

These conditions activate or require the feature behavior:

- Goal-driven: 修正 `openflow-writing-plan` 的保存路径，补全 `docs/changes/*/plan.md` 和 OMO 双存
- Goal-driven: 将任务拆分策略从 "maximum parallel" 改为 "bounded work packages"
- Goal-driven: 消除 enhancer TDD expansion 和 Verification Phase 与 quality-gate 的重复
- Goal-driven: 增加 plan budget 自检防止保存前计划已爆炸
- Goal-driven: 保持 Task 段落 parser 兼容、enhancer hook 不破坏、quality-gate 指令保留
- In-scope match: 修正 writing-plan-skill.ts 和 writing-plan.ts 的路径输出和 OMO 双存逻辑
- In-scope match: 修改任务拆分策略文案
- In-scope match: 修改 plan enhancer TDD expansion 为非 checkbox 格式
- In-scope match: 废弃 enhancer Verification Phase checkbox
- In-scope match: 增加 plan budget 自检逻辑
- Must constraint: Task 段落格式兼容：`## Tasks` 下仍使用 `- [ ]` / `1.` 格式，parser 不变
- Must constraint: enhancer hook 不破坏
- Must constraint: quality-gate 指令保留
- Must constraint: SkillInfo 接口不变
- Must constraint: OMO 双存不重复
- Should constraint: 不引入新的执行依赖
- Should constraint: TDD expansion 不删除

## Non-Trigger Rules

These conditions do NOT activate the feature:

- Out of scope: 修改 /start-work 或 Atlas 执行器
- Out of scope: 删除 TDD 功能
- Out of scope: 修改 openflow-quality-gate 逻辑
- Out of scope: 修改 SkillInfo 接口签名
- Not a goal: 修改 `/start-work` 或 Atlas 执行器代码
- Not a goal: 删除 TDD expansion 功能
- Not a goal: 删除 `openflow-quality-gate` 或手动验证功能
- Not a goal: 修改 `SkillInfo` 接口签名
- Not a goal: 修改 `getPlanPath()` / `getChangePlansPath()` 函数签名

## User-Visible Scenarios

Each scenario describes what a user or external caller observes — not how the system produces it internally.

### Scenario: 运行 `/openflow-writing-plan <feature>` 后输出双路径

**Given:**
- The target user is: 内部开发者
- The problem context is: `openflow-writing-plan` 存在三层放大导致 subagent 爆炸和路径缺失

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- 运行 `/openflow-writing-plan <feature>` 后输出双路径
- The outcome is visible to the user or caller without inspecting implementation internals

### Scenario: OMO 安装时 skill 指导保存两份内容一致的 plan.md

**Given:**
- The target user is: 内部开发者
- The problem context is: `openflow-writing-plan` 存在三层放大导致 subagent 爆炸和路径缺失

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- OMO 安装时 skill 指导保存两份内容一致的 plan.md
- The outcome is visible to the user or caller without inspecting implementation internals

### Scenario: 写入 plan 后 enhancer 不再注入 checkbox 格式的 TDD expansion

**Given:**
- The target user is: 内部开发者
- The problem context is: `openflow-writing-plan` 存在三层放大导致 subagent 爆炸和路径缺失

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- 写入 plan 后 enhancer 不再注入 checkbox 格式的 TDD expansion
- The outcome is visible to the user or caller without inspecting implementation internals

### Scenario: 写入 plan 后 enhancer 不再注入 Verification Phase checkbox

**Given:**
- The target user is: 内部开发者
- The problem context is: `openflow-writing-plan` 存在三层放大导致 subagent 爆炸和路径缺失

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- 写入 plan 后 enhancer 不再注入 Verification Phase checkbox
- The outcome is visible to the user or caller without inspecting implementation internals

### Scenario: Plan budget 超过阈值时输出警告

**Given:**
- The target user is: 内部开发者
- The problem context is: `openflow-writing-plan` 存在三层放大导致 subagent 爆炸和路径缺失

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- Plan budget 超过阈值时输出警告
- The outcome is visible to the user or caller without inspecting implementation internals

### Scenario: Task 段落 parser 兼容性不变

**Given:**
- The target user is: 内部开发者
- The problem context is: `openflow-writing-plan` 存在三层放大导致 subagent 爆炸和路径缺失

**When:**
- A user or caller triggers the behavior described by this scenario

**Then (observable outcome):**
- Task 段落 parser 兼容性不变
- The outcome is visible to the user or caller without inspecting implementation internals

## Required Content

The following content or outcomes must be present in any successful response:

- Must include: 修正 writing-plan-skill.ts 和 writing-plan.ts 的路径输出和 OMO 双存逻辑
- Must include: 修改任务拆分策略文案：maximum parallel → bounded work packages
- Must include: 修改 plan enhancer TDD expansion 为非 checkbox 格式
- Must include: 废弃 enhancer Verification Phase checkbox，由 quality-gate 统一收口
- Must include: 增加 plan budget 自检逻辑
- Must include: 更新 openflow-writing-plan SKILL.md 用户侧文案
- Required outcome: 修正 `openflow-writing-plan` 的保存路径，补全 `docs/changes/*/plan.md` 和 OMO 双存
- Required outcome: 将任务拆分策略从 "maximum parallel" 改为 "bounded work packages"
- Required outcome: 消除 enhancer TDD expansion 和 Verification Phase 与 quality-gate 的重复
- Required outcome: 增加 plan budget 自检防止保存前计划已爆炸
- Required outcome: 保持 Task 段落 parser 兼容、enhancer hook 不破坏、quality-gate 指令保留
- Must satisfy constraint: Task 段落格式兼容：`## Tasks` 下仍使用 `- [ ]` / `1.` 格式，parser 不变 (verify by: bun test tests/plan/parser.test.ts)
- Must satisfy constraint: enhancer hook 不破坏：`tool-after.ts` 对 `.sisyphus/plans/*.md` 的写入拦截继续触发 (verify by: bun test tests/hooks/tool-after.test.ts)
- Must satisfy constraint: quality-gate 指令保留：Step 7 "invoke openflow-quality-gate" 不能删除 (verify by: grep 确认 skill 文案包含 quality-gate instruction)
- Must satisfy constraint: SkillInfo 接口不变：`getWritingPlanSkill()` 返回类型不修改 (verify by: npm run typecheck)
- Must satisfy constraint: OMO 双存不重复：两份 `plan.md` 内容完全一致 (verify by: skill 文案明确说明两份内容一致)

## Success Responses

**Success:** 运行 `/openflow-writing-plan <feature>` 后输出双路径

**Success:** OMO 安装时 skill 指导保存两份内容一致的 plan.md

**Success:** 写入 plan 后 enhancer 不再注入 checkbox 格式的 TDD expansion

**Success:** 写入 plan 后 enhancer 不再注入 Verification Phase checkbox

**Success:** Plan budget 超过阈值时输出警告

**Success:** Task 段落 parser 兼容性不变

## Must Not Behavior

The following outcomes must not occur as user-visible behavior:

- Must not: 修改 `/start-work` 或 Atlas 执行器代码
- Must not: 删除 TDD expansion 功能
- Must not: 删除 `openflow-quality-gate` 或手动验证功能
- Must not: 修改 `SkillInfo` 接口签名
- Must not: 修改 `getPlanPath()` / `getChangePlansPath()` 函数签名
- Excluded: 修改 /start-work 或 Atlas 执行器
- Excluded: 删除 TDD 功能
- Excluded: 修改 openflow-quality-gate 逻辑
- Excluded: 修改 SkillInfo 接口签名

## Acceptance / Verification Mapping

Each acceptance criterion maps to an observable scenario and verification approach:

| Behavior | Evidence Type | Expected Evidence | Status |
|----------|--------------|-------------------|--------|
| 运行 `/openflow-writing-plan <feature>` 后输出双路径 | tests-after | `bun test` contract tests verify dual-path output | verified |
| OMO 安装时 skill 指导保存两份内容一致的 plan.md | tests-after | skill content includes OMO dual-save instruction | verified |
| 写入 plan 后 enhancer 不再注入 checkbox 格式的 TDD expansion | tests-after | enhancer test asserts no `- [ ]` in TDD output | verified |
| 写入 plan 后 enhancer 不再注入 Verification Phase checkbox | tests-after | `formatPrefix('plan')` returns `-` not `- [ ]` | verified |
| Plan budget 超过阈值时输出警告 | tests-after | `addBudgetWarning()` unit tests with task count and unit thresholds | verified |
| Task 段落 parser 兼容性不变 | tests-after | parser test confirms `## Tasks` and `## TODOs` both parsed | verified |
