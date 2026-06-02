import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { OpenFlowContext } from '../types.js'
import { getChangeWorkspacePath } from '../config.js'
import { logger } from './logger.js'

/**
 * Execution state sidecar for a feature's plan.
 *
 * Stored alongside the canonical `plan.md` in the change workspace
 * (e.g., `docs/changes/{feature}/plan.state.json`).
 *
 * Purpose: tracks execution progress (checked tasks, current wave, run linkage)
 * without modifying the canonical plan document.
 */
export interface PlanExecutionState {
  /** Feature slug */
  feature: string
  /** Execution status */
  status: 'created' | 'in_progress' | 'completed' | 'blocked'
  /** ISO timestamp when the state was initialized */
  createdAt: string
  /** ISO timestamp when the state was last updated */
  updatedAt: string
  /** 1-indexed task numbers that have been checked off */
  checkedTasks: number[]
  /** Current execution wave (if applicable) */
  currentWave?: number
  /** Linked ImplementationRun ID (if applicable) */
  runId?: string
  /** Free-form execution notes */
  notes?: string
}

const STATE_FILENAME = 'plan.state.json'

/**
 * Get the path to the plan state sidecar file.
 * Resolves to `docs/changes/{change-dir}/plan.state.json`.
 */
export async function getPlanStatePath(
  projectDir: string,
  featureName: string,
  config?: import('../types.js').OpenFlowConfig,
): Promise<string> {
  const workspacePath = await getChangeWorkspacePath(projectDir, featureName, config)
  return path.join(workspacePath, STATE_FILENAME)
}

/**
 * Initialize plan execution state.
 * If the state file already exists, returns the existing state without overwriting.
 * If it doesn't exist, creates a new state file with status 'created'.
 */
export async function initPlanState(
  ctx: OpenFlowContext,
  feature: string,
): Promise<PlanExecutionState> {
  const existing = await loadPlanState(ctx, feature)
  if (existing) {
    logger.debug('orchestrator', 'existing plan state found, skipping init', { feature })
    return existing
  }

  const now = new Date().toISOString()
  const state: PlanExecutionState = {
    feature,
    status: 'created',
    createdAt: now,
    updatedAt: now,
    checkedTasks: [],
  }

  await savePlanState(ctx, feature, state)
  logger.info('orchestrator', 'initialized plan execution state', { feature })
  return state
}

/**
 * Load plan execution state from disk.
 * Returns null if the state file doesn't exist or is corrupted.
 */
export async function loadPlanState(
  ctx: OpenFlowContext,
  feature: string,
): Promise<PlanExecutionState | null> {
  try {
    const statePath = await getPlanStatePath(ctx.directory, feature, ctx.config)
    const raw = await fs.readFile(statePath, 'utf-8')
    return JSON.parse(raw) as PlanExecutionState
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return null
    }
    // Corrupted JSON or other error
    logger.warn('orchestrator', 'failed to load plan state, returning null', {
      feature,
      error: String(error),
    })
    return null
  }
}

/**
 * Save plan execution state to disk.
 * Creates parent directories if needed.
 */
export async function savePlanState(
  ctx: OpenFlowContext,
  feature: string,
  state: PlanExecutionState,
): Promise<void> {
  state.updatedAt = new Date().toISOString()
  const statePath = await getPlanStatePath(ctx.directory, feature, ctx.config)
  await fs.mkdir(path.dirname(statePath), { recursive: true })
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8')
}
