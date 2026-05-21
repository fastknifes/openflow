# harden-orchestration-redesign - Observable Behavior

**日期**: 2026-05-21
**Feature**: harden-orchestration-redesign
**状态**: Behavior

---

## 1. 问题背景

当前 harden 流程中，Reviewer 单向输出 findings，Executor 只能被动修复，不存在真正的攻防博弈。Token 硬性限制会在审查尚未收敛时强制终止。角色和提示词混杂在同一个 session 中，行为边界模糊。

本设计改造 harden 为真正的三角色对抗流程。

---

## 2. 触发规则

当满足以下条件时，harden 按本 behavior 执行：

- AI 在完成代码实现后调用 `openflow-quality-gate`
- quality-gate 的风险评估判定需要运行 harden（complex 或 simple 级别）
- `harden.enabled` 为 true

当 `harden.enabled` 为 false 或 complexity 为 trivial 时，不触发 harden。

---

## 3. 非触发规则

以下情况不按本 behavior 的对抗流程执行：

- trivial 级别：直接拒绝，不消耗审查资源（保持现有行为）
- harden 被禁用：返回拒绝状态
- 外部直接调用旧版 `/openflow-harden` 命令：仍走 `handleHarden` 入口，但内部流程已更新

---

## 4. 用户可见场景

### 4.1 场景：complex 级别进入完整对抗循环

**Given:**
- 当前 feature 的 git diff 规模达到 complex 级别（多文件、有逻辑分支、涉及状态变更）
- 存在有效的 plan 文件

**When:**
- quality-gate 触发 harden

**Then（可观察结果）：**

1. **Session 创建可见性**
   - 用户可见多个子 session 被创建，标题分别为：
     - `Harden Round 1/5 - Reviewer`
     - `Harden Round 1/5 - Executor`
     - `Harden Round 2/5 - Reviewer`
     - `Harden Round 2/5 - Executor`
     - ...（根据实际轮次）

2. **Reviewer 行为**
   - Reviewer session 中只读，不修改任何文件
   - 输出格式化的 findings 列表，每个 finding 包含 Level / Description / Evidence / Files

3. **Executor 行为**
   - Executor session 中可能修改代码（仅接受/partial 的 finding）
   - 输出 Disposition Report，明确标注每个 finding 的 verdict：
     - `accept`：确认问题存在，已修复
     - `reject`：否决 finding，给出理由
     - `partial`：部分确认，已做最小修复

4. **反驳流程（如触发）**
   - 若 Executor 否决了 finding，可能出现额外 session：
     - `Harden Round 1/5 - Reviewer Rebuttal`
     - `Harden Round 1/5 - Executor Rebuttal`
   - Reviewer Rebuttal 中可见补充证据或接受反驳的声明
   - Executor Rebuttal 中可见最终 verdict

5. **终止状态**
   - 最终输出 markdown 报告，包含：
     - Status: `pass` / `pass_with_risks` / `max_rounds_reached` / `needs_human`
     - Rounds: 实际执行轮次
     - Total tokens consumed: 各角色 token 消耗总和（纯展示，不影响结果）
     - 每轮 findings 和 disposition 摘要

### 4.2 场景：simple 级别进入轻量审视

**Given:**
- 当前 feature 的 git diff 规模达到 simple 级别（单文件 ≤50 行、无明显逻辑分支）

**When:**
- quality-gate 触发 harden

**Then（可观察结果）：**
- 只创建一轮 Reviewer + Executor session
- Executor 只做确认/否决，不进入多轮修复循环
- 最终报告返回用户，由用户自行决定是否修复（不自动修复）

### 4.3 场景：token 不触发截断

**Given:**
- 某轮 Reviewer 或 Executor 消耗了大量 token

**When:**
- token 消耗超过旧版 budget 阈值

**Then（可观察结果）：**
- 流程不中断，继续执行
- 最终报告中显示实际 token 消耗，不带任何 budget exhausted 警告
- 终止原因只能是轮次耗尽或人工介入，不会是因为 token

### 4.4 场景：旧配置平滑兼容

**Given:**
- 项目配置文件中仍保留 `tokenBudgetTotal` 或 `tokenBudgetPerRound` 字段

**When:**
- harden 读取配置

