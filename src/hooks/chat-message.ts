import type { OpenFlowContext } from '../types.js'
import { sanitizeFeatureName, createSafePath } from '../utils/security.js'
import { logger } from '../utils/logger.js'
import { fileExists } from './file-utils.js'

const REQUIREMENT_PATTERNS = [
  /实现\s*(\S+)\s*功能/,
  /添加\s*(\S+)/,
  /创建\s*(\S+)/,
  /开发\s*(\S+)/,
  /implement\s+(\w+)\s+feature/i,
  /add\s+(\w+)/i,
  /create\s+(\w+)/i,
  /build\s+(\w+)/i,
]

export function createChatMessageHook(ctx: OpenFlowContext) {
  return async (input: { sessionID?: string; message?: unknown }): Promise<void> => {
    if (!ctx.config.brainstorming.enabled || !ctx.config.brainstorming.auto_trigger) return

    const message = input.message
    if (typeof message !== 'string') return

    for (const pattern of REQUIREMENT_PATTERNS) {
      const match = message.match(pattern)
      if (match?.[1]) {
        try {
          const detectedFeature = sanitizeFeatureName(match[1])
          await checkAndLogNewRequirement(ctx, detectedFeature)
        } catch {
          return
        }
        break
      }
    }
  }
}

async function checkAndLogNewRequirement(ctx: OpenFlowContext, feature: string): Promise<void> {
  const designDir = createSafePath(ctx.directory, ctx.config.brainstorming.output_dir, feature)
  const planPath = createSafePath(ctx.directory, '.sisyphus', 'plans', `${feature}.md`)

  const [designExists, planExists] = await Promise.all([fileExists(designDir), fileExists(planPath)])

  if (!designExists && !planExists) {
    logger.info('New requirement detected', { feature })
    logger.info('Consider running brainstorming skill', { skill: 'openflow-brainstorm' })
  }
}
