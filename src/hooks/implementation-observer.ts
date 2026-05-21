import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { ImplementationRun, ImplementationRunStatus, OpenFlowContext } from '../types.js'
import { implementationRunStore } from '../utils/implementation-run.js'

export interface ObserverState {
  activeRuns: Map<string, ImplementationRun>
}

type HookInput = Record<string, unknown> & { sessionID?: string }
type HookOutput = Record<string, unknown>
type ObserverHook = (input: HookInput, output: HookOutput) => Promise<void>
type ObserverEventHook = (input: HookInput) => Promise<void>

interface ImplementationEvent {
  type: 'backend_started' | 'backend_failed' | 'backend_completed' | 'quality_gate_started' | 'quality_gate_completed'
  runID: string
  sessionID: string
  timestamp: string
  tool?: string
  callID?: string
  command?: string
  result?: string
  error?: string
}

export function createImplementationObserver(ctx: OpenFlowContext): {
  chatMessageHook: ObserverHook
  toolBeforeHook: ObserverHook
  toolAfterHook: ObserverHook
  commandBeforeHook: ObserverHook
  setActiveRun: (run: ImplementationRun) => void
  clearActiveRun: (sessionID: string) => void
  getActiveRun: (sessionID: string) => ImplementationRun | undefined
  'chat.message': ObserverHook
  'tool.execute.before': ObserverHook
  'tool.execute.after': ObserverHook
  'command.execute.before': ObserverHook
  'shell.env': ObserverHook
  event: ObserverEventHook
} {
  const state: ObserverState = { activeRuns: new Map() }

  async function recordEvent(run: ImplementationRun, event: Omit<ImplementationEvent, 'runID' | 'sessionID' | 'timestamp'>, status: ImplementationRunStatus): Promise<void> {
    const nextEvent: ImplementationEvent = {
      ...event,
      runID: run.runID,
      sessionID: run.sessionID,
      timestamp: new Date().toISOString(),
    }

    const eventsPath = resolveRunPath(ctx, run.eventsPath)
    await fs.mkdir(path.dirname(eventsPath), { recursive: true })
    await fs.appendFile(eventsPath, `${JSON.stringify(nextEvent)}\n`, 'utf8')

    const updated = await implementationRunStore.updateRun(ctx, run.runID, { status })
    state.activeRuns.set(updated.sessionID, updated)
  }

  function getActiveRun(sessionID: string): ImplementationRun | undefined {
    return state.activeRuns.get(sessionID)
  }

  async function chatMessageHook(input: HookInput, output: HookOutput): Promise<void> {
    const sessionID = readString(input.sessionID)
    if (!sessionID) return

    const run = getActiveRun(sessionID)
    if (!run) return

    const message = extractMessageText(output)
    if (!message) return

    if (message.includes('/start-work')) {
      await recordEvent(run, { type: 'backend_started' }, 'starting_backend')
      return
    }

    const qualityGateResult = detectQualityGateResult(message)
    if (!qualityGateResult) return

    await recordEvent(
      run,
      { type: 'quality_gate_completed', result: qualityGateResult },
      qualityGateResult === 'ready' ? 'ready_for_archive' : 'blocked',
    )
  }

  async function toolBeforeHook(input: HookInput, _output: HookOutput): Promise<void> {
    const run = getRunForInput(input)
    const tool = readString(input.tool)
    if (!run || !matchesBackendTool(run, tool)) return

    await recordEvent(run, withToolCall('backend_started', tool, readString(input.callID)), 'starting_backend')
  }

  async function toolAfterHook(input: HookInput, output: HookOutput): Promise<void> {
    const run = getRunForInput(input)
    const tool = readString(input.tool)
    if (!run || !matchesBackendTool(run, tool)) return

    const error = extractError(output)
    if (error) {
      await recordEvent(run, { ...withToolCall('backend_failed', tool, readString(input.callID)), error }, 'blocked')
      return
    }

    await recordEvent(run, withToolCall('backend_completed', tool, readString(input.callID)), 'quality_gate_pending')
  }

  async function commandBeforeHook(input: HookInput, _output: HookOutput): Promise<void> {
    const run = getRunForInput(input)
    const command = readString(input.command)
    if (!run || !isQualityGateCommand(command)) return

    await recordEvent(run, { type: 'quality_gate_started', command }, 'quality_gate_running')
  }

  function getRunForInput(input: HookInput): ImplementationRun | undefined {
    const sessionID = readString(input.sessionID)
    return sessionID ? getActiveRun(sessionID) : undefined
  }

  async function shellEnvHook(_input: HookInput, _output: HookOutput): Promise<void> {
    return
  }

  async function eventHook(input: HookInput): Promise<void> {
    const sessionID = readString(input.sessionID)
    const run = sessionID ? getActiveRun(sessionID) : undefined
    if (!run) return

    const type = readString(input.type) ?? readString(input.event)
    if (type === 'implementation.backend.failed' || type === 'backend_failed') {
      const error = extractError(input)
      await recordEvent(run, error ? { type: 'backend_failed', error } : { type: 'backend_failed' }, 'blocked')
      return
    }

    if (type === 'implementation.backend.completed' || type === 'backend_completed') {
      await recordEvent(run, { type: 'backend_completed' }, 'quality_gate_pending')
    }
  }

  return {
    chatMessageHook,
    toolBeforeHook,
    toolAfterHook,
    commandBeforeHook,
    setActiveRun(run) {
      state.activeRuns.set(run.sessionID, run)
    },
    clearActiveRun(sessionID) {
      state.activeRuns.delete(sessionID)
    },
    getActiveRun,
    'chat.message': chatMessageHook,
    'tool.execute.before': toolBeforeHook,
    'tool.execute.after': toolAfterHook,
    'command.execute.before': commandBeforeHook,
    'shell.env': shellEnvHook,
    event: eventHook,
  }
}

