# Plan: current-drg-promotion

## Overview

重构 `docs/current/` 目录结构，从按文档类型+feature 子目录的平面切分改为按 DDD 限界上下文聚合；同时将 archive 时的 current promotion 从同步阻塞执行改为 DRG 任务调度器异步驱动，受资源锁保护、可重试、可观测。

## Design Context

设计文档位于 `docs/changes/2026-05-22-current-drg-promotion/`：
- `design.md` — 限界上下文列表、文件组织规则、DRG 集成架构、`current-promotion.ts` 重写设计、三阶段迁移步骤
- `requirements.md` — 12 项功能需求、非目标、约束、验收映射
- `spec.md` — `spec.md` 章节结构、`current-promotion` executor 接口、7 个行为场景、错误处理表
- `decisions.md` — 8 项关键决策的选项对比与 rationale

## Execution Strategy

### Parallel Execution Waves

- **Wave 1**: 目录结构创建 + `buildPromotionSuggestions` 重写 + DRG 实例化接入（三者无依赖，可并行）
- **Wave 2**: `applyPromotionSuggestions` 重写 + 现有内容迁移（依赖 Wave 1 的目录结构和 suggestion 格式）
- **Wave 3**: DRG executor 实现 + archive 命令异步化（依赖 Wave 2 的 apply 逻辑和 Wave 1 的 DRG 接入）
- **Wave 4**: 全面测试与回归验证（依赖 Wave 2 的迁移和 Wave 3 的 archive 接入）
- **Wave 5**: OpenFlow Quality Gate（依赖 Wave 4 的全部完成）

### Dependency Matrix

| Task | Blocked By | Blocks |
|---|---|---|
| 1. 创建限界上下文目录结构 | — | 2, 5 |
| 2. 重写 buildPromotionSuggestions | — | 4 |
| 3. DRG 调度器实例化接入 | — | 6, 7 |
| 4. 重写 applyPromotionSuggestions | 1, 2 | 6 |
| 5. 迁移现有 current/ 内容 | 1 | 8 |
| 6. 实现 current-promotion DRG executor | 3, 4 | 7 |
| 7. archive 命令改为 DRG 异步提交 | 3, 6 | 8 |
| 8. 全面测试与回归验证 | 5, 7 | 9 |
| 9. OpenFlow Quality Gate | 8 | — |

## Tasks

- [ ] 1. 创建 `docs/current/` 限界上下文目录结构与单文件例外配置 (Agent: quick | Blocks: [2, 5] | Blocked By: [])
  - 创建目录：`docs/current/feature-lifecycle/`、`issue-investigation/`、`quality-governance/`、`drift-guardian/`、`archive-authority/`、`workflow-conventions/`、`ai-self-governance/`
  - 为 `ai-self-governance/` 创建 `.context-meta.json` 声明单文件例外
  - 每个目录创建初始的 `design.md`、`spec.md`、`requirements.md`（或 `facts.md`）
  - **文件**: `docs/current/feature-lifecycle/design.md` 等（共 7 个上下文 × 3 文件 = 21 个文件，小上下文例外减少）
  - **验证**: `Get-ChildItem -Path docs/current -Directory | Measure-Object` 返回 7；`Get-ChildItem -Path docs/current -Recurse -File | Measure-Object` 返回 ≥ 18

- [ ] 2. 重写 `current-promotion.ts` 的 `buildPromotionSuggestions` — 新结构下的 promotion plan 生成 (Agent: deep | Blocks: [4] | Blocked By: [])
  - 废弃旧的 `PROMOTION_AREAS` 配置（基于 `docs/current/design/`、`spec/` 平面目录）
  - 新增 `BOUNDED_CONTEXTS` 配置，定义每个上下文的 `currentDir` 和 `sourceMapping`
  - 重写 `findHistoricalMatch`：在 `docs/current/{context}/` 的三个文件中按内容相似度匹配，而非在 `docs/current/design/{feature}/` 中查找
  - 重写 `buildPromotionSuggestions`：返回的 suggestion 指向 `docs/current/{context}/{design|spec|requirements}.md`
  - **文件**: `src/phases/archive/current-promotion.ts`
  - **验证**: `npm run typecheck` 通过；运行单元测试（如有）确认 suggestion 生成逻辑正确

- [ ] 3. DRG 调度器实例化与启动接入 (Agent: deep | Blocks: [6, 7] | Blocked By: [])
  - 在 OpenFlow 启动入口（如 `src/index.ts` 或 plugin init）创建 `SchedulerLoop` 全局实例
  - 配置 `maxConcurrency: 2`、`tickIntervalMs: 100`
  - 启动调度循环 `scheduler.startScheduler()`
  - 在 OpenFlow 关闭/卸载时调用 `scheduler.stopScheduler()`
  - **文件**: `src/index.ts`（或 plugin 主入口）
  - **验证**: `npm run typecheck` 通过；启动 OpenFlow 后 `scheduler.listTasks()` 返回空数组 `{ tasks: [], corrupted: false }`

- [ ] 4. 重写 `current-promotion.ts` 的 `applyPromotionSuggestions` — 新结构下的文件操作 (Agent: deep | Blocks: [6] | Blocked By: [1, 2])
  - 适配新 suggestion 格式（`targetPath` 指向 `docs/current/{context}/spec.md` 等）
  - 保留 `synthesizeCurrentDocument` 节级合并算法（该算法与目录结构无关，可直接复用）
  - 确保 `direct_migration` 策略正确创建目标目录（`fs.mkdir` with `recursive: true`）
  - 确保 `synthesized_refresh` 策略在新路径下正常工作
  - **文件**: `src/phases/archive/current-promotion.ts`
  - **验证**: `npm run typecheck` 通过；archive 同步执行模式下（DRG 未启用），promotion 能正确更新 `docs/current/{context}/` 下的文件

