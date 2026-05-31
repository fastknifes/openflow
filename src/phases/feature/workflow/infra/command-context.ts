export function getToolSessionID(toolContext: unknown): string | undefined {
  if (!toolContext || typeof toolContext !== 'object') {
    return undefined
  }

  return typeof (toolContext as { sessionID?: unknown }).sessionID === 'string'
    ? (toolContext as { sessionID: string }).sessionID
    : undefined
}

export function getToolMessageID(toolContext: unknown): string | undefined {
  if (!toolContext || typeof toolContext !== 'object') {
    return undefined
  }

  return typeof (toolContext as { messageID?: unknown }).messageID === 'string'
    ? (toolContext as { messageID: string }).messageID
    : undefined
}
