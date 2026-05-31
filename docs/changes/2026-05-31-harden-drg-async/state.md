# harden-drg-async Feature State

- Status: `complete`
- Feature: `harden-drg-async`
- Updated At: 2026-05-31T11:27:42.651Z

## Feature Brief

重新设计 harden 工作流，使用 DRG 做异步 AI 对话交互

## Constraints

- DRG 保持为全局单例任务调度器（不是事件总线），插件启动时初始化。所有异步任务共享同一个 SchedulerLoop 和 DagEngine 实例，统一状态存储。
- 每次 harden 调用创建独立 DAG（如 harden-\<uuid\>），任务 ID 带前缀隔离。harden 结束后整个 DAG 归档/销毁。
- 异步通信总线模式：reviewer 和 executor 各持一个长生命周期 session，DRG 调度'思考回合任务'在已有 session 上追加消息。像聊天一样来回对话。
- DRG 任务粒度是'思考回合'：让 session 基于当前消息历史生成下一轮报告。任务输出包含 session ID 和报告内容。
- 默认1轮对抗（reviewer→executor→reviewer 为一轮），可配置最多10轮，串行执行。当前默认是 maxRounds=5，改为1。
- 流程结束当且仅当 reviewer 在一轮审查后认为没有需要继续追的问题（executor 的上报为空或 reviewer 全部认可），或达到 max rounds。终止判定权在 reviewer。
- 同一 finding 被 executor 连续拒绝3次后，reviewer session 自行维护计数器，达到3次后忽略该 finding，不再上报给 executor。
- reviewer 报告包含：问题、证据链、置信度（高/中/低）。executor 修复高置信度问题；对中低置信度自行决定是否修复；不需要修复的通过 DRG 报告回复 reviewer。
- quality-gate 的对话负责决定是否启动 harden（风险评估）和最终收敛判定。harden 不直接修改 acceptance state 或 ImplementationRun 状态。
- DRG 引擎核心不因本功能修改
- harden 输出格式必须与现有格式兼容
- quality-gate 编排逻辑不修改
- 同一时间最多一个 harden DAG 运行

## Assumptions

- None recorded.

## Generated Documents

- `F:\\ai-code\\openflow\\docs\\changes\\2026-05-31-harden-drg-async\\design.md`
- `F:\\ai-code\\openflow\\docs\\changes\\2026-05-31-harden-drg-async\\behavior.md`

## Next Steps

- [ ] Review `design.md` and `behavior.md` for constraint sufficiency
- [ ] Run `/openflow-writing-plan harden-drg-async` when ready for implementation