- [ ] 5. 迁移现有 `docs/current/` 散落内容到限界上下文目录 (Agent: quick | Blocks: [8] | Blocked By: [1])
  - 遍历 `docs/current/design/`、`docs/current/spec/`、`docs/current/requirements/` 下的所有 `feature-xxx/` 子目录和松散文件
  - 按主题域判断每个文件应归属的限界上下文（参考 `decisions.md` 的迁移映射示例）
  - 将 `behavior.md` 内容合并到目标上下文的 `spec.md` 的 `## Behavior Scenarios` 和 `## Constraints` 章节
  - 将 `design.md` 内容移动到目标上下文的 `design.md`
  - 将 `prd.md` 内容移动到目标上下文的 `requirements.md`
  - 删除旧平面目录 `docs/current/design/`、`docs/current/spec/`（保留 `.bak` 备份直到验收完成）
  - **文件**: `docs/current/` 下的全部文档（只操作文档，不修改代码）
  - **验证**: `glob docs/current/**/feature-*` 返回空数组；`glob docs/current/**/behavior.md` 返回空数组；每个上下文目录下存在 `design.md` + `spec.md` + `requirements.md`

- [ ] 6. 实现 `current-promotion` DRG executor 并注册 (Agent: deep | Blocks: [7] | Blocked By: [3, 4])
  - 创建 `current-promotion` executor 函数，签名符合 `ExecutorFunction`
  - executor 内部调用重写后的 `applyPromotionSuggestions` 逻辑（或提取公共函数）
  - executor 返回 `{ applied: [...], skipped: [...] }` 作为 `result`
  - 在 OpenFlow 启动时注册：`scheduler.registerExecutor('current-promotion', currentPromotionExecutor)`
  - executor 需处理 `AbortSignal`：收到 cancel 时优雅中断文件操作
  - **文件**: `src/phases/archive/current-promotion-executor.ts`（新建）或 `src/phases/archive/current-promotion.ts`（扩展）
  - **验证**: `npm run typecheck` 通过；submit 一个测试任务，executor 被正确调用并返回结果

- [ ] 7. `src/commands/archive.ts` 改为提交 DRG 任务 + 同步回退逻辑 (Agent: deep | Blocks: [8] | Blocked By: [3, 6])
  - 将同步 `applyPromotionSuggestions({...})` 替换为 `scheduler.submitTask({ type: 'current-promotion', payload, resources })`
  - `payload` 包含 `feature`、`archiveDir`、`promotionPlan`、`targetContexts`
  - `resources` 声明所有要写入的 `docs/current/` 文件路径（`kind: 'file'`, `mode: 'write'`）
  - archive 命令立即返回，结果消息中包含 DRG `taskId` 和状态查询指引
  - 增加回退逻辑：如果 `config.archive.sync_promotion_fallback === true` 且 DRG 未启动，则回退到同步执行
  - **文件**: `src/commands/archive.ts`
  - **验证**: `npm run typecheck` 通过；archive 执行后 `scheduler.listTasks({ type: 'current-promotion' })` 返回一个 pending/ready/running/succeeded 任务；回退模式下同步执行成功

- [ ] 8. 全面测试与回归验证 (Agent: unspecified-high | Blocks: [9] | Blocked By: [5, 7])
  - 单元测试：`buildPromotionSuggestions` 在新结构下生成正确 suggestion（覆盖 UPDATE / ADD / synthesized_refresh / direct_migration 四种策略）
  - 单元测试：`applyPromotionSuggestions` 在新路径下正确执行文件操作
  - 集成测试：完整 archive 流程（changes → archive → DRG promotion → current 更新）
  - 并发测试：两个 promotion 任务争用同一 `docs/current/` 文件时的资源锁排队行为
  - 回归测试：现有 archive 相关测试通过（或明确更新为符合新结构的预期）
  - **命令**: `npm test`（运行全部测试套件）
  - **验证**: 所有测试通过；如果现有测试因路径变更失败，更新测试预期并确认变更合理性

- [ ] 9. OpenFlow Quality Gate (Agent: openflow-quality-gate skill | Blocks: [] | Blocked By: [8])
  - After implementation is complete, invoke the `openflow-quality-gate` skill.
  - The skill decides whether harden is required and performs evidence-aware verify.
  - Do not claim completion until the quality gate reports readiness.


---
## Verification Phase

### Security Checks
- **Secret Scan**: Check for accidentally committed secrets
- **Vulnerability Scan**: Run dependency vulnerability check

### Quality Checks
- **Lint Check**: Run linter
- **Type Check**: Run type checker
- **Test Suite**: Run all tests

### Final Verification Authority

**After all implementation tasks are complete, invoke `openflow-quality-gate` as the final readiness authority.**

The quality gate performs:
- Adversarial hardening assessment (risk-based)
- Evidence collection and verification
- Readiness classification (`Ready`, `ReadyWithDocUpdates`, `NotReady`, `NeedsDecision`)

Do not claim completion until `openflow-quality-gate` returns `Ready` or `ReadyWithDocUpdates`.

### Failure Handling
- Quality failure: fix implementation and rerun verification.
- Security failure: block archive until fixed.
- Consistency failure: sync docs and implementation, then rerun verification.

> Auto-generated by OpenFlow. `openflow-quality-gate` is the final verification authority.

---
## Plan Budget Warning

> This plan exceeds recommended task density. The warning is non-blocking —
> implementation may proceed, but consider splitting into smaller waves.

- **Same-wave tasks**: 9 (recommended max: 4)
- **Estimated execution units**: 15 (recommended max: 20)

**Suggestion**: Split large waves across multiple `/start-work` invocations
or reduce per-wave task count to keep execution feedback loops short.
