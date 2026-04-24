/**
 * Newline used when generating fresh files.
 */
export const NEWLINE_DEFAULT = '\n' as const

/**
 * Marker placed before the managed OpenFlow docs guide block.
 */
export const OPENFLOW_MARKER_BEGIN = '<!-- OPENFLOW DOCS GUIDE:BEGIN -->' as const

/**
 * Marker placed after the managed OpenFlow docs guide block.
 */
export const OPENFLOW_MARKER_END = '<!-- OPENFLOW DOCS GUIDE:END -->' as const

/**
 * Curated first-run base template for AGENTS.md.
 */
export const AGENTS_INIT_BASE_TEMPLATE = `# OpenFlow

OpenFlow 是面向 OpenCode 的工作流插件，帮助团队从需求、设计到实现、归档保持一致的文档与执行节奏。

> 这里放置项目级协作约定、工作方式说明，以及需要所有参与者遵守的默认规则。
`

/**
 * Managed Chinese OpenFlow docs guide block for AGENTS.md.
 */
export const OPENFLOW_DOCS_GUIDE_BLOCK = `<!-- OPENFLOW DOCS GUIDE:BEGIN -->
## 文档阅读指南

以下目录均为按需阅读，不要求一次性通读；只在对应工作阶段或问题需要时再打开相关文件。

- \`docs/current/requirements/\`：当前需求事实与验收要点，优先作为“要做什么”的依据。
- \`docs/current/design/\`：当前设计事实、模块边界与实现约束，优先作为“怎么做”的依据。
- \`docs/current/spec/\`：当前规格说明与可执行规范，优先用于校准行为细节与接口约定。
- \`docs/current/workflow/\`：当前流程规则与协作步骤，优先用于确认文档与执行顺序。
- \`docs/decisions/\`：跨版本的架构与治理决策，只有在需要理解长期原则或取舍时才阅读。
- \`docs/changes/\`：进行中的变更工作区，仅在处理某个具体 feature、需求或设计任务时阅读。
- \`docs/archive/\`：已完成并冻结的历史归档，仅在追溯背景、对比演进或审计时阅读。

阅读原则：先读当前、再读相关、最后才读历史；先看最小必要集合，再按需要扩展。
<!-- OPENFLOW DOCS GUIDE:END -->` as const

/**
 * Supported init result states.
 */
export type InitResult = 'initialized' | 'refreshed' | 'appended' | 'safe_repair'

/**
 * User-facing messages for init result states.
 */
export const INIT_RESULT_MESSAGES: Readonly<Record<InitResult, string>> = Object.freeze({
  initialized: 'initialized AGENTS.md and added OpenFlow docs guide',
  refreshed: 'refreshed OpenFlow docs guide',
  appended: 'appended OpenFlow docs guide',
  safe_repair: 'appended fresh OpenFlow docs guide as safe repair',
})
