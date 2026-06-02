# openflow-implement - Implementation Mapper
**Date**: 2026-05-30
**Status**: ready_with_doc_updates
## Behavior to Code Mapping

| Behavior Scenario | Type | Expected Behavior | Code Files | Key Symbols |
|-------------------|------|-------------------|------------|-------------|
| OMO 环境正确检测（.omo 目录） | scenario | Not specified. | — | — |
| OMO 兼容旧 .sisyphus 目录 | scenario | Not specified. | — | — |
| OMO 环境优先使用 .omo 目录 | scenario | Not specified. | — | — |
| 非 OMO 环境提供完整执行指导 | scenario | Not specified. | — | — |
| 非 OMO 环境注入约束摘要 | scenario | Not specified. | — | — |
| 非 OMO 环境无约束时不输出 Constraints 区块 | scenario | Not specified. | — | — |
| OMO 环境不包含 Execution Guide | scenario | Not specified. | — | — |
| constraint-guard 正确解析 constraints.md | scenario | Not specified. | — | — |
| constraint-guard 对 write/edit 工具生效 | scenario | Not specified. | — | — |
| 约束文件为空或不存在时无报错 | scenario | Not specified. | — | — |
| 无活跃 ImplementationRun 时 constraint-guard 不介入 | scenario | Not specified. | — | — |
| Worktree 创建前 auto-stash dirty main | scenario | Not specified. | — | — |
| Worktree 创建前 main 干净时不 stash | scenario | Not specified. | — | — |
| auto-stash 失败不阻断 worktree 创建 | scenario | Not specified. | — | — |
| OMO 后端 toolAfterHook 推进到 quality_gate_pending | scenario | Not specified. | — | — |
| Non-OMO 后端 toolAfterHook 不自动推进 quality_gate_pending | scenario | Not specified. | — | — |
| Non-OMO 后端 toolAfterHook 错误时推进到 blocked | scenario | Not specified. | — | — |
| .omo/boulder.json 畸形时 fallback 到 .sisyphus | scenario | Not specified. | — | — |
| auto-stash pop 失败后记录恢复指引 | scenario | Not specified. | — | — |
| backendCommand undefined 时按 non-OMO 处理 | scenario | Not specified. | — | — |
| Execution Guide 内容不含 OMO 特有字符串 | scenario | Not specified. | — | — |
