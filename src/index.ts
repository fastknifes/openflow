import type { Plugin as OpenCodePlugin, PluginInput } from '@opencode-ai/plugin'
import { tool } from '@opencode-ai/plugin/tool'
import type { OpenFlowContext as BaseOpenFlowContext } from './types.js'
import { registerCommands } from './command-registration.js'
import { registerSkills } from './skills/registration.js'
import { loadConfig } from './config.js'
import { logger, OpenFlowError } from './utils/index.js'
import { handleInit, handleWritingPlan, handleIssue, handleArchive } from './commands/index.js'
import { getContractRuntime } from './contracts/runtime.js'
import { GuardianConsumer } from './drift/guardian-consumer.js'
import { handleBrainstorm } from './commands/brainstorm.js'
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
      'openflow-init': tool({
        description: 'Initialize or refresh the root AGENTS.md with OpenFlow docs navigation guide',
        args: {},
        execute: async (_args, toolContext) => {
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
      'openflow-brainstorm': tool({
        description: 'OpenFlow brainstorm command for design clarification. Start or continue feature design. Provide feature name and optionally an answer to the current brainstorm question.',
        args: {
          feature: tool.schema.string().max(64),
          answer: tool.schema.string().optional(),
        },
        execute: async (args: { feature: string; answer?: string }, toolContext) => {
          try {
            return await handleBrainstorm(openflowCtx, args.feature || undefined, args.answer, toolContext)
          } catch (error) {
            if (error instanceof OpenFlowError) {
              return error.toUserMessage()
            }
            return `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        },
      }),
      'openflow-issue': tool({
        description: 'OpenFlow issue clarification and triage command. Investigates uncertain problems (data issues, config issues, behavior changes) via 8-stage clarification before any implementation. Supports flags inline: --readonly, --write-doc, --no-doc, --name <slug>, --env <local|staging|production>, --continue.',
        args: {
          caseText: tool.schema.string(),
        },
        execute: async (args: { caseText: string }, toolContext) => {
          void toolContext
          try {
            return await handleIssue(openflowCtx, args.caseText)
          } catch (error) {
            if (error instanceof OpenFlowError) {
              return error.toUserMessage()
            }
            return `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        },
      }),
      'openflow-archive': tool({
        description: 'OpenFlow archive command. Archives a completed feature/issue — copies design docs, generates implementation-mapper.md, promotes current facts, and cleans up build data. Requires verify readiness.',
        args: {
          feature: tool.schema.string(),
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
