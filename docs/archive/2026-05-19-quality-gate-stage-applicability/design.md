# quality-gate-stage-applicability - Design

## Human Consensus Summary

Feature title: 质量门阶段适用性判定
Internal slug: quality-gate-stage-applicability
Source intent: 收集并固化质量门触发边界的约束条件，避免 AI 为了通过质量门而补写未授权文档。
Problem or improvement target: `openflow-quality-gate` 目前会在缺少 design/workspace/plan 证据时返回 NotReady，容易诱导 AI 反向生成最小 `design.md`、`plan.md` 等文档。
Expected result: 质量门由代码层面的阶段适用性判定触发；不适用的阶段返回 NotApplicable/SkippedByStage，而不是 NotReady。

## Identity And Assumptions

- Feature slug: quality-gate-stage-applicability
- Feature title: 质量门阶段适用性判定
- Source intent: 把质量门从提示词自律升级为代码层面的阶段判定。
- Assumptions:
  - 质量门仍然是实现/bugfix/archive readiness 的硬性节点。
  - design-only、planning-only、metadata-only、feature-renaming 不应被质量门判成失败。
  - 缺少工作流产物是阶段状态信号，不是 AI 自动创建这些产物的授权。
- Pending confirmations:
  - Not specified.

## Overview

本 feature 定义质量门的阶段适用性边界：只有实现完成、bugfix 完成或明确请求 archive readiness 时，质量门才作为硬性门槛生效。对于设计、计划、元数据修正、feature 重命名等非实现阶段，质量门应报告 NotApplicable/SkippedByStage 或 limited-context 状态，而不是输出 NotReady 并诱导 AI 补文档。

## Problem

当前质量门语义把“缺少本次变更的 OpenFlow 设计工作区和计划证据”映射为 NotReady。AI 收到这种结果后，容易为了让流程变绿而补一个最小 `docs/changes/.../design.md` 或 `.sisyphus/plans/...md`，即使用户没有要求进入 feature design 或 writing-plan 阶段。这会破坏工作流授权边界。

## Goals

- 建立质量门阶段适用性分类：implementation、bugfix、archive readiness 才触发硬性质量门。
- 对 design-only、planning-only、metadata-only、feature-renaming 返回 NotApplicable/SkippedByStage，而不是 NotReady。
- 缺少 `plan.md`、`design.md`、`behavior.md`、`issue-clarification.md` 时，报告为 workflow-state blocker 或 limited context，不授权 AI 自动创建。
- harden 缺少 plan 时只阻止 harden 子流程，不应默认要求生成 plan。

## Non-Goals

- 不删除 `openflow-quality-gate`。
- 不把质量门变成可选节点。
- 不做全局 guard-message 文案治理。
- 不让 AI 自动补写设计、行为、计划或 issue 文档来满足门禁。

## Behavior Alignment

| Behavior Scenario | Design Response | Risk |
|------------------|-----------------|------|
| 实现或 bugfix 完成后需要收口 | 质量门必须运行，并执行风险评估、harden 决策和 evidence-aware verify。 | High |
| 纯设计/计划/元数据/重命名任务触发质量门 | 返回 NotApplicable/SkippedByStage，说明该阶段不需要质量门。 | High |
| 缺少 design/workspace/plan 证据 | 报告为阶段状态或 limited context，不把缺失证据解释成自动补文档授权。 | High |
| harden 因缺 plan 被拒绝 | quality-gate 报告 harden unavailable/skipped-by-context，而不是诱导生成 plan。 | Medium |

## Design Constraints

- [must] 质量门触发不再主要依赖 prompt 文案自律，而应由代码层面的阶段适用性分类决定。
- [must] 对非实现阶段不得返回会诱导补文档的 NotReady。
- [must] 质量门报告必须明确“不要为通过门禁而创建缺失工作流产物”。
- [must] 实现/bugfix/archive readiness 仍然不可跳过质量门。
- [should] 保持现有 readiness 兼容；如果枚举暂时不能扩展，可在报告中显式表达 NotApplicable/SkippedByStage。

## Success Criteria

- [ ] design-only / planning-only / metadata-only / feature-renaming 场景不会触发 harden，也不会因缺 plan/design 返回普通 NotReady。
- [ ] implementation / bugfix 场景仍然运行质量门。
- [ ] 缺失 workflow artifact 的报告不会建议 AI 直接创建文档，只建议显式用户命令或说明阶段不适用。
- [ ] 测试覆盖质量门阶段适用性分类和 harden 缺 plan 的降级行为。

## Risks And Mitigations

- **Risk**: NotApplicable 被误用为跳过真正实现验证。  
  **Mitigation**: 分类器必须优先识别源代码/测试/公共 API/bugfix diff，一旦属于实现类任务，仍强制质量门。
- **Risk**: 兼容现有 readiness 枚举成本较高。  
  **Mitigation**: MVP 可先在报告层表达 SkippedByStage，并保持内部状态向后兼容。

## Testing Strategy

- Unit tests for stage applicability classifier.
- Quality-gate tests for design-only/metadata-only/rename-only returning NotApplicable/SkippedByStage.
- Quality-gate tests for implementation diffs still requiring verify.
- Harden integration test proving missing plan does not instruct artifact creation.
