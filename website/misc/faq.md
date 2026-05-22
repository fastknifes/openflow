---
layout: doc
---

# 常见问题（FAQ）

本文档收集 OpenFlow 使用中的常见问题及解答。

## 通用问题

### OpenFlow 适合什么样的项目？

OpenFlow 最适合棕地项目——已有生产流量、遗留行为和历史约束的系统。如果你正在处理一个需要明确问题边界、可靠追溯和治理链的项目，OpenFlow 是很好的选择。

对于快速原型或一次性演示，OpenFlow 可能显得过重。

### OpenFlow 和 OpenSpec / GSD 有什么区别？

- **OpenSpec / GSD**：更快上手，适合"已经知道要建什么"的场景
- **OpenFlow**：强调先明确问题边界，再进行有治理的变更，适合问题本身还不清晰的场景

### 我需要安装 omo 才能使用 OpenFlow 吗？

不需要。OpenFlow 的核心约束模型可以独立运行。omo 提供多 Agent 编排能力，是可选的深度集成。

## 工作流问题

### 什么时候用 `/openflow-feature`，什么时候用 `/openflow-issue`？

- **需求明确**（新功能、已知重构）→ `/openflow-feature`
- **问题模糊**（数据异常、行为不符预期、不确定是不是 bug）→ `/openflow-issue`

### `/openflow-writing-plan` 和 `/openflow-implement` 的关系？

- `/openflow-writing-plan`：从设计生成结构化实施计划（保存计划后停止）
- `/openflow-implement`：基于设计和计划开始受治理的执行

### 质量门会阻塞我的工作吗？

质量门在实施完成后自动触发，不会在编码过程中中断。如果判定需要硬化（Harden），会提供建议但不会强制阻塞。

## 配置问题

### 配置应该放在哪里？

推荐使用项目根目录的 `openflow.json`。也可以放在 `opencode.json` 的 `openflow` 键下。详见[配置项参考](/reference/config-options)。

> 本文档正在建设中，更多问题将持续补充。
