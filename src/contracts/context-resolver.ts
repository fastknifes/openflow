import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  scanCurrentConstraints,
  scanDecisionConstraints,
  scanReflectionDocs,
} from './constraint-scanner.js'
import type { ScannedConstraint } from './constraint-scanner.js'
import { resolveChangeUnitDir } from '../utils/change-units.js'

// ── Types ────────────────────────────────────────────────────────────────

export interface ScoreResult {
  score: number        // 0.0 - 1.0
  matchType: 'exact' | 'prefix' | 'glob' | 'keyword'
  matchedPaths: string[]
}

export interface ResolvedConstraint {
  sources: Array<{ sourceType: 'current' | 'decision' | 'reflection'; file: string }>
  rule: string
  severity: 'blocking' | 'warning'
  appliesTo: string[]
  score: number
  matchType: 'exact' | 'prefix' | 'glob' | 'keyword'
  matchedPaths: string[]
}

export type ConstraintPacketStatus = 'success' | 'degraded' | 'failed'

export interface ConstraintPacketResult {
  status: ConstraintPacketStatus
  constraintsPath?: string
  constraintCount: number
  filteredCount: number
  error?: string
}

export interface ConstraintEvidence {
  constraintId: string
  command: string
  output: string
  exitCode?: number
  checkedAt: string
  reasoning: string
}

export interface ConstraintVerificationResult {
  status: 'satisfied' | 'blocked' | 'skipped'
  checked: Array<{
    constraintId: string
    satisfied: boolean
    evidence?: ConstraintEvidence
    missingEvidence?: string
  }>
  warnings: string[]
}

// ── Constants ────────────────────────────────────────────────────────────

const MAX_CONSTRAINTS = 15
const MAX_RULE_LENGTH = 300
const MIN_RELEVANCE_SCORE = 0.3

const SOURCE_PRIORITY: Record<string, number> = {
  decision: 3,
  current: 2,
  reflection: 1,
}

// ── extractPlanPaths ─────────────────────────────────────────────────────

export function extractPlanPaths(planContent: string): string[] {
  const regex = /`((?:src|tests|docs)\/[\w.\/\-*]+)`/g
  const paths: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(planContent)) !== null) {
    paths.push(match[1]!)
  }
  return [...new Set(paths)]
}

// ── scoreRelevance ───────────────────────────────────────────────────────

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '')
}

function globMatch(pattern: string, candidate: string): boolean {
  // Minimal minimatch-style glob: supports * and ** only
  // **/ means "any depth including zero" and ** alone means "anything"
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '{{GLOBSTAR_SLASH}}')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{GLOBSTAR_SLASH}}/g, '(?:.+/)?')
    .replace(/{{GLOBSTAR}}/g, '.*')
  const re = new RegExp(`^${regexStr}$`)
  return re.test(candidate)
}

function hasKeywordOverlap(appliesToPath: string, planPaths: string[]): boolean {
  const normAp = normalizePath(appliesToPath)
  // Extract meaningful directory segments, excluding generic top-level prefixes
  const excluded = new Set(['src', 'tests', 'docs', ''])
  const segments = normAp.split('/').filter(f => f.length > 1 && !excluded.has(f))

  for (const frag of segments) {
    for (const pp of planPaths) {
      const normPp = normalizePath(pp)
      // Match as a path segment boundary
      if (
        normPp.includes('/' + frag + '/') ||
        normPp.includes('/' + frag + '.') ||
        normPp.startsWith(frag + '/') ||
        normPp.endsWith('/' + frag) ||
        // Keyword overlap: fragment appears within a path segment (e.g. "auth" in "auth-v2")
        normPp.split('/').some(seg => seg.length > 1 && seg.includes(frag))
      ) {
        return true
      }
    }
  }
  return false
}

export function scoreRelevance(
  constraint: { appliesTo: string[] },
  planPaths: string[],
): ScoreResult {
  let bestScore = 0
  let bestMatchType: ScoreResult['matchType'] = 'keyword'
  const allMatched: string[] = []

  for (const ap of constraint.appliesTo) {
    const nap = normalizePath(ap)
    const hasGlob = nap.includes('*')

    for (const pp of planPaths) {
      const npp = normalizePath(pp)

      // Exact match
      if (nap === npp) {
        if (1.0 > bestScore) {
          bestScore = 1.0
          bestMatchType = 'exact'
        }
        allMatched.push(pp)
        continue
      }

      // Prefix match
      if (npp.startsWith(nap + '/') || nap.startsWith(npp + '/')) {
        if (0.8 > bestScore) {
          bestScore = 0.8
          bestMatchType = 'prefix'
        }
        allMatched.push(pp)
        continue
      }

      // Glob match
      if (hasGlob && globMatch(nap, npp)) {
        if (0.6 > bestScore) {
          bestScore = 0.6
          bestMatchType = 'glob'
        }
        allMatched.push(pp)
        continue
      }

      // Keyword match
      if (hasKeywordOverlap(nap, [npp])) {
        if (0.3 > bestScore) {
          bestScore = 0.3
          bestMatchType = 'keyword'
        }
        if (!allMatched.includes(pp)) {
          allMatched.push(pp)
        }
      }
    }
  }

  if (bestScore === 0) {
    return { score: 0, matchType: 'keyword', matchedPaths: [] }
  }

  return { score: bestScore, matchType: bestMatchType, matchedPaths: [...new Set(allMatched)] }
}

