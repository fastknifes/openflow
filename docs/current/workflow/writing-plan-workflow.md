# Writing-plan 工作节点工作流

## 1. 节点定位

`writing-plan` 是把 feature 设计转成实现计划的节点。它的核心来源是 `src/skills/writing-plan-skill.ts` 与 `src/commands/writing-plan.ts`。

这个节点只负责生成计划上下文和指导 AI 写出 parser-compatible 的 `plan.md`。它不执行计划，不创建 ImplementationRun，也不调用 `/start-work`。

## 2. 给人看的流程图

```mermaid
flowchart TD
    A[/openflow-writing-plan <feature>/] --> B[规范化 feature]
    B --> C{writingPlan.enabled?}
    C -->|否| Z[返回 disabled]
    C -->|是| D[读取 design context packet]
    D --> E{设计上下文是否足够?}
    E -->|否| F[提示先运行 /openflow-feature 或继续澄清]
    E -->|是| G[生成 Writing Plan Packet]
    G --> H[声明目标 agent]
    H --> I{OMO 是否存在?}
    I -->|是| J[Prometheus 负责规划会话]
    I -->|否| K[OpenCode plan agent 负责规划]
    J --> L[写 docs/changes/.../plan.md]
    K --> L
    L --> M{是否需要 OMO 执行副本?}
    M -->|是| N[写 .sisyphus/plans/{feature}.md]
    M -->|否| O[只保留 change workspace plan]
    N --> P[自检计划格式]
    O --> P
    P --> Q[停止: 等待 /openflow-implement]
```

## 3. 给人和 AI 执行的流程说明

1. 用户明确请求 `/openflow-writing-plan <feature>`，或明确要求生成 implementation/development plan。
2. AI 确认这是 planning 请求，而不是 brainstorm 卡住、feature 生成后自动继续、ULW 续跑或普通讨论。
3. 如果用户没有明确要求 plan：
   - 不调用 writing-plan。
   - 只建议用户在准备好后手动运行 `/openflow-writing-plan <feature>`。
4. 系统规范化 feature 名。
5. 系统检查 writing-plan 是否启用。
6. 如果 writing-plan 禁用：
   - 返回 disabled 提示。
   - 不读取设计上下文。
   - 不写计划文件。
7. 如果 writing-plan 启用：
   - 系统读取设计上下文。
   - 优先读取 `design.meta.json` 或 `requirements.json`。
   - 如果结构化 sidecar 不可用，回退读取 `design.md` 的关键章节。
8. 如果找不到设计上下文：
   - 告诉用户先运行 `/openflow-feature <feature>`。
   - 不写带占位符的计划。
9. 如果设计上下文存在但需求仍不清楚：
   - 停止并提出澄清问题。
   - 不写 `TBD`、`TODO`、`DECISION-NEEDED`。
10. 如果设计上下文足够：
   - 系统生成 Writing Plan Packet。
   - Packet 包含设计上下文、目标 agent、输出路径、格式规则、自检规则和下一步。
11. 系统声明 agent target：
   - OMO detected：计划会话由 Prometheus 负责 interview、clearance 和 execution 准备。
   - Non-OMO：计划会话由 OpenCode 原生 `plan` agent 负责。
12. AI 写 `docs/changes/YYYY-MM-DD-{feature}/plan.md`。
13. 如果 OMO / Prometheus 执行环境存在，或 `.sisyphus/` 目录存在：
   - AI 同步写 `.sisyphus/plans/{feature}.md`。
   - 初始内容必须和 change workspace plan 完全一致。
14. 如果 `.sisyphus/plans/{feature}.md` 已经存在且包含执行进度：
   - 不要为了“恢复一致”覆盖它。
   - 因为执行开始后 `.sisyphus` 副本是 execution-state copy，可以发散。
15. 计划必须包含固定结构：
   - `# Plan: {feature}`。
   - `## Overview`。
   - `## Design Context`。
   - `## Execution Strategy`。
   - `### Parallel Execution Waves`。
   - `### Dependency Matrix`。
   - `## Tasks`。
16. `## Tasks` 中每个任务必须是 checkbox 或编号项。
17. 每个任务必须写清楚：
   - 具体文件路径。
   - 推荐 Agent Profile。
   - 是否可并行。
   - 被哪些任务阻塞。
   - 阻塞哪些任务。
   - QA Scenarios。
   - Acceptance Criteria。
   - 可运行验证命令和预期结果。
