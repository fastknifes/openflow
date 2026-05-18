# drift-guardian - Design

## Overview

Feature: drift-guardian
Target users: 内部开发者：主要使用者是工程/研发内部开发者，尤其是使用 OpenCode/OpenFlow/OMO 进行 AI 辅助实现、验证和归档的开发者。
In scope: drift-guardian new-feature：这是一个全新功能，虽然会复用 writing-plan、quality-gate、verify、archive/implementation-mapper 等现有流程，但 Drift Guardian 的 contract markers、checkpoint mini task、semantic drift review 和 Guardian evidence 闭环是新的能力。; Address the stated problem: 采用推荐的闭环方案：文档阶段生成稳定 contract markers；writing-plan 读取 markers 并把 Drift Guardian checkpoint 写成显式 mini task；write/edit 阶段只做文件变更记录和可选确定性轻量检查，不跑 LLM；每个明确 plan milestone/checkpoint task 完成后运行异步语义漂移检查，优先使用 guardian.semantic.model 配置的 OpenCode/OMO 模型名，未配置时 fallback 到 OMO librarian；语义检查只产出 advisory evidence / pending findings，不作为 ready 裁判；quality-gate/verify 重新读取 markers、checkpoint evidence、代码和文档，独立最终判定 readiness；archive/implementation-mapper 使用 marker ID 建立 marker → plan task → checkpoint evidence → verify result → code/evidence 的追溯闭环。
## Problem

采用推荐的闭环方案：文档阶段生成稳定 contract markers；writing-plan 读取 markers 并把 Drift Guardian checkpoint 写成显式 mini task；write/edit 阶段只做文件变更记录和可选确定性轻量检查，不跑 LLM；每个明确 plan milestone/checkpoint task 完成后运行异步语义漂移检查，优先使用 guardian.semantic.model 配置的 OpenCode/OMO 模型名，未配置时 fallback 到 OMO librarian；语义检查只产出 advisory evidence / pending findings，不作为 ready 裁判；quality-gate/verify 重新读取 markers、checkpoint evidence、代码和文档，独立最终判定 readiness；archive/implementation-mapper 使用 marker ID 建立 marker → plan task → checkpoint evidence → verify result → code/evidence 的追溯闭环。
## Goals

- Solve: 采用推荐的闭环方案：文档阶段生成稳定 contract markers；writing-plan 读取 markers 并把 Drift Guardian checkpoint 写成显式 mini task；write/edit 阶段只做文件变更记录和可选确定性轻量检查，不跑 LLM；每个明确 plan milestone/checkpoint task 完成后运行异步语义漂移检查，优先使用 guardian.semantic.model 配置的 OpenCode/OMO 模型名，未配置时 fallback 到 OMO librarian；语义检查只产出 advisory evidence / pending findings，不作为 ready 裁判；quality-gate/verify 重新读取 markers、checkpoint evidence、代码和文档，独立最终判定 readiness；archive/implementation-mapper 使用 marker ID 建立 marker → plan task → checkpoint evidence → verify result → code/evidence 的追溯闭环。
- Serve target users: 内部开发者：主要使用者是工程/研发内部开发者，尤其是使用 OpenCode/OpenFlow/OMO 进行 AI 辅助实现、验证和归档的开发者。
- Honor priority: 风险最小：优先保证 Drift Guardian 不会误判、不会阻塞 AI 正常执行、不会替代 quality-gate/verify 的最终裁判地位。确定性检查应保守，语义检查只产出 advisory evidence。自动修复仅限可证明唯一合理的小范围修改。
## Non-Goals

- Unrelated modules or workflows
## Architecture

Not specified.
## Behavior Alignment

