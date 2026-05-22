import { appendFile, mkdir } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import type { ToolContext } from '@opencode-ai/plugin/tool'
import type { ImplementationBackend, ImplementationRun, OpenFlowContext } from '../types.js'
import { implementationRunStore, recordObservation } from './implementation-run.js'
import { detectOmoEnvironment } from './omo-detection.js'
import { logger } from './logger.js'

export interface BackendHandoffResult {
  success: boolean
  backend: 'omo' | 'opencode'
  command?: string
  error?: string
}

interface PromptClient {
  session: {
    prompt(input: {
      path: { id: string }
      body: { parts: Array<{ type: 'text'; text: string }> }
    }): Promise<unknown>
  }
}

interface BackendHandoffEvent {
  type: 'backend_started' | 'backend_failed'
  runID: string
  feature: string
  backend: ImplementationBackend
  sessionID: string
  timestamp: string
  command?: string
  error?: string
}

const activeHandoffs = new Set<string>()

export async function handoffToBackend(
  ctx: OpenFlowContext,
  run: ImplementationRun,
  toolContext: ToolContext,
): Promise<BackendHandoffResult> {
  logger.debug('orchestrator', 'handoffToBackend started', { runID: run.runID, feature: run.feature, sessionID: toolContext.sessionID })

  const environment = await detectOmoEnvironment(ctx)
  logger.debug('orchestrator', 'omo environment detected', { environment, runID: run.runID })

  if (environment === 'non-omo') {
    const command = 'opencode build'
    logger.info('orchestrator', 'non-omo environment, using opencode backend', { runID: run.runID, command })
    await updateRunBackend(ctx, run, 'opencode', command, 'running')
    await recordBackendEvent(ctx, run, { type: 'backend_started', backend: 'opencode', command })
    await recordObservation(ctx, run.observationsPath, `Backend started: opencode (${command})`)
    return { success: true, backend: 'opencode', command }
  }

  const command = `/start-work ${run.feature}`
  if (activeHandoffs.has(toolContext.sessionID)) {
    const error = 'Recursion guard: handoff already in progress'
    logger.warn('orchestrator', 'backend handoff blocked by recursion guard', { runID: run.runID, sessionID: toolContext.sessionID })
    await updateRunBackend(ctx, run, 'omo', command, 'blocked')
    await recordBackendEvent(ctx, run, { type: 'backend_failed', backend: 'omo', command, error })
    return { success: false, backend: 'omo', error }
  }

  activeHandoffs.add(toolContext.sessionID)
  logger.debug('orchestrator', 'sending omo handoff prompt', { runID: run.runID, command, sessionID: toolContext.sessionID })
  try {
    await getPromptClient(ctx).session.prompt({
      path: { id: toolContext.sessionID },
      body: { parts: [{ type: 'text', text: command }] },
    })

    logger.info('orchestrator', 'omo handoff prompt sent successfully', { runID: run.runID, command })
    await updateRunBackend(ctx, run, 'omo', command, 'running')
    await recordBackendEvent(ctx, run, { type: 'backend_started', backend: 'omo', command })
    await recordObservation(ctx, run.observationsPath, `Backend started: omo (${command})`)
    return { success: true, backend: 'omo', command }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('orchestrator', 'omo handoff prompt failed', error instanceof Error ? error : new Error(message), { runID: run.runID, command })
    await updateRunBackend(ctx, run, 'omo', command, 'blocked')
    await recordBackendEvent(ctx, run, { type: 'backend_failed', backend: 'omo', command, error: message })
    await recordObservation(ctx, run.observationsPath, `Backend failed: omo (${command}) — ${message}`)
    return { success: false, backend: 'omo', error: message }
  } finally {
    activeHandoffs.delete(toolContext.sessionID)
    logger.debug('orchestrator', 'handoffToBackend finished', { runID: run.runID })
  }
}

function getPromptClient(ctx: OpenFlowContext): PromptClient {
  const client = ctx.client as Partial<PromptClient> | undefined
  if (!client?.session?.prompt) {
    throw new Error('OpenCode session prompt client is unavailable')
  }
  return client as PromptClient
}

async function updateRunBackend(
  ctx: OpenFlowContext,
  run: ImplementationRun,
  backend: ImplementationBackend,
  backendCommand: string,
  status: ImplementationRun['status'],
): Promise<void> {
  try {
    await implementationRunStore.updateRun(ctx, run.runID, { backend, backendCommand, status })
  } catch {
    // Tests and callers may pass an in-memory run before persistence is wired.
  }
}

async function recordBackendEvent(
  ctx: OpenFlowContext,
  run: ImplementationRun,
  event: Omit<BackendHandoffEvent, 'runID' | 'feature' | 'sessionID' | 'timestamp'>,
): Promise<void> {
  try {
    const eventPath = isAbsolute(run.eventsPath) ? run.eventsPath : join(ctx.directory, run.eventsPath)
    await mkdir(dirname(eventPath), { recursive: true })
    const entry: BackendHandoffEvent = {
      ...event,
      runID: run.runID,
      feature: run.feature,
      sessionID: run.sessionID,
      timestamp: new Date().toISOString(),
    }
    await appendFile(eventPath, `${JSON.stringify(entry)}\n`, 'utf8')
  } catch {
    // Event recording is observability only; do not mask the backend handoff result.
  }
}
