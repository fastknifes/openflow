# openflow-harden - Design

**日期**: 2026-05-08
**Feature**: openflow-harden
**状态**: Design

> Update 2026-05-13: User-facing workflow has moved to the AI-callable `openflow-quality-gate` Skill (ADR-004). The harden capability remains relevant as the risk-based adversarial review stage inside the quality gate, but `/openflow-harden` is no longer the normal manual workflow entrypoint.

---

## 1. 问题陈述

当前 OpenFlow 工作流 `implement → verify → archive` 中，verify 阶段的职责是：

> 生产证据（测试、类型检查、lint、文档对齐），判断 readiness。

verify 不负责深度代码审查。它回答的是"是否就绪进入 archive"，而不是"实现是否有隐藏 bug、spec 偏离、回归风险"。

这意味着：**在 implement 完成和 verify 通过之间，没有一个对抗式质量加固阶段。** 对于重要变更、复杂实现、多文件重构，这一缺失可能导致 verify 通过但存在隐蔽缺陷。

---

## 2. 设计目标

> Note: The original design target was an independent optional command. Today, the harden capability is an internal risk-driven adversarial review stage inside `openflow-quality-gate`. The design goals below describe the capability's internal behavior.

添加一个独立可选命令 `/openflow-harden`，在 implement 和 verify 之间提供对抗式质量加固。

### 2.1 核心目标

1. **多轮 reviewer/executor 对抗**
   reviewer（严格审查者）攻击实现，executor（修复者）修复阻塞问题。多轮循环直到无可证实的阻塞问题。

2. **必须锚定设计文档**
   所有审查和修复必须基于 plan、design、decisions、current。不允许 reviewer 提出超出设计文档范围的新需求。

3. **finding 严格分级**
   只有 `blocking_bug`、`spec_violation`、高置信度 `regression_risk` 可驱动修复。`design_ambiguity` 停止并交给用户。`style_or_preference` 忽略。

4. **异构模型**
   reviewer 使用谨慎高质量模型。executor 使用廉价执行力模型。安装了 Omo 则优先使用 Omo 定义的子模型。

5. **成本可控**
   token 预算上限 + 收敛规则防止无限循环。trivial 需求直接拒绝。

6. **流程定位**
   独立可选命令，不嵌入 verify、archive、implement。不替代 verify，不输出 readiness。

### 2.2 非目标

1. 不替代 verify
2. 不成为默认必跑流程
3. 不输出 canonical status
4. 不对 trivial/simple 需求运行完整对抗循环

---

## 3. 命令形态

> 以下内容描述的是 harden 能力的原始设计。作为正常用户工作流入口，`/openflow-harden` 已被 `openflow-quality-gate` Skill 替代（详见顶部更新通知）。该能力作为风险驱动的对抗性审查阶段，仍然在 quality gate 内部被自动调用。

### 3.1 入口

> Deprecated: This command is no longer the user-facing entrypoint. The quality-gate skill internally delegates to harden for high-risk changes. The example below shows historical usage.

```text
/openflow-harden <feature>
```

内部自动分级：

| 级别 | 判定条件 | 行为 |
|------|---------|------|
| trivial | 单文件 ≤10 行、纯文案、纯格式化、纯测试补充、纯文档 | 拒绝，不消耗审查 token |
| simple | 单文件 ≤50 行、无明显逻辑分支、无状态变化 | 单轮 reviewer，不启动 executor |
| complex | 多文件有逻辑分支、涉及状态/权限/数据流、公共接口变更 | 完整多轮对抗 |

用户可强制 full mode（历史用法，现已由 quality-gate 内部自动触发）：`/openflow-harden <feature> --full`

### 3.2 参数

```text
--full              强制完整对抗循环（仅覆盖 complexity grading，不影响 mode。对 trivial 无效 — trivial 始终拒绝）
--mode quick        最轻：plan + diff + test summary
--mode standard     默认：额外读取 GitNexus impact + 调用链
--mode deep         重型：加载更多上下文
--max-rounds N      硬上限轮次（默认 5，--deep 默认 8）
--reviewer-model X  指定审查者模型
--executor-model X  指定执行者模型
```

**`--full` 与 `--mode` 交互规则**：

| 组合 | 行为 |
|------|------|
| `--full --mode quick` | full 循环 + quick 输入深度 |
| `--full --mode deep` | full 循环 + deep 输入深度 |
| `--full`（trivial 需求） | 仍然拒绝（trivial 不可覆盖） |
| `--mode quick`（complex 需求） | complex 循环 + quick 输入深度 |

`--full` 只影响 complexity grading 的覆盖行为，不改变 mode 控制的输入深度。

---

