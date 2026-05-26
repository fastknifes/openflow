import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Part } from '@opencode-ai/sdk'
import type {
  ActiveFeatureIndex,
  FeatureTriggerSource,
  OpenFlowContext,
  PersistedFeatureSession,
  RecentFeatureCompletionIndex,
  RequestType,
} from '../types.js'
import { sanitizeFeatureName } from '../utils/security.js'
import { logger } from '../utils/logger.js'
import { fileExists } from './file-utils.js'
import { getDesignCandidatePaths } from '../config.js'

const REQUIREMENT_PATTERNS = [
  // 标准动作动词
  /(?:实现|开发|创建|添加|做|写)\s*(?:一个|个)?\s*([^\s,，。！？]+?)\s*(?:功能|模块|页面|系统|流程)?(?:[\s,，。！？]|$)/,
  /(?:增加|新增|扩展|接入|支持)\s*(?:一个|个|一种|一套)?\s*([^\s,，。！？]+?)\s*(?:功能|模块|页面|系统|流程|平台|方式|能力)?(?:[\s,，。！？]|$)/,
  /(?:我想|我要|需要|想要)\s*(?:增加|新增|扩展|接入|支持|做|写|实现|开发)\s*(?:一个|个|一种|一套)?\s*([^\s,，。！？]+?)\s*(?:功能|模块|页面|系统|流程|平台|方式|能力)?(?:[\s,，。！？]|$)/,
  
  // 新增：更多中文表达方式
  /(?:新加|重构|优化|改进|升级|改造|完善|调整|集成|整合)\s*(?:一个|个|整个|全部)?\s*([^\s,，。！？]+?)\s*(?:功能|模块|页面|系统|流程|机制|架构|方案)?(?:[\s,，。！？]|$)/,
  /(?:新加需求|新增需求|新需求)[，,]?\s*(?:是|:|：)?\s*([^\s,，。！？]+?)(?:[\s,，。！？]|$)/,
  
  // 英文模式
  /(?:implement|add|create|build|write)\s+(?:a\s+|an\s+)?([a-z0-9_-]+)(?:\s+feature)?/i,
  /(?:support|introduce|integrate|extend)\s+(?:a\s+|an\s+)?([a-z0-9_-]+)(?:\s+(?:platform|feature|module|flow))?/i,
  /(?:refactor|optimize|improve|upgrade|enhance)\s+(?:the\s+)?([a-z0-9_-]+)(?:\s+(?:system|module|feature|flow))?/i,
]

// 启发式关键词：检测可能的需求意图
const INTENT_KEYWORDS = {
  feature: ['功能', 'feature', 'module', '模块', '系统', 'system', '流程', 'flow', '页面', 'page'],
  action: ['新加', '新增', '添加', '实现', '开发', '创建', '重构', '优化', '改进', '升级', '集成', '整合'],
  requirement: ['需求', 'requirement', '规格', 'specification', '方案', 'solution'],
}

const REQUEST_TYPES = new Set<RequestType>(['trivial', 'explicit', 'exploratory', 'open-ended', 'fix'])
const DESIGN_MARKDOWN_PATTERNS = [/^\d{8}-design\.md$/i, /^design\.md$/i]
const BEHAVIOR_MARKDOWN_PATTERNS = [/^\d{8}-behavior\.md$/i, /^behavior\.md$/i]
const DEFAULT_STRONG_CLOSURE_SIGNALS = ['按这个做', '按这个方案推进', '生成正式文档', '就按这个方向', 'go with this', 'proceed with this', 'generate formal docs']
const DEFAULT_WEAK_CLOSURE_SIGNALS = ['可以', '好', '确认', '没问题', 'done', 'looks good', 'approved']
const ACTIVE_FEATURE_TTL_MS = 1000 * 60 * 60 * 6
const RECENT_COMPLETION_TTL_MS = 1000 * 60 * 5
const LOW_SIGNAL_CONTINUATION_PATTERNS = [
  /^(?:继续|继续吧|继续生成|继续说|继续下去|好|好的|好吧|可以|确认|收到|ok|okay|yes|continue|go on|next|proceed)\s*[.!。！？?]*$/iu,
]

