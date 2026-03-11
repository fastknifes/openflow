import type { OpenFlowContext } from '../types.js'
import { extractPlanName } from '../plan/parser.js'
import { enhancePlan } from '../plan/enhancer.js'
import { logger } from '../utils/logger.js'

export function createToolAfterHook(ctx: OpenFlowContext) {
  return async (input: { tool: string; args?: Record<string, unknown> }): Promise<void> => {
    if (input.tool !== 'write' && input.tool !== 'edit') return

    const filePath = input.args?.filePath as string | undefined
    if (!filePath) return

    const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/')

    if (normalizedPath.includes('.sisyphus/plans/') && normalizedPath.endsWith('.md')) {
      const planName = extractPlanName(filePath)

      if (planName && !ctx.enhancedPlans.has(planName)) {
        logger.info('Plan file detected', { path: filePath })

        if (ctx.config.tdd.enabled || ctx.config.verification.in_plan || ctx.config.brainstorming.enabled) {
          const enhanced = await enhancePlan({
            planPath: filePath,
            config: ctx.config,
            baseDir: ctx.directory,
          })
          if (enhanced) {
            ctx.enhancedPlans.add(planName)
          }
        }
      }
    }
  }
}
