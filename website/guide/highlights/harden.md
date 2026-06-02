---
layout: doc
---

# Harden 对抗审查

以对抗视角审查 AI 实现，发现行为违规、合约偏离和回归风险，并通过分类分级系统决定每个发现的处置方式。

## 它是什么

Harden（对抗审查）是 OpenFlow 质量门内的一道强化审查机制。它从三个层面运作：

- **Harden Reviewer（审查者）** — 以对抗视角审查实现代码，对照已批准的合约层级（decisions > current > behavior > design > plan > request > diff > implementation）寻找发现项
- **发现分类引擎** — 将每个发现归入严格的分类体系：`behavior_violation`（行为违规）、`spec_violation`（规格违反）、`intent_gap`（意图缺口）、`contract_divergence`（合约偏离）、`regression_risk`（回归风险）、`missing_evidence`（缺失证据）等
- **Harden Executor（执行者）** — 仅处理可修复的实现层发现，不会静默修改文档或批准合约偏离

每个发现经过置信度推断和实现对齐分析后，被分入四个处置组之一：

- **actionable（必须修复）** — 有证据的行为违规和回归风险
- **ambiguous（需要决策）** — 合约偏离和缺失证据，需要人工确认
- **nonBlocking（不阻塞）** — 已知问题或设计范围外的问题
- **style（样式偏好）** — 直接过滤，不进入审查流程

## 为什么需要它

AI 生成的代码可能"看起来正确"但违反了设计合约中的隐性约定。传统的 lint 和 typecheck 只能发现技术层面的问题，无法检测"实现是否偏离了设计意图"这类语义偏差。

Harden 通过对抗性审查和多维度分类，在代码合并前捕获行为违规和合约偏离，并区分"必须修复"、"需要人工决策"和"可接受的已知问题"，避免一刀切的审查阻塞工作流。

## 适用场景

- 质量门判定变更复杂度为 `complex` 时自动触发 Harden 审查
- 检查实现是否符合 behavior.md 中定义的行为场景
- 识别代码中与已批准设计文档不一致的意图缺口
- 检测可能的回归风险和缺失的测试证据

## 与其他功能的关系

- Harden 是 [质量门](/guide/how-it-works/quality-gate) 流程中的一个阶段，由质量门根据复杂度决定是否触发
- 审查依据来自 [合约与约束扫描](./contract-scanning.md) 提取的行为场景和约束
- Harden 的发现结果通过 Harden Ledger 追踪，最终写入 [Code Map](./code-map.md) 的验证摘要
- [AI 自我反思](./ai-reflection.md) 可能会记录 Harden 发现的流程性教训