export interface ClosureDecision {
  isClosureReady: boolean
  level: 'none' | 'weak' | 'strong'
  matchedSignals: string[]
  reason: string
}

export interface IntentGateMetadata {
  featureHint?: string | undefined
  requestType?: RequestType | undefined
  shouldFeature?: boolean | undefined
  reason?: string | undefined
}

export interface TriggerDecision {
  feature?: string | undefined
  requestType?: RequestType | undefined
  shouldTrigger: boolean
  source: FeatureTriggerSource
  reason?: string | undefined
}

export interface FeatureSuggestionEligibility {
  eligible: boolean
  reason: string
}

export type OpenFlowNoticeKind =
  | 'feature-suggestion'
  | 'feature-closure-ready'
  | 'completion-blocked'
  | 'verification-suggested'
  | 'command-result'
  | 'feature-continuation'

export interface OpenFlowNotice {
  kind: OpenFlowNoticeKind
  text: string
  idempotencyKey?: string | undefined
  placement?: 'prepend' | 'append' | undefined
  ephemeral?: boolean | undefined
}

export interface OpenFlowNoticeMetadata {
  openflow: true
  kind: OpenFlowNoticeKind
  idempotencyKey?: string | undefined
  ephemeral: boolean
}

export function detectClosureReady(ctx: OpenFlowContext, message: string): ClosureDecision {
  const closureConfig = ctx.config.feature.closure
  if (!closureConfig?.enabled) {
    return {
      isClosureReady: false,
      level: 'none',
      matchedSignals: [],
      reason: 'closure detection disabled',
    }
  }

  const strongSignals = closureConfig.strong_signals.length > 0
    ? closureConfig.strong_signals
    : DEFAULT_STRONG_CLOSURE_SIGNALS
  const weakSignals = closureConfig.weak_signals.length > 0
    ? closureConfig.weak_signals
    : DEFAULT_WEAK_CLOSURE_SIGNALS
  const weakSignalThreshold = Math.max(1, closureConfig.weak_signal_threshold)

  const lowerMessage = message.toLowerCase()
  const strongMatched = strongSignals.filter(signal => lowerMessage.includes(signal.toLowerCase()))
  if (strongMatched.length > 0) {
    return {
      isClosureReady: true,
      level: 'strong',
      matchedSignals: strongMatched,
      reason: 'strong closure signal matched',
    }
  }

  const weakMatched = weakSignals.filter(signal => lowerMessage.includes(signal.toLowerCase()))
  if (weakMatched.length >= weakSignalThreshold) {
    return {
      isClosureReady: true,
      level: 'weak',
      matchedSignals: weakMatched,
      reason: `weak closure signals reached threshold(${weakSignalThreshold})`,
    }
  }

  return {
    isClosureReady: false,
    level: 'none',
    matchedSignals: weakMatched,
    reason: 'no closure signals met threshold',
  }
}

export function getMessageRole(output: Record<string, unknown>): string | undefined {
  const message = output.message as Record<string, unknown> | undefined
  return typeof message?.role === 'string' ? message.role : undefined
}

export function extractMessageText(output: Record<string, unknown>): string {
  const parts = Array.isArray(output.parts) ? output.parts : []
  const textParts: string[] = []

  for (const part of parts) {
    const rawPart = part as Record<string, unknown>
    if (rawPart.type !== 'text') continue
    if (typeof rawPart.text === 'string') textParts.push(rawPart.text)
  }

  return textParts.join(' ').trim()
}

