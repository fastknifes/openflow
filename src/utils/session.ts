import type { FileChangeRecord, PhasedChanges } from '../types.js'

interface ToolPart {
  type: 'tool'
  tool: string
  callID: string
  state: {
    status: string
    input: Record<string, unknown>
    output?: string
  }
  [key: string]: unknown
}

interface SessionMessage {
  info: {
    role: 'user' | 'assistant'
    id: string
    createdAt?: string | number
    timestamp?: string | number
  }
  createdAt?: string | number
  timestamp?: string | number
  parts: Array<{ type: string; [key: string]: unknown }>
}

interface SessionMessagesClient {
  session: {
    messages: (args: { sessionID: string }) => Promise<{ data?: unknown[]; messages?: unknown[] }>
  }
}

function isToolPart(part: { type: string; [key: string]: unknown }): part is ToolPart {
  return part.type === 'tool'
}

function isSessionMessage(value: unknown): value is SessionMessage {
  if (!value || typeof value !== 'object') return false
  const maybe = value as { info?: unknown; parts?: unknown }
  if (!maybe.info || typeof maybe.info !== 'object') return false
  if (!Array.isArray(maybe.parts)) return false
  return true
}

function normalizeSessionMessages(response: { data?: unknown[]; messages?: unknown[] }): SessionMessage[] {
  const rawMessages = response.data ?? response.messages ?? []
  return rawMessages.filter(isSessionMessage)
}

function isWriteOrEditTool(tool: string): tool is FileChangeRecord['tool'] {
  return tool === 'write' || tool === 'edit'
}

function shouldSkipFilePath(filePath: string): boolean {
  return filePath.includes('.sisyphus/') || filePath.includes('node_modules/')
}

function parseTimestampValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
  }

  return undefined
}

function extractMessageTimestamp(message: SessionMessage): number | undefined {
  return (
    parseTimestampValue(message.info.createdAt) ??
    parseTimestampValue(message.info.timestamp) ??
    parseTimestampValue(message.createdAt) ??
    parseTimestampValue(message.timestamp)
  )
}

function extractToolFileChange(part: ToolPart, timestamp: number): FileChangeRecord | null {
  if (!isWriteOrEditTool(part.tool)) return null

  const filePath = part.state.input.filePath as string | undefined
  if (!filePath) return null

  return {
    filePath,
    tool: part.tool,
    timestamp,
  }
}

export async function getSessionFileChanges(
  client: SessionMessagesClient,
  sessionID: string
): Promise<FileChangeRecord[]> {
  const response = await client.session.messages({ sessionID })
  const messages = normalizeSessionMessages(response)

  const changes: FileChangeRecord[] = []
  const seenFilePaths = new Set<string>()

  for (const message of messages) {
    if (message.info.role !== 'assistant') continue
    const messageTimestamp = extractMessageTimestamp(message) ?? Date.now()

    for (const part of message.parts) {
      if (!isToolPart(part)) continue
      const change = extractToolFileChange(part, messageTimestamp)
      if (!change) continue
      if (seenFilePaths.has(change.filePath)) continue

      seenFilePaths.add(change.filePath)
      changes.push(change)
    }
  }

  return changes
}

export async function getPhasedFileChanges(
  client: SessionMessagesClient,
  sessionID: string,
  implementationEndTime?: string
): Promise<PhasedChanges> {
  const response = await client.session.messages({ sessionID })
  const messages = normalizeSessionMessages(response)

  const implementationCutoff = implementationEndTime 
    ? new Date(implementationEndTime).getTime() 
    : Date.now()

  const result: PhasedChanges = {
    implementation: [],
    acceptance: []
  }
  const seenImplementation = new Set<string>()
  const seenAcceptance = new Set<string>()

  for (const message of messages) {
    if (message.info.role !== 'assistant') continue
    const messageTimestamp = extractMessageTimestamp(message) ?? Date.now()

    for (const part of message.parts) {
      if (!isToolPart(part)) continue
      const change = extractToolFileChange(part, messageTimestamp)
      if (!change) continue
      if (shouldSkipFilePath(change.filePath)) continue

      const timestamp = change.timestamp ?? messageTimestamp

      if (timestamp < implementationCutoff) {
        if (seenImplementation.has(change.filePath)) continue
        seenImplementation.add(change.filePath)
        result.implementation.push(change)
      } else {
        if (seenAcceptance.has(change.filePath)) continue
        seenAcceptance.add(change.filePath)
        result.acceptance.push(change)
      }
    }
  }

  return result
}

export function formatFileChangesForSrs(changes: FileChangeRecord[]): string {
  if (changes.length === 0) {
    return '| *No changes recorded* | |'
  }

  return changes.map(change => {
    const changeType = change.tool === 'write' ? 'created' : 'modified'
    return `| ${change.filePath} | ${changeType} |`
  }).join('\n')
}