**Then（可观察结果）：**
- harden 正常执行，不因旧字段报错
- 旧字段被静默忽略，实际只受 `maxRounds` 限制

---

## 5. 必须包含的内容

任何成功的 harden 执行结果必须包含：

- [ ] 明确的 Status 字段（`pass` / `pass_with_risks` / `max_rounds_reached` / `needs_human` / `rejected`）
- [ ] 实际执行轮次（Rounds）
- [ ] 每轮的 findings 列表（如有）
- [ ] Executor 的 Disposition Report（`accept` / `reject` / `partial` 判定 + 理由）
- [ ] 反驳记录（如有触发反驳子流程）
- [ ] Total tokens consumed（纯统计，不影响结果）
- [ ] Stop reason（终止原因）
- [ ] Coordinator session ID（用于审计追踪）
- [ ] 每轮 Reviewer / Executor 的子 session ID（用于审计追踪）
- [ ] Findings 最终状态汇总（`resolved` / `rejected` / `unresolved_must_fix` / `unresolved_needs_decision` / `accepted_known_issues`）

---

## 6. 禁止行为

以下行为在任何情况下不得出现：

- [ ] Executor 在未给出 verdict 和理由的情况下直接修改代码
- [ ] Reviewer 在 simple 级别被跳过（simple 仍需运行 Reviewer）
- [ ] 因 token 消耗超过阈值而提前终止 harden
- [ ] 单 finding 争论超过 `maxArgumentRoundsPerFinding` 轮而未标记为 `design_ambiguity`
- [ ] Coordinator 自行审查代码或修改代码（只能调度）
- [ ] Executor 修改 plan 范围外的文件

---

## 7. 验收标准

| 验收标准 | 验证场景 | 证据类型 | 期望证据 |
|---------|---------|---------|---------|
| Reviewer 和 Executor 拥有独立 session | 4.1 | 日志/测试 | `createHardenSession` 被调用多次，session 标题包含角色和轮次 |
| Executor 可输出 reject verdict | 4.1 | 日志/测试 | Disposition Report 中包含 `verdict: reject` 和 `rationale` |
| Reviewer 可对 rejection 反驳一次 | 4.1 | 日志/测试 | 出现 `Reviewer Rebuttal` session，且不超过 `maxArgumentRoundsPerFinding` |
| Token 不触发截断 | 4.3 | 日志/测试 | 大 token 消耗下流程仍完成，Status 不为 `budget_exhausted` |
| 对话标题携带轮次 | 4.1 | 日志/测试 | 所有子 session 标题包含 `Round N/{maxRounds}` |
| 旧配置兼容 | 4.4 | 测试 | 包含旧 token 字段的配置文件不报错，harden 正常执行 |
| simple 模式不自动修复 | 4.2 | 测试 | simple 级别下 Executor 输出 disposition 但不做多轮修复 |
| 报告包含 findings 最终状态汇总 | 4.1 | 测试 | 最终报告中包含 `resolved` / `rejected` / `unresolved_must_fix` / `unresolved_needs_decision` 分类 |
| 报告包含子 session ID | 4.1 | 测试 | 每轮报告包含 reviewer_session_id 和 executor_session_id |
| Quality-gate 能正确解析新报告 | 4.1 | 测试 | quality-gate 的 `parseFindingsSummary` 和 `extractHardenStatus` 能识别新格式 |

---

## 8. 与 design.md 的映射

| design.md 章节 | behavior.md 对应 |
|----------------|-----------------|
| 3. 角色架构 | 4.1 中观察到的三角色行为 |
| 4.1 完整流程 | 4.1 中描述的 session 序列和输出格式 |
| 4.2 simple 模式 | 4.2 轻量审视 |
| 5.2 对话标题 | 4.1 session 创建可见性 |
| 7.1 移除 token 限制 | 4.3 token 不触发截断 |
| 7.4 向后兼容 | 4.4 旧配置平滑兼容 |
| 9.2 向父 Session 的报告契约 | 5. 必须包含的内容（findings 最终状态汇总、子 session ID） |
| 9.2 向父 Session 的报告契约 | 7. 验收标准（报告包含 findings 最终状态汇总、子 session ID、quality-gate 能正确解析） |