export function extractIntentMetadata(input: Record<string, unknown>, output: Record<string, unknown>): IntentGateMetadata {
  const candidates = [
    input.intentGate,
    output.intentGate,
    input.classification,
    output.classification,
    getNested(input, ['metadata', 'intentGate']),
    getNested(output, ['metadata', 'intentGate']),
    getNested(output, ['message', 'metadata', 'intentGate']),
  ]

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue
    const raw = candidate as Record<string, unknown>
    const requestType = normalizeRequestType(raw.requestType ?? raw.intent)
    const featureHint = typeof raw.featureHint === 'string'
      ? raw.featureHint
      : typeof raw.feature === 'string'
        ? raw.feature
        : undefined
    const shouldFeature = typeof raw.shouldFeature === 'boolean'
      ? raw.shouldFeature
      : typeof raw.featureDesign === 'boolean'
        ? raw.featureDesign
        : typeof raw.feature === 'boolean'
          ? raw.feature
          : undefined
    const reason = typeof raw.reason === 'string' ? raw.reason : undefined

    if (requestType || featureHint || shouldFeature !== undefined || reason) {
      return { requestType, featureHint, shouldFeature, reason }
    }
  }

  return {}
}

export function decideTrigger(
  ctx: OpenFlowContext,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  message: string
): TriggerDecision {
  const metadata = extractIntentMetadata(input, output)
  const hintedFeature = extractFeatureFromExplicitHint(metadata.featureHint)
  const requirementFeature = extractFeatureFromRequirementText(message)
  const candidateFeature = hintedFeature ?? requirementFeature

  if (ctx.config.feature.trigger_mode === 'never') {
    return { shouldTrigger: false, source: 'config', reason: 'feature trigger mode is never' }
  }

  if (ctx.config.feature.trigger_mode === 'always') {
    return {
      feature: candidateFeature,
      requestType: metadata.requestType,
      shouldTrigger: Boolean(candidateFeature),
      source: hintedFeature ? 'intent' : 'config',
      reason: metadata.reason ?? (candidateFeature ? 'feature trigger mode is always' : 'feature trigger mode is always but no feature candidate was derived'),
    }
  }

  if (metadata.shouldFeature === false) {
    return {
      feature: hintedFeature,
      requestType: metadata.requestType,
      shouldTrigger: false,
      source: 'intent',
      reason: metadata.reason ?? 'intent gate disabled feature design',
    }
  }

  if (metadata.shouldFeature === true || metadata.requestType === 'open-ended') {
    return {
      feature: candidateFeature,
      requestType: metadata.requestType ?? 'open-ended',
      shouldTrigger: Boolean(candidateFeature),
      source: 'intent',
      reason: metadata.reason ?? (candidateFeature ? 'intent gate marked request as open-ended' : 'intent gate marked request as open-ended but no feature candidate was derived'),
    }
  }

  const fallbackFeature = hintedFeature ?? requirementFeature
  return {
    feature: fallbackFeature,
    shouldTrigger: Boolean(fallbackFeature),
    requestType: fallbackFeature ? 'open-ended' : undefined,
    source: 'fallback',
    reason: fallbackFeature ? 'fallback requirement pattern matched' : 'no feature trigger matched',
  }
}

export function assessFeatureSuggestionEligibility(message: string): FeatureSuggestionEligibility {
  const trimmed = message.trim()

  if (!trimmed) {
    return { eligible: false, reason: 'message is empty' }
  }

  if (looksLikeDocPath(trimmed)) {
    return { eligible: false, reason: 'message looks like a documentation path' }
  }

  if (/^##\s+OpenFlow:/iu.test(trimmed) || /<(?:system-reminder|auto-slash-command|command-message|omo_internal_initiator)\b/i.test(trimmed)) {
    return { eligible: false, reason: 'message is an internal OpenFlow/runtime marker' }
  }

  if (/^OpenFlow command:\s*\/openflow-/iu.test(trimmed)) {
    return { eligible: false, reason: 'message is an OpenFlow command echo' }
  }

  if (LOW_SIGNAL_CONTINUATION_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return { eligible: false, reason: 'message is a low-signal continuation reply' }
  }

  return { eligible: true, reason: 'message is eligible for feature suggestion evaluation' }
}

