# Writing-plan 工作节点工作流

## 1. 节点定位

`writing-plan` 是把 feature 设计转成实现计划的节点。它的核心来源是 `src/skills/writing-plan-skill.ts` 与 `src/commands/writing-plan.ts`。

对非简单需求，`writing-plan` 默认使用“金字塔原理 + TDD”计划模式：金字塔原理负责识别最高层目标、核心抽象、边界和任务分组；TDD 负责把这些抽象节点映射为可观察行为，并安排 Red → Green → Refactor 的实现顺序。

这个节点只负责生成计划上下文和指导 AI 写出 parser-compatible 的 `plan.md`。它不执行计划，不创建 ImplementationRun，也不调用 `/start-work`。

## 2. 给人看的流程图

```mermaid
flowchart TD
    A[/openflow-writing-plan <feature> [--mode=<pyramid|pattern|mixed|false>]/] --> B[规范化 feature + 解析 --mode]
    B --> C{writingPlan.enabled?}
    C -->|否| Z[返回 disabled]
    C -->|是| D[验证 design readiness 门控]
    D --> E{设计上下文是否足够?}
    E -->|否| F[提示先运行 /openflow-feature 或继续澄清]
    E -->|是| G[读取 design context packet]
    G --> H[生成 Writing Plan Packet]
    H --> I[生成金字塔 + TDD 策略 + BAD/GOOD 示例]
    I --> J[声明目标 agent]
    J --> R{OMO 是否存在?}
    R -->|是| K[Prometheus 负责规划会话]
    R -->|否| L[OpenCode build agent 负责规划并写入 plan.md]
    K --> M[确保 OMO workspace: 硬链接 .sisyphus/plans/{feature}.md]
    L --> N[写 docs/changes/.../plan.md]
    M --> N
    N --> O[自检计划格式]
    O --> P[停止: 等待 /openflow-implement]
```

## 3. 给人和 AI 执行的流程说明

1. 用户明确请求 `/openflow-writing-plan <feature>`，或明确要求生成 implementation/development plan。
2. AI 确认这是 planning 请求，而不是 brainstorm 卡住、feature 生成后自动继续、ULW 续跑或普通讨论。
3. 如果用户没有明确要求 plan：
   - 不调用 writing-plan。
   - 只建议用户在准备好后手动运行 `/openflow-writing-plan <feature>`。
4. 系统规范化 feature 名。
5. 系统解析可选 `--mode` 参数：
   - 支持 `--mode=pyramid`、`--mode=pattern`、`--mode=mixed`、`--mode=false`。
   - 支持空格写法 `--mode pyramid` 等。
   - `--mode` 无值时忽略 flag，走配置默认值 `writingPlan.mode`。
6. 系统检查 writing-plan 是否启用。
7. 如果 writing-plan 禁用：
   - 返回 disabled 提示。
   - 不读取设计上下文。
   - 不写计划文件。
8. 如果 writing-plan 启用：
   - 系统执行 `verifyDesignReadiness` 门控。
   - 检查 `design.md`、`behavior.md` 是否存在。
   - 检查 `state.md` 是否包含精确 `complete` 状态（支持 `` `complete` ``、`status: complete`、整行 `complete`；排除 `incomplete` / `not complete` 等误匹配）。
   - 检查 Cross-Validation Summary 是否为 `Passed`。
   - 任何检查不通过均返回 `Writing Plan Blocked`，不生成 plan packet。
9. 如果找不到设计上下文：
   - 告诉用户先运行 `/openflow-feature <feature>`。
   - 不写带占位符的计划。
10. 如果设计上下文存在但需求仍不清楚：
    - 停止并提出澄清问题。
    - 不写 `TBD`、`TODO`、`DECISION-NEEDED`。
