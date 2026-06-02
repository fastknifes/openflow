# openflow-implement Feature State

- Status: `complete`
- Feature: `openflow-implement`
- Updated At: 2026-05-30T12:00:00.000Z

## Feature Brief

优化 openflow-implement 命令

## Constraints

- D1 (OMO 检测): `.omo` 优先，`.sisyphus` 保留兼容 fallback
- D4 (constraint-guard): `parseConstraintsMd` 和 `extractTargetFromTool` 已修复
- D5 (auto-stash): stash 失败不阻断，pop 必须在 finally 中
- D6 (observer): OMO 后端保持原有行为不变
- OMO 路径的 `/start-work` 行为不得被修改

## Assumptions

- OMO 的 `ACCEPTED_PACKAGE_NAMES` 仍包含 `oh-my-openagent` 和 `oh-my-opencode`
- `opencode build` 是 non-OMO 环境下唯一的后端命令
- AI 代理在 non-OMO 环境下通过 Execution Guide 文本获取执行指导（不通过 session.prompt）
