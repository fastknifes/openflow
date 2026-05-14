# openflow-issue - Design

## Overview

Feature: openflow-issue
Target users: 内部开发者
Scope: 对 `/openflow-issue` 流程的重塑，引入统一 Work Node 模型

## Problem

当前 OpenFlow 存在两条独立的质量流程：

1. **Feature 流程**：brainstorm → plan → start-work（内嵌 harden + verify）→ archive
2. **Issue 流程**：issue → investigate → classify → ?（质量门缺失）

问题：
- Issue 修复后没有统一的质量保障路径
- `/openflow-verify` 假设存在 plan 文件和 design.md，issue workspace 通常没有这些
- `/openflow-archive` 在缺少 design.md 时会卡住
- Start-work 和 issue 各自拼装 execute/harden/verify，导致两套质量逻辑

## Design Decisions

### Decision 1: 统一 Work Node

将 execute + harden + verify 打包为一个统一的 Work Node。

```
brainstorm ──┐
              ├──► [Work Node] ──► archive
issue fix  ──┘
```

Work Node 不关心上游是 brainstorm 还是 issue，它只关心：
- **输入**：上下文文档（design.md 或 issue-clarification.md）+ 质量策略
- **输出**：evidence packet + readiness status

#### Work Node 内部流程

```
execute → harden (conditional) → verify (required)
```

| 阶段 | 说明 |
|---|---|
| execute | 实际执行改动。feature 场景由 plan 驱动；issue 场景为直接修复 |
| harden | 根据风险等级自动决定是否执行。start-work 可询问用户；issue fix 自动判断 |
| verify | 必须执行。基于 context alignment 检查，不依赖 plan 文件 |

### Decision 2: 开发计划不作为必要输入

开发计划是执行脚手架，不是治理产物。

对后续 AI 对话的价值排序：
```
design.md / behavior.md > issue-resolution > verify evidence > implementation-mapper > plan
```

规则：
- **feature 开发**：plan 可作为临时消费品存在（Prometheus 生成、Sisyphus 消费），但不作为 verify/archive 的前置条件
- **issue bug-fix**：默认不需要 plan
- **verify 不检查 plan_exists**：改为检查 context alignment（改动是否与上下文文档对齐）
- **archive 不因缺少 plan 阻塞**

### Decision 3: Issue Fix 的质量门委托给 openflow-quality-gate

Issue fix 不再自行决定 harden 策略。`--resolve` 完成后，质量保障（risk-based harden + evidence-aware verify）委托给 `openflow-quality-gate` Skill。

**策略：自动 risk-based harden，不打断用户**

```
issue --resolve → 记录 Work Node 状态
  → AI 调用 openflow-quality-gate
    → 评估改动风险
    → trivial/simple: 跳过 harden，跑 verify
    → complex: 自动执行 harden，再跑 verify
    → 输出 readiness + evidence
```

用户不再需要选择 fast/balanced/strict，也不需要手动跑 `/openflow-harden` 或 `/openflow-verify`。

| 改动风险 | 质量门行为 |
|---|---|
| trivial / simple | 跳过 harden，跑 evidence-aware verify |
| complex / cross-file | 自动跑 harden + verify |
| production / security / data loss | 必须跑 harden + verify |
| 无 design.md 或 issue-clarification.md | 降级为 limited-context verify，不阻塞 |

### Decision 4: Issue Fix 的意图路由

`/openflow-issue` 需要在"分析问题"和"动手修复问题"之间做意图路由：

```
/openflow-issue <problem>
  ↓
intent detection
  ├─ 只读查询 → 输出分析结果，不进入 Work Node
  └─ 需要修复 → 进入 Work Node → archive
```

### Decision 5: Archive 统一归档

Archive 不区分 feature 和 issue 来源，只消费 evidence + readiness：

```
有 readiness=Ready？→ archive
没有？→ 回去跑 Work Node
```

Archive 产物：
- **Feature**: design.md + behavior.md + implementation-mapper.md
- **Issue**: issue-clarification.md + issue-resolution.md + promotion-candidate.md
- **通用**: verify evidence + promotion suggestions