export function appendOpenFlowNotice(output: Record<string, unknown>, notice: OpenFlowNotice): boolean {
  const message = output.message as Record<string, unknown> | undefined
  const messageID = typeof message?.id === 'string' ? message.id : `msg_openflow-${randomUUID().replace(/-/g, '')}`
  const sessionID = typeof message?.sessionID === 'string' ? message.sessionID : 'openflow-session'
  const idempotencyKey = notice.idempotencyKey ?? `${notice.kind}:${messageID}`

  if (!Array.isArray(output.parts)) {
    output.parts = []
  }

  removeOpenFlowNotices(output, metadata => metadata.kind === notice.kind && metadata.idempotencyKey === idempotencyKey)

  const parts = output.parts as Part[]
  const nextPart: Part = {
    id: `prt_openflow-${randomUUID().replace(/-/g, '')}`,
    sessionID,
    messageID,
    type: 'text',
    text: notice.text,
    synthetic: true,
    metadata: {
      openflow: true,
      kind: notice.kind,
      idempotencyKey,
      ephemeral: notice.ephemeral ?? false,
    },
  }

  if (notice.placement === 'append') {
    parts.push(nextPart)
  } else {
    parts.unshift(nextPart)
  }

  return true
}

export function appendGuardMessage(output: Record<string, unknown>, text: string): void {
  appendOpenFlowNotice(output, {
    kind: 'command-result',
    text,
    ephemeral: false,
    placement: 'prepend',
  })
}

export function removeOpenFlowNotices(
  output: Record<string, unknown>,
  predicate: (metadata: OpenFlowNoticeMetadata) => boolean,
): number {
  if (!Array.isArray(output.parts)) {
    return 0
  }

  const parts = output.parts as Part[]
  const keptParts = parts.filter((part) => {
    const metadata = getOpenFlowNoticeMetadata(part)
    return !metadata || !predicate(metadata)
  })

  const removed = parts.length - keptParts.length
  if (removed > 0) {
    output.parts = keptParts
  }

  return removed
}

