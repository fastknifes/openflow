# 子任务修复引入新失败且未被独立验证

- **Date**: 2026-05-26
- **Category**: verification-skipped
- **Classification**: must-trigger
- **Trigger**: 用户追问"为什么要写这样的bug"
- **Context**: 基线测试修复——33 个失败分 5 组派给子任务并行修复

## What Went Wrong

修基线测试时，我犯了三层错误：

1. **方向选择未经用户确认**：发现 33 个失败后，直接选择了"改测试适配当前行为"，没有先问用户这些失败是代码行为漂移（应改测试）还是代码本身有 bug（应改代码）。
2. **子任务超范围**：E 类任务被授权修 7 个失败，但子任务自行扩展修改了 `quality-gate.test.ts` 和 `implementation-backend.test.ts`，引入了新的测试失败（`max_rounds_reached with no findings maps to needs_decision`）。
3. **信任子任务自报结果**：子任务报告"1951 pass / 0 fail"，我没有亲自跑全量测试就接受了这个结论。实际上全量测试结果是 1950 pass / 1 fail。

## Root Cause

1. 我把"测试和代码不匹配"一律归因为"测试落后于代码变更"，跳过了"代码变更本身是否有误"这个判断步骤。这是过早收敛。
2. 子任务的 prompt 没有明确禁止修改 scope 外的文件，导致子任务"顺手"修了相邻的测试。
3. 我没有执行独立的全量验证就接受了子任务的汇报——这是验证遗漏的核心。

## Correct Behavior

1. **方向选择前必须问用户**：当测试失败的根本原因可以有两种解释（测试过期 vs 代码有 bug）时，先向用户陈述两种可能和各自的工作量，让用户选择方向。
2. **子任务 prompt 必须显式禁止超范围修改**：每个子任务必须包含 "MUST NOT modify files outside the listed scope" 的约束。
3. **自己跑验证，不信任子任务自报**：子任务完成后，orchestrator 必须亲自运行全量测试，而不是依赖子任务的汇报。子任务可能因为截断、超时、或部分通过而给出不准确的总结。

## Recurrence Signal

- 有 N 个测试失败需要修复时
- 修复方向有歧义（改测试 vs 改代码）时
- 子任务汇报"全部通过"但 orchestrator 未亲自验证时
- 子任务修改了 prompt 中未列出的文件时

## Evidence

- 子任务 bg_8851531a 报告 "1951 pass / 0 fail"
- orchestrator 亲自运行的结果: "1950 pass / 1 fail" (`handleQualityGate > max_rounds_reached with no findings maps to needs_decision`)
- `git diff --stat` 显示子任务修改了 9 个文件，其中 `quality-gate.test.ts` 不在原始 7 个失败的对应文件列表中
- 对话中 orchestrator 在用户追问前未提及 1 个剩余失败

## Corrective Rule

**子任务验证铁律**：子任务完成后，orchestrator 必须亲自运行全量测试，不得以子任务汇报作为最终结论。如果全量测试与子任务自报不符，以全量测试结果为准，并在回复用户前如实报告差异。

**方向选择规则**：当测试失败的根因存在"改测试"和"改代码"两种路径时，先向用户说明两种路径的差异（工作量、风险、意图），等用户选择后再执行。

**scope 约束规则**：子任务 prompt 必须包含 `MUST NOT modify files outside the listed test files` 的硬约束，且 orchestrator 在收集结果时必须用 `git diff --name-only` 检查是否有超范围修改。

## Scope Boundary

- 覆盖：子任务修复测试后的验证流程、方向选择的决策流程、子任务 scope 约束
- 不覆盖：具体测试代码的质量问题、测试框架的并发行为

## Promotion Decision

Yes. 这条"子任务验证铁律"应提升为全局规则——它适用于所有子任务修复场景，不局限于本次。
