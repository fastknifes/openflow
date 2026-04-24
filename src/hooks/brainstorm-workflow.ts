import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Part } from '@opencode-ai/sdk'
import type {
  ActiveBrainstormIndex,
  BrainstormTriggerSource,
  OpenFlowContext,
  PersistedBrainstormSession,
  RecentBrainstormCompletionIndex,
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
const DESIGN_DOC_PATTERNS = [
  /^\d{8}-proposal\.md$/i,
  /^\d{8}-design\.md$/i,
  /^\d{8}-decisions\.md$/i,
  /^proposal\.md$/i,
  /^design\.md$/i,
  /^decisions\.md$/i,
]
const DEFAULT_STRONG_CLOSURE_SIGNALS = ['按这个做', '按这个方案推进', '生成正式文档', '就按这个方向', 'go with this', 'proceed with this', 'generate formal docs']
const DEFAULT_WEAK_CLOSURE_SIGNALS = ['可以', '好', '确认', '没问题', 'done', 'looks good', 'approved']
const ACTIVE_BRAINSTORM_TTL_MS = 1000 * 60 * 60 * 6
const RECENT_COMPLETION_TTL_MS = 1000 * 60 * 5

export interface ClosureDecision {
  isClosureReady: boolean
  level: 'none' | 'weak' | 'strong'
  matchedSignals: string[]
  reason: string
}

export interface IntentGateMetadata {
  featureHint?: string | undefined
  requestType?: RequestType | undefined
  shouldBrainstorm?: boolean | undefined
  reason?: string | undefined
}

export interface TriggerDecision {
  feature?: string | undefined
  requestType?: RequestType | undefined
  shouldTrigger: boolean
  source: BrainstormTriggerSource
  reason?: string | undefined
}

export function detectClosureReady(ctx: OpenFlowContext, message: string): ClosureDecision {
  const closureConfig = ctx.config.brainstorming.closure
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
    const shouldBrainstorm = typeof raw.shouldBrainstorm === 'boolean'
      ? raw.shouldBrainstorm
      : typeof raw.brainstorm === 'boolean'
        ? raw.brainstorm
        : undefined
    const reason = typeof raw.reason === 'string' ? raw.reason : undefined

    if (requestType || featureHint || shouldBrainstorm !== undefined || reason) {
      return { requestType, featureHint, shouldBrainstorm, reason }
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

  if (ctx.config.brainstorming.trigger_mode === 'never') {
    return { shouldTrigger: false, source: 'config', reason: 'brainstorm trigger mode is never' }
  }

  if (ctx.config.brainstorming.trigger_mode === 'always') {
    return {
      feature: extractFeature(metadata.featureHint) ?? extractFeature(message),
      requestType: metadata.requestType,
      shouldTrigger: true,
      source: metadata.featureHint ? 'intent' : 'config',
      reason: metadata.reason ?? 'brainstorm trigger mode is always',
    }
  }

  if (metadata.shouldBrainstorm === false) {
    return {
      feature: extractFeature(metadata.featureHint),
      requestType: metadata.requestType,
      shouldTrigger: false,
      source: 'intent',
      reason: metadata.reason ?? 'intent gate disabled brainstorm',
    }
  }

  if (metadata.shouldBrainstorm === true || metadata.requestType === 'open-ended') {
    return {
      feature: extractFeature(metadata.featureHint) ?? extractFeature(message),
      requestType: metadata.requestType ?? 'open-ended',
      shouldTrigger: true,
      source: 'intent',
      reason: metadata.reason ?? 'intent gate marked request as open-ended',
    }
  }

  const fallbackFeature = extractFeature(message)
  return {
    feature: fallbackFeature,
    shouldTrigger: Boolean(fallbackFeature),
    requestType: fallbackFeature ? 'open-ended' : undefined,
    source: 'fallback',
    reason: fallbackFeature ? 'fallback requirement pattern matched' : 'no brainstorm trigger matched',
  }
}

export function appendGuardMessage(output: Record<string, unknown>, text: string): void {
  const message = output.message as Record<string, unknown> | undefined
  const messageID = typeof message?.id === 'string' ? message.id : `openflow-${randomUUID()}`
  const sessionID = typeof message?.sessionID === 'string' ? message.sessionID : 'openflow-session'

  if (!Array.isArray(output.parts)) {
    output.parts = []
  }

  const parts = output.parts as Part[]
  parts.unshift({
    id: `openflow-${randomUUID()}`,
    sessionID,
    messageID,
    type: 'text',
    text,
    synthetic: true,
    metadata: { openflow: true },
  })
}

export async function hasDesignDoc(ctx: OpenFlowContext, featureName: string): Promise<boolean> {
  const candidatePaths = await getDesignCandidatePaths(ctx.directory, featureName, ctx.config)

  for (const candidatePath of candidatePaths) {
    if (!(await fileExists(candidatePath))) continue

    try {
      const stats = await fs.stat(candidatePath)
      if (stats.isFile() && DESIGN_DOC_PATTERNS.some(pattern => pattern.test(path.basename(candidatePath)))) {
        return true
      }
      if (!stats.isDirectory()) continue

      const entries = await fs.readdir(candidatePath, { withFileTypes: true })
      if (entries.some(entry => entry.isFile() && DESIGN_DOC_PATTERNS.some(pattern => pattern.test(entry.name)))) {
        return true
      }
    } catch (error) {
      logger.debug('Failed to inspect brainstorm design docs', {
        featureName,
        designDir: candidatePath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return false
}

export async function getActiveBrainstormFeature(projectDir: string, sessionID?: string): Promise<string | undefined> {
  if (!sessionID) return undefined

  const index = await loadAndCleanActiveBrainstormIndex(projectDir)
  return index.bySessionID[sessionID]?.feature
}

export async function getRecentCompletedBrainstormFeature(projectDir: string, sessionID?: string): Promise<string | undefined> {
  if (!sessionID) return undefined

  const index = await loadAndCleanRecentCompletionIndex(projectDir)
  return index.bySessionID[sessionID]?.feature
}

export async function getBrainstormLifecycleState(
  projectDir: string,
  sessionID?: string
): Promise<{ activeFeature?: string; recentCompletedFeature?: string }> {
  const activeFeature = await getActiveBrainstormFeature(projectDir, sessionID)
  const recentCompletedFeature = await getRecentCompletedBrainstormFeature(projectDir, sessionID)

  return {
    ...(activeFeature ? { activeFeature } : {}),
    ...(recentCompletedFeature ? { recentCompletedFeature } : {}),
  }
}

export async function markRecentBrainstormCompletion(projectDir: string, sessionID: string | undefined, feature: string): Promise<void> {
  if (!sessionID) return

  const index = await loadAndCleanRecentCompletionIndex(projectDir)
  index.bySessionID[sessionID] = {
    feature,
    completedAt: new Date().toISOString(),
  }
  await saveRecentCompletionIndex(projectDir, index)
}

export async function clearRecentBrainstormCompletion(projectDir: string, sessionID: string | undefined): Promise<void> {
  if (!sessionID) return

  const index = await loadAndCleanRecentCompletionIndex(projectDir)
  if (!index.bySessionID[sessionID]) return
  delete index.bySessionID[sessionID]
  await saveRecentCompletionIndex(projectDir, index)
}

async function loadAndCleanActiveBrainstormIndex(projectDir: string): Promise<ActiveBrainstormIndex> {
  const indexPath = path.join(projectDir, '.sisyphus', 'brainstorm', 'active.json')
  const now = Date.now()

  try {
    const content = await fs.readFile(indexPath, 'utf-8')
    const parsed = JSON.parse(content) as Partial<ActiveBrainstormIndex>
    const nextIndex: ActiveBrainstormIndex = { bySessionID: {} }
    let changed = false

    for (const [sessionID, entry] of Object.entries(parsed.bySessionID ?? {})) {
      if (!entry || typeof entry.feature !== 'string' || typeof entry.updatedAt !== 'string') {
        changed = true
        continue
      }

      const age = now - Date.parse(entry.updatedAt)
      if (!Number.isFinite(age) || age > ACTIVE_BRAINSTORM_TTL_MS) {
        changed = true
        continue
      }

      const sessionFilePath = path.join(projectDir, '.sisyphus', 'brainstorm', `${entry.feature}.json`)
      if (!(await fileExists(sessionFilePath))) {
        changed = true
        continue
      }

      try {
        const session = JSON.parse(await fs.readFile(sessionFilePath, 'utf-8')) as Partial<PersistedBrainstormSession>
        if (session.workflowState === 'completed') {
          changed = true
          continue
        }
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

async function loadAndCleanRecentCompletionIndex(projectDir: string): Promise<RecentBrainstormCompletionIndex> {
  const indexPath = path.join(projectDir, '.sisyphus', 'brainstorm', 'recent-completed.json')
  const now = Date.now()

  try {
    const content = await fs.readFile(indexPath, 'utf-8')
    const parsed = JSON.parse(content) as Partial<RecentBrainstormCompletionIndex>
    const nextIndex: RecentBrainstormCompletionIndex = { bySessionID: {} }
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

async function saveRecentCompletionIndex(projectDir: string, index: RecentBrainstormCompletionIndex): Promise<void> {
  const indexPath = path.join(projectDir, '.sisyphus', 'brainstorm', 'recent-completed.json')
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

function extractFeature(value?: string): string | undefined {
  if (!value) return undefined

  // 首先尝试模式匹配
  for (const pattern of REQUIREMENT_PATTERNS) {
    const match = value.match(pattern)
    if (match?.[1]) return sanitizeFeatureCandidate(match[1])
  }

  // 启发式规则：如果包含特征关键词，尝试提取
  const hasFeatureKeyword = INTENT_KEYWORDS.feature.some(kw => value.includes(kw))
  const hasActionKeyword = INTENT_KEYWORDS.action.some(kw => value.includes(kw))
  const hasRequirementKeyword = INTENT_KEYWORDS.requirement.some(kw => value.includes(kw))

  if (hasFeatureKeyword || (hasActionKeyword && hasRequirementKeyword)) {
    // 尝试从句子中提取第一个有意义的词组作为 feature 名称
    const words = value.split(/[\s,，。！？、]+/).filter(w => w.length > 0)
    // 找到动作词后的第一个词
    for (let i = 0; i < words.length - 1; i++) {
      const currentWord = words[i]
      if (currentWord && INTENT_KEYWORDS.action.some(kw => currentWord.includes(kw))) {
        const candidate = words[i + 1]
        if (candidate && !INTENT_KEYWORDS.feature.includes(candidate) && !INTENT_KEYWORDS.requirement.includes(candidate)) {
          return sanitizeFeatureCandidate(candidate)
        }
      }
    }
    // 如果没有找到，使用整个句子生成一个 feature 名称
    return sanitizeFeatureCandidate(value.substring(0, 30))
  }

  return sanitizeFeatureCandidate(value)
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