### Decision 6: 修复后留档

Issue 修复完成后必须留档，为后续 AI 对话提供信息。

留档产物：

| 文件 | 内容 | 长期价值 |
|---|---|---|
| issue-clarification.md | 问题现象、约束、证据 | 记录原始问题 |
| issue-resolution.md | 根因、修复方式、验证证据、复发识别 | **最高**——后续 AI 的主要参考 |
| promotion-candidate.md | 哪些经验值得提升为项目知识 | 选择性进入 docs/current 或 docs/decisions |

issue-resolution.md 中最重要的两段：
- **Recurrence Signature**：以后怎么识别同类问题
- **Future AI Guidance**：后续 AI 遇到类似问题时应优先检查什么

## Architecture

### 现有代码在新模型下的角色

| 现有模块 | 新角色 |
|---|---|
| `acceptance-state.ts` 的 phase 状态机 | Work Node 的内部状态 |
| `execution-policy.ts` 的 fast/balanced/strict | Work Node 的质量参数 |
| `verify.ts` 的 evidence/readiness | Work Node 的出口门 |
| `harden.ts` 的对抗循环 | Work Node 的可选内循环 |
| `detectMode()` | Archive 层路由，Work Node 不需要 |
| `chat-message.ts` 的 quality policy lifecycle | Work Node 的初始化逻辑 |
| `issue-utils.ts` 的 detectMode / IssueMode | Archive 和 hook 层复用 |

### 命令流程

```
Feature:
  /openflow-brainstorm <feature>
    → design.md + behavior.md
    → /start-work (Work Node: execute + harden + verify)
    → /openflow-archive <feature>

Issue:
  /openflow-issue <problem>
    → issue-clarification.md
    → intent detection (read-only or fix)
    → if fix: --resolve records Work Node state
    → AI invokes openflow-quality-gate (risk-based harden + evidence-aware verify)
    → /openflow-archive <issue>
```

## Design Constraints

- [must] 兼容现有命令：/openflow-issue、/openflow-verify、/openflow-archive 的接口保持不变
- [must] Work Node 统一质量门：feature 和 issue 走同一个 harden + verify 机制
- [must] Archive 不因缺少 design.md 或 plan 阻塞
- [must] Issue fix 质量门委托给 openflow-quality-gate，不询问用户
- [must] Issue 修复后生成 issue-resolution.md 和 promotion-candidate.md
- [must] Verify 基于 context alignment，不检查 plan_exists
- [should] 后续 `/openflow-issue` 启动时搜索历史 issue-resolution 记录

## Non-Goals

- 不改变 start-work 的用户交互流程（仍可询问质量模式）
- 不改变 brainstorm 的设计文档生成流程
- 不强制 issue fix 生成 plan 文件
- 不把 execute 细节统一（feature 和 issue 的执行方式可以不同）

## Risks and Mitigations

| 风险 | 缓解 |
|---|---|
| Archive 对 issue workspace 的支持不完整 | 现有 archive.ts 已有 issue-mode 分支，需扩展 |
| Issue fix 不生成 plan 时 verify 需要新的检查逻辑 | 从 plan_exists 改为 context_alignment |
| Issue-mode hook 噪声（brainstorm/harden suggestion 误触发） | detectMode 感知 issue workspace 时压制 feature 建议 |
| issue-resolution 模板不够具体 | 增加结构化字段：Symptom, Root Cause, Recurrence Signature, Future AI Guidance |

## Success Criteria

- [ ] `/openflow-issue <problem>` 能完成调查 → 修复 → 留档全流程
- [ ] Issue fix --resolve 后质量门由 openflow-quality-gate 执行 risk-based harden + evidence-aware verify
- [ ] Archive 成功归档 issue workspace（无 design.md、无 plan）
- [ ] 归档后 issue-resolution.md 包含 Recurrence Signature 和 Future AI Guidance
- [ ] Verify 不因缺少 plan 文件判定 NotReady
- [ ] Issue workspace 活跃时压制 brainstorm/harden 的 feature 建议噪声
