export function extractOpencodePluginNames(
  rawConfig: Record<string, unknown> | undefined,
): string[] {
  if (!rawConfig) return []

  const opencode = rawConfig.opencode as Record<string, unknown> | undefined
  const candidates = [
    rawConfig.plugin,
    rawConfig.plugins,
    opencode?.plugin,
    opencode?.plugins,
  ]

  return candidates.flatMap(extractPluginNamesFromConfigValue)
}

export function normalizeOpencodePluginName(spec: string): string {
  const trimmed = spec.trim()
  if (!trimmed) return trimmed

  if (trimmed.startsWith('@')) {
    const versionAt = trimmed.indexOf('@', 1)
    return versionAt === -1 ? trimmed : trimmed.slice(0, versionAt)
  }

  const versionAt = trimmed.indexOf('@')
  return versionAt === -1 ? trimmed : trimmed.slice(0, versionAt)
}

function extractPluginNamesFromConfigValue(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (typeof entry === 'string') {
      return [normalizeOpencodePluginName(entry)]
    }

    if (Array.isArray(entry) && typeof entry[0] === 'string') {
      return [normalizeOpencodePluginName(entry[0])]
    }

    return []
  })
}