| Behavior Scenario | Design Response | Files / Modules | Risk |
|------------------|-----------------|-----------------|------|
| drift-guardian addresses the stated problem: 采用推荐的闭环方案：文档阶段生成稳定 contract markers；writing-plan 读取 markers 并把 Drift Guardian checkpoint 写成显式 mini task；write/edit 阶段只做文件变更记录和可选确定性轻量检查，不跑 LLM；每个明确 plan milestone/checkpoint task 完成后运行异步语义漂移检查，优先使用 guardian.semantic.model 配置的 OpenCode/OMO 模型名，未配置时 fallback 到 OMO librarian；语义检查只产出 advisory evidence / pending findings，不作为 ready 裁判；quality-gate/verify 重新读取 markers、checkpoint evidence、代码和文档，独立最终判定 readiness；archive/implementation-mapper 使用 marker ID 建立 marker → plan task → checkpoint evidence → verify result → code/evidence 的追溯闭环。 | See constraints (4 total) | Not specified. | Medium |
| drift-guardian works for the target users: 内部开发者：主要使用者是工程/研发内部开发者，尤其是使用 OpenCode/OpenFlow/OMO 进行 AI 辅助实现、验证和归档的开发者。 | See constraints (4 total) | Not specified. | Medium |
| drift-guardian implementation reflects the selected priority: 风险最小：优先保证 Drift Guardian 不会误判、不会阻塞 AI 正常执行、不会替代 quality-gate/verify 的最终裁判地位。确定性检查应保守，语义检查只产出 advisory evidence。自动修复仅限可证明唯一合理的小范围修改。 | See constraints (4 total) | Not specified. | Medium |
| drift-guardian respects the stated constraint: 兼容现有系统：Drift Guardian 不能破坏现有的 writing-plan、quality-gate、verify、archive/implementation-mapper 的工作流和接口。Guardian evidence 作为 verify 的可选输入 | See constraints (4 total) | Not specified. | Medium |
| drift-guardian respects the stated constraint: 不能改变 verify 的独立裁判地位。contract markers 应复用现有 OpenFlowContract / alignmentItems / BehaviorScenario 结构 | See constraints (4 total) | Not specified. | Medium |
| drift-guardian respects the stated constraint: 不引入新的解析口径。checkpoint mini task 应作为 writing-plan 生成的常规任务插入 | See constraints (4 total) | Not specified. | Medium |
| drift-guardian respects the stated constraint: 不改变 plan 生成的根本逻辑。 | See constraints (4 total) | Not specified. | Medium |
## Design Constraints

- [should] 兼容现有系统：Drift Guardian 不能破坏现有的 writing-plan、quality-gate、verify、archive/implementation-mapper 的工作流和接口。Guardian evidence 作为 verify 的可选输入
- [should] 不能改变 verify 的独立裁判地位。contract markers 应复用现有 OpenFlowContract / alignmentItems / BehaviorScenario 结构
- [should] 不引入新的解析口径。checkpoint mini task 应作为 writing-plan 生成的常规任务插入
- [should] 不改变 plan 生成的根本逻辑。
## Success Criteria

