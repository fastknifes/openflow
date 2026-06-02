import type { HardenFinding } from '../types.js'
import { registerHardenSession } from '../hooks/system-transform.js'
import type { OpenFlowContext } from '../types.js'
import { classifyFindings } from '../utils/harden-utils.js'
import type { ExecutorFunction } from './types.js'

interface SessionClientLike {
  session?: {
    create: (options: unknown) => Promise<unknown>
    prompt: (options: unknown) => Promise<unknown>
  }
}

type HardenAgent = 'harden-reviewer' | 'harden-executor'

interface ParsedDisposition {
  findingId: string
  verdict: 'accept' | 'reject' | 'partial'
  rationale: string
  fixSummary?: string
}

export function createHardenReviewerExecutor(ctx: OpenFlowContext): ExecutorFunction {
  const rejectedCountsBySession = new Map<string, Map<string, number>>()

  return async (task) => {
    const result = await runHardenAgentTask(ctx, task.payload, 'harden-reviewer')
    const counts = rejectedCountsBySession.get(result.sessionID) ?? new Map<string, number>()
    updateRejectedCounts(counts, parseExecutorDispositions(typeof task.payload?.priorExecutorText === 'string' ? task.payload.priorExecutorText : ''))
    rejectedCountsBySession.set(result.sessionID, counts)
    const grouped = classifyFindings(result.text as string, [])
    const actionable = grouped.actionable.filter((finding) => (counts.get(findingKey(finding)) ?? 0) < 3)
    const ambiguous = grouped.ambiguous.filter((finding) => (counts.get(findingKey(finding)) ?? 0) < 3)
    const nonBlocking = grouped.nonBlocking.filter((finding) => (counts.get(findingKey(finding)) ?? 0) < 3)
    const findings = [...actionable, ...ambiguous, ...nonBlocking]
    const maxRoundsReached = isMaxRoundsReached(task.payload)
    const contentConverged = findings.length === 0
      || (actionable.length === 0 && !containsExecutorReviewableLevel(result.text as string))
    const converged = contentConverged || maxRoundsReached
    return {
      ...result,
      findings,
      converged,
      reason: contentConverged ? inferReviewerReason({ actionable, ambiguous, nonBlocking, style: grouped.style }) : (maxRoundsReached ? 'max_rounds_reached' : 'actionable_findings'),
      rejectedCounts: Object.fromEntries(counts),
    }
  }
}

export function createHardenExecutorExecutor(ctx: OpenFlowContext): ExecutorFunction {
  return async (task) => {
    const result = await runHardenAgentTask(ctx, task.payload, 'harden-executor')
    const dispositions = parseExecutorDispositions(result.text as string)
    return {
      ...result,
      dispositions,
      fixReport: result.text as string,
      codeChanges: typeof task.payload?.codeChanges === 'string' ? task.payload.codeChanges : '',
    }
  }
}

async function runHardenAgentTask(
  ctx: OpenFlowContext,
  payload: Record<string, unknown> | undefined,
  expectedAgent: HardenAgent,
): Promise<{ sessionID: string; text: string; tokens: number }> {
  const agent = requireString(payload, 'agent') as HardenAgent
  if (agent !== expectedAgent) {
    throw new Error(`Invalid harden agent ${agent}; expected ${expectedAgent}`)
  }

  const sessionID = await resolveSessionID(ctx, payload, agent)
  const systemPrompt = requireString(payload, 'systemPrompt')
  const userPrompt = requireString(payload, 'userPrompt')
  const model = typeof payload?.model === 'string' ? payload.model : undefined

  const client = getSessionClient(ctx)
  const response = await client.session.prompt(buildPromptPayload(sessionID, systemPrompt, userPrompt, agent, model, ctx.directory))
  return {
    sessionID,
    text: extractText(response),
    tokens: extractTokens(response),
  }
}

async function resolveSessionID(
  ctx: OpenFlowContext,
  payload: Record<string, unknown> | undefined,
  agent: HardenAgent,
): Promise<string> {
  const existing = typeof payload?.sessionID === 'string' ? payload.sessionID.trim() : ''
  if (existing) return existing

  const client = getSessionClient(ctx)
  const parentSessionID = typeof payload?.parentSessionID === 'string' ? payload.parentSessionID : undefined
  const feature = typeof payload?.feature === 'string' ? payload.feature : 'harden'
  const title = typeof payload?.title === 'string' ? payload.title : `Harden ${agent === 'harden-reviewer' ? 'Reviewer' : 'Executor'} - ${feature}`
  const body: Record<string, unknown> = { title }
  if (parentSessionID) body.parentID = parentSessionID
  const created = await client.session.create({ query: { directory: ctx.directory }, body })
  const sessionID = extractSessionID(created)
  registerHardenSession(sessionID, { role: agent === 'harden-reviewer' ? 'reviewer' : 'executor', parentSessionID, feature })
  return sessionID
}

