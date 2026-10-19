import type { Plugin as OpenCodePlugin, PluginInput } from '@opencode-ai/plugin'
import { createOpenFlowRuntime } from './runtime.js'
import { setupOpenFlowV2 } from './v2/index.js'

export type { OpenFlowConfig, OpenFlowContext } from './types.js'
export type { OpenFlowHost, OpenFlowRuntime } from './runtime.js'

export { getSchedulerLoop, scheduler, stopOpenFlowScheduler } from './scheduler-singleton.js'

/**
 * OpenCode V1 server-hook entrypoint.
 *
 * Kept byte-compatible with the historical behaviour: it boots the shared
 * runtime and returns the V1 `Hooks` object.
 */
export const OpenFlowPlugin: OpenCodePlugin = async (ctx: PluginInput) => {
  const { hooks } = await createOpenFlowRuntime({
    directory: ctx.directory,
    worktree: ctx.worktree,
    client: ctx.client,
    shell: ctx.$,
    opencodeConfig: (ctx as Record<string, unknown>).config as Record<string, unknown> | undefined,
  })

  return hooks
}

/**
 * Durable V1/V2 default export.
 *
 * - OpenCode V1 (>= 1.18.29) reads `server` and calls it as a server hook.
 * - OpenCode V2 reads `id` + `setup` and ignores `server`.
 */
export default {
  id: '@fastknife/openflow',
  server: OpenFlowPlugin,
  setup: setupOpenFlowV2,
}
