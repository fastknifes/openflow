export interface BrainstormingConfig {
  enabled: boolean
  output_dir: string
  auto_trigger: boolean
}

export interface TddConfig {
  enabled: boolean
  expand_threshold: number
}

export interface VerificationConfig {
  in_plan: boolean
  security: SecurityCheckType[]
  quality: QualityCheckType[]
  auto_fix: boolean
}

export type SecurityCheckType = 'secret' | 'vuln' | 'dependency'
export type QualityCheckType = 'lint' | 'typecheck' | 'test' | 'format'

export interface ArchiveConfig {
  enabled: boolean
  output_dir: string
}

export interface OpenFlowConfig {
  brainstorming: BrainstormingConfig
  tdd: TddConfig
  verification: VerificationConfig
  archive: ArchiveConfig
}

export const defaultConfig: OpenFlowConfig = {
  brainstorming: {
    enabled: true,
    output_dir: 'docs/design',
    auto_trigger: true,
  },
  tdd: {
    enabled: true,
    expand_threshold: 3,
  },
  verification: {
    in_plan: true,
    security: ['secret', 'vuln'],
    quality: ['lint', 'typecheck', 'test'],
    auto_fix: false,
  },
  archive: {
    enabled: true,
    output_dir: 'docs/archive',
  },
}

// 已增强的计划记录（内存中）
export interface EnhancedPlansState {
  plans: Set<string>
}

// 文件变更记录（从 Session API 获取）
export interface FileChangeRecord {
  filePath: string
  tool: 'write' | 'edit'
  timestamp?: number
}

export interface OpenFlowContext {
  directory: string
  worktree: string
  client: unknown
  $: unknown
  config: OpenFlowConfig
  enhancedPlans: Set<string>
}

export type TaskType = 'implementation' | 'test' | 'verification' | 'review' | 'setup' | 'unknown'

export interface ParsedTask {
  id: number
  title: string
  description: string
  type: TaskType
  dependencies: number[]
  isImplementation: boolean
  raw: string
  lineNumber: number
}
