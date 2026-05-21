import type { OpenFlowContext } from '../types.js'
import { detectOmoEnvironment } from './omo-detection.js'

export type PlanAgent = 'prometheus' | 'plan'

/**
 * Detect which planning agent should handle the current /openflow-writing-plan request.
 *
 * Rules (evaluated in order):
 * 1. OMO environment detected (via detectOmoEnvironment) → 'prometheus'
 * 2. Otherwise → OpenCode native 'plan' agent
 */
export async function detectPlanAgent(
  ctx: OpenFlowContext,
  message?: string,
): Promise<PlanAgent> {
  const omoEnv = await detectOmoEnvironment(ctx, message)
  if (omoEnv === 'omo') {
    return 'prometheus'
  }
  return 'plan'
}