## 4. 角色与模型

### 4.1 三角色

| 角色 | 职责 | 权限 |
|------|------|------|
| Reviewer | 基于设计文档严格审查实现，输出 findings | 只读，不能修改代码 |
| Executor | 最小修复 blocking findings | 可修改代码，但不能超出 plan 范围 |
| Coordinator | 控制轮次、过滤 findings、判断收敛、传递上下文 | 编排者，不审查不修复 |

### 4.2 模型选择

**Reviewer**：优先谨慎高质量模型。安装了 Omo → 使用 Omo 高质量子模型；未安装 → 使用当前可用最高质量模型。不可用则降级并告知。

**Executor**：优先廉价执行力模型。安装了 Omo → 使用 Omo executor 子模型；未安装 → 任选廉价模型（deepseek / glm / kimi）。不可用则降级到系统默认模型。

---

## 5. Finding 分级

### 5.1 定义

| 级别 | 定义 | 行为 |
|------|------|------|
| `blocking_bug` | 确定会导致功能错误、回归、数据损坏、命令运行失败。基于代码逻辑推理，不依赖设计文档对比。 | 自动进入 executor 修复 |
| `spec_violation` | 实现偏离 plan / design / decisions / current 中的明确约束，但未直接触发运行时错误。（例如：实现了一个非目标功能、遗漏了约束中要求的行为、文件位置不符合约定。） | 自动进入 executor 修复 |
| `regression_risk` | 有明确证据表明可能破坏已有行为 | 需要附带置信度理由；符合高置信度条件时修复或补测试 |
| `test_gap` | 测试不足，但实现本身未被证明错误 | 默认不强制改实现，可补测试 |
| `design_ambiguity` | 设计文档未覆盖，无法判断 | 停止，交给用户 |
| `style_or_preference` | 风格、命名、抽象偏好 | 忽略，不驱动任何修复 |

### 5.2 驱动规则

只有 `blocking_bug`、`spec_violation`、高置信度 `regression_risk` 能驱动 executor 修复。`test_gap` 和 `design_ambiguity` 报告但不自动修复。`style_or_preference` 直接丢弃。

### 5.3 `regression_risk` 置信度判定

Reviewer 标记 `regression_risk` 时，必须附带三段式置信度理由：

1. **受影响代码路径**：哪个调用链/入口点会被影响
2. **触发条件**：在什么场景下问题会暴露
3. **预期后果**：预期会发生什么错误/异常行为

Coordinator 据此判断置信度：

- 三段均完整且可定位 → 高置信度 → 进入修复
- 任一段缺失或模糊 → 低置信度 → 降级为 `nonBlocking`，仅报告不修复

---

## 6. 对抗循环机制

### 6.1 流程

```text
第 N 轮:
  1. Coordinator 收集输入（plan 摘要、本轮 diff、上轮 findings、fix report、测试摘要）
  2. Reviewer 基于设计文档审查，输出 findings
  3. Coordinator 过滤 findings（只保留可执行类别）
  4. 无 blocking/spec_violation/high-confidence regression_risk → PASS
  5. Executor 做最小修复
  6. Executor 输出 fix report（根因分析 + fix diff）
  7. 进入第 N+1 轮
```

### 6.2 收敛规则

1. 上轮 finding 中可修复的必须消失或降级，否则 executor 未修好 → 不进入下一轮
2. 本轮新 blocking 问题必须是修复副作用，非旧问题 → 否则降低 max_rounds
3. 连续 1 轮无 blocking → PASS
4. 连续 2 轮只剩 non-blocking → PASS WITH RISK NOTES
5. 同一 finding 反复出现 ≥2 次 → `unresolvable_by_ai` → 停止
6. executor 修复引入新 blocking bug ≥2 次 → 停止
7. 出现 `design_ambiguity` → 立即停止

### 6.3 终止状态

| 状态 | 条件 | 质量门处理 |
|------|------|-----------|
| `pass` | 无 blocking/spec_violation/high-confidence regression_risk | 不阻塞 |
| `pass_with_risks` | 连续 2 轮只有 non-blocking | 不阻塞 |
| `max_rounds_reached` | 达到硬上限 | **阻塞为 NeedsDecision** |
| `budget_exhausted` | 达到 token 预算 | **阻塞为 NeedsDecision** |
| `needs_human` | design_ambiguity / unresolvable_by_ai / executor 多次失败 | 阻塞为 NeedsDecision |
| `rejected` | trivial 需求 | 不运行 |

---

## 7. 审查基准

Reviewer 只能基于以下材料提出 findings：

