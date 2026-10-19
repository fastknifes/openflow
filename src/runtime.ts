import type { Hooks } from '@opencode-ai/plugin'
import { tool } from '@opencode-ai/plugin/tool'
import type { OpenFlowContext } from './types.js'
import { registerCommands } from './command-registration.js'
import { registerSkills } from './skills/registration.js'
import { loadConfig } from './config.js'
import { discoverConfig } from './utils/config-loader.js'
import { logger, OpenFlowError } from './utils/index.js'
import { initLogger, reconfigureLogger } from './utils/logger.js'
import {
  handleInit,
  handleWritingPlan,
  handleFeature,
  handleArchive,
  handleQualityGate,
  handleMigrateDocs,
  handleImplement,
  type QualityGateArgs,
} from './commands/index.js'
import { getContractRuntime } from './contracts/runtime.js'
import { GuardianConsumer } from './drift/guardian-consumer.js'
import { createChatMessageHook } from './hooks/chat-message.js'
import { createToolBeforeHook } from './hooks/tool-before.js'
import { createToolAfterHook } from './hooks/tool-after.js'
import { createImplementationObserver } from './hooks/implementation-observer.js'
import { OPENFLOW_TOOL_COMMANDS } from './commands/manifest.js'
import { createHardenReviewerExecutor, createHardenExecutorExecutor } from './orchestrator/harden-executors.js'
import { currentPromotionExecutor } from './phases/archive/current-promotion-executor.js'
import { defaultConfig } from './types.js'
import { startOpenFlowScheduler } from './scheduler-singleton.js'

/**
 * Host-neutral input required to boot an OpenFlow runtime.
 *
 * Both the V1 server hook (`PluginInput`) and the V2 setup context are adapted
 * down to this shape so all business logic is shared.
 */
export interface OpenFlowHost {
  directory: string
  worktree: string
  client: unknown
  shell: unknown
  opencodeConfig?: Record<string, unknown> | undefined
}

export interface OpenFlowRuntime {
  ctx: OpenFlowContext
  hooks: Hooks
}

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

/**
 * Boot the shared OpenFlow runtime (config, logger, scheduler, guardians,
 * command/skill registration, hooks and tools) against a host-neutral context.
 */
export async function createOpenFlowRuntime(host: OpenFlowHost): Promise<OpenFlowRuntime> {
  const discovered = host.directory
    ? await discoverConfig(host.directory, host.opencodeConfig)
    : null
  const config = loadConfig(discovered ?? undefined)
  initLogger(config.logging ?? defaultConfig.logging!, host.directory || process.cwd())
  const schedulerLoop = startOpenFlowScheduler(host.directory || process.cwd())
  if (!schedulerLoop.hasExecutor('current-promotion')) {
    schedulerLoop.registerExecutor('current-promotion', currentPromotionExecutor)
  }

  const openflowCtx: OpenFlowContext = {
    directory: host.directory,
    worktree: host.worktree,
    client: host.client,
    $: host.shell,
    config,
    enhancedPlans: new Set(),
  }

  // Register harden executors (after openflowCtx is available)
  if (!schedulerLoop.hasExecutor('harden-reviewer')) {
    schedulerLoop.registerExecutor('harden-reviewer', createHardenReviewerExecutor(openflowCtx))
  }
  if (!schedulerLoop.hasExecutor('harden-executor')) {
    schedulerLoop.registerExecutor('harden-executor', createHardenExecutorExecutor(openflowCtx))
  }

  logger.info('Plugin initialized', {
    feature: true,
    tdd: config.tdd.enabled,
    verification: config.verification.in_plan,
    archive: config.archive.enabled,
    acceptance: config.acceptance.enabled,
    guardian: config.guardian.enabled,
    scheduler: schedulerLoop !== undefined,
  })

  // Start ContractRuntime + Guardian if enabled
  if (config.guardian.enabled && config.guardian.auto_start) {
    try {
      const runtime = getContractRuntime()
      await runtime.start(host.directory)
      const guardian = new GuardianConsumer(host.directory)
      runtime.consumers.register(guardian)
      logger.info('Drift Guardian started', { state_dir: config.paths.guardian_state })
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

  const implementationObserver = createImplementationObserver(openflowCtx)
  const chatMessageHook = createChatMessageHook(openflowCtx, implementationObserver)
  const toolBeforeHook = createToolBeforeHook(openflowCtx)
  const toolAfterHook = createToolAfterHook(openflowCtx)

  const hooks: Hooks = {
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
      [OPENFLOW_TOOL_COMMANDS.implement.name]: tool({
        description: OPENFLOW_TOOL_COMMANDS.implement.description,
        args: {
          feature: tool.schema.string().max(128).optional(),
          useWorktree: tool.schema.boolean().optional(),
        },
        execute: async (args: { feature?: string; useWorktree?: boolean }, toolContext) => {
          return safeExecute(() => handleImplement(openflowCtx, args.feature, args.useWorktree, toolContext, implementationObserver))
        },
      }),
    },

    'chat.message': async (input, output) => {
      await implementationObserver['chat.message'](input, output)
      await chatMessageHook(input, output)
    },
    'tool.execute.before': async (input, output) => {
      await implementationObserver['tool.execute.before'](input, output)
      await toolBeforeHook(input, output)
    },
    'tool.execute.after': async (input, output) => {
      await toolAfterHook(input, output)
      await implementationObserver['tool.execute.after'](input, output)
    },
    'command.execute.before': async (input, output) => {
      await implementationObserver['command.execute.before'](input, output)
    },
    'shell.env': async (input, output) => {
      await implementationObserver['shell.env'](input, output)
    },
    event: async (input) => {
      await implementationObserver.event(input)
    },

    config: async (cfg) => {
      const nextDiscovered = openflowCtx.directory
        ? await discoverConfig(openflowCtx.directory, cfg as Record<string, unknown> | undefined)
        : null
      openflowCtx.config = loadConfig(nextDiscovered ?? undefined)
      reconfigureLogger(openflowCtx.config.logging ?? defaultConfig.logging!, openflowCtx.directory || process.cwd())
      logger.info('Configuration reloaded')
    },
  }

  return { ctx: openflowCtx, hooks }
}