export async function hasDesignDoc(ctx: OpenFlowContext, featureName: string): Promise<boolean> {
  const candidatePaths = await getDesignCandidatePaths(ctx.directory, featureName, ctx.config)

  for (const candidatePath of candidatePaths) {
    if (!(await fileExists(candidatePath))) continue

    try {
      const stats = await fs.stat(candidatePath)
      if (stats.isFile() && DESIGN_MARKDOWN_PATTERNS.some(pattern => pattern.test(path.basename(candidatePath)))) {
        const siblingEntries = await fs.readdir(path.dirname(candidatePath), { withFileTypes: true })
        if (siblingEntries.some(entry => entry.isFile() && BEHAVIOR_MARKDOWN_PATTERNS.some(pattern => pattern.test(entry.name)))) {
          return true
        }
      }
      if (!stats.isDirectory()) continue

      const entries = await fs.readdir(candidatePath, { withFileTypes: true })
      const hasDesign = entries.some(entry => entry.isFile() && DESIGN_MARKDOWN_PATTERNS.some(pattern => pattern.test(entry.name)))
      const hasBehavior = entries.some(entry => entry.isFile() && BEHAVIOR_MARKDOWN_PATTERNS.some(pattern => pattern.test(entry.name)))
      if (hasDesign && hasBehavior) {
        return true
      }
    } catch (error) {
      logger.debug('Failed to inspect feature design docs', {
        featureName,
        designDir: candidatePath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return false
}

export async function getActiveFeatureSession(projectDir: string, sessionID?: string): Promise<string | undefined> {
  if (!sessionID) return undefined

  const index = await loadAndCleanActiveFeatureIndex(projectDir)
  return index.bySessionID[sessionID]?.feature
}

export async function getRecentCompletedFeature(projectDir: string, sessionID?: string): Promise<string | undefined> {
  if (!sessionID) return undefined

  const index = await loadAndCleanRecentCompletionIndex(projectDir)
  return index.bySessionID[sessionID]?.feature
}

export async function getFeatureLifecycleState(
  projectDir: string,
  sessionID?: string
): Promise<{ activeFeature?: string; recentCompletedFeature?: string }> {
  const activeFeature = await getActiveFeatureSession(projectDir, sessionID)
  const recentCompletedFeature = await getRecentCompletedFeature(projectDir, sessionID)

  return {
    ...(activeFeature ? { activeFeature } : {}),
    ...(recentCompletedFeature ? { recentCompletedFeature } : {}),
  }
}

export async function markRecentFeatureCompletion(projectDir: string, sessionID: string | undefined, feature: string): Promise<void> {
  if (!sessionID) return

  const index = await loadAndCleanRecentCompletionIndex(projectDir)
  index.bySessionID[sessionID] = {
    feature,
    completedAt: new Date().toISOString(),
  }
  await saveRecentCompletionIndex(projectDir, index)
}

export async function clearRecentFeatureCompletion(projectDir: string, sessionID: string | undefined): Promise<void> {
  if (!sessionID) return

  const index = await loadAndCleanRecentCompletionIndex(projectDir)
  if (!index.bySessionID[sessionID]) return
  delete index.bySessionID[sessionID]
  await saveRecentCompletionIndex(projectDir, index)
}

async function loadAndCleanActiveFeatureIndex(projectDir: string): Promise<ActiveFeatureIndex> {
  const indexPath = path.join(projectDir, '.sisyphus', 'feature', 'active.json')
  const now = Date.now()

  try {
    const content = await fs.readFile(indexPath, 'utf-8')
    const parsed = JSON.parse(content) as Partial<ActiveFeatureIndex>
    const nextIndex: ActiveFeatureIndex = { bySessionID: {} }
    let changed = false

    for (const [sessionID, entry] of Object.entries(parsed.bySessionID ?? {})) {
      if (!entry || typeof entry.feature !== 'string' || typeof entry.updatedAt !== 'string') {
        changed = true
        continue
      }

      const age = now - Date.parse(entry.updatedAt)
      if (!Number.isFinite(age) || age > ACTIVE_FEATURE_TTL_MS) {
        changed = true
        continue
      }

      const sessionFilePath = path.join(projectDir, '.sisyphus', 'feature', `${entry.feature}.json`)
      if (!(await fileExists(sessionFilePath))) {
        changed = true
        continue
      }

      try {
        JSON.parse(await fs.readFile(sessionFilePath, 'utf-8')) as Partial<PersistedFeatureSession>
      } catch {
        changed = true
        continue
      }

      nextIndex.bySessionID[sessionID] = entry
    }

    if (changed) {
      await fs.writeFile(indexPath, JSON.stringify(nextIndex, null, 2), 'utf-8')
    }

    return nextIndex
  } catch {
    return { bySessionID: {} }
  }
}

async function loadAndCleanRecentCompletionIndex(projectDir: string): Promise<RecentFeatureCompletionIndex> {
  const indexPath = path.join(projectDir, '.sisyphus', 'feature', 'recent-completed.json')
  const now = Date.now()

  try {
    const content = await fs.readFile(indexPath, 'utf-8')
    const parsed = JSON.parse(content) as Partial<RecentFeatureCompletionIndex>
    const nextIndex: RecentFeatureCompletionIndex = { bySessionID: {} }
    let changed = false

    for (const [sessionID, entry] of Object.entries(parsed.bySessionID ?? {})) {
      if (!entry || typeof entry.feature !== 'string' || typeof entry.completedAt !== 'string') {
        changed = true
        continue
      }

      const age = now - Date.parse(entry.completedAt)
      if (!Number.isFinite(age) || age > RECENT_COMPLETION_TTL_MS) {
        changed = true
        continue
      }

      nextIndex.bySessionID[sessionID] = entry
    }

    if (changed) {
      await saveRecentCompletionIndex(projectDir, nextIndex)
    }

    return nextIndex
  } catch {
    return { bySessionID: {} }
  }
}

async function saveRecentCompletionIndex(projectDir: string, index: RecentFeatureCompletionIndex): Promise<void> {
  const indexPath = path.join(projectDir, '.sisyphus', 'feature', 'recent-completed.json')
  await fs.mkdir(path.dirname(indexPath), { recursive: true })
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8')
}

function getNested(source: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = source
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function normalizeRequestType(value: unknown): RequestType | undefined {
  if (typeof value !== 'string') return undefined

  const normalized = value.toLowerCase()
  if (REQUEST_TYPES.has(normalized as RequestType)) {
    return normalized as RequestType
  }

  if (normalized === 'implementation') {
    return 'open-ended'
  }

  return undefined
}

function extractFeatureFromRequirementText(value: string): string | undefined {
  if (!value) return undefined
  if (looksLikeDocPath(value)) return undefined

  for (const pattern of REQUIREMENT_PATTERNS) {
    const match = value.match(pattern)
    if (match?.[1]) return sanitizeFeatureCandidate(resolveCommonFeatureAlias(match[1]) ?? match[1])
  }

  const hasFeatureKeyword = INTENT_KEYWORDS.feature.some(kw => value.includes(kw))
  const hasActionKeyword = INTENT_KEYWORDS.action.some(kw => value.includes(kw))
  const hasRequirementKeyword = INTENT_KEYWORDS.requirement.some(kw => value.includes(kw))

  if (hasFeatureKeyword || (hasActionKeyword && hasRequirementKeyword)) {
    const words = value.split(/[\s,，。！？、]+/).filter(w => w.length > 0)
    for (let i = 0; i < words.length - 1; i++) {
      const currentWord = words[i]
      if (currentWord && INTENT_KEYWORDS.action.some(kw => currentWord.includes(kw))) {
        const candidate = words[i + 1]
        if (candidate && !INTENT_KEYWORDS.feature.includes(candidate) && !INTENT_KEYWORDS.requirement.includes(candidate)) {
          return sanitizeFeatureCandidate(resolveCommonFeatureAlias(candidate) ?? candidate)
        }
      }
    }
    return sanitizeFeatureCandidate(value.substring(0, 30))
  }

  return undefined
}

function extractFeatureFromExplicitHint(value?: string): string | undefined {
  if (!value) return undefined
  if (looksLikeDocPath(value)) return undefined

  const derivedFromRequirementText = extractFeatureFromRequirementText(value)
  if (derivedFromRequirementText) {
    return derivedFromRequirementText
  }

  if (value.length <= 64 && !/\s/.test(value)) {
    return sanitizeFeatureCandidate(value)
  }

  return undefined
}

function resolveCommonFeatureAlias(value: string): string | undefined {
  if (/登录|login/iu.test(value)) return 'user-login'
  if (/代理平台|agent.platform/iu.test(value)) return 'agent-platform'
  return undefined
}

function looksLikeDocPath(value: string): boolean {
  return /(?:^|[\\/])docs[\\/](?:changes|archive|current|design|requirements)(?:[\\/]|$)/i.test(value)
    || /(?:^|\s)docs[\\/](?:changes|archive|current|design|requirements)(?:[\\/]|\s|$)/i.test(value)
}

function sanitizeFeatureCandidate(value: string): string | undefined {
  try {
    return sanitizeFeatureName(value)
  } catch {
    const unicodeSlug = Array.from(value.trim())
      .map(char => char.codePointAt(0)?.toString(16))
      .filter((part): part is string => Boolean(part))
      .join('-')

    if (!unicodeSlug) return undefined

    try {
      return sanitizeFeatureName(`feature-${unicodeSlug}`)
    } catch {
      return undefined
    }
  }
}

function getOpenFlowNoticeMetadata(part: unknown): OpenFlowNoticeMetadata | undefined {
  if (!part || typeof part !== 'object') return undefined

  const rawPart = part as Record<string, unknown>
  if (rawPart.synthetic !== true) return undefined

  const metadata = rawPart.metadata
  if (!metadata || typeof metadata !== 'object') return undefined

  const rawMetadata = metadata as Record<string, unknown>
  if (rawMetadata.openflow !== true) return undefined
  if (typeof rawMetadata.kind !== 'string') return undefined

  return {
    openflow: true,
    kind: rawMetadata.kind as OpenFlowNoticeKind,
    idempotencyKey: typeof rawMetadata.idempotencyKey === 'string' ? rawMetadata.idempotencyKey : undefined,
    ephemeral: rawMetadata.ephemeral === true,
  }
}
