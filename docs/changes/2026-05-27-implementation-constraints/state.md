# Implementation Constraint Packet Feature State

> AI-managed working state. This file records the current Feature Brief for this feature workspace. It is not a formal design document and does not participate in Cross-Validation.

## Feature Identity

- Directory: `2026-05-27-implementation-constraints`
- Semantic name: `implementation-constraints`
- Status: `complete`
- State authority: `state.md` is working memory before generation; formal documents are the factual source after generation.

## Feature Brief

### problem

- value: AI agent 在执行 `openflow-implement` 时，只知道当前 feature 的 plan/design/behavior 文档，不知道其他 feature 留下的 ADR 决策、`docs/current` 中的约束规则、AI 反思纠正规则等跨 feature 知识。触碰受约束代码路径可能引入违规代码而不自知。
- confidence: high
- source: explicit

### target-users

- value: 使用 `/openflow-implement` 执行开发计划的 AI agent 和人类用户；quality-gate 在 final-verify 阶段消费约束验证结果。
- confidence: high
- source: explicit

### scope

- value: 在 `openflow-implement` 命令中新增约束发现→传播→验证闭环。涉及 constraint-scanner（从 contract-extractor 提取）、context-resolver（评分+去重+生成）、constraint-guard（advisory hook）、backend handoff 注入、final-verify enforcement。不涉及向量数据库、语义搜索、自动修复。
- confidence: high
- source: explicit

### priority

- value: 优先保证约束文件在 backend handoff 前生成、advisory 不阻断编辑、final-verify enforcement 阻断违规、降级路径可靠。
- confidence: high
- source: explicit

### constraints

- value:
  - 不引入向量数据库，使用路径匹配 + 关键词匹配（D7）。
  - 约束文件位置：`docs/changes/{YYYY-MM-DD}-{feature}/constraints.md`（D1）。
  - 生成失败不阻断实现，降级到无约束模式（D2）。
  - edit/write 时 advisory（只提醒），final-verify 时 enforcement（D3）。
  - 重构 `contract-extractor.ts` 提取共享扫描 API，保留现有行为（D4）。
  - 证据来源仅限命令输出（D5）。
  - resumed runs 已存在则复用（D6）。
  - 最多 15 条约束，单条 ≤300 字（D8）。
  - final-verify 是 constraints enforcement 的唯一点，quality-gate 只消费结果。
  - constraint-guard 异常时静默跳过，不阻断编辑。
  - 原子写入（tmp + rename），不留部分文件。
- confidence: high
- source: explicit

## Stable Decisions

- D1: 约束文件放在 feature 的 `docs/changes` workspace，worktree 模式下写入 worktree 目录。
- D2: 生成失败降级到无约束模式，记录 warning observation。
- D3: 实现期 advisory，final-verify enforcement。
- D4: 从 `contract-extractor.ts` 提取共享 `constraint-scanner.ts`，内部改为调用 scanner API。
- D5: 约束满足证据必须是命令输出（grep、测试结果）。
- D6: resumed run 已有 constraints.md 则复用，否则生成。
- D7: 路径匹配 + 关键词匹配，不引入向量数据库。
- D8: 最多 15 条，单条 ≤300 字，同分 tie-breaking 按 decision > current > reflection。
- 去重 key：`{sourceFile}:{normalizedRule}:{normalizedAppliesTo}`。
- ConstraintGuard 与 implementation-guard 共享 hook 注册，不创建竞争性 guard。
- Cross-Validation 已通过 Oracle 架构审查（5 critical + 7 major 全部修复）。

## Open Questions

- None.
