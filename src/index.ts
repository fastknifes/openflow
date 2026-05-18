import type { Plugin as OpenCodePlugin, PluginInput } from '@opencode-ai/plugin'
import { tool } from '@opencode-ai/plugin/tool'
import type { OpenFlowContext as BaseOpenFlowContext } from './types.js'
import { registerCommands } from './command-registration.js'
import { registerSkills } from './skills/registration.js'
import { loadConfig } from './config.js'
import { logger, OpenFlowError } from './utils/index.js'
import { handleInit, handleWritingPlan, handleFeature, handleIssue, handleArchive, handleQualityGate, handleMigrateDocs, type QualityGateArgs } from './commands/index.js'
import { getContractRuntime } from './contracts/runtime.js'
import { GuardianConsumer } from './drift/guardian-consumer.js'
import { createChatMessageHook } from './hooks/chat-message.js'
import { createToolBeforeHook } from './hooks/tool-before.js'
import { createToolAfterHook } from './hooks/tool-after.js'
import { OPENFLOW_TOOL_COMMANDS } from './commands/manifest.js'

type OpenFlowContext = BaseOpenFlowContext & PluginInput

export type { OpenFlowContext }

async function safeExecute(operation: () => Promise<string>): Promise<string> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof OpenFlowError) {
      return error.toUserMessage()
    }

    return `Error: ${error instanceof Error ? error.message : String(error)}`
  }
}

export const OpenFlowPlugin: OpenCodePlugin = async (ctx: PluginInput) => {
  const config = loadConfig((ctx as Record<string, unknown>).config as Record<string, unknown> | undefined)

  const openflowCtx: OpenFlowContext = {
    ...ctx,
    config,
    enhancedPlans: new Set(),
  }

  logger.info('Plugin initialized', {
    feature: config.feature.enabled,
    tdd: config.tdd.enabled,
    verification: config.verification.in_plan,
    archive: config.archive.enabled,
    acceptance: config.acceptance.enabled,
    guardian: config.guardian.enabled,
  })

  // Start ContractRuntime + Guardian if enabled
  if (config.guardian.enabled && config.guardian.auto_start) {
    try {
      const runtime = getContractRuntime()
      await runtime.start(ctx.directory)
      const guardian = new GuardianConsumer(ctx.directory)
      runtime.consumers.register(guardian)
      logger.info('Drift Guardian started', { state_dir: config.guardian.state_dir })
    } catch (error) {
      logger.warn('Guardian initialization failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

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
      [OPENFLOW_TOOL_COMMANDS.init.name]: tool({
        description: OPENFLOW_TOOL_COMMANDS.init.description,
        args: {},
        execute: async (_args, toolContext) => {
          void toolContext
          return safeExecute(() => handleInit(openflowCtx))
        },
      }),
      [OPENFLOW_TOOL_COMMANDS.writingPlan.name]: tool({
        description: OPENFLOW_TOOL_COMMANDS.writingPlan.description,
        args: {
          feature: tool.schema.string().max(64),
        },
        execute: async (args: { feature: string }, toolContext) => {
          void toolContext
          return safeExecute(() => handleWritingPlan(openflowCtx, args.feature))
        },
      }),
      [OPENFLOW_TOOL_COMMANDS.feature.name]: tool({
        description: OPENFLOW_TOOL_COMMANDS.feature.description,
        args: {
          feature: tool.schema.string().max(128).optional(),
        },
        execute: async (args: { feature?: string }, toolContext) => {
          return safeExecute(() => handleFeature(openflowCtx, args.feature, undefined, toolContext))
        },
      }),
      [OPENFLOW_TOOL_COMMANDS.issue.name]: tool({
        description: OPENFLOW_TOOL_COMMANDS.issue.description,
        args: {
          caseText: tool.schema.string(),
        },
        execute: async (args: { caseText: string }, toolContext) => {
          void toolContext
          return safeExecute(() => handleIssue(openflowCtx, args.caseText))
        },
      }),
      [OPENFLOW_TOOL_COMMANDS.archive.name]: tool({
        description: OPENFLOW_TOOL_COMMANDS.archive.description,
        args: {
          feature: tool.schema.string(),
        },
        execute: async (args: { feature: string }, toolContext) => {
          void toolContext
          return safeExecute(() => handleArchive(openflowCtx, args.feature))
        },
      }),
      [OPENFLOW_TOOL_COMMANDS.qualityGate.name]: tool({
        description: OPENFLOW_TOOL_COMMANDS.qualityGate.description,
        args: {
          feature: tool.schema.string().max(64).optional(),
          sessionID: tool.schema.string().optional(),
        },
        execute: async (args: { feature?: string; sessionID?: string }, toolContext) => {
          return safeExecute(async () => {
            const gateArgs: QualityGateArgs = {}
            if (args.feature) gateArgs.feature = args.feature
            const resolvedSessionID = toolContext?.sessionID || args.sessionID
            if (resolvedSessionID) gateArgs.sessionID = resolvedSessionID
            return await handleQualityGate(openflowCtx, gateArgs)
          })
        },
      }),
      [OPENFLOW_TOOL_COMMANDS.migrateDocs.name]: tool({
        description: OPENFLOW_TOOL_COMMANDS.migrateDocs.description,
        args: {
          sourceDir: tool.schema.string().max(256).optional(),
          targetDir: tool.schema.string().max(256).optional(),
          dryRun: tool.schema.boolean().optional(),
          answer: tool.schema.string().max(280).optional(),
        },
        execute: async (args: { sourceDir?: string; targetDir?: string; dryRun?: boolean; answer?: string }, toolContext) => {
          void toolContext
          return safeExecute(() => handleMigrateDocs(openflowCtx, args))
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