18. 如果一个任务跨度超过 3-4 个紧密相关文件：
   - 拆分任务。
   - 或重新组织 wave。
19. 如果同一 wave 超过 3-4 个并行任务：
   - 合并小任务。
   - 或增加 wave，降低并发。
20. 如果总执行单元超过 20：
   - 合并过细任务。
   - 或明确拆成多个 feature。
21. 写完计划后必须自检：
   - 没有占位符。
   - 每个任务有具体路径。
   - 每个任务有验证命令。
   - 任务数量与 feature 大小匹配。
   - `## Tasks` 可被 parser 识别。
   - 最终实现/QA 任务要求调用 `openflow-quality-gate`。
22. 自检通过后，writing-plan 节点停止。
23. 下一步只能由 `/openflow-implement <feature>` 启动。

## 4. 核心业务 TDD 规则

1. 如果计划任务涉及核心业务逻辑，必须安排 TDD。
2. 核心业务逻辑包括：
   - 算法、匹配、计算、解析、转换。
   - 数据模型、状态字段、持久化结构、序列化语义。
   - 业务规则、权限边界、准入/拒绝规则。
   - 领域服务、resolver、validator、planner。
   - 状态机、生命周期、重试/补偿逻辑。
   - 认证、授权、租户隔离、安全边界。
3. TDD 任务必须写出 RED → GREEN → REFACTOR：
   - 先写失败测试。
   - 确认测试因目标行为缺失而失败。
   - 写最小实现让测试通过。
   - 保持测试绿色后再重构。
4. 如果任务只是配置、静态元数据、样式、测试工具、纯类型定义或简单 passthrough：
   - 可以不要求 TDD。
   - 但仍要写验证命令。

## 5. BDD + 集成测试规则

1. 如果 feature 产生了 `behavior.md`，计划必须读取其中的 User-Visible Scenarios。
2. 对每个 critical scenario：
   - 计划必须要求集成测试，或要求等价的行为证据。
   - 证据必须能映射回 scenario。
   - 不能只写“补测试”这种泛化任务。
3. 对 optional 或 boundary scenario：
   - 计划要说明为什么它是 optional。
   - 如果暂不覆盖，要写明风险和后续处理。
4. 后续 quality-gate 会检查行为证据是否 fresh、exact/equivalent。
5. critical scenario 缺失、过期或只有 partial evidence 时，readiness 会被阻断。

## 6. 产物

1. 主要产物：
   - `docs/changes/YYYY-MM-DD-{feature}/plan.md`。
2. OMO 兼容产物：
   - `.sisyphus/plans/{feature}.md`。
3. 两份计划的初始内容必须一致。
4. 实现开始后，`.sisyphus/plans/{feature}.md` 可以记录执行状态并与主计划发散。

## 7. 禁止事项

1. 不要从 feature 节点自动进入 writing-plan；必须有显式用户意图。
2. 不要写带占位符的计划。
3. 不要覆盖已有执行进度的 `.sisyphus/plans/{feature}.md`。
4. 不要在 writing-plan 节点执行任务。
5. 不要调用 `/start-work`。
6. 不要在计划完成后声称实现完成。
7. 不要要求用户手动运行 `/openflow-harden` 或 `/openflow-verify`；最终质量门应是 `openflow-quality-gate`。

## 8. 与代码对照清单

| 文档规则 | 代码依据 | 漂移检查 |
|---|---|---|
| writing-plan 是 Skill/参考入口 | `src/skills/writing-plan-skill.ts` | 描述仍是 manual command reference |
| packet 读取设计上下文 | `src/commands/writing-plan.ts` | `readDesignContextPacket()` 仍读取 sidecar / markdown |
| 主计划路径 | `getChangePlansPath()` | 仍指向 change workspace plan |
| OMO 计划副本 | `getPlanPath()` | 仍指向 `.sisyphus/plans/{feature}.md` |
| 计划格式 | `writing-plan-skill.ts` | Header、Tasks、Dependency Matrix 未改变 |
| TDD 规则 | `src/skills/tdd-skill.ts` | 核心业务逻辑范围未改变 |
| quality-gate 要求 | `writing-plan-skill.ts` | 最终任务仍要求 `openflow-quality-gate` |

## 9. 漂移风险提示

如果计划文件路径、OMO 检测方式、Prometheus handoff、任务 parser 格式、TDD Skill 触发范围变化，本文件必须同步更新。重点检查 `src/skills/writing-plan-skill.ts`、`src/commands/writing-plan.ts`、`src/skills/tdd-skill.ts`。
