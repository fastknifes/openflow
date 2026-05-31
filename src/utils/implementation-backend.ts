import { appendFile, mkdir } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import type { ToolContext } from '@opencode-ai/plugin/tool'
import type { ImplementationBackend, ImplementationRun, OpenFlowContext } from '../types.js'
import { implementationRunStore, recordObservation } from './implementation-run.js'
import { detectOmoEnvironment } from './omo-detection.js'
import { logger } from './logger.js'
import { resolveChangeUnitDir } from './change-units.js'
import type { ConstraintPacketResult } from '../contracts/context-resolver.js'

export interface BackendHandoffResult {
  success: boolean
  backend: 'omo' | 'opencode'
  command?: string
  executionGuide?: string
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

/**
 * Build a structured execution guide for non-OMO environments.
 * Injected into handleImplement's return text so the AI agent knows
 * what to do, how to read the plan, and how to call quality-gate.
 */
export function buildExecutionGuide(options: {
  run: ImplementationRun
  constraintResult?: ConstraintPacketResult
  executionRoot: string
  changeDir: string
}): string {
  const { run, constraintResult, executionRoot, changeDir } = options
  const planPath = `docs/changes/${changeDir}/plan.md`

  const designPath = `docs/changes/${changeDir}/design.md`
  const behaviorPath = `docs/changes/${changeDir}/behavior.md`

  const lines: string[] = [
    '## OpenCode Native Build Execution Guide',
    '',
    '### Execution Context',
    `- **Run ID**: ${run.runID}`,
    `- **Feature**: ${run.feature}`,
    `- **Execution Root**: \`${executionRoot}\``,
    `- **Plan Path**: \`${planPath}\``,
    `- **Design Doc**: \`${designPath}\``,
    `- **Behavior Spec**: \`${behaviorPath}\``,
    `- **Container Mode**: ${run.containerMode}`,
    '',
    '### What To Do',
    `1. Read the FULL plan file at \`${planPath}\` — this is the ONLY source of truth for tasks`,
    `2. Read the design doc at \`${designPath}\` for architectural context and decision rationale`,
    `3. Read the behavior spec at \`${behaviorPath}\` for acceptance criteria and edge cases`,
    '4. Decompose every plan checkbox into granular sub-steps BEFORE starting any code changes',
    '5. For each sub-step: identify files to modify, expected behavior, verification method',
    '6. Execute sub-steps sequentially, writing tests first for core logic (TDD: RED → GREEN → REFACTOR)',
    '7. After ALL tasks are done, call `/openflow-quality-gate` — do NOT skip this step',
    '',
    '### Task Breakdown (Mandatory)',
    '- Each plan checkbox MUST be split into concrete, actionable sub-tasks',
    '- Sub-tasks MUST specify: file to modify, what to change, expected behavior',
    '- Register ALL sub-tasks as TODO items before starting any code changes',
    '- Mark each TODO as completed only after the code change is verified',
    '',
    `### Plan Progress Tracking`,
    `- After completing each plan task, you MUST update \`${planPath}\` by changing \`- [ ]\` to \`- [x]\` for the corresponding checkbox`,
    '- The quality gate will REJECT your work if any plan checkbox remains unchecked',
    '- This is the ONLY way the system knows a task is done — updating the file is mandatory',
    '- Do NOT change a checkbox to [x] until the task is truly complete and verified',
    '',
    '### Critical Rules',
    '- You MUST read the FULL plan before starting any implementation',
    '- You MUST verify your changes against the behavior spec acceptance criteria',
    `- You MUST update \`${planPath}\` checkboxes as tasks complete — unchecked tasks = incomplete`,
    '- You MUST call `/openflow-quality-gate` after implementation completes',
    '- Do NOT skip TDD for core business logic changes',
    '- Do NOT modify files outside the execution root',
    '- Do NOT claim completion before ALL plan checkboxes are [x] AND quality-gate returns readiness',
    '- If constraint conflicts with plan, stop and report drift',
  ]

  if (constraintResult && constraintResult.constraintCount > 0) {
    lines.push(
      '',
      '### Constraints',
      `- **Constraint file**: \`docs/changes/${changeDir}/constraints.md\``,
      `- **Status**: ${constraintResult.status}`,
      `- **Total constraints**: ${constraintResult.constraintCount}`,
      '- You MUST read the constraint file before creating or executing tasks',
      '- Every task prompt MUST include applicable constraints',
    )
  }

  if (run.worktree) {
    lines.push(
      '',
      '### Worktree Completion',
      '- After all tasks complete, commit all changes in the worktree',
      '- Do NOT merge the worktree branch yourself — the system handles merge during archive',
      '- Call `/openflow-quality-gate` after committing, then `/openflow-archive` when ready',
    )
  }

  return lines.join('\n')
}

export async function handoffToBackend(
  ctx: OpenFlowContext,
  run: ImplementationRun,
  toolContext: ToolContext,
  constraintResult?: ConstraintPacketResult,
): Promise<BackendHandoffResult> {
  logger.debug('orchestrator', 'handoffToBackend started', { runID: run.runID, feature: run.feature, sessionID: toolContext.sessionID })

  const environment = await detectOmoEnvironment(ctx)
  logger.debug('orchestrator', 'omo environment detected', { environment, runID: run.runID })

  // Shared execution context — used by both branches
  const executionRoot = run.worktree || run.directory
  const changeDir = await resolveChangeUnitDir(executionRoot, run.feature)
  const planPath = `docs/changes/${changeDir}/plan.md`

  if (environment === 'non-omo') {
    const command = 'opencode build'
    const executionGuide = buildExecutionGuide({
      run,
      ...(constraintResult ? { constraintResult } : {}),
      executionRoot,
      changeDir,
    })
    logger.info('orchestrator', 'non-omo environment, using opencode backend', { runID: run.runID, command })
    await updateRunBackend(ctx, run, 'opencode', command, 'running')
    await recordBackendEvent(ctx, run, { type: 'backend_started', backend: 'opencode', command })
    await recordObservation(ctx, run.observationsPath, `Backend started: opencode (${command})`)
    await recordObservation(ctx, run.observationsPath, `Implementation context: runID=${run.runID}, feature=${run.feature}, executionRoot=${executionRoot}, worktree=${run.worktree || '(none)'}, planPath=${planPath}, containerMode=${run.containerMode}`)
    if (constraintResult) {
      const constraintObs = `Constraint packet: status=${constraintResult.status}, count=${constraintResult.constraintCount}, path=${constraintResult.constraintsPath ?? 'N/A'}`
      await recordObservation(ctx, run.observationsPath, constraintObs)
    }
    return { success: true, backend: 'opencode', command, executionGuide }
  }

  const constraintLines = constraintResult ? [
    '',
    'OpenFlow Implementation Constraints:',
    `- Constraint packet: docs/changes/${changeDir}/constraints.md`,
    `- Generation status: ${constraintResult.status}`,
    '- You MUST read this file before creating or executing implementation tasks.',
    '- Every child task prompt MUST include applicable constraints from this packet.',
    '- Blocking constraints are advisory during implementation; enforcement is at final-verify, consumed by quality-gate.',
    '- If constraint conflicts with plan, stop and report drift.',
  ] : []
  const command = [
    `/start-work ${run.feature}`,
    '',
    'OpenFlow Implementation Context:',
    `- runID: ${run.runID}`,
    `- feature: ${run.feature}`,
    `- executionRoot: ${executionRoot}`,
    `- worktree: ${run.worktree || '(none)'}`,
    `- planPath: ${planPath}`,
    `- containerMode: ${run.containerMode}`,
    `- mustUseExistingImplementationRun: true`,
    ...(constraintResult ? constraintLines : []),
  ].join('\n')
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
