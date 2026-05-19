import * as path from 'node:path'

export interface FeatureDiffScope {
  featureSlug: string
  exactPaths: Set<string>
  pathFragments: Set<string>
}

export interface ScopedDiffResult {
  diff: string
  omittedPaths: string[]
}

export function scopeDiffToFiles(diffStr: string, scopedFiles: string[]): ScopedDiffResult {
  if (!diffStr.trim()) return { diff: diffStr, omittedPaths: [] }

  const normalizedScope = new Set(scopedFiles.map(normalizeProjectPath))
  if (normalizedScope.size === 0) return { diff: diffStr, omittedPaths: [] }

  const blocks = splitDiffBlocks(diffStr)
  const scopedBlocks = blocks.filter(block => diffBlockMatchesFiles(block, normalizedScope))
  const omittedPaths = blocks
    .filter(block => !diffBlockMatchesFiles(block, normalizedScope))
    .flatMap(extractDiffBlockPaths)
    .filter(isReviewRelevantOmittedPath)

  return { diff: scopedBlocks.join('\n'), omittedPaths: [...new Set(omittedPaths)].sort() }
}

export function scopeDiffToFeature(
  projectDir: string,
  feature: string,
  diffStr: string,
  planPath: string,
  designPaths: string[],
  planContent: string,
  designContent: string,
): ScopedDiffResult {
  if (!diffStr.trim()) return { diff: diffStr, omittedPaths: [] }

  const scope = collectFeatureScope(projectDir, feature, planPath, designPaths, planContent, designContent)
  const blocks = splitDiffBlocks(diffStr)
  const scopedBlocks = blocks.filter(block => diffBlockMatchesScope(block, scope))
  const omittedPaths = blocks
    .filter(block => !diffBlockMatchesScope(block, scope))
    .flatMap(extractDiffBlockPaths)
    .filter(isReviewRelevantOmittedPath)

  if (scopedBlocks.length === 0) return { diff: diffStr, omittedPaths: [] }
  return { diff: scopedBlocks.join('\n'), omittedPaths: [...new Set(omittedPaths)].sort() }
}

export function collectFeatureScope(
  projectDir: string,
  feature: string,
  planPath: string,
  designPaths: string[],
  planContent: string,
  designContent: string,
): FeatureDiffScope {
  const featureSlug = normalizeProjectPath(feature)
  const exactPaths = new Set<string>()
  const pathFragments = new Set<string>([
    featureSlug,
    `docs/changes/${featureSlug}`,
    `.sisyphus/plans/${featureSlug}.md`,
  ])

  exactPaths.add(toProjectRelativePath(projectDir, planPath))
  for (const designPath of designPaths) {
    exactPaths.add(toProjectRelativePath(projectDir, designPath))
  }

  for (const candidate of extractReferencedProjectPaths(`${planContent}\n${designContent}`)) {
    exactPaths.add(candidate)
  }

  return { featureSlug, exactPaths, pathFragments }
}

export function filterPathsToFeatureScope(
  paths: string[],
  scope: FeatureDiffScope,
): { scopedPaths: string[]; omittedPaths: string[] } {
  const scopedPaths: string[] = []
  const omittedPaths: string[] = []

  for (const filePath of paths) {
    if (isPathInFeatureScope(filePath, scope)) {
      scopedPaths.push(normalizeProjectPath(filePath))
    } else if (isReviewRelevantOmittedPath(filePath)) {
      omittedPaths.push(normalizeProjectPath(filePath))
    }
  }

  return {
    scopedPaths: [...new Set(scopedPaths)].sort(),
    omittedPaths: [...new Set(omittedPaths)].sort(),
  }
}

export function filterPathsToExactScope(
  paths: string[],
  scopedFiles: string[],
): { scopedPaths: string[]; omittedPaths: string[] } {
  const normalizedScope = new Set(scopedFiles.map(normalizeProjectPath))
  const scopedPaths: string[] = []
  const omittedPaths: string[] = []

  for (const filePath of paths) {
    const normalizedPath = normalizeProjectPath(filePath)
    if (normalizedScope.has(normalizedPath)) {
      scopedPaths.push(normalizedPath)
    } else if (isReviewRelevantOmittedPath(normalizedPath)) {
      omittedPaths.push(normalizedPath)
    }
  }

  return {
    scopedPaths: [...new Set(scopedPaths)].sort(),
    omittedPaths: [...new Set(omittedPaths)].sort(),
  }
}

