import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Part } from '@opencode-ai/sdk'
import type {
  ActiveFeatureIndex,
  PersistedFeatureSession,
  RecentFeatureCompletionIndex,
} from '../types.js'
import { fileExists } from './file-utils.js'

const ACTIVE_FEATURE_TTL_MS = 1000 * 60 * 60 * 6
const RECENT_COMPLETION_TTL_MS = 1000 * 60 * 5

export type OpenFlowNoticeKind =
  | 'completion-blocked'
  | 'verification-suggested'
  | 'command-result'

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

export async function getActiveFeatureSession(projectDir: string, sessionID?: string): Promise<string | undefined> {
  if (!sessionID) return undefined

  const index = await loadAndCleanActiveFeatureIndex(projectDir)
  return index.bySessionID[sessionID]?.feature
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
  const indexPath = path.join(projectDir, '.openflow', 'feature', 'active.json')
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

      const sessionFilePath = path.join(projectDir, '.openflow', 'feature', `${entry.feature}.json`)
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
  const indexPath = path.join(projectDir, '.openflow', 'feature', 'recent-completed.json')
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
  const indexPath = path.join(projectDir, '.openflow', 'feature', 'recent-completed.json')
  await fs.mkdir(path.dirname(indexPath), { recursive: true })
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8')
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
