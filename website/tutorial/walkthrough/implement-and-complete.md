---
layout: doc
---

# 实施与完成实操

本页带你完成从代码实现到正式归档的完整流程：功能实施 → 质量门验证 → 归档结项。

## 流程概览

```mermaid
flowchart LR
    implement[功能实施] --> qualityGate[质量门]
    qualityGate --> archive[归档结项]

    classDef main fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#01579b
    classDef success fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#2e7d32

    class implement,qualityGate main
    class archive success
```

## Step 1: 开始实施

```text
/openflow-implement <feature>
```

OpenFlow 会创建一条 `ImplementationRun` 记录，然后根据环境选择执行后端：

| 环境 | 执行路径 |
|---|---|
| 安装了 OMO | 委派给 OMO 的 `/start-work <feature>`，支持多 Agent 协同 |
| 未安装 OMO | 使用 OpenCode 原生执行路径 |

### Worktree 隔离

如果希望把实现放进独立 git worktree：

```text
/openflow-implement <feature> --worktree
```

### 生命周期

```text
created → starting_backend → running → quality_gate_pending → ready_for_archive → archived
```

## Step 2: 质量门验证

代码实现完成后，AI 会自动调用 `openflow-quality-gate`。你不需要手动触发。

### 质量门执行流程

1. 构建上下文：feature design、behavior、plan 或 git diff
2. 判断变更风险
3. 必要时运行对抗性 harden
4. 检查验证证据的新鲜度和覆盖范围
5. 输出 readiness 判定

### Readiness 判定

| 状态 | 含义 | 下一步 |
|---|---|---|
| `Ready` | 可以归档 | 执行 `/openflow-archive` |
| `ReadyWithDocUpdates` | 可归档，需处理文档更新提示 | 处理提示后归档 |
| `NotReady` | 仍有 blocker | 修复后重新进入质量门 |
| `NeedsDecision` | 需要人工决策 | 你做出决策后继续 |

如果返回 `NotReady` 或 `NeedsDecision`，流程会停在阻塞状态，不能宣称完成。

## Step 3: 归档结项

当质量门返回 `Ready` 或 `ReadyWithDocUpdates` 后：

```text
/openflow-archive <feature>
```

### 归档操作

1. 检查是否有允许归档的 readiness
2. 复制并冻结工作文档到 `docs/archive/`
3. 按需提升 `docs/current/` 下的文档
4. 生成 `implementation-mapper.md` — 将需求/设计约束映射到代码和证据

## 常见问题

**Q: 质量门返回 NotReady 但我不清楚哪里有问题？**
查看质量门输出中的具体 blocker 描述，修复后 AI 会重新调用质量门。

**Q: 可以在 NeedsDecision 状态下强制归档吗？**
不可以。必须先做出人工决策，质量门重新通过后才能归档。

**Q: 归档后发现遗漏怎么办？**
归档后的文档已冻结。如需修改，开启新的 feature 或 issue 来处理。
