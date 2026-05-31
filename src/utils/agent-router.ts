import type { OpenFlowContext } from '../types.js'
import { detectOmoEnvironment } from './omo-detection.js'

export type PlanAgent = 'prometheus' | 'build'

/**
 * Detect which planning agent should handle the current /openflow-writing-plan request.
 *
 * Rules (evaluated in order):
 * 1. OMO environment detected (via detectOmoEnvironment) → 'prometheus'
 * 2. Otherwise → OpenCode native 'build' agent
 *
 * Non-OMO routes to 'build' (not 'plan') because the plan agent is read-only
 * and cannot persist the plan.md file. The build agent has write access;
 * STOP guardrails in the packet prevent it from proceeding to implementation.
 */
export async function detectPlanAgent(
  ctx: OpenFlowContext,
  message?: string,
): Promise<PlanAgent> {
  const omoEnv = await detectOmoEnvironment(ctx, message)
  if (omoEnv === 'omo') {
    return 'prometheus'
  }
  return 'build'
}
