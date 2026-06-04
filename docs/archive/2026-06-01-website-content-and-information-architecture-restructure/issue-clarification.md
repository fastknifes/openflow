# Issue: worktree 模式下实现引擎不 commit，导致 QG 和 archive 链路断裂

## 严重程度

HIGH — 影响 `/openflow-implement` worktree 模式的全部后续流程

## 现象

在使用 worktree 模式执行 `/openflow-implement` 后，实现引擎在 worktree 中创建了所有文件，但：

1. **所有文件均为 uncommitted 状态**（staged + untracked，515 个文件，0 个 commit）
2. **Run state 卡在 `blocked`**，不会自动转为 `completed`
3. **`/openflow-quality-gate` 报 `not_ready`**，因为 worktree 中缺少 `docs/changes/` 工作区文件
4. **`/openflow-archive` 拒绝归档**，因为 run status 不是 `completed` 且 QG 未报 `ready`

最终结果：实现工作完成了，但无法通过正常流程进入 QG → archive。

## 复现步骤

1. 运行 `/openflow-feature` 完成设计
2. 运行 `/openflow-writing-plan` 生成计划
3. 运行 `/openflow-implement <feature>`（触发 worktree 模式）
4. AI 在 worktree 中完成所有代码改动
5. 运行 `/openflow-quality-gate <feature>` → 报 `not_ready`
6. 运行 `/openflow-archive <feature>` → 报 `blocked`

## 根因分析

### 问题 1：worktree 中无 commit

实现引擎（OpenCode build agent）在 worktree 目录中创建和修改了文件，但没有执行 `git add` + `git commit`。worktree 的分支 `openflow/implement-<feature>` 上有 0 个 commit。

```
# worktree 中 git status 的结果：
AM  website/.vitepress/config.ts      # staged then modified
??  website/guide/understanding/       # 完全 untracked
??  website/guide/how-it-works/        # 完全 untracked
...（515 个文件）
```

**期望行为**：实现引擎完成工作后应该在 worktree 中 commit 所有变更。

### 问题 2：run state 不更新

`.openflow/runs/<feature>/run_xxx.json` 中 `status` 字段始终为 `"blocked"`。

```json
{
  "status": "blocked",
  "startedAt": "2026-06-01T09:11:50.517Z",
  "updatedAt": "2026-06-01T09:33:22.102Z"
}
```

**期望行为**：实现引擎完成（或 QG 通过）后，run state 应更新为 `"completed"`。

### 问题 3：worktree 缺少 changes 工作区

`/openflow-implement` 在 worktree 中创建文件，但 `docs/changes/<date>-<feature>/` 下的 design.md、behavior.md、plan.md 只存在于主仓库，不在 worktree 中。QG 检查 `context_alignment` 和 `changes_workspace` 时找不到这些文件。

**期望行为**：worktree 初始化时应将 changes 工作区文件同步/链接到 worktree。

## 影响

- `/openflow-quality-gate` 无法正常评估（缺少上下文）
- `/openflow-archive` 拒绝执行（run status 不满足条件）
- 用户只能手动 commit、手动修改 run JSON、手动复制文件来绕过
- 最终只能手动将 worktree 文件复制回主仓库，绕过整个归档流程

## 涉及文件

- `src/utils/implementation-run.ts` — run state 管理
- `src/utils/implementation-worktree.ts` — worktree 创建和管理
- `src/commands/implement.ts` — `/openflow-implement` 命令
- `src/commands/archive.ts` — `/openflow-archive` 命令
- `src/skills/quality-gate-skill.ts` — QG skill

## 临时解决方案（本次使用的方法）

1. 手动在 worktree 中 `git add website/ && git commit`
2. 手动编辑 `.openflow/runs/.../run_xxx.json` 将 `status` 从 `"blocked"` 改为 `"completed"`
3. 手动将 `docs/changes/` 下的 design.md、behavior.md、plan.md 复制到 worktree
4. 手动在 worktree 中创建 `.sisyphus/plans/` 并放入 plan.md
5. 手动将 worktree 中的文件复制回主仓库

## 建议修复方向

1. **实现引擎完成时应自动 commit**：worktree 中的变更应该在实现完成后被 commit，无论后续是 QG 还是 archive
2. **Run state 应在 commit 后更新为 `completed`**：commit 成功后更新 run JSON
3. **Worktree 初始化时应同步 changes 工作区**：至少复制 design.md、behavior.md、plan.md 到 worktree
4. **Archive 应能处理 worktree 模式**：检测到 worktree 时，应能自动 merge 或将变更应用回主仓库

## 复现环境

- OpenFlow 版本：当前 main 分支
- 容器模式：worktree（`containerMode: "worktree"`）
- 后端：opencode（非 OMO）
- Feature：`website-content-and-information-architecture-restructure`
