# OpenFlow: AI 驱动开发的工业级治理层

[English](./README.md) | [架构设计](./docs/changes/openflow-init/design.md)

OpenFlow 是一款专为 **OpenCode** 和 **oh-my-openagent (omo)** 打造的工业级开发工作流引擎。它将 AI 编码从“随机生成”转变为“受控的工程过程”。

当其他插件还在关注 *如何* 写代码时，OpenFlow 关注的是 *如何管理* 变更，确保每一行 AI 生成的代码都 **可追溯、已验证，并与设计保持一致**。

---

## 💎 为什么选择 OpenFlow？

在 AI 时代，开发瓶颈不再是写代码，而是 **维护代码**。OpenFlow 解决了 AI 驱动开发中的三大核心风险：

1.  **黑盒风险**：AI 写了代码，但你不知道它究竟满足了哪些需求。
2.  **偏离风险**：随着项目演进，文档和代码逐渐脱节。
3.  **质量风险**：AI 可能会在没有实际证据的情况下“幻觉”任务已完成。

**OpenFlow + omo** 提供了一套“硬门禁”工作流，保障工程的完整性。

---

## 🚀 核心能力

### 🛡️ 治理与硬门禁 (Governance & Hard Gates)
OpenFlow 不仅仅是一套建议，它是一个工作流引擎。它强制执行严格的生命周期：**头脑风暴 (Brainstorm) → 实现 (Implement) → 验证 (Verify) → 归档 (Archive)**。除非功能通过了带有具体证据的“验证”关卡，否则无法进行“归档”。

### 🗺️ 实现映射 (溯源能力)
每一个归档的功能都会自动生成 `implementation-mapper.md`。这是你代码库的“GPS”，它将需求精确映射到特定的文件、函数和符号。从此不再疑惑“这段代码为什么存在？”。

### 🔍 自动化偏离检测 (Drift Detection)
OpenFlow 实时监控工作区。如果 Agent 修改实现的方式偏离了已批准的 `design.md`，OpenFlow 会在验证阶段立即标记出这种“偏离”。

### 🧪 TDD 计划增强
OpenFlow 自动将 **红-绿-重构 (Red-Green-Refactor)** 任务注入 Agent 的执行计划。它提供测试模板和执行命令，将 TDD 从“最佳实践”变为“默认行为”。

---

## 🛠️ 使用手册

### 1. 初始化：`/openflow/init`
任何新项目的起点。它会设置 `AGENTS.md` 指导，并为受控开发准备工作区。

### 2. 设计阶段：`/openflow/brainstorm <功能名>`
- **作用**：探索意图，询问澄清问题，并提出 2-3 种方案。
- **智能化产出**：根据需求的复杂度，在 `docs/changes/YYYY-MM-DD-feature/` 下生成定制化的文档集，可能包括：
  - `design.md`：核心架构与技术方案（主文档）。
  - `prd.md`：产品需求文档（针对高复杂度功能自动生成）。
  - `requirements.md`：显式的需求定义与约束说明。
  - `proposal.md`：问题定义与初步方案探索。
  - `decisions.md`：关键架构决策与权衡记录。

### 3. 计划与执行：`Prometheus` 与 `/startwork`
设计定稿后，利用 **omo** 的原生能力将设计转化为代码：
- **计划生成**：调用 omo 的 **Prometheus** Agent，基于 OpenFlow 的设计工作区生成详细的开发计划。OpenFlow 会自动 **拦截** 该计划，注入 TDD 任务和设计上下文。
- **任务执行**：运行 `/startwork` 触发 omo 的执行引擎。omo 将自动完成各项任务，而 OpenFlow 确保实现过程始终遵循设计约束。

### 4. 验证阶段：`/openflow/verify <功能名>`
看门人。在声明成功之前，必须运行 verify。
- **漂移检测 (Drift Detection)**：自动校验代码实现是否偏离了已批准的设计和需求文档。
- **证据阶段**：运行测试、安全扫描（密钥/漏洞）和 Lint。
- **就绪阶段**：将状态分类为 `Ready`（就绪）、`ReadyWithDocUpdates`（文档待更新）、`NotReady`（未就绪）或 `NeedsDecision`（需决策）。
- **铁律**：没有新鲜的验证证据，不得声明任务完成。

### 5. 归档阶段：`/openflow/archive <功能名>`
最终权威。
- **规范化**：将工作文档移动到 `docs/archive/`。
- **晋升**：更新 `docs/current/` 以反映最新的系统状态。
- **映射**：生成 `implementation-mapper.md` 以实现永久溯源。

### 6. 维护与管理：`/openflow/status` & `/openflow/config`
- **状态查询 (Status)**：查看当前所有活跃功能开发会话的状态和就绪度。
- **配置管理 (Config)**：实时查看或更新 OpenFlow 的运行配置。

---

## ⚙️ 配置说明

在你的 `opencode.json` 中添加：

```json
{
  "plugins": ["@fastknife/openflow"],
  "openflow": {
    "brainstorming": {
      "enabled": true,
      "auto_trigger": true,
      "trigger_mode": "smart"
    },
    "tdd": {
      "enabled": true,
      "expand_threshold": 3
    },
    "verification": {
      "in_plan": true,
      "security": ["secret", "vuln"],
      "quality": ["lint", "typecheck", "test"]
    },
    "archive": {
      "enabled": true,
      "auto_promote_current": true
    }
  }
}
```

---

## 🏗️ 架构图

OpenFlow 与 **omo (oh-my-openagent)** 运行时深度集成。

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenCode IDE                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │ oh-my-openagent │  │         OpenFlow Plugin         │  │
│  │    (运行时)     │◄─┤        (治理层/管控层)          │  │
│  │                 │  │                                 │  │
│  │  - 上下文注入   │  │  - 偏离检测 (Drift Detection)   │  │
│  │  - 任务执行     │  │  - 证据收集 (Evidence)          │  │
│  │  - 工具链       │  │  - 实现映射 (Mapping)           │  │
│  └─────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🤝 对比：OpenFlow vs. Superpowers

| 特性 | OpenFlow + omo | Superpowers |
| :--- | :--- | :--- |
| **集成深度** | 原生深度绑定 (Hook 级拦截) | 通用型 (Prompt 级指令) |
| **流程约束** | 硬门禁 (流程强制执行) | 软引导 (建议与原则) |
| **可追溯性** | 自动生成溯源映射表 | 手动文档记录 |
| **上下文** | 零配置自动注入 | 手动加载上下文 |
| **维护目标** | 为长期工程治理而设计 | 为快速执行而设计 |

---

## 📄 开源协议

MIT License. 由 [fastknife](https://github.com/fastknifes) 开发。
