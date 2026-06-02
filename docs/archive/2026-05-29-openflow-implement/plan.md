# Plan: openflow-implement

## Overview

修复 `openflow-implement` 命令的 6 个 bug：OMO 检测过时（只检查 `.sisyphus/` 不检查 `.omo/`）、非 OMO 环境无执行指导、constraints 不注入到 AI、worktree 创建前不保存 dirty main、observer 过早推进 quality_gate_pending、代码未按设计实现。涉及 6 个源文件的修改，5 个测试文件的更新。

## Design Context

- Design: `docs/changes/2026-05-29-openflow-implement/design.md`
- Behavior: `docs/changes/2026-05-29-openflow-implement/behavior.md`
- State: `docs/changes/2026-05-29-openflow-implement/state.md`
- Decisions: D1–D6

## Mixed Strategy

### Phase 1 — Classify

| 维度 | 评估 | 理由 |
|------|------|------|
| Process complexity | HIGH | 6 bugs 跨 6 文件，5 phase 依赖链 |
| Architectural complexity | MODERATE | 修改现有代码，无新抽象引入 |
| Structural reuse | LOW | bug 修复而非新架构 |
| Data flow complexity | MODERATE | ImplementationRun 状态机 + stash/pop 生命周期 |

**结论: Pyramid only** — 进程密集型，依赖链清晰，Pattern 方法不增加价值。

### Phase 2 — Apply Pyramid

#### Highest-Level Goal

`openflow-implement` 命令在 OMO 和 non-OMO 环境下都能正确检测环境、保护用户 dirty 代码、向 AI 注入完整执行指导（含约束）、并在实现完成后正确衔接质量门。

#### Task Pyramid

```
1. 环境检测修复 (D1)
   1.1 omo-detection.ts 路径更新
   1.2 测试覆盖
2. Dirty main 保护 (D5)
   2.1 auto-stash/pop 机制
   2.2 测试覆盖
3. Non-OMO 执行指导 (D2/D3)
   3.1 buildExecutionGuide 函数
   3.2 handoffToBackend + implement.ts 返回文本注入
   3.3 测试覆盖
4. Observer 状态推进修复 (D6)
   4.1 OMO/non-OMO 后端区分
   4.2 测试覆盖
5. 集成验证 + 文档对齐
   5.1 全量回归测试
   5.2 文档同步
```

#### Core Abstractions and Boundaries

| Abstraction | Responsibility | Boundary |
|-------------|---------------|----------|
| OMO Environment Detector (`omo-detection.ts`) | 判定 OMO vs non-OMO 环境 | 只做检测，不做路由或执行 |
| Worktree Stash Guard (`implementation-worktree.ts`) | 保护 dirty main 不受 worktree 操作影响 | 只管 stash/pop 生命周期，不管 worktree 创建逻辑本身 |
| Execution Guide Builder (`implementation-backend.ts`) | 为 non-OMO AI 构建结构化执行指导 | 只构建文本，不执行任何操作 |
| Backend Observer (`implementation-observer.ts`) | 区分 OMO/non-OMO 后端完成事件 | 只管理状态推进，不改变业务逻辑 |

## Execution Strategy

### Parallel Execution Waves

**Wave 1** (no dependencies — parallel):
- T1: OMO 检测路径更新 (D1)
- T2: Worktree auto-stash 机制 (D5)

**Wave 2** (depends on T1):
- T3: Execution Guide 构建 + 注入 (D2/D3)

**Wave 3** (depends on T3):
- T4: Observer non-OMO 状态推进修复 (D6)

**Wave 4** (depends on T1–T4 — parallel):
- T5: OMO 检测测试 (D1)
- T6: Auto-stash 测试 (D5)
- T7: Execution Guide 测试 (D2/D3)
- T8: Observer 测试 (D6)

**Wave 5** (depends on T5–T8):
- T9: 文档对齐 + 全量回归

### Dependency Matrix

| Task | Blocked By | Blocks |
|------|-----------|--------|
| T1 | — | T3, T5 |
| T2 | — | T6 |
| T3 | T1 | T4, T7 |
| T4 | T3 | T8 |
| T5 | T1 | T9 |
| T6 | T2 | T9 |
| T7 | T3 | T9 |
| T8 | T4 | T9 |
| T9 | T5, T6, T7, T8 | — |

## Tasks

- [x] 1. **OMO 检测路径更新** (Agent: fixer | Blocks: T3, T5 | Blocked By: —)
  - **Files**: `src/utils/omo-detection.ts`
  - **What**: 修改 `detectOmoExecutionFlow` Rule 2 和 `detectOmoEnvironment` Rule 2/3，将 `.sisyphus` 单路径检查改为 `.omo` 优先 + `.sisyphus` fallback 循环
  - **Constraints**: [D1] `.omo` 优先检测，`.sisyphus` 保留兼容 fallback；OMO_PLUGIN_IDS 无需变更
  - **Verify**: `npx bun test tests/utils/omo-detection.test.ts`

- [x] 2. **Worktree auto-stash 机制** (Agent: fixer | Blocks: T6 | Blocked By: —)
  - **Files**: `src/utils/implementation-worktree.ts`, `src/commands/implement.ts`
  - **What**: 新增 `autoStashIfDirty()` 和 `autoStashPop()` 函数；修改 `createWorktree` 在 worktree add 前后包裹 stash/pop（pop 在 finally 中）；`WorktreeResult` 增加 `stashed` 标记；`handleImplement` 记录 stash observation
  - **Constraints**: [D5] stash 失败不阻断（返回 false 继续创建）；pop 必须在 finally 中执行；pop 失败记录 warning observation（`User may need to run 'git stash pop' manually`）不抛异常
  - **Verify**: `npx bun test tests/utils/implementation-worktree.test.ts`

