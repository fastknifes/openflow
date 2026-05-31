import type { OpenFlowContext } from '../types.js'
import { runFeatureWorkflow } from '../phases/feature/workflow/feature-workflow.js'

export async function handleFeature(
  ctx: OpenFlowContext,
  feature?: string,
  answer?: string,
  action?: 'status' | 'collect' | 'generate',
  facts?: Record<string, string>,
  toolContext?: unknown,
): Promise<string> {
  return runFeatureWorkflow(ctx, feature, answer, action, facts, toolContext)
}
