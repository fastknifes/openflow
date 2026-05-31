function normalizeProjectPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//u, '')
}

export function computeDiffHash(diffStr: string): string {
  let hash = 5381

  for (const char of diffStr) {
    hash = ((hash << 5) + hash) ^ char.charCodeAt(0)
    hash >>>= 0
  }

  return hash.toString(16).padStart(8, '0')
}

export function computeChangedFilesSet(diffStr: string): Set<string> {
  const files = new Set<string>()

  for (const line of diffStr.split('\n')) {
    const diffMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/u)
    if (diffMatch?.[1]) files.add(normalizeProjectPath(diffMatch[1]))
    if (diffMatch?.[2]) files.add(normalizeProjectPath(diffMatch[2]))

    const fileMatch = line.match(/^(?:---|\+\+\+) (?:a|b)\/(.+)$/u)
    if (fileMatch?.[1]) files.add(normalizeProjectPath(fileMatch[1]))
  }

  return files
}

export function hasMaterialChange(
  beforeHash: string,
  afterHash: string,
  beforeFiles: Set<string>,
  afterFiles: Set<string>,
): boolean {
  if (beforeHash !== afterHash) return true
  if (beforeFiles.size !== afterFiles.size) return true

  for (const filePath of beforeFiles) {
    if (!afterFiles.has(filePath)) return true
  }

  return false
}