- [x] 3. **Execution Guide 构建 + 注入** (Agent: fixer | Blocks: T4, T7 | Blocked By: T1)
  - **Files**: `src/utils/implementation-backend.ts`, `src/commands/implement.ts`
  - **What**: 新增 `buildExecutionGuide()` 函数（输出 Execution Context / What To Do / Task Breakdown / Critical Rules / 条件 Constraints / 条件 Worktree Completion 共 6 个 section）；`BackendHandoffResult` 增加 `executionGuide?: string`；`handoffToBackend` non-omo 分支调用并赋值；`handleImplement` 返回文本追加 `handoffResult.executionGuide`
  - **Constraints**: [D2] 仅 non-OMO 路径注入；[D3] constraints 仅在 count > 0 时输出 Constraints section；Execution Guide 不含 `/start-work`、`mustUseExistingImplementationRun`、`boulder.json`
  - **Verify**: `npx bun test tests/utils/implementation-backend.test.ts tests/commands/implement.test.ts`

- [x] 4. **Observer non-OMO 状态推进修复** (Agent: fixer | Blocks: T8 | Blocked By: T3)
  - **Files**: `src/hooks/implementation-observer.ts`
  - **What**: 修改 `toolAfterHook` 中 backend tool 完成后的状态推进逻辑：OMO 后端（`backendCommand.startsWith('/start-work')`）保持原有行为推进到 `quality_gate_pending`；non-OMO 后端只记录 `backend_completed` event，status 保持 `running`；错误路径 OMO/non-OMO 一致推进到 `blocked`；处理 `backendCommand` undefined 或空字符串按 non-OMO 处理
  - **Constraints**: [D6] OMO 后端行为不变；backendCommand undefined 不崩溃
  - **Verify**: `npx bun test tests/hooks/implementation-observer.test.ts`

- [x] 5. **OMO 检测测试** (Agent: fixer | Blocks: T9 | Blocked By: T1)
  - **Files**: `tests/utils/omo-detection.test.ts`
  - **What**: 新增 4 个用例：`.omo/boulder.json` 存在时返回 `'omo'`；`.sisyphus/boulder.json`（无 `.omo/`）仍返回 `'omo'`；两者同时存在时优先 `.omo/`；`.omo/boulder.json` 畸形时 fallback 到 `.sisyphus`
  - **Constraints**: [D1] 覆盖 behavior.md 4 个 D1 场景
  - **Verify**: `npx bun test tests/utils/omo-detection.test.ts`

- [x] 6. **Auto-stash 测试** (Agent: fixer | Blocks: T9 | Blocked By: T2)
  - **Files**: `tests/utils/implementation-worktree.test.ts`
  - **What**: 新增 4 个用例：dirty → auto-stash → worktree → auto-pop；干净 → 不 stash 直接创建；stash 失败 → 不阻断 worktree 创建；stash 成功但 pop 失败 → 记录 warning，不抛异常
  - **Constraints**: [D5] 覆盖 behavior.md 4 个 D5 场景
  - **Verify**: `npx bun test tests/utils/implementation-worktree.test.ts`

- [x] 7. **Execution Guide 测试** (Agent: fixer | Blocks: T9 | Blocked By: T3)
  - **Files**: `tests/utils/implementation-backend.test.ts`, `tests/commands/implement.test.ts`
  - **What**: `implementation-backend.test.ts` 新增：`buildExecutionGuide` 输出包含全部 6 个 section（有 constraints + worktree）；无 constraints 时不输出 Constraints section；无 worktree 时不输出 Worktree Completion section。`implement.test.ts` 新增：non-omo 返回文本包含 "OpenCode Native Build Execution Guide"；OMO 返回文本不含 Execution Guide；Execution Guide 不含 `/start-work`、`mustUseExistingImplementationRun`、`boulder.json`
  - **Constraints**: [D2/D3] 覆盖 behavior.md 5 个 D2/D3 场景
  - **Verify**: `npx bun test tests/utils/implementation-backend.test.ts tests/commands/implement.test.ts`

- [x] 8. **Observer 测试** (Agent: fixer | Blocks: T9 | Blocked By: T4)
  - **Files**: `tests/hooks/implementation-observer.test.ts`
  - **What**: 新增 4 个用例：OMO 后端完成 → status 推进到 `quality_gate_pending`；non-OMO 后端完成 → status 保持 `running`；non-OMO 后端错误 → status 推进到 `blocked`；`backendCommand` undefined → 不崩溃，status 保持 `running`
  - **Constraints**: [D6] 覆盖 behavior.md 4 个 D6 场景
  - **Verify**: `npx bun test tests/hooks/implementation-observer.test.ts`

- [x] 9. **文档对齐 + 全量回归** (Agent: fixer | Blocks: — | Blocked By: T5, T6, T7, T8)
  - **Files**: `docs/current/workflow/implement-workflow.md`
  - **What**: 更新 implement-workflow.md：OMO 检测描述与 D1 一致（`.omo` 优先 + `.sisyphus` 兼容）；新增 dirty main auto-stash 步骤说明；新增 non-OMO observer 不自动推进 quality_gate_pending 的说明；运行全量测试确认无回归
  - **Constraints**: 所有 D1–D6 变更同步到 workflow 文档
  - **Verify**: `npx bun test`
  - After formal implementation is complete and Full Quality Gate admission criteria are met, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness. For casual coding or low-risk edits, use lightweight verification instead.


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
- **Estimated execution units**: 9 (recommended max: 20)

**Suggestion**: Split large waves across multiple `/openflow-implement` invocations
or reduce per-wave task count to keep execution feedback loops short.
