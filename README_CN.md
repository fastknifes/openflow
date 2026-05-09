# OpenFlow: AI 驱动开发的工业级治理层

[English](./README.md) | [架构设计](./docs/changes/openflow-init/design.md)

## 快速入口

- **先看这里：** [OpenFlow 使用教程](./docs/current/workflow/openflow-usage-tutorial.md)
- **想先看命令总览：** [使用手册](#-使用手册)
- **想先理解项目定位：** [为什么选择 OpenFlow？](#-为什么选择-openflow)
- **想看设计背景：** [架构设计文档](./docs/changes/openflow-init/design.md)

OpenFlow 是一款面向 **OpenCode** 的工业级开发工作流引擎。它可以很好地与 **oh-my-openagent (omo)** 配合，但核心价值并不强依赖 omo：**文档编程就是约束编程**。设计文档、当前事实、全局决策、验证证据和归档记录不是被动说明，而是可执行的治理约束，用来强制 AI 编程始终停留在已确认的工程边界内。

OpenFlow 将 AI 编码从“随机生成”转变为“受控的工程过程”。当其他插件还在关注 *如何* 写代码时，OpenFlow 关注的是 *如何约束* 变更，确保每一行 AI 生成的代码都 **可追溯、已验证，并与文档化的需求和设计保持一致**。

---

## 💎 为什么选择 OpenFlow？

在 AI 时代，开发瓶颈不再是写代码，而是 **维护代码**。OpenFlow 解决了 AI 驱动开发中的三大核心风险：

1.  **黑盒风险**：AI 写了代码，但你不知道它究竟满足了哪些需求。
2.  **偏离风险**：随着项目演进，文档和代码逐渐脱节。
3.  **质量风险**：AI 可能会在没有实际证据的情况下“幻觉”任务已完成。

**OpenFlow** 提供了一套“硬门禁”工作流，通过把文档转化为可执行约束来保障工程完整性。存在 omo 时，OpenFlow 可以把它作为执行协作层；没有 omo 时，文档治理与约束编程模型仍然可以独立成立。

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

如果你需要的不是命令清单，而是一份真正按步骤走的教程，请先看：[`docs/current/workflow/openflow-usage-tutorial.md`](./docs/current/workflow/openflow-usage-tutorial.md)

### 1. 初始化：`/openflow-init`
任何新项目的起点。它会设置 `AGENTS.md` 指导，并为受控开发准备工作区。

### 2. 设计阶段：`/openflow-brainstorm <功能名>`
- **作用**：探索意图，询问澄清问题，并提出 2-3 种方案。
- **智能化产出**：根据需求的复杂度，在 `docs/changes/YYYY-MM-DD-feature/` 下生成定制化的文档集，可能包括：
  - `design.md`：核心架构与技术方案（主文档）。
  - `prd.md`：产品需求文档（针对高复杂度功能自动生成）。
  - `requirements.md`：显式的需求定义与约束说明。
  - `proposal.md`：问题定义与初步方案探索。
  - `decisions.md`：关键架构决策与权衡记录。

### 3. 计划与执行：`Prometheus` 与 `/startwork`
设计定稿后，可以用不止一种方式把设计转化为代码：
- **配合 omo**：调用 **Prometheus** 生成开发计划，再通过 `/startwork` 进入 omo 的执行流程。
- **使用 OpenCode 原生流程**：也可以直接依赖 OpenCode 原生的 **plan** 与 **build** 工作方式，而不依赖 omo。无论采用哪种执行路径，OpenFlow 的核心职责都不变：把设计、需求、决策、验证与归档约束持续绑定到实现过程。

### 4. Issue 澄清：`/openflow-issue <问题名或问题描述>`
当问题本身还不明确、还不能直接判断是不是 bug 时，先使用这个命令。
- **作用**：在动手实现前先澄清用户期望、修复边界、证据和当前语义。
- **典型场景**：数据异常、行为异常、业务规则不清、配置/环境问题，或者你需要先判断下一步是修复、继续调查还是升级到 brainstorm。
- **常用参数**(可选)：`--readonly`、`--write-doc`、`--continue`。

### 5. 加固阶段：`/openflow-harden <功能名>`
当改动复杂、风险高或跨多个文件/路径时，在实现完成后、verify 之前运行。
- **作用**：通过 reviewer / executor 风格的对抗审查循环，对实现做质量加固。
- **典型场景**：多文件逻辑修改、状态/权限/数据流变更、公共接口调整，或者“测试可能过了，但仍担心隐藏回归”的实现。
- **常用参数**：`--full`、`--mode quick|standard|deep`、`--max-rounds N`。

### 6. 验证阶段：`/openflow-verify <功能名>`
看门人。在声明成功之前，必须运行 verify。
- **漂移检测 (Drift Detection)**：自动校验代码实现是否偏离了已批准的设计和需求文档。
- **证据阶段**：运行测试、安全扫描（密钥/漏洞）和 Lint。
- **就绪阶段**：将状态分类为 `Ready`（就绪）、`ReadyWithDocUpdates`（文档待更新）、`NotReady`（未就绪）或 `NeedsDecision`（需决策）。
- **铁律**：没有新鲜的验证证据，不得声明任务完成。

### 7. 归档阶段：`/openflow-archive <功能名>`
最终权威。
- **规范化**：将工作文档移动到 `docs/archive/`。
- **晋升**：更新 `docs/current/` 以反映最新的系统状态。
- **映射**：生成 `implementation-mapper.md` 以实现永久溯源。

### 8. 文档迁移：`/openflow-migrate-docs --sourceDir <source-docs-dir> [--targetDir <target-dir>] [--dryRun]`
当你要把其他工作流或旧项目里的文档体系迁移到 OpenFlow 结构时，使用这个命令。
- **作用**：检测源文档结构，扫描文件，把内容分类到 `docs/current/`、`docs/changes/`、`docs/archive/`、`docs/decisions/`、`docs/references/`，并在真正落盘前先进行澄清。
- **典型场景**：从 OpenSpec、Spec Kit、Kiro、Cursor/Trae 约定，或手工维护的旧 `docs/` 目录迁移到 OpenFlow。
- **重要行为**：默认是“先报告、先澄清”；删除原文档永远不会自动发生。

### 9. 维护与管理：`/openflow-status` & `/openflow-config`
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

OpenFlow 运行在 **OpenCode** 中，定位是文档治理与工作流约束层。存在 **omo (oh-my-openagent)** 时可以深度协作，但整体工作流模型并不强依赖 omo。

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

## 📄 开源协议

MIT License. 由 [fastknife](https://github.com/fastknifes) 开发。
