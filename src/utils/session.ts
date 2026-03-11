import type { FileChangeRecord } from '../types.js'

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
  }
  parts: Array<{ type: string; [key: string]: unknown }>
}

function isToolPart(part: { type: string; [key: string]: unknown }): part is ToolPart {
  return part.type === 'tool'
}

export async function getSessionFileChanges(
  client: { session: { messages: (args: { sessionID: string }) => Promise<{ data?: SessionMessage[]; messages?: SessionMessage[] }> } },
  sessionID: string
): Promise<FileChangeRecord[]> {
  const response = await client.session.messages({ sessionID })
  const messages = response.data ?? response.messages ?? []

  const changes: FileChangeRecord[] = []

  for (const message of messages) {
    if (message.info.role !== 'assistant') continue

    for (const part of message.parts) {
      if (!isToolPart(part)) continue
      if (part.tool !== 'write' && part.tool !== 'edit') continue

      const filePath = part.state.input.filePath as string | undefined
      if (!filePath) continue

      if (!changes.some(c => c.filePath === filePath)) {
        changes.push({
          filePath,
          tool: part.tool,
          timestamp: Date.now(),
        })
      }
    }
  }

  return changes
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