function requireString(payload: Record<string, unknown> | undefined, key: string): string {
  const value = payload?.[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing harden task payload field: ${key}`)
  }
  return value
}

function getSessionClient(ctx: OpenFlowContext): { session: { create: (options: unknown) => Promise<unknown>; prompt: (options: unknown) => Promise<unknown> } } {
  const client = ctx.client as SessionClientLike
  if (!client.session?.create || !client.session.prompt) {
    throw new Error('OpenFlow harden requires ctx.client.session.create() and ctx.client.session.prompt().')
  }
  return { session: client.session }
}

function buildPromptPayload(
  sessionID: string,
  systemPrompt: string,
  userPrompt: string,
  agent: HardenAgent,
  model: string | undefined,
  directory: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    agent,
    parts: [{ type: 'text', text: `${systemPrompt}\n\n## Task\n${userPrompt}` }],
  }
  const parsedModel = parseModel(model)
  if (parsedModel) body.model = parsedModel
  return { path: { id: sessionID }, query: { directory }, body }
}

function extractSessionID(response: unknown): string {
  const object = asRecord(response)
  if (typeof object.id === 'string') return object.id
  const data = asRecord(object.data)
  if (typeof data.id === 'string') return data.id
  throw new Error('Failed to create harden task session.')
}

function isMaxRoundsReached(payload: Record<string, unknown> | undefined): boolean {
  const round = typeof payload?.round === 'number' ? payload.round : 0
  const maxRounds = typeof payload?.maxRounds === 'number' ? payload.maxRounds : 0
  return maxRounds > 0 && round >= maxRounds
}

function updateRejectedCounts(counts: Map<string, number>, dispositions: ParsedDisposition[]): void {
  for (const disposition of dispositions) {
    if (disposition.verdict === 'reject') {
      counts.set(disposition.findingId, (counts.get(disposition.findingId) ?? 0) + 1)
    } else {
      counts.delete(disposition.findingId)
    }
  }
}

function parseExecutorDispositions(text: string): ParsedDisposition[] {
  const matches = [...text.matchAll(/(?:finding\s*:\s*([^\n|]+)[\s\S]*?)?verdict\s*:\s*(accept|reject|partial)([\s\S]*?)(?=\n\s*(?:finding\s*:|verdict\s*:)|$)/giu)]
  if (matches.length === 0) return []
  return matches.map((match, index) => {
    const description = match[1]?.trim() || `finding-${index + 1}`
    const tail = match[3] ?? ''
    return {
      findingId: normalizeFindingKey(description),
      verdict: normalizeVerdict(match[2] ?? 'accept'),
      rationale: extractField(tail, 'rationale') || tail.trim(),
      ...(extractField(tail, 'fix') ? { fixSummary: extractField(tail, 'fix') } : {}),
    }
  })
}

function normalizeVerdict(value: string): 'accept' | 'reject' | 'partial' {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'reject') return 'reject'
  if (normalized === 'partial') return 'partial'
  return 'accept'
}

function extractField(text: string, field: string): string {
  const match = new RegExp(`${field}\\s*:\\s*([^|\\n]+)`, 'iu').exec(text)
  return match?.[1]?.trim() ?? ''
}

function findingKey(finding: HardenFinding): string {
  return finding.normalizedKey || normalizeFindingKey(finding.description)
}

function normalizeFindingKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim()
}

function containsExecutorReviewableLevel(text: string): boolean {
  return /Level:\s*(behavior_violation|blocking_bug|spec_violation|regression_risk|intent_gap)/iu.test(text)
}

function inferReviewerReason(grouped: ReturnType<typeof classifyFindings>): string {
  if (grouped.ambiguous.length > 0 && grouped.actionable.length === 0) return 'review_inconclusive'
  if (grouped.nonBlocking.length > 0) return 'non_blocking_only'
  return 'no_findings'
}

function parseModel(model: string | undefined): { providerID: string; modelID: string } | null {
  if (!model) return null
  const separatorIndex = model.indexOf('/')
  if (separatorIndex <= 0 || separatorIndex === model.length - 1) return null
  return { providerID: model.slice(0, separatorIndex), modelID: model.slice(separatorIndex + 1) }
}

function extractText(response: unknown): string {
  const body = extractResponseBody(response)
  const parts = Array.isArray(body.parts) ? body.parts : []
  const text = parts
    .map((part) => {
      const record = asRecord(part)
      return typeof record.text === 'string' ? record.text : ''
    })
    .filter(Boolean)
    .join('\n')
    .trim()
  return text || (typeof body.output === 'string' ? body.output : '')
}

function extractTokens(response: unknown): number {
  const body = extractResponseBody(response)
  const info = asRecord(body.info)
  const tokens = asRecord(info.tokens)
  const cache = asRecord(tokens.cache)
  return toNumber(tokens.input) + toNumber(tokens.output) + toNumber(tokens.reasoning) + toNumber(cache.read) + toNumber(cache.write)
}

function extractResponseBody(response: unknown): Record<string, unknown> {
  const object = asRecord(response)
  return object.data ? asRecord(object.data) : object
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