export function appendOmittedDiffManifest(diffStr: string, omittedPaths: string[]): string {
  if (omittedPaths.length === 0) return diffStr

  return [
    diffStr,
    '',
    '# OpenFlow Harden Scoped Diff Notice',
    '# The full workspace diff contained additional implementation/config/test files not included above.',
    '# Review whether any omitted path appears relevant to the feature contract before concluding NO_FINDINGS.',
    ...omittedPaths.map(filePath => `# omitted: ${filePath}`),
  ].join('\n')
}

export function extractDiffBlockPaths(block: string): string[] {
  const paths = new Set<string>()

  for (const line of block.split('\n')) {
    const diffMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/u)
    if (diffMatch?.[1]) paths.add(normalizeProjectPath(diffMatch[1]))
    if (diffMatch?.[2]) paths.add(normalizeProjectPath(diffMatch[2]))

    const fileMatch = line.match(/^(?:---|\+\+\+) (?:a|b)\/(.+)$/u)
    if (fileMatch?.[1]) paths.add(normalizeProjectPath(fileMatch[1]))
  }

  return [...paths]
}

function extractReferencedProjectPaths(content: string): string[] {
  const paths = new Set<string>()
  const pattern = /(?:^|[\s`"'([:])((?:src|tests|docs|scripts|templates|\.sisyphus)[/\\][A-Za-z0-9._@/\\-]+)(?=$|[\s`"')\],.:;])/gm
  let match: RegExpExecArray | null

  while ((match = pattern.exec(content)) !== null) {
    const rawPath = match[1]
    if (rawPath) paths.add(cleanReferencedPath(rawPath))
  }

  return [...paths].filter(pathValue => pathValue.length > 0)
}

function cleanReferencedPath(filePath: string): string {
  return normalizeProjectPath(filePath).replace(/[.,:;]+$/u, '')
}

function splitDiffBlocks(diffStr: string): string[] {
  const blocks: string[] = []
  let current: string[] = []

  for (const line of diffStr.split('\n')) {
    if (line.startsWith('diff --git ') && current.length > 0) {
      blocks.push(current.join('\n'))
      current = []
    }
    current.push(line)
  }

  if (current.length > 0 && current.some(line => line.trim().length > 0)) {
    blocks.push(current.join('\n'))
  }

  return blocks
}

function diffBlockMatchesScope(block: string, scope: FeatureDiffScope): boolean {
  const paths = extractDiffBlockPaths(block)
  if (paths.length === 0) return false

  return paths.some(filePath => isPathInFeatureScope(filePath, scope))
}

function diffBlockMatchesFiles(block: string, scopedFiles: Set<string>): boolean {
  const paths = extractDiffBlockPaths(block)
  if (paths.length === 0) return false

  return paths.some(filePath => scopedFiles.has(normalizeProjectPath(filePath)))
}

function isPathInFeatureScope(filePath: string, scope: FeatureDiffScope): boolean {
  const normalized = normalizeProjectPath(filePath)
  if (scope.exactPaths.has(normalized)) return true
  for (const exactPath of scope.exactPaths) {
    if (normalized.startsWith(`${exactPath}/`)) return true
  }

  for (const fragment of scope.pathFragments) {
    if (normalized.includes(fragment)) return true
  }

  return false
}

function isReviewRelevantOmittedPath(filePath: string): boolean {
  const normalized = normalizeProjectPath(filePath)
  if (normalized.startsWith('docs/archive/')) return false
  if (normalized.endsWith('.meta.json')) return false
  if (/^docs\/changes\/\d{4}-\d{2}-\d{2}-/u.test(normalized)) return false

  return /^(src|tests|scripts|templates)\//u.test(normalized) || /^[^/]+\.(json|jsonc|ts|js|mjs|cjs|yaml|yml|toml)$/u.test(normalized)
}

function normalizeProjectPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//u, '')
}

function toProjectRelativePath(projectDir: string, filePath: string): string {
  const relativePath = path.relative(projectDir, filePath)
  return normalizeProjectPath(relativePath || filePath)
}
