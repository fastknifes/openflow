import type { Plugin as OpenCodePlugin, PluginInput } from '@opencode-ai/plugin'
import { tool } from '@opencode-ai/plugin/tool'
import type { OpenFlowContext as BaseOpenFlowContext } from './types.js'
import { registerCommands } from './command-registration.js'
import { registerSkills } from './skills/registration.js'
import { loadConfig } from './config.js'
import { logger, OpenFlowError } from './utils/index.js'
import { handleWritingPlan } from './commands/index.js'
import { createChatMessageHook } from './hooks/chat-message.js'
import { createToolBeforeHook } from './hooks/tool-before.js'
import { createToolAfterHook } from './hooks/tool-after.js'

type OpenFlowContext = BaseOpenFlowContext & PluginInput

export type { OpenFlowContext }

export const OpenFlowPlugin: OpenCodePlugin = async (ctx: PluginInput) => {
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
    acceptance: config.acceptance.enabled,
  })

  await registerCommands().catch((error: unknown) => {
    logger.warn('Command registration failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  })

  await registerSkills(openflowCtx).catch((error: unknown) => {
    logger.warn('Skill registration failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  })

  const chatMessageHook = createChatMessageHook(openflowCtx)
  const toolBeforeHook = createToolBeforeHook(openflowCtx)
  const toolAfterHook = createToolAfterHook(openflowCtx)

  return {
    tool: {
      'openflow-writing-plan': tool({
        description: 'OpenFlow writing-plan command for development plan generation guidance',
        args: {
          feature: tool.schema.string().max(64),
        },
        execute: async (args: { feature: string }, toolContext) => {
          void toolContext
          try {
            return await handleWritingPlan(openflowCtx, args.feature)
          } catch (error) {
            if (error instanceof OpenFlowError) {
              return error.toUserMessage()
            }
            return `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        },
      }),
    },

    'chat.message': async (input, output) => {
      await chatMessageHook(input, output)
    },
    'tool.execute.before': async (input, output) => {
      await toolBeforeHook(input, output)
    },
    'tool.execute.after': async (input, output) => {
      await toolAfterHook(input, output)
    },

    config: async (cfg) => {
      openflowCtx.config = loadConfig(cfg as Record<string, unknown>)
      logger.info('Configuration reloaded')
    },
  }
}

export const Plugin: OpenCodePlugin = OpenFlowPlugin
export default OpenFlowPlugin

export type { OpenFlowConfig } from './types.js'
