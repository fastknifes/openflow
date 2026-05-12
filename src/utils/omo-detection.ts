import { readFile } from 'fs/promises'
import { join } from 'path'
import type { OpenFlowContext } from '../types.js'

const OMO_PLUGIN_IDS = ['oh-my-openagent', 'oh-my-opencode']

/**
 * Detect whether the current execution is part of an OMO (oh-my-openagent) work session.
 *
 * Detection rules (evaluated in order):
 * 1. Current message contains /start-work → OMO execution
 * 2. .sisyphus/boulder.json exists with truthy active_plan → OMO resume
 * 3. opencode config lists an OMO plugin → installed but not executing
 * 4. Otherwise → non-OMO
 */
export async function detectOmoExecutionFlow(
  ctx: OpenFlowContext,
  message?: string,
): Promise<'omo' | 'non-omo'> {
  // Rule 1: /start-work command in current message
  if (message && message.includes('/start-work')) {
    return 'omo'
  }

  // Rule 2: boulder.json with active_plan indicates OMO resume
  try {
    const boulderPath = join(ctx.directory, '.sisyphus', 'boulder.json')
    const raw = await readFile(boulderPath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && parsed.active_plan) {
      return 'omo'
    }
  } catch {
    // File missing, unreadable, or invalid JSON → fall through
  }

  // Rule 3: OMO plugin installed (but not actively executing)
  const rawConfig = (ctx as unknown as Record<string, unknown>).config as Record<string, unknown> | undefined
  const plugins = extractPluginsList(rawConfig)
  if (plugins && plugins.some((p: string) => OMO_PLUGIN_IDS.includes(p))) {
    return 'non-omo'
  }

  // Rule 4: Default
  return 'non-omo'
}

function extractPluginsList(
  rawConfig: Record<string, unknown> | undefined,
): string[] | null {
  if (!rawConfig) return null

  // opencode.json may have top-level "plugins" array
  if (Array.isArray(rawConfig.plugins)) {
    return rawConfig.plugins as string[]
  }

  // Could be nested under an "opencode" key
  const opencode = rawConfig.opencode as Record<string, unknown> | undefined
  if (opencode && Array.isArray(opencode.plugins)) {
    return opencode.plugins as string[]
  }

  return null
}