// ── deduplicateConstraints ───────────────────────────────────────────────

export function deduplicateConstraints(constraints: ResolvedConstraint[]): ResolvedConstraint[] {
  const map = new Map<string, ResolvedConstraint>()

  for (const c of constraints) {
    const normalizedRule = c.rule.trim().toLowerCase()
    const key = normalizedRule

    const existing = map.get(key)
    if (!existing) {
      map.set(key, c)
      continue
    }

    // Merge sources
    const mergedSources = [...existing.sources]
    for (const s of c.sources) {
      if (!mergedSources.some(e => e.sourceType === s.sourceType && e.file === s.file)) {
        mergedSources.push(s)
      }
    }

    // Merge appliesTo
    const mergedAppliesTo = [...new Set([...existing.appliesTo, ...c.appliesTo])]

    // Keep highest score
    const best = c.score > existing.score ? c : existing

    map.set(key, {
      ...best,
      sources: mergedSources,
      appliesTo: mergedAppliesTo,
    })
  }

  return [...map.values()]
}

// ── resolveConstraints ───────────────────────────────────────────────────

export async function resolveConstraints(
  projectDir: string,
  planPaths: string[],
): Promise<ResolvedConstraint[]> {
  const [currents, decisions, reflections] = await Promise.all([
    scanCurrentConstraints(projectDir),
    scanDecisionConstraints(projectDir),
    scanReflectionDocs(projectDir),
  ])

  const allScanned: Array<ScannedConstraint & { _src: 'current' | 'decision' | 'reflection' }> = [
    ...currents.map(c => ({ ...c, _src: 'current' as const })),
    ...decisions.map(c => ({ ...c, _src: 'decision' as const })),
    ...reflections.map(c => ({ ...c, _src: 'reflection' as const })),
  ]

  // Score and convert
  const resolved: ResolvedConstraint[] = allScanned.map(sc => {
    const scoreResult = scoreRelevance(sc, planPaths)
    return {
      sources: [{ sourceType: sc._src, file: sc.file }],
      rule: sc.rule,
      severity: sc.severity,
      appliesTo: sc.appliesTo,
      ...scoreResult,
    }
  })

  // Filter by minimum score
  const filtered = resolved.filter(c => c.score >= MIN_RELEVANCE_SCORE)

  // Deduplicate
  const deduped = deduplicateConstraints(filtered)

  // Sort: score desc, then source priority desc
  deduped.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const aPriority = Math.max(...a.sources.map(s => SOURCE_PRIORITY[s.sourceType] ?? 0))
    const bPriority = Math.max(...b.sources.map(s => SOURCE_PRIORITY[s.sourceType] ?? 0))
    return bPriority - aPriority
  })

  // Truncate to max
  const truncated = deduped.slice(0, MAX_CONSTRAINTS)

  // Truncate rule text
  for (const c of truncated) {
    if (c.rule.length > MAX_RULE_LENGTH) {
      c.rule = c.rule.slice(0, MAX_RULE_LENGTH) + '…'
    }
  }

  return truncated
}

// ── renderConstraintPacket ───────────────────────────────────────────────

