import type { Plugin as OpenCodePlugin, PluginInput } from '@opencode-ai/plugin'
import { tool } from '@opencode-ai/plugin/tool'
import type { OpenFlowContext as BaseOpenFlowContext } from './types.js'
import { cleanupLegacyCommandArtifacts } from './command-registration.js'
import { loadConfig } from './config.js'
import { registerSkills } from './skills/registration.js'
import { logger, OpenFlowError } from './utils/index.js'
import { handleArchive, handleBrainstorm, handleInit, handleStatus, handleConfig, handleVerify, handleMigrateDocs } from './commands/index.js'
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

  await cleanupLegacyCommandArtifacts().catch((error: unknown) => {
    logger.warn('Legacy command cleanup failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  })

  // Register skills eagerly for the native skill tool discovery path
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
      'openflow/brainstorm': tool({
        description: 'OpenFlow brainstorm command for design clarification',
        args: {
          feature: tool.schema.string().max(64).optional(),
          answer: tool.schema.string().max(280).optional(),
        },
        execute: async (args: { feature?: string; answer?: string }, toolContext) => {
          try {
            return await handleBrainstorm(openflowCtx, args.feature, args.answer, toolContext)
          } catch (error) {
            if (error instanceof OpenFlowError) {
              return error.toUserMessage()
            }
            return `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        },
      }),
      'openflow/archive': tool({
        description: 'OpenFlow archive command for completed features',
        args: {
          feature: tool.schema.string().max(64),
        },
        execute: async (args: { feature: string }, toolContext) => {
          void toolContext
          try {
            return await handleArchive(openflowCtx, args.feature)
          } catch (error) {
            if (error instanceof OpenFlowError) {
              return error.toUserMessage()
            }
            return `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        },
      }),
      'openflow/init': tool({
        description: 'OpenFlow init command for initializing AGENTS.md with docs guide',
        args: {},
        execute: async (_args: Record<string, never>, toolContext) => {
          void toolContext
          try {
            return await handleInit(openflowCtx)
          } catch (error) {
            if (error instanceof OpenFlowError) {
              return error.toUserMessage()
            }
            return `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        },
      }),
      'openflow/status': tool({
        description: 'OpenFlow status command',
        args: {},
        execute: async (_args: Record<string, never>, toolContext) => {
          void toolContext
          try {
            return handleStatus(openflowCtx)
          } catch (error) {
            if (error instanceof OpenFlowError) {
              return error.toUserMessage()
            }
            return `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        },
      }),
      'openflow/config': tool({
        description: 'OpenFlow config command',
        args: {},
        execute: async (_args: Record<string, never>, toolContext) => {
          void toolContext
          try {
            return handleConfig(openflowCtx)
          } catch (error) {
            if (error instanceof OpenFlowError) {
              return error.toUserMessage()
            }
            return `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        },
      }),
      'openflow/verify': tool({
        description: 'OpenFlow verify command for evidence and readiness checks',
        args: {
          feature: tool.schema.string().max(64).optional(),
        },
        execute: async (args: { feature?: string }, toolContext) => {
          void toolContext
          try {
            return await handleVerify(openflowCtx, args.feature)
          } catch (error) {
            if (error instanceof OpenFlowError) {
              return error.toUserMessage()
            }
            return `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        },
      }),
      'openflow/migrate-docs': tool({
        description: 'Migrate documentation from other workflow tools into OpenFlow docs structure',
        args: {
          sourceDir: tool.schema.string().max(256).optional(),
          targetDir: tool.schema.string().max(256).optional(),
          dryRun: tool.schema.boolean().optional(),
          answer: tool.schema.string().max(280).optional(),
        },
        execute: async (args: { sourceDir?: string; targetDir?: string; dryRun?: boolean; answer?: string }, toolContext) => {
          void toolContext
          try {
            return await handleMigrateDocs(openflowCtx, args)
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