1. 当前 feature 的 design / plan / spec（`docs/changes/{feature}/`）
2. `docs/current/*` 中的当前事实
3. `docs/decisions/*` 中的全局约束
4. 实际 git diff（预过滤格式化和无关变更）
5. 相关测试和验证输出（verify 证据摘要）

**禁止 Reviewer 基于自身偏好或未锚定设计文档的最佳实践提出新需求。** 发现设计文档未覆盖的重要问题必须输出 `design_ambiguity`，不允许要求 executor 直接实现。

---

## 8. 成本控制

### 8.1 无预确认页

用户运行命令即表示承担成本。不弹出预算确认页。

### 8.2 强制上限

- `token_budget_per_round`：固定上限，不随轮次增加
- `token_budget_total`：命令总上限
- `max_rounds`：默认 5 轮，`--deep` 默认 8 轮

任一触达即停。

### 8.3 输入压缩

每轮 reviewer 输入固定为：plan 摘要、本轮 diff、上轮 findings + fix report（压缩格式）、verify 证据摘要。不传递完整会话历史和完整仓库。

---

## 9. 与 verify/archive 关系

> 以下流程图展示了独立命令形态下的工作流。当前正常路径为 `implement → openflow-quality-gate → archive`，harden 与 verify 作为 quality gate 内部的子步骤被自动调度。

```text
implement
  → /openflow-harden    对抗式加固（可选，已集成至 quality-gate）
    → pass / pass_with_risks / needs_human
  → /openflow-verify    证据与 readiness（已集成至 quality-gate）
    → ready / ready_with_doc_updates / not_ready / needs_decision
  → /openflow-archive   canonicalization
```

harden 不输出 readiness。harden 完成后提示用户重新运行 verify。

---

## 10. 边界情况

- **设计文档缺失**：plan 不存在 → 直接拒绝；plan 不完整 → 只审查明确约束，其余标 `design_ambiguity`；plan 与实现偏差 → 标 `spec_violation`
- **修复 scope drift**：executor 修改 plan 范围外文件 → 标记 `scope_violation` → 拒绝此轮修复
- **模型不可用**：降级到备用模型并告知；全部不可用 → 直接失败
- **并发修改**：harden 期间 git 状态变化 → 立即停止
- **敏感文件**：拒绝审查/修改包含密钥、证书的文件 → `security_sensitive_skip`

---

## 11. 状态流转

> Deprecated: This state flow describes the historical command behavior. Today, the harden stage is invoked internally by `openflow-quality-gate` and uses these same states, but users no longer interact with this command directly.

```text
/openflow-harden <feature>
  │
  ├─ trivial → rejected
  │
  ├─ simple → reviewer-only
  │     ├─ no blocking → pass
  │     └─ has blocking → report (用户自行决定)
  │
  └─ complex → full adversarial loop
        │
        ├─ Round 1: reviewer → findings → executor → fix
        ├─ Round 2: reviewer → re-check → executor → fix (如有)
        ├─ ...
        ├─ Round N: reviewer → no blocking → pass
        │
        └─ 终止: pass | pass_with_risks | max_rounds | budget_exhausted | needs_human
```

---

## 12. 命令语义边界

> Note: harden is now an internal capability of `openflow-quality-gate`, and verify is the internal evidence collection stage. This table shows historical roles.

| 命令 | 回答 | 输出 |
|------|------|------|
| brainstorm | intent 是什么 | design / prd / requirements |
| plan | 怎么实现 | tasks / implementation plan |
| implement | 实现是否正确完成 | code changes |
| **harden** (internal) | 实现是否经得起对抗审查 | pass / hardened evidence |
| verify (internal) | 证据是否足够进入 archive | readiness status |
| archive | 是否正式固化 | canonical status + mapper |

---

## 13. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 假阳性消耗 token | finding 必须附带证据；coordinator 过滤无证据 finding |
| 修复震荡 | 收敛规则 6；executor 必须跑回归验证 |
| executor scope drift | 只能修改 plan 范围内文件；coordinator 验证 fix diff |
| 异构模型仍共享盲区 | finding 证据要求 + 设计文档锚定，不依赖模型多样性为唯一防线 |

---

## 14. 与 Omo 的关系

- 安装了 Omo → 优先使用 Omo 定义的 reviewer / executor 子模型
- 未安装 Omo → 使用系统模型，reviewer 选高质量，executor 选廉价
- 不依赖 Omo，可独立运行

---

## 15. 一句话总结

`/openflow-harden` 是 implement 和 verify 之间的可选对抗式加固命令（现已集成至 `openflow-quality-gate`）。通过 reviewer 和 executor 的多轮对抗，在设计文档约束下发现并修复隐藏的阻塞问题，直到实现经得起反复攻击，或预算/轮次用尽。