- [ ] drift-guardian addresses the stated problem: 采用推荐的闭环方案：文档阶段生成稳定 contract markers；writing-plan 读取 markers 并把 Drift Guardian checkpoint 写成显式 mini task；write/edit 阶段只做文件变更记录和可选确定性轻量检查，不跑 LLM；每个明确 plan milestone/checkpoint task 完成后运行异步语义漂移检查，优先使用 guardian.semantic.model 配置的 OpenCode/OMO 模型名，未配置时 fallback 到 OMO librarian；语义检查只产出 advisory evidence / pending findings，不作为 ready 裁判；quality-gate/verify 重新读取 markers、checkpoint evidence、代码和文档，独立最终判定 readiness；archive/implementation-mapper 使用 marker ID 建立 marker → plan task → checkpoint evidence → verify result → code/evidence 的追溯闭环。
- [ ] drift-guardian works for the target users: 内部开发者：主要使用者是工程/研发内部开发者，尤其是使用 OpenCode/OpenFlow/OMO 进行 AI 辅助实现、验证和归档的开发者。
- [ ] drift-guardian implementation reflects the selected priority: 风险最小：优先保证 Drift Guardian 不会误判、不会阻塞 AI 正常执行、不会替代 quality-gate/verify 的最终裁判地位。确定性检查应保守，语义检查只产出 advisory evidence。自动修复仅限可证明唯一合理的小范围修改。
- [ ] drift-guardian respects the stated constraint: 兼容现有系统：Drift Guardian 不能破坏现有的 writing-plan、quality-gate、verify、archive/implementation-mapper 的工作流和接口。Guardian evidence 作为 verify 的可选输入
- [ ] drift-guardian respects the stated constraint: 不能改变 verify 的独立裁判地位。contract markers 应复用现有 OpenFlowContract / alignmentItems / BehaviorScenario 结构
- [ ] drift-guardian respects the stated constraint: 不引入新的解析口径。checkpoint mini task 应作为 writing-plan 生成的常规任务插入
- [ ] drift-guardian respects the stated constraint: 不改变 plan 生成的根本逻辑。
## Proposed Design

Address the problem statement: 采用推荐的闭环方案：文档阶段生成稳定 contract markers；writing-plan 读取 markers 并把 Drift Guardian checkpoint 写成显式 mini task；write/edit 阶段只做文件变更记录和可选确定性轻量检查，不跑 LLM；每个明确 plan milestone/checkpoint task 完成后运行异步语义漂移检查，优先使用 guardian.semantic.model 配置的 OpenCode/OMO 模型名，未配置时 fallback 到 OMO librarian；语义检查只产出 advisory evidence / pending findings，不作为 ready 裁判；quality-gate/verify 重新读取 markers、checkpoint evidence、代码和文档，独立最终判定 readiness；archive/implementation-mapper 使用 marker ID 建立 marker → plan task → checkpoint evidence → verify result → code/evidence 的追溯闭环。 Primary scope: drift-guardian new-feature：这是一个全新功能，虽然会复用 writing-plan、quality-gate、verify、archive/implementation-mapper 等现有流程，但 Drift Guardian 的 contract markers、checkpoint mini task、semantic drift review 和 Guardian evidence 闭环是新的能力。; Address the stated problem: 采用推荐的闭环方案：文档阶段生成稳定 contract markers；writing-plan 读取 markers 并把 Drift Guardian checkpoint 写成显式 mini task；write/edit 阶段只做文件变更记录和可选确定性轻量检查，不跑 LLM；每个明确 plan milestone/checkpoint task 完成后运行异步语义漂移检查，优先使用 guardian.semantic.model 配置的 OpenCode/OMO 模型名，未配置时 fallback 到 OMO librarian；语义检查只产出 advisory evidence / pending findings，不作为 ready 裁判；quality-gate/verify 重新读取 markers、checkpoint evidence、代码和文档，独立最终判定 readiness；archive/implementation-mapper 使用 marker ID 建立 marker → plan task → checkpoint evidence → verify result → code/evidence 的追溯闭环。
## Risks And Mitigations

Not specified.
## Testing Strategy

Use targeted tests and review to verify: 风险最小：优先保证 Drift Guardian 不会误判、不会阻塞 AI 正常执行、不会替代 quality-gate/verify 的最终裁判地位。确定性检查应保守，语义检查只产出 advisory evidence。自动修复仅限可证明唯一合理的小范围修改。, 兼容现有系统：Drift Guardian 不能破坏现有的 writing-plan、quality-gate、verify、archive/implementation-mapper 的工作流和接口。Guardian evidence 作为 verify 的可选输入, 不能改变 verify 的独立裁判地位。contract markers 应复用现有 OpenFlowContract / alignmentItems / BehaviorScenario 结构, 不引入新的解析口径。checkpoint mini task 应作为 writing-plan 生成的常规任务插入, 不改变 plan 生成的根本逻辑。