11. 如果设计上下文足够：
    - 系统生成 Writing Plan Packet。
    - Packet 包含设计上下文、金字塔 + TDD 策略（含 BAD/GOOD 示例）、目标 agent、输出路径、格式规则、自检规则和下一步。
    - 如果是非简单需求，计划必须先说明最高层目标、任务金字塔、核心抽象与边界，再安排 TDD 驱动顺序。
    - 如果是简单需求，计划可以简化金字塔 + TDD 内容，但必须保留章节并说明为什么不需要详细结构化计划。
 12. 系统声明 agent target：
    - OMO detected：计划会话由 Prometheus 负责 interview、clearance 和 execution 准备。
    - Non-OMO：计划由 OpenCode 原生 `build` agent 负责生成并写入 plan.md。
    - Non-OMO 不使用 `plan` agent 的原因：plan agent 是只读的，无法持久化 plan.md 文件。build agent 有文件写入权限，packet 中的 STOP guardrail 阻止它继续执行实现。
 13. AI 写 `docs/changes/YYYY-MM-DD-{feature}/plan.md`。
 14. 如果检测到 OMO 环境（例如 `/start-work` 命令、`.sisyphus/boulder.json` 存在 active_plan、或 opencode config 安装了 OMO plugin）：
     - 系统调用 `ensureOmoWorkspace` 在 `.sisyphus/plans/{feature}.md` 和 `docs/changes/.../plan.md` 之间创建硬链接（`fs.link`）。
     - Prometheus 写入 `.sisyphus/plans/` 路径时，硬链接确保 `docs/changes/` 中的 canonical plan 同步更新。无需双写或复制。
     - 如果硬链接创建失败，`tool-after` hook 会通过 `ino` 比较检测并自动 `copyFile` 到 canonical 路径作为 fallback。
 15. 如果 `.sisyphus/plans/{feature}.md` 已经存在且包含执行进度：
    - 不要为了“恢复一致”覆盖它。
    - 因为执行开始后 `.sisyphus` 副本是 execution-state copy，可以发散。
15. 计划必须包含固定结构：
    - `# Plan: {feature}`。
    - `## Overview`。
    - `## Design Context`。
    - `## Pyramid + TDD Strategy`。
      - `### Highest-Level Goal`。
      - `### Task Pyramid`。
      - `### Core Abstractions and Boundaries`。
      - `### TDD Driving Order`。
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

## 5. 金字塔 + TDD 计划规则

1. 非简单需求默认启用金字塔 + TDD 计划模式。非简单需求包括：
   - 跨模块或跨层改动。
   - 复杂业务逻辑、状态机、生命周期、权限边界或安全边界。
   - 重构、抽象设计、领域模型调整或多阶段实现。
   - 需要先拆分目标、边界和依赖关系才能安全执行的需求。
2. 金字塔原理负责结构：
   - 最高层目标。
   - 任务金字塔。
   - 核心抽象与边界。
   - 同层任务分组与依赖关系。
3. TDD 负责行为：
   - 最高层业务行为先写失败测试。
   - 下层业务规则按任务金字塔逐层补测试。
   - 每个核心业务节点都要说明 RED、GREEN、REFACTOR 顺序。
4. 二者的边界：
   - 金字塔不能变成完整预先设计；只保留能指导测试和实现的抽象。
   - TDD 不能变成无结构地堆测试；测试顺序必须跟随任务金字塔。
   - 每轮 GREEN 后的 REFACTOR 必须检查抽象层级是否一致，避免高层流程混入数据库、HTTP、JSON、字段转换等底层细节。
5. 简单需求可以不展开详细金字塔：
   - 但计划必须说明简单原因。
   - 仍必须提供验证命令和预期结果。

## 6. BDD + 集成测试规则

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

## 7. 产物

 1. 主要产物（所有环境）：
    - `docs/changes/YYYY-MM-DD-{feature}/plan.md`。
 2. OMO 兼容产物（仅 OMO 环境）：
    - `.sisyphus/plans/{feature}.md`（硬链接到 canonical plan）。
 3. 当 OMO 环境存在时，两个路径指向同一个 inode（硬链接），不需要手动同步。
 4. 实现开始后，`.sisyphus/plans/{feature}.md` 可以记录执行状态并与主计划发散。

