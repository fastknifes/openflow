export interface OpenFlowCommandMetadata {
  name: string
  description: string
}

export const OPENFLOW_TOOL_COMMANDS = {
  init: {
    name: 'openflow-init',
    description: 'Initialize or refresh the root AGENTS.md with OpenFlow docs navigation guide',
  },
  writingPlan: {
    name: 'openflow-writing-plan',
    description: 'OpenFlow writing-plan command for development plan generation guidance',
  },
  feature: {
    name: 'openflow-feature',
    description: 'OpenFlow feature command for natural-language design clarification. Starts or continues feature design without requiring a user-provided slug; feature identity is resolved from context or description.',
  },
  archive: {
    name: 'openflow-archive',
    description: 'OpenFlow archive command. Archives a completed feature/issue — copies design docs, promotes current facts, and cleans up build data. Requires verify readiness. The implementation-mapper.md is generated during the quality-gate phase.',
  },
  qualityGate: {
    name: 'openflow-quality-gate',
    description: 'Quality Gate executed after code changes or bug fixes. AI should call openflow-quality-gate and not claim completion until readiness is returned.',
  },
  migrateDocs: {
    name: 'openflow-migrate-docs',
    description: 'Migrate documentation from other workflow tools into OpenFlow docs structure',
  },
  implement: {
    name: 'openflow-implement',
    description: 'OpenFlow implementation command. Creates an ImplementationRun and delegates to the selected backend (omo /start-work or OpenCode native build).',
  },
} as const satisfies Record<string, OpenFlowCommandMetadata>

export const OPENFLOW_COMMAND_FILES: readonly OpenFlowCommandMetadata[] = [
  OPENFLOW_TOOL_COMMANDS.feature,
  {
    name: 'openflow-change',
    description: 'OpenFlow change command for feature workspace management',
  },
  {
    name: OPENFLOW_TOOL_COMMANDS.init.name,
    description: 'OpenFlow init command for initializing AGENTS.md with docs guide',
  },
  {
    name: OPENFLOW_TOOL_COMMANDS.archive.name,
    description: 'OpenFlow archive command for completed features',
  },
  {
    name: 'openflow-status',
    description: 'OpenFlow status command',
  },
  {
    name: 'openflow-config',
    description: 'OpenFlow config command',
  },
  OPENFLOW_TOOL_COMMANDS.migrateDocs,
  OPENFLOW_TOOL_COMMANDS.implement,
]

export const OPENFLOW_REGISTERED_SKILL_NAMES = [
  'openflow-writing-plan',
  'openflow-brainstorm',
  'openflow-quality-gate',
  'openflow-ai-reflection',
  'openflow-tdd',
] as const
