import type { Plugin, PluginInput } from '@opencode-ai/plugin'
import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'
import type { OpenFlowContext as BaseOpenFlowContext } from './types.js'
import { loadConfig } from './config.js'
import { registerSkills } from './skills/index.js'
import { logger, OpenFlowError } from './utils/index.js'
import { handleArchive } from './commands/archive.js'
import { handleStatus } from './commands/status.js'
import { handleConfig } from './commands/config-cmd.js'
import { createChatMessageHook } from './hooks/chat-message.js'
import { createToolAfterHook } from './hooks/tool-after.js'

type OpenFlowContext = BaseOpenFlowContext & PluginInput

export type { OpenFlowContext }

export const OpenFlowPlugin: Plugin = async (ctx: PluginInput) => {
  const config = loadConfig((ctx as Record<string, unknown>).config as Record<string, unknown> | undefined)

  const openflowCtx: OpenFlowContext = {
    ...ctx,
    config,
    enhancedPlans: new Set(),
  }

  logger.info('Plugin initialized', {
    brainstorming: config.brainstorming.enabled,
    tdd: config.tdd.enabled,
    verification: config.verification.in_plan,
    archive: config.archive.enabled,
  })

  await registerSkills(openflowCtx)

  return {
    tool: {
      openflow: tool({
        description: 'OpenFlow workflow commands for development process management',
        args: {
          action: z.enum(['archive', 'status', 'config']),
          feature: z.string().max(64).optional(),
        },
        execute: async (args: { action: 'archive' | 'status' | 'config'; feature?: string }) => {
          try {
            switch (args.action) {
              case 'archive':
                return await handleArchive(openflowCtx, args.feature)
              case 'status':
                return handleStatus(openflowCtx)
              case 'config':
                return handleConfig(openflowCtx)
              default:
                return `Unknown action: ${args.action}. Available actions: archive, status, config`
            }
          } catch (error) {
            if (error instanceof OpenFlowError) {
              return error.toUserMessage()
            }
            return `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        },
      }),
    },

    'chat.message': createChatMessageHook(openflowCtx),
    'tool.execute.after': createToolAfterHook(openflowCtx),

    config: async (cfg) => {
      openflowCtx.config = loadConfig(cfg as Record<string, unknown>)
      logger.info('Configuration reloaded')
    },
  }
}

export type { OpenFlowConfig } from './types.js'
export { loadConfig } from './config.js'
export { registerSkills } from './skills/index.js'
