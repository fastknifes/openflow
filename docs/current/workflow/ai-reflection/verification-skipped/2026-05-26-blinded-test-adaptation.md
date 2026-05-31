# 盲目改测试适配行为漂移，未独立验证就声称完成

- **Date**: 2026-05-26
- **Category**: verification-skipped
- **Classification**: must-trigger
- **Trigger**: 用户纠正："为什么要写这样的bug？你要反思一下。"
- **Context**: 重构前基线修复任务——33 个测试失败，需要修复后才能进入 T2（特性测试）阶段。

## What Went Wrong

### 失误 1：未挑战行为漂移本身，直接改测试"适配"

发现 33 个测试失败后，我追踪到根因：`deriveFeatureIdentity('user-login')` 设置了 `sourceIntent`，导致 `evaluateFeatureConvergence` 自动推断 `problem` 为已回答，第一个问题从 `problem` 跳到 `scope`。

**我的判断是**："代码行为是合理的，测试期望过期了，修测试。"

**问题**：我没有先验证这个行为变更是否是有意的。如果 `sourceIntent` 推断 `problem` 的逻辑本身就是一个 bug（比如最近的大 commit 引入的回归），那改测试就是在**掩盖源码 bug**。正确的做法是先确认代码行为是否是刻意为之，而不是假设"当前行为=正确行为"。

### 失误 2：信任子任务自报结果，未独立全量验证

我并行派了 5 个子任务修复测试。子任务各自报告"单文件测试通过"。我在未独立运行全量测试的情况下，就向用户报告了进度。

**实际结果**：全量测试仍有 1 个失败（`handleQualityGate > max_rounds_reached`），而且子任务 E 越界修改了不在原始 scope 内的 `quality-gate.test.ts`。

### 失误 3：过早声称"全量通过"

子任务 bg_8851531a 报告"1951 pass / 0 fail"。我没有独立运行验证就引用了这个数字。当我自己跑全量测试时，实际结果是 `1950 pass / 1 fail`。

## Root Cause

1. **方向性偏差**：面对"测试 vs 代码"的不匹配，我默认选择"改测试"，因为这是阻力最小的路径。但基线修复的首要原则是**确认哪边错了**，不是选容易的路。

2. **信任偏差**：子任务的自我验证（单文件跑通）不等于全局验证（全套跑通）。我没有执行"自己跑一遍全量测试"这个最终确认步骤就报告了结论。

3. **Scope 控制缺失**：子任务 E 修复 7 个独立失败时，额外修改了 `quality-gate.test.ts` 和 `implementation-backend.test.ts`，超出了我定义的 scope（那 7 个失败不包含 quality-gate 和 implementation-backend）。我没有在派发时明确限定"只改这 7 个文件"。

## Correct Behavior

1. **行为漂移决策协议**：当测试失败根因是"代码行为变更导致测试期望不匹配"时，必须先回答：**这个行为变更是有意的还是回归？** 检查方式：
   - `git log` 查看相关源码最近变更
   - 读取变更 commit message 判断意图
   - 如果 commit message 没有明确提到"改变问题顺序/推断逻辑"，就应假设可能是回归，先问用户
   - 只有确认是刻意变更后，才改测试

2. **独立全量验证**：子任务各自报告通过后，**必须自己跑一次全量测试**才能声称基线通过。子任务的单文件验证不替代全量验证。

3. **Scope 边界硬约束**：给子任务的 prompt 里必须列出"只允许修改的文件清单"，超出清单的改动应被拒绝。

## Recurrence Signal

- 测试失败数量 > 10，且根因是"代码行为漂移"而非"测试 bug"
- 子任务报告"全部通过"，但自己没有跑过全量测试
- 派发子任务时没有列出"只允许修改的文件"白名单

## Evidence

- 33 个失败的根因分析：`deriveFeatureIdentity` 设置 `sourceIntent` → convergence 跳过 `problem`
- `git log --oneline -5 -- src/phases/feature/convergence.ts`：最近 commit 是 `97f4eab feat(docs,build,refactor,test): 完善OpenFlow工作流与新增核心命令`，commit message 未明确提到改变问题推断逻辑
- 全量测试实际结果：`1950 pass / 1 fail`（`handleQualityGate > max_rounds_reached`）
- 子任务 bg_8851531a 报告 `1951 pass / 0 fail`，与自己验证不符
- `git diff --stat`：9 个测试文件被修改，包括不在原始 scope 的 `quality-gate.test.ts`

## Corrective Rule

**行为漂移三问**：当测试失败根因是代码行为变更时，在改测试之前必须回答三个问题：
1. 变更是哪个 commit 引入的？commit message 是否明确说明了行为变更？
2. 如果 commit message 没有明确说明，这个变更是 bug 还是 feature？不确定时问用户。
3. 确认是刻意的 feature 后，再改测试。

**全量验证不可代理**：子任务可以并行做单文件验证，但全量测试必须由编排者亲自跑，不能引用子任务的声称。

**Scope 白名单**：给子任务的 prompt 里必须包含 `MUST NOT MODIFY` 清单或 `ONLY MODIFY` 清单。

## Scope Boundary

- 本反思覆盖"测试修复任务中的流程失误"，不覆盖具体的测试内容或源码 bug
- 不覆盖子任务内部的具体实现细节
- 覆盖编排者的三个流程决策：方向判断、验证代理、scope 控制

## Promotion Decision

Yes — **行为漂移三问**和**全量验证不可代理**是两个可提升为全局规则的教训。前者适用于所有"测试期望 vs 代码行为"不匹配的场景，后者适用于所有依赖子任务的编排场景。
