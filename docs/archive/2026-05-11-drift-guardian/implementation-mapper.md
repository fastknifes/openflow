# drift-guardian - Implementation Mapper

**Date**: 2026-05-15
**Status**: Archived

## 1. 概述

本次变更解决了与 `drift-guardian` 相关的实现追溯需求。

**归档时间**: 2026-05-15
**追溯范围**: 本次变更覆盖需求到实现的完整追溯链。

## 2. 需求到实现映射

> 未发现 requirements / proposal 追溯项，已回退使用 design 文档生成追溯关系。

| 追溯来源 | 需求/决策 | 代码文件 | 关键符号 | 关联说明 | 验证证据 |
|----------|-----------|----------|----------|----------|----------|
| design: docs/changes/2026-05-11-drift-guardian/design.md → 2.1 Core Goals (goal-1) | 执行期持续对齐维护：在文件变更发生时尽早发现 code ↔ design ↔ behavior 漂移 | src/drift/diff-engine.ts; src/drift/scoped-job.ts; src/hooks/tool-after.ts | checkDrift, classifyDrift, ScopedDriftJob; tool-after hook | 文件级 + 符号级 drift 检查，通过 tool-after hook 触发 | no verification evidence recorded |
| design: docs/changes/2026-05-11-drift-guardian/design.md → 2.1 Core Goals (goal-2) | Contract Runtime consumer + scoped jobs：OpenFlow 插件加载时启动单例 ContractRuntime，Guardian 注册为运行期消费者 | src/contracts/runtime.ts; src/drift/guardian-consumer.ts | ContractRuntime, getContractRuntime; GuardianConsumer | ContractRuntime 单例管理 contract、event、consumer、evidence sink；GuardianConsumer 接收 FileChangedEvent | no verification evidence recorded |
| design: docs/changes/2026-05-11-drift-guardian/design.md → 2.1 Core Goals (goal-3) | 统一 Contract Runtime：定义共享 OpenFlowContract 中间格式，BDD/Guardian/verify adapter/mapper 共用同一契约口径 | src/contracts/openflow-contract.ts; src/contracts/contract-extractor.ts | OpenFlowContract, BehaviorScenario, AlignmentItem, Constraint; ContractExtractor | 共享契约类型定义 + 从 behavior/design/current/decisions 提取统一 contract | no verification evidence recorded |
| design: docs/changes/2026-05-11-drift-guardian/design.md → 2.1 Core Goals (goal-4) | 明确 bug 自动修复，模糊项人工确认：确定性规则证明的 bug 自动修复，语义/设计取舍入人工确认队列 | src/drift/repair-coordinator.ts; src/drift/scoped-job.ts | isDeterministicRepair, executeRepair, repairDesignDocRef, repairSymbolRefInDesign; ScopedDriftJob.run() | 乐观并发 + edit-only + 3 次重试；模糊项写入 pending queue | no verification evidence recorded |
| design: docs/changes/2026-05-11-drift-guardian/design.md → 2.1 Core Goals (goal-5) | verify 保持最终裁判：Guardian 不替代 verify，verify consistency adapter 独立重新检查最终状态 | src/adapters/consistency/design-drift.ts | DesignDriftAdapter (extended) | Guardian evidence 作为 verify 输入，verify adapter 独立复核 | no verification evidence recorded |
| design: docs/changes/2026-05-11-drift-guardian/design.md → 2.1 Core Goals (goal-6) | 中断友好与统一运行期状态：Guardian 状态写入 .sisyphus/openflow/guardian/，中断后恢复 | src/drift/state-store.ts | ensureGuardianStateDir, readGuardianRepairs, writeSessionPending, readSessionPending, writeFeatureGuardianState, deleteFeatureGuardianState | JSONL 格式持久化 repairs/pending/feature 状态，支持中断恢复 | no verification evidence recorded |
| design: docs/changes/2026-05-11-drift-guardian/design.md → 4. Core Architecture | Contract Runtime 单例架构：ContractRegistry + ContractExtractor + EventQueue + EvidenceSink + Consumers | src/contracts/runtime.ts; src/contracts/openflow-contract.ts | ContractRuntime, getContractRuntime; BehaviorScenario, AlignmentItem, Constraint, OpenFlowContract | ContractRuntime 单例，ContractRegistry 管理 active feature 的契约索引 | no verification evidence recorded |
| design: docs/changes/2026-05-11-drift-guardian/design.md → 5. Contract Runtime & Unified Contract | 统一契约提取：从 behavior.md / Behavior Alignment / current / decisions 提取 OpenFlowContract | src/contracts/contract-extractor.ts | ContractExtractor.extract() | 基于源文件 hash 缓存失效；解析 behavior scenarios / alignment items / constraints | no verification evidence recorded |
| design: docs/changes/2026-05-11-drift-guardian/design.md → 6. Drift Guardian Workflow | 启动 → 文件变更处理 → 分级结果 (auto_repaired / ambiguous / violation / no_drift) | src/drift/guardian-consumer.ts; src/drift/scoped-job.ts; src/drift/diff-engine.ts | GuardianConsumer.onEvent(); ScopedDriftJob.run(); checkDrift, classifyDrift | FileChangedEvent → ContractRegistry 查找 → ScopedDriftJob → drift check | no verification evidence recorded |
| design: docs/changes/2026-05-11-drift-guardian/design.md → 7. Auto-Repair Criteria | 6 项自动修复前提 + 必须人工确认的 8 种情况 | src/drift/repair-coordinator.ts | isDeterministicRepair, executeRepair, repairDesignDocRef, repairSymbolRefInDesign | 确定性规则证明 + 唯一合理修复 + 低风险 + 可验证 + 无治理冲突 | no verification evidence recorded |
| design: docs/changes/2026-05-11-drift-guardian/design.md → 8. Concurrency Handling | 乐观并发 + edit-only + 最多 3 次重试 | src/drift/repair-coordinator.ts | executeRepair() | read → 生成 patch → 写前再 read 确认 → edit / 重试 / 降级人工确认 | no verification evidence recorded |
| design: docs/changes/2026-05-11-drift-guardian/design.md → 9. State & Cache | .sisyphus/openflow/guardian/ 文件布局与清理规则 | src/drift/state-store.ts | ensureGuardianStateDir, readGuardianRepairs, appendGuardianRepair, writeSessionPending, readSessionPending, deleteSessionPending, writeFeatureGuardianState, readFeatureGuardianState, deleteFeatureGuardianState | contracts.json 缓存 + repairs.jsonl + pending/{sessionId}.json + feature/{feature}.json | no verification evidence recorded |
| design: docs/changes/2026-05-11-drift-guardian/design.md → 12. Module Impact | 15 个文件/模块的变更列表 | src/index.ts; src/types.ts; src/config.ts; src/adapters/consistency/design-drift.ts; src/hooks/tool-after.ts; src/phases/archive/implementation-mapper.ts | OpenFlowPlugin (extended); GuardianConfig, GuardianEvidence; GuardianConfig defaults; DesignDriftAdapter (extended); tool-after hook (extended); generateImplementationMapper (extended) | 集成点变更：插件初始化、类型系统、配置扩展、hook 复用、archive mapper 扩展 | no verification evidence recorded |
| design: docs/changes/2026-05-11-drift-guardian/design.md → 15. Acceptance Criteria (ac-1~ac-15) | 15 项验收标准 | src/drift/guardian-consumer.ts; src/drift/scoped-job.ts; src/drift/diff-engine.ts; src/drift/repair-coordinator.ts; src/drift/state-store.ts; src/contracts/runtime.ts; src/contracts/contract-extractor.ts; src/contracts/openflow-contract.ts | GuardianConsumer; ScopedDriftJob; checkDrift, classifyDrift; isDeterministicRepair, executeRepair; state-store functions; ContractRuntime; ContractExtractor; OpenFlowContract | 覆盖启动、idle、contract 提取、diff 检查、auto-repair、pending、中断恢复、verify 证据、archive 清理等全部场景 | no verification evidence recorded |

## 3. 验证与结论

**验证证据**: no verification evidence recorded
