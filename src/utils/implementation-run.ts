import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import type { ImplementationRun, ImplementationRunStatus, OpenFlowContext } from '../types.js'

export interface RunStore {
  createRun(ctx: OpenFlowContext, run: Omit<ImplementationRun, 'runID' | 'startedAt' | 'updatedAt'>): Promise<ImplementationRun>
  getRun(ctx: OpenFlowContext, runID: string): Promise<ImplementationRun | null>
  updateRun(ctx: OpenFlowContext, runID: string, updates: Partial<ImplementationRun>): Promise<ImplementationRun>
  listRuns(ctx: OpenFlowContext, filter?: { feature?: string; sessionID?: string; status?: ImplementationRunStatus[] }): Promise<ImplementationRun[]>
  deleteRun(ctx: OpenFlowContext, runID: string): Promise<void>
  getActiveRun(ctx: OpenFlowContext, feature: string, sessionID?: string): Promise<ImplementationRun | null>
}

export type ImplementationRunUpdates = Partial<Omit<ImplementationRun, 'runID' | 'startedAt' | 'updatedAt'>>

export async function recordObservation(
  ctx: OpenFlowContext,
  observationsPath: string,
  message: string,
): Promise<void> {
  try {
    const fullPath = join(ctx.directory, observationsPath)
    const timestamp = new Date().toISOString()
    const line = `[${timestamp}] ${message}\n`
    await fs.mkdir(join(fullPath, '..'), { recursive: true })
    await fs.appendFile(fullPath, line, 'utf8')
  } catch {
    // Observations are best-effort; do not fail the caller.
  }
}

const TERMINAL_STATUSES = new Set<ImplementationRunStatus>(['archived', 'blocked', 'cancelled'])

let lastTimestamp = 0

export function createRunID(): string {
  return `run_${randomUUID()}`
}

export function resolveRunsPath(ctx: OpenFlowContext): string {
  return join(ctx.directory, ctx.config.paths.implementation_runs)
}

export function isTerminalStatus(status: ImplementationRunStatus): boolean {
  return TERMINAL_STATUSES.has(status)
}

function formatTimestamp(): string {
  const now = Date.now()
  lastTimestamp = Math.max(now, lastTimestamp + 1)
  return new Date(lastTimestamp).toISOString()
}

function getFeatureDir(ctx: OpenFlowContext, feature: string): string {
  return join(resolveRunsPath(ctx), feature)
}

function getFeatureRunPath(ctx: OpenFlowContext, run: Pick<ImplementationRun, 'feature' | 'runID'>): string {
  return join(getFeatureDir(ctx, run.feature), `${run.runID}.json`)
}

