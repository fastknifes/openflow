# 非对称安全阀遗漏：tracked diff 路径加了保护，untracked 镜像路径被遗忘

- **Date**: 2026-05-19
- **Category**: verification-skipped
- **Classification**: must-trigger
- **Trigger**: 用户在 mdd-mall-server 项目中发现 quality gate 反复误判"实现缺失"——5 轮 harden 消耗 16 万 tokens，结论不变，因为 untracked 实现文件从未进入证据源。
- **Context**: 2026-05-17 修复 scope contamination 时，AI 在 `scopeDiffToFeature` 中添加了安全阀（当所有 tracked diff blocks 被过滤掉时回退到全量），但忘记在镜像路径 `filterPathsToFeatureScope` 和 `filterPathsToExactScope`（处理 untracked 文件）中添加等价保护。

## What Went Wrong

quality gate 的 scope 裁剪逻辑有两套对称的处理路径：

| 处理路径 | 数据源 | 裁剪函数 | 安全阀 |
|---------|--------|---------|--------|
| tracked diff | `git diff HEAD` | `scopeDiffToFeature` | ✅ 有（`scopedBlocks.length === 0` 时回退） |
| untracked files | `git ls-files --others` | `filterPathsToFeatureScope` / `filterPathsToExactScope` | ❌ **没有** |

AI 在 scope contamination 修复时给 tracked diff 加了安全阀，但没有检查 untracked 路径是否需要同等保护。结果：当 scope 推导不完整时，untracked 实现文件被全量裁剪，质量门看不到新文件——hardener 在 5 轮迭代中每次都基于不变的证据源给出相同错误结论。

## Root Cause

**局部修复思维**：AI 定位到"scopeDiffToFeature 过滤掉所有 diff block 时应该回退"这一具体问题并解决了它，但没有问"还有哪些地方在用类似方式做 scope 过滤？"——没有做对称性检查。

根本原因不是技术复杂，是修了一个对称结构的一半就结束了，没有验证完整性。

## Correct Behavior

修复涉及对称/镜像结构时，必须执行以下检查：

1. 列出所有语义对等的处理路径（如 tracked vs untracked、read vs write、sync vs async）
2. 对每个路径，确认是否需要相同的修复
3. 如果需要但暂不修复，记录原因和后续计划
4. 验证阶段覆盖所有对称路径，而不只是被修改的那个

## Recurrence Signal

识别模式：
- 代码中存在成对的处理分支（if/else、diff/files、read/write）
- 修复只改了其中一条路径
- 两条路径的函数名高度相似（如 `scopeDiffToFeature` vs `filterPathsToFeatureScope`）
- 用户在运行后发现"为什么另一边还有同样的问题"

确认信号：运行后发现镜像路径仍在产生错误输出，且证据源从未更新。

## Evidence

- 代码审查：`src/utils/diff-scope.ts` L51（tracked 安全阀存在）vs L85-127（untracked 安全阀缺失）
- 用户报告：mdd-mall-server 项目中 "5 轮 harden、消耗了 16 万 tokens，每次都是同样的判断，因为它的证据来源从始至终就没有变过"
- 修复验证：1482 tests pass, 0 fail（含 quality-gate 36 tests）
- Issue 文档：`docs/changes/2026-05-19-quality-gate-untracked-omission/issue-clarification.md`

## Corrective Rule

> 当修复涉及对等处理路径时，修改完成后必须列出所有语义对等的路径，逐条验证是否需要相同修复。不允许只修一边就收工。

## Scope Boundary

- **In scope**: 代码中存在多个语义对等的处理分支，修复只覆盖了其中一个
- **Out of scope**: 两个路径用途完全不同、不存在对等关系的情况；需要在两边做不同处理的技术场景

## Promotion Decision

**建议提升为全局规则**。理由：这是一个高度可重复的错误模式——"修了 A 忘了 B"在对称代码结构中极易发生，且后果严重（本例消耗 16 万 tokens 做无效审查）。提升为全局规则后，未来 AI 在涉及对称结构时会自带检查清单。