export function renderConstraintPacket(
  constraints: ResolvedConstraint[],
  metadata: { feature: string; planPath: string; runID: string },
): string {
  const blocking = constraints.filter(c => c.severity === 'blocking')
  const warnings = constraints.filter(c => c.severity === 'warning' && !c.sources.some(s => s.sourceType === 'reflection'))
  const reflections = constraints.filter(c => c.sources.some(s => s.sourceType === 'reflection'))

  const lines: string[] = []
  lines.push('# Constraint Packet')
  lines.push('')
  lines.push(`- **Feature**: ${metadata.feature}`)
  lines.push(`- **Plan**: ${metadata.planPath}`)
  lines.push(`- **Run ID**: ${metadata.runID}`)
  lines.push(`- **Generated**: ${new Date().toISOString()}`)
  lines.push(`- **Constraints**: ${constraints.length}`)
  lines.push('')

  // Blocking Constraints
  lines.push('## Blocking Constraints')
  lines.push('')
  if (blocking.length === 0) {
    lines.push('_None_')
  } else {
    blocking.forEach((c, i) => {
      lines.push(`### ${i + 1}. ${c.rule}`)
      lines.push('')
      lines.push(`- **Severity**: ${c.severity}`)
      lines.push(`- **Score**: ${c.score} (${c.matchType})`)
      lines.push(`- **Applies to**: ${c.appliesTo.join(', ')}`)
      lines.push(`- **Matched paths**: ${c.matchedPaths.join(', ')}`)
      const srcDesc = c.sources.map(s => `${s.sourceType}: ${s.file}`).join(', ')
      lines.push(`- **Sources**: ${srcDesc}`)
      lines.push('')
    })
  }

  // Warning Constraints
  lines.push('## Warning Constraints')
  lines.push('')
  if (warnings.length === 0) {
    lines.push('_None_')
  } else {
    warnings.forEach((c, i) => {
      lines.push(`### ${i + 1}. ${c.rule}`)
      lines.push('')
      lines.push(`- **Severity**: ${c.severity}`)
      lines.push(`- **Score**: ${c.score} (${c.matchType})`)
      lines.push(`- **Applies to**: ${c.appliesTo.join(', ')}`)
      lines.push(`- **Matched paths**: ${c.matchedPaths.join(', ')}`)
      const srcDesc = c.sources.map(s => `${s.sourceType}: ${s.file}`).join(', ')
      lines.push(`- **Sources**: ${srcDesc}`)
      lines.push('')
    })
  }

  // Reflection Rules
  lines.push('## Reflection Rules')
  lines.push('')
  if (reflections.length === 0) {
    lines.push('_None_')
  } else {
    reflections.forEach((c, i) => {
      lines.push(`### ${i + 1}. ${c.rule}`)
      lines.push('')
      lines.push(`- **Score**: ${c.score} (${c.matchType})`)
      lines.push(`- **Applies to**: ${c.appliesTo.join(', ')}`)
      lines.push(`- **Matched paths**: ${c.matchedPaths.join(', ')}`)
      const srcDesc = c.sources.map(s => `${s.sourceType}: ${s.file}`).join(', ')
      lines.push(`- **Sources**: ${srcDesc}`)
      lines.push('')
    })
  }

  // Required Reads
  lines.push('## Required Reads')
  lines.push('')
  const allSourceFiles = new Set<string>()
  for (const c of constraints) {
    for (const s of c.sources) {
      allSourceFiles.add(s.file)
    }
  }
  if (allSourceFiles.size === 0) {
    lines.push('_None_')
  } else {
    for (const f of [...allSourceFiles].sort()) {
      lines.push(`- \`${f}\``)
    }
  }
  lines.push('')

  // Summary
  lines.push('## Summary')
  lines.push('')
  lines.push(`| Metric | Count |`)
  lines.push(`|--------|-------|`)
  lines.push(`| Blocking | ${blocking.length} |`)
  lines.push(`| Warning | ${warnings.length} |`)
  lines.push(`| Reflection | ${reflections.length} |`)
  lines.push(`| Total | ${constraints.length} |`)
  lines.push('')

  return lines.join('\n')
}

// ── generateConstraintPacket ─────────────────────────────────────────────

export async function generateConstraintPacket(options: {
  projectDir: string
  planContent: string
  feature: string
  runID: string
  executionRoot: string
}): Promise<ConstraintPacketResult> {
  const { projectDir, planContent, feature, runID, executionRoot } = options

  // Extract plan paths
  const planPaths = extractPlanPaths(planContent)
  if (planPaths.length === 0) {
    return {
      status: 'degraded',
      constraintCount: 0,
      filteredCount: 0,
    }
  }

  // Resolve constraints
  const constraints = await resolveConstraints(projectDir, planPaths)
  if (constraints.length === 0) {
    return {
      status: 'degraded',
      constraintCount: 0,
      filteredCount: 0,
    }
  }

  // Resolve change dir
  let changeDir: string
  try {
    changeDir = await resolveChangeUnitDir(executionRoot, feature)
  } catch {
    return {
      status: 'failed',
      constraintCount: constraints.length,
      filteredCount: 0,
      error: `Failed to resolve change unit dir for feature "${feature}"`,
    }
  }

  // Render packet
  const content = renderConstraintPacket(constraints, {
    feature,
    planPath: planPaths.join(', '),
    runID,
  })

  // Atomic write
  const constraintsDir = path.join(executionRoot, 'docs', 'changes', changeDir)
  const constraintsPath = path.join(constraintsDir, 'constraints.md')
  const tmpPath = constraintsPath + '.tmp'

  try {
    await fs.mkdir(constraintsDir, { recursive: true })
    await fs.writeFile(tmpPath, content, 'utf-8')
    await fs.rename(tmpPath, constraintsPath)
  } catch (err) {
    // Cleanup tmp on failure
    try { await fs.unlink(tmpPath) } catch { /* ignore */ }
    return {
      status: 'failed',
      constraintCount: constraints.length,
      filteredCount: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  return {
    status: 'success',
    constraintsPath,
    constraintCount: constraints.length,
    filteredCount: 0,
  }
}