function getFlatRunPath(ctx: OpenFlowContext, runID: string): string {
  return join(resolveRunsPath(ctx), `${runID}.json`)
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function atomicWriteJson(filePath: string, value: ImplementationRun, tempPath = `${filePath}.tmp.${randomUUID()}`): Promise<void> {
  await fs.mkdir(join(filePath, '..'), { recursive: true })
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await fs.rename(tempPath, filePath)
}

async function readRunFile(filePath: string): Promise<ImplementationRun | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    return JSON.parse(content) as ImplementationRun
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

function isActive(run: ImplementationRun): boolean {
  return !isTerminalStatus(run.status)
}

function sortNewestFirst(runs: ImplementationRun[]): ImplementationRun[] {
  return [...runs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export const implementationRunStore: RunStore = {
  async createRun(ctx, run) {
    const existing = await this.getActiveRun(ctx, run.feature, run.sessionID)
    if (existing) {
      return existing
    }

    const timestamp = formatTimestamp()
    const created: ImplementationRun = {
      ...run,
      runID: createRunID(),
      startedAt: timestamp,
      updatedAt: timestamp,
    }

    await atomicWriteJson(getFeatureRunPath(ctx, created), created)
    return created
  },

  async getRun(ctx, runID) {
    const runs = await this.listRuns(ctx)
    return runs.find((run) => run.runID === runID) ?? null
  },

  async updateRun(ctx, runID, updates) {
    const current = await this.getRun(ctx, runID)
    if (!current) {
      throw new Error(`Implementation run not found: ${runID}`)
    }

    const updated: ImplementationRun = {
      ...current,
      ...updates,
      runID: current.runID,
      startedAt: current.startedAt,
      updatedAt: formatTimestamp(),
    }

    await atomicWriteJson(getFeatureRunPath(ctx, updated), updated)
    return updated
  },

  async listRuns(ctx, filter = {}) {
    const root = resolveRunsPath(ctx)
    if (!(await pathExists(root))) {
      return []
    }

    const featureNames = filter.feature ? [filter.feature] : await fs.readdir(root)
    const runs: ImplementationRun[] = []

    for (const feature of featureNames) {
      const featureDir = getFeatureDir(ctx, feature)
      if (!(await pathExists(featureDir))) {
        continue
      }

      const entries = await fs.readdir(featureDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) {
          continue
        }

        const run = await readRunFile(join(featureDir, entry.name))
        if (run) {
          runs.push(run)
        }
      }
    }

    return sortNewestFirst(runs).filter((run) => {
      if (filter.feature && run.feature !== filter.feature) return false
      if (filter.sessionID && run.sessionID !== filter.sessionID) return false
      if (filter.status && !filter.status.includes(run.status)) return false
      return true
    })
  },

  async deleteRun(ctx, runID) {
    const run = await this.getRun(ctx, runID)
    if (!run) {
      return
    }

    await fs.rm(getFeatureRunPath(ctx, run), { force: true })
  },

  async getActiveRun(ctx, feature, sessionID) {
    const filter = sessionID ? { feature, sessionID } : { feature }
    const runs = await this.listRuns(ctx, filter)
    return runs.find(isActive) ?? null
  },
}

export async function createRun(ctx: OpenFlowContext, run: ImplementationRun): Promise<ImplementationRun> {
  await atomicWriteJson(getFlatRunPath(ctx, run.runID), run, `${getFlatRunPath(ctx, run.runID)}.tmp`)
  return run
}

export async function getRun(ctx: OpenFlowContext, runID: string): Promise<ImplementationRun | null> {
  return readRunFile(getFlatRunPath(ctx, runID))
}

export async function updateRun(ctx: OpenFlowContext, runID: string, updates: ImplementationRunUpdates): Promise<ImplementationRun | null> {
  const current = await getRun(ctx, runID)
  if (!current) {
    return null
  }

  const updated: ImplementationRun = {
    ...current,
    ...updates,
    runID: current.runID,
    startedAt: current.startedAt,
    updatedAt: formatTimestamp(),
  }

  await createRun(ctx, updated)
  return updated
}

export async function listRuns(ctx: OpenFlowContext, feature?: string): Promise<ImplementationRun[]> {
  const runsPath = resolveRunsPath(ctx)
  if (!(await pathExists(runsPath))) {
    return []
  }

  const entries = await fs.readdir(runsPath, { withFileTypes: true })
  const runs: ImplementationRun[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue
    }

    const run = await readRunFile(join(runsPath, entry.name))
    if (run && (!feature || run.feature === feature)) {
      runs.push(run)
    }
  }

  return sortNewestFirst(runs)
}

export async function deleteRun(ctx: OpenFlowContext, runID: string): Promise<boolean> {
  const existing = await getRun(ctx, runID)
  if (!existing) {
    return false
  }

  await fs.rm(getFlatRunPath(ctx, runID), { force: true })
  return true
}

export async function getActiveRun(ctx: OpenFlowContext, feature: string, sessionID?: string): Promise<ImplementationRun | null> {
  return implementationRunStore.getActiveRun(ctx, feature, sessionID)
}

export async function findActiveRun(ctx: OpenFlowContext, sessionID: string): Promise<ImplementationRun | null> {
  const runs = await listRuns(ctx)
  return runs.find((run) => run.sessionID === sessionID && isActive(run)) ?? null
}
