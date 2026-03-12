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
  drift_check?: boolean
}

export interface AcceptanceConfig {
  enabled: boolean
  trigger_words_zh: string[]
  trigger_words_en: string[]
  doc_sync_prompt: boolean
  drift_detection: boolean
}

export interface OpenFlowConfig {
  brainstorming: BrainstormingConfig
  tdd: TddConfig
  verification: VerificationConfig
  acceptance: AcceptanceConfig
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
  acceptance: {
    enabled: true,
    trigger_words_zh: ['调整', '改一下', '测试发现', '验收', '检查', '问题', '还有问题', '需要改'],
    trigger_words_en: ['adjust', 'fix', 'test found', 'acceptance', 'check', 'issue', 'tweak', 'modify'],
    doc_sync_prompt: true,
    drift_detection: true,
  },
  archive: {
    enabled: true,
    output_dir: 'docs/archive',
    drift_check: true,
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

// 验收阶段类型
export type DevelopmentPhase = 'implementation' | 'acceptance' | 'archived'

export interface PendingDocUpdate {
  file: string
  timestamp: string
  reason?: string
}

export interface AcceptanceState {
  feature: string
  phase: DevelopmentPhase
  phaseStartedAt: string
  implementationEndedAt?: string
  pendingDocUpdates: PendingDocUpdate[]
}

// 按阶段分段的文件变更记录
export interface PhasedChanges {
  implementation: FileChangeRecord[]
  acceptance: FileChangeRecord[]
}

// 设计文档漂移检测结果
export interface DriftItem {
  item: string
  designDoc: string
  actualCode: string
  reason: string
}
