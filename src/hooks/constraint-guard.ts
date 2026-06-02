import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { OpenFlowContext } from '../types.js'
import { implementationRunStore, isTerminalStatus } from '../utils/implementation-run.js'
import { resolveChangeUnitDir } from '../utils/change-units.js'
import { logger } from '../utils/logger.js'

export interface ConstraintGuardOptions {
  ctx: OpenFlowContext
  tool?: string
  taskArgs?: Record<string, unknown>
  sessionID?: string
}

export interface ConstraintGuardResult {
  advisory: boolean
  message?: string
}

interface ParsedConstraint {
  id: string
  appliesTo: string[]
  rule: string
  severity: string
}

/**
 * Check if the current file operation hits an active constraint.
 * Returns advisory info (never blocks).
 */
export async function checkConstraintGuard(options: ConstraintGuardOptions): Promise<ConstraintGuardResult> {
  const { ctx, tool, taskArgs, sessionID } = options

  // Only check write/edit/task operations
  if (!tool || !['write', 'edit', 'task', 'task_create'].includes(tool)) {
    return { advisory: false }
  }

  try {
    // Find active implementation run
    const activeRun = await findActiveRun(ctx, sessionID)
    if (!activeRun) return { advisory: false }

    const executionRoot = activeRun.worktree || activeRun.directory
    const changeDir = await resolveChangeUnitDir(executionRoot, activeRun.feature)
    const constraintsPath = path.join(executionRoot, 'docs', 'changes', changeDir, 'constraints.md')

    let content: string
    try {
      content = await fs.readFile(constraintsPath, 'utf-8')
    } catch {
      return { advisory: false } // No constraints file
    }

    const constraints = parseConstraintsMd(content)
    if (constraints.length === 0) return { advisory: false }

    // Extract target file path from the operation
    const targetPath = extractTargetFromTool(tool, taskArgs)
    if (!targetPath) return { advisory: false }

    // Check if target matches any constraint
    const matched = findMatchingConstraints(constraints, targetPath)
    if (matched.length === 0) return { advisory: false }

    const lines = [
      '## Constraint Advisory',
      '',
      `The file \`${targetPath}\` is subject to the following constraints:`,
      '',
    ]
    for (const c of matched.slice(0, 3)) {
      lines.push(`- [${c.id}] ${c.severity.toUpperCase()}: ${c.rule.substring(0, 150)}${c.rule.length > 150 ? '...' : ''}`)
    }

    return { advisory: true, message: lines.join('\n') }
  } catch (error) {
    // Silent failure — never block editing
    logger.debug('orchestrator', 'constraint guard check failed silently', { error: error instanceof Error ? error.message : String(error) })
    return { advisory: false }
  }
}

async function findActiveRun(ctx: OpenFlowContext, sessionID?: string) {
  try {
    // Use store.listRuns directly — avoids traversing docs/changes and
    // per-feature getActiveRun calls (each of which also calls listRuns).
    const filter = sessionID ? { sessionID } : {}
    const runs = await implementationRunStore.listRuns(ctx, filter)
    return runs.find(run => !isTerminalStatus(run.status)) ?? null
  } catch {
    // ignore
  }
  return null
}

function extractTargetFromTool(tool: string, taskArgs?: Record<string, unknown>): string | null {
  if (tool === 'task' && taskArgs) {
    const prompt = typeof taskArgs.prompt === 'string' ? taskArgs.prompt : ''
    // Extract file paths from task prompt
    const match = prompt.match(/(?:edit|write|modify|create|update)\s+`?((?:src|tests)\/[\w.\/-]+)`?/i)
    return match?.[1] ?? null
  }
  if (tool === 'write' || tool === 'edit') {
    // Check filePath in args (opencode write/edit typically has filePath parameter)
    const filePath = taskArgs?.filePath as string | undefined
    if (typeof filePath === 'string') return filePath
    return null
  }
  return null
}

function parseConstraintsMd(content: string): ParsedConstraint[] {
  const constraints: ParsedConstraint[] = []
  // Match ### N. pattern (renderConstraintPacket output)
  const sectionRegex = /^### (\d+)\. (.+)$/gm
  let match
  while ((match = sectionRegex.exec(content)) !== null) {
    const id = match[1]!
    const rule = match[2]!
    // Extract subsequent key-value lines until next ### or end
    const rest = content.slice(match.index + match[0].length)
    const nextSection = rest.search(/^### \d+\./m)
    const block = nextSection >= 0 ? rest.slice(0, nextSection) : rest

    const appliesToMatch = block.match(/\*\*Applies to\*\*:\s*(.+)/)
    const severityMatch = block.match(/\*\*Severity\*\*:\s*(\w+)/)

    const appliesTo = (appliesToMatch?.[1] ?? '')
      .split(/,\s*/)
      .map(p => p.replace(/`/g, '').trim())
      .filter(p => p && p !== '(all paths)')

    if (appliesTo.length > 0) {
      constraints.push({
        id,
        appliesTo,
        rule,
        severity: severityMatch?.[1] ?? 'warning',
      })
    }
  }
  return constraints
}

function findMatchingConstraints(constraints: ParsedConstraint[], targetPath: string): ParsedConstraint[] {
  const normalizedTarget = targetPath.replace(/\\/g, '/')
  return constraints.filter(c =>
    c.appliesTo.some(applies => {
      const normalizedApplies = applies.replace(/\\/g, '/')
      return normalizedTarget === normalizedApplies ||
        normalizedTarget.startsWith(normalizedApplies.replace(/\/$/, '') + '/') ||
        matchGlob(normalizedApplies, normalizedTarget)
    })
  )
}

function matchGlob(pattern: string, target: string): boolean {
  if (!pattern.includes('*')) return false
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*')
  try {
    return new RegExp(`^${regexStr}$`).test(target)
  } catch {
    return false
  }
}
