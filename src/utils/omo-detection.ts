import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import type { OpenFlowContext } from '../types.js'

const OMO_PLUGIN_IDS = ['oh-my-openagent', 'oh-my-opencode']
const OMO_MARKER_ENTRIES = ['boulder.json', 'plans', 'run-continuation']

/**
 * Detect whether the current execution is part of an OMO (oh-my-openagent) work session.
 *
 * Detection rules (evaluated in order):
 * 1. Current message contains /start-work → OMO execution
 * 2. .omo/boulder.json or .sisyphus/boulder.json exists with truthy active_plan → OMO resume
 * 3. Otherwise → non-OMO
 */
export async function detectOmoExecutionFlow(
  ctx: OpenFlowContext,
  message?: string,
): Promise<'omo' | 'non-omo'> {
  // Rule 1: /start-work command in current message
  if (message && message.includes('/start-work')) {
    return 'omo'
  }

  // Rule 2: boulder.json with active_plan — check .omo first, then .sisyphus
  const boulderPaths = [
    join(ctx.directory, '.omo', 'boulder.json'),
    join(ctx.directory, '.sisyphus', 'boulder.json'),
  ]
  for (const boulderPath of boulderPaths) {
    try {
      const raw = await readFile(boulderPath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed && parsed.active_plan) return 'omo'
    } catch {
      // File missing, unreadable, or invalid JSON → fall through
    }
  }

  // Rule 3: Default
  return 'non-omo'
}

/**
 * Detect whether the current environment has OMO installed/available.
 * More permissive than detectOmoExecutionFlow — used for deciding
 * which planning agent to route to (Prometheus vs native plan).
 *
 * Detection rules (evaluated in order):
 * 1. Current message contains /start-work → OMO
 * 2. .omo/boulder.json or .sisyphus/boulder.json exists with truthy active_plan → OMO
 * 3. .omo/ or .sisyphus/ directory exists and contains OMO-specific entries → OMO workspace
 * 4. opencode config lists an OMO plugin → OMO installed
 * 5. Otherwise → non-OMO
 */
export async function detectOmoEnvironment(
  ctx: OpenFlowContext,
  message?: string,
): Promise<'omo' | 'non-omo'> {
  // Rule 1: /start-work command in current message
  if (message && message.includes('/start-work')) {
    return 'omo'
  }

  // Rule 2: boulder.json with active_plan — check .omo first, then .sisyphus
  const boulderPaths = [
    join(ctx.directory, '.omo', 'boulder.json'),
    join(ctx.directory, '.sisyphus', 'boulder.json'),
  ]
  for (const boulderPath of boulderPaths) {
    try {
      const raw = await readFile(boulderPath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed && parsed.active_plan) return 'omo'
    } catch {
      // fall through
    }
  }

  // Rule 3: Check marker entries in .omo/ first, then .sisyphus/
  const omoDirs = ['.omo', '.sisyphus']
  for (const dir of omoDirs) {
    try {
      const dirPath = join(ctx.directory, dir)
      const entries = await readdir(dirPath)
      if (entries.some((e) => OMO_MARKER_ENTRIES.includes(e))) {
        return 'omo'
      }
    } catch {
      // fall through
    }
  }

  // Rule 4: OMO plugin installed in opencode config
  const rawConfig = (ctx as unknown as Record<string, unknown>).config as Record<string, unknown> | undefined
  const plugins = extractPluginsList(rawConfig)
  if (plugins && plugins.some((p: string) => OMO_PLUGIN_IDS.includes(p))) {
    return 'omo'
  }

  // Rule 5: Default
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
