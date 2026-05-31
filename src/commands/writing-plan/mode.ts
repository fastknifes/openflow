import type { OpenFlowConfig } from '../../types.js'
import type { WritingPlanMode } from '../../types.js'

export interface WritingPlanModeArgs {
  config: OpenFlowConfig
  invocationValue?: string | boolean | undefined
}

export function parseWritingPlanMode(value: string | boolean | undefined): WritingPlanMode {
  if (value === 'pyramid') return 'pyramid'
  if (value === 'pattern') return 'pattern'
  if (value === 'mixed') return 'mixed'
  if (value === false || value === 'false' || value === '0') return false
  throw new Error(`Invalid mode value: "${value}". Supported values: pyramid, pattern, mixed, false, 0`)
}

export function resolveWritingPlanMode(args: WritingPlanModeArgs): WritingPlanMode {
  if (args.invocationValue !== undefined) {
    return parseWritingPlanMode(args.invocationValue)
  }
  return args.config.writingPlan?.mode ?? false
}
