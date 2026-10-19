import type { Plugin as V2Plugin } from '@opencode/plugin'
import { createOpenFlowRuntime } from '../runtime.js'
import { createCompatClient } from './compat-client.js'
import { registerOpenFlowHooksOnV2 } from './register.js'
import { logger } from '../utils/logger.js'
import { stopOpenFlowScheduler } from '../scheduler-singleton.js'

type V2Ctx = V2Plugin.Context
type Cleanup = () => Promise<void> | void

/**
 * OpenCode V2 plugin setup entrypoint.
 *
 * Boots the shared OpenFlow runtime against a V1-shaped host context (built
 * from the V2 context plus a session client shim) and registers the resulting
 * hooks and tools through the V2 domain APIs.
 */
export async function setupOpenFlowV2(ctx: V2Ctx): Promise<Cleanup> {
  const directory = ctx.location?.directory ?? process.cwd()
  // V2 exposes the project root as `location.project.canonical`, which is the
  // closest analogue of the V1 `worktree` (stable repo root).
  const worktree = ctx.location?.project?.canonical ?? directory

  logger.info('OpenFlow V2 setup starting', { directory, worktree })

  const client = createCompatClient(ctx)

  const { ctx: openflowCtx, hooks } = await createOpenFlowRuntime({
    directory,
    worktree,
    client,
    shell: undefined,
    opencodeConfig: ctx.options as Record<string, unknown> | undefined,
  })

  const cleanups = await registerOpenFlowHooksOnV2(ctx, { hooks, ctx: openflowCtx })

  logger.info('OpenFlow V2 setup complete', { registrations: cleanups.length })

  return async () => {
    for (const dispose of cleanups.reverse()) {
      try {
        await dispose()
      } catch (error) {
        logger.debug('OpenFlow V2 cleanup failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // V2 unloads plugins explicitly, so stop the shared scheduler with them.
    try {
      await stopOpenFlowScheduler({ abortRunning: true })
    } catch (error) {
      logger.debug('OpenFlow V2 scheduler stop failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
