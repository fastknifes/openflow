export function assessChangeRisk(
  files: string[],
  diffLines: number,
  hasNewExports: boolean,
): 'high' | 'medium' | 'low' {
  const safeFiles = files ?? []

  if (safeFiles.length >= 3) return 'high'
  if (diffLines >= 50) return 'high'
  if (hasNewExports === true) return 'high'

  const SENSITIVE_PATHS = [
    '/hooks/',
    '/commands/',
    '/config/',
    '/verify/',
    '/archive/',
    '/security/',
    '/auth/',
    '/permission/',
    '/payment/',
  ]
  for (const f of safeFiles) {
    for (const s of SENSITIVE_PATHS) {
      if (f.includes(s)) return 'high'
    }
  }

  if (safeFiles.includes('src/types.ts') || safeFiles.includes('src/index.ts')) return 'high'

  if (safeFiles.length === 2) return 'medium'

  return 'low'
}

export function isHighRisk(risk: string): boolean {
  return risk === 'high'
}