function resolveRunPath(ctx: OpenFlowContext, runPath: string): string {
  return path.isAbsolute(runPath) ? runPath : path.join(ctx.directory, runPath)
}

function matchesBackendTool(run: ImplementationRun, tool: string | undefined): boolean {
  if (!tool) return false
  const command = run.backendCommand.trim()
  if (command === tool) return true
  return command.split(/\s+/u)[0] === tool
}

function isQualityGateCommand(command: string | undefined): command is string {
  return Boolean(command && /^\/?openflow-quality-gate\b/u.test(command))
}

function detectQualityGateResult(message: string): string | undefined {
  if (!/quality[-\s]?gate|readiness/iu.test(message)) return undefined
  if (/ready[_\s-]?with[_\s-]?doc[_\s-]?updates/iu.test(message)) return 'ready_with_doc_updates'
  if (/needs[_\s-]?decision/iu.test(message)) return 'needs_decision'
  if (/not[_\s-]?ready/iu.test(message)) return 'not_ready'
  if (/\bready\b/iu.test(message)) return 'ready'
  return undefined
}

function extractMessageText(output: HookOutput): string {
  const parts = Array.isArray(output.parts) ? output.parts : []
  const partText = parts
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      const text = (part as Record<string, unknown>).text
      return typeof text === 'string' ? text : ''
    })
    .filter(Boolean)
    .join('\n')

  if (partText) return partText
  return readString(output.message) ?? readString(output.output) ?? ''
}

function extractError(output: HookOutput): string | undefined {
  const error = output.error
  if (!error) return undefined
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : JSON.stringify(error)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function withToolCall(
  type: 'backend_started' | 'backend_failed' | 'backend_completed',
  tool: string | undefined,
  callID: string | undefined,
): Pick<ImplementationEvent, 'type' | 'tool' | 'callID'> {
  return {
    type,
    ...(tool ? { tool } : {}),
    ...(callID ? { callID } : {}),
  }
}