## 8. 禁止事项

1. 不要从 feature 节点自动进入 writing-plan；必须有显式用户意图。
2. 不要写带占位符的计划。
3. 不要覆盖已有执行进度的 `.sisyphus/plans/{feature}.md`。
4. 不要在 writing-plan 节点执行任务。
5. 不要调用 `/start-work`。
6. 不要在计划完成后声称实现完成。
7. 不要要求用户手动运行 `/openflow-harden` 或 `/openflow-verify`；最终质量门应是 `openflow-quality-gate`。

## 9. 与代码对照清单

| 文档规则 | 代码依据 | 漂移检查 |
|---|---|---|
| writing-plan 是 Skill/参考入口 | `src/skills/writing-plan-skill.ts` | 描述仍是 manual command reference |
| `--mode` 参数解析 | `src/hooks/chat-command-dispatch.ts` `parseWritingPlanCommandArgs()` | 支持 `--mode=<value>` 和 `--mode <value>` 空格写法；无值时忽略 flag |
| `--mode` 解析与默认值 | `src/commands/writing-plan/mode.ts` `resolveWritingPlanMode()` | `invocationValue !== undefined` 判断，避免无值时崩溃 |
| packet 读取设计上下文 | `src/commands/writing-plan.ts` `readDesignContextPacket()` | 仍读取 sidecar / markdown |
| 设计就绪门控 | `src/commands/writing-plan.ts` `verifyDesignReadiness()` | 含 `state.md` 精确正则 ``/`complete`\|`status:\s*complete`\|^\s*complete\s*$`` |
| 主计划路径 | `getChangePlansPath()` | 仍指向 change workspace plan |
| OMO 计划副本 | `src/commands/writing-plan.ts` `ensureOmoWorkspace()` | `fs.link()` 硬链接；失败时 `tool-after` hook 自动 `copyFile` fallback |
| OMO 检测一致性 | `src/commands/writing-plan.ts` `handleWritingPlan()` | 接收 `message` 并传给 `detectOmoEnvironment(ctx, message)` |
| 计划格式 | `src/commands/writing-plan.ts` `buildPacketMarkdown()` | Header、Pyramid + TDD Strategy、Tasks、Dependency Matrix 未改变 |
| 策略模板 | `src/commands/writing-plan.ts` `buildStrategyContent()` | Pyramid/Pattern/Mixed 均含 BAD/GOOD 示例；Pyramid 使用缩进代码块避免内层 fence 破坏外层 |
| 反例 / Anti-pattern | `src/commands/writing-plan.ts` `buildStrategyContent()` | 三 mode 的 `strategyRules` 均追加 `Anti-pattern` |
| TDD 规则 | `src/skills/tdd-skill.ts` | 核心业务逻辑范围未改变 |
| quality-gate 要求 | `writing-plan-skill.ts` | 最终任务仍要求 `openflow-quality-gate` |
| 代码结构 | `src/commands/writing-plan.ts` | `handleWritingPlan` 已按金字塔原理提取 `buildBlockedResponse` / `ensureOmoWorkspace` / `buildPacketMarkdown` |

## 10. 漂移风险提示

如果计划文件路径、OMO 检测方式、Prometheus handoff、任务 parser 格式、TDD Skill 触发范围、`--mode` 参数解析、`state.md` 门控逻辑、硬链接 fallback 机制变化，本文件必须同步更新。重点检查 `src/skills/writing-plan-skill.ts`、`src/commands/writing-plan.ts`、`src/commands/writing-plan/mode.ts`、`src/hooks/chat-command-dispatch.ts`、`src/hooks/tool-after.ts`、`src/skills/tdd-skill.ts`。
