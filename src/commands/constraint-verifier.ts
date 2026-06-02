import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { resolveChangeUnitDir } from '../utils/change-units.js'

export interface ConstraintVerificationResult {
  status: 'satisfied' | 'blocked' | 'skipped'
  checked: Array<{
    constraintId: string
    satisfied: boolean
    evidence?: { summary: string }
    missingEvidence?: string
  }>
  warnings: string[]
}

export interface ConstraintEvidence {
  /** The type of evidence provided */
  type: 'command_output' | 'verbal_statement' | 'observation_log' | 'unknown'
  /** The actual evidence content */
  content: string
  /** Source description (e.g., "grep result", "test output") */
  source?: string
}

export interface VerifyConstraintOptions {
  projectDir: string
  feature: string
  changedFiles: string[]
  /**
   * C8: Evidence items for constraint satisfaction.
   * When provided, blocking constraints can be satisfied by matching command output evidence.
   * Verbal statements and observation logs are NOT accepted — only command output counts.
   */
  evidence?: ConstraintEvidence[]
}

/**
 * Verify that changed files satisfy constraints from constraints.md.
 * Shared constraint verification logic. Called by final-verify as the sole enforcement point (C2).
 */
export async function verifyConstraintSatisfaction(options: VerifyConstraintOptions): Promise<ConstraintVerificationResult> {
  const { projectDir, feature, changedFiles, evidence } = options

  try {
    const changeDir = await resolveChangeUnitDir(projectDir, feature)
    const constraintsPath = path.join(projectDir, 'docs', 'changes', changeDir, 'constraints.md')

    let content: string
    try {
      content = await fs.readFile(constraintsPath, 'utf-8')
    } catch {
      return { status: 'skipped', checked: [], warnings: ['constraints.md not found, skipping constraint verification'] }
    }

    // Check generation status
    const statusMatch = content.match(/Generation status:\s*(.+)/)
    if (statusMatch && statusMatch[1]!.trim() !== 'success') {
      return { status: 'skipped', checked: [], warnings: [`Constraint generation was ${statusMatch[1]!.trim()}, skipping verification`] }
    }

    const constraints = parseConstraintsMd(content)
    if (constraints.length === 0) {
      return { status: 'skipped', checked: [], warnings: [] }
    }

    // Normalize changed files
    const normalizedChanged = changedFiles.map(f => f.replace(/\\/g, '/'))

    // Find blocking constraints whose appliesTo intersects with changed files
    const checked: ConstraintVerificationResult['checked'] = []
    const warnings: string[] = []

    for (const c of constraints) {
      const isBlocking = c.severity === 'blocking'
      const matchesChangedFile = c.appliesTo.some(applies =>
        normalizedChanged.some(changed =>
          changed === applies ||
          changed.startsWith(applies.replace(/\/$/, '') + '/') ||
          matchGlob(applies, changed)
        )
      )

      if (!matchesChangedFile) continue

      if (!isBlocking) {
        warnings.push(`Warning constraint [${c.id}] applies to changed files but does not block: ${c.rule.substring(0, 100)}`)
        continue
      }

      // C8: Blocking constraint matches a changed file — requires command output evidence
      // Check if there's matching command output evidence for this constraint
      const commandOutputEvidence = (evidence ?? []).filter(
        e => e.type === 'command_output' && e.content.trim().length > 0,
      )

      if (commandOutputEvidence.length > 0) {
        // Command output evidence exists — check if it satisfies the constraint
        // Evidence must reference the constraint's appliesTo files or contain the constraint rule keyword
        const relevantEvidence = commandOutputEvidence.find(e => {
          const contentLower = e.content.toLowerCase()
          return c.appliesTo.some(applies =>
            contentLower.includes(applies.toLowerCase().replace(/\//g, /[/\\]/.test(applies) ? '/' : '/'))
          ) || contentLower.includes(c.rule.toLowerCase().substring(0, 30))
        })

        if (relevantEvidence) {
          checked.push({
            constraintId: c.id,
            satisfied: true,
            evidence: { summary: relevantEvidence.content.substring(0, 200) },
          })
          continue
        }
      }

      // Check if non-command-output evidence was provided (verbal statement, observation log)
      const nonCommandEvidence = (evidence ?? []).filter(
        e => e.type !== 'command_output' && e.content.trim().length > 0,
      )
      if (nonCommandEvidence.length > 0) {
        // C8: Reject non-command-output evidence
        checked.push({
          constraintId: c.id,
          satisfied: false,
          missingEvidence: `Blocking constraint [${c.id}] applies to changed files (${c.appliesTo.join(', ')}). Rule: ${c.rule.substring(0, 200)}. Non-command-output evidence (${nonCommandEvidence.map(e => e.type).join(', ')}) is NOT accepted — provide command output evidence (e.g., grep results, test output).`,
        })
        continue
      }

      // No evidence at all
      checked.push({
        constraintId: c.id,
        satisfied: false,
        missingEvidence: `Blocking constraint [${c.id}] applies to changed files (${c.appliesTo.join(', ')}). Rule: ${c.rule.substring(0, 200)}. Provide command output evidence (e.g., grep results, test output).`,
      })
    }

    if (checked.length === 0) {
      return { status: warnings.length > 0 ? 'satisfied' : 'skipped', checked: [], warnings }
    }

    const allSatisfied = checked.every((c: ConstraintVerificationResult['checked'][number]) => c.satisfied)
    return {
      status: allSatisfied ? 'satisfied' : 'blocked',
      checked,
      warnings,
    }
  } catch (error) {
    return {
      status: 'skipped',
      checked: [],
      warnings: [`Constraint verification error: ${error instanceof Error ? error.message : String(error)}`],
    }
  }
}

interface ParsedConstraint {
  id: string
  appliesTo: string[]
  rule: string
  severity: string
}

function parseConstraintsMd(content: string): ParsedConstraint[] {
  const constraints: ParsedConstraint[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.match(/^- \[(\d+)\]\s+Source:/)
    if (!match) continue

    const id = match[1]!
    const block: string[] = []
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j]!.match(/^- \[\d+\]/) || (lines[j]!.trim() === '' && block.length > 0)) break
      block.push(lines[j]!)
    }

    const blockText = block.join('\n')
    const appliesToMatch = blockText.match(/Applies to:\s*(.+)/)
    const ruleMatch = blockText.match(/Rule:\s*(.+)/)
    const severityMatch = blockText.match(/Severity:\s*(\w+)/)

    if (appliesToMatch) {
      const appliesTo = appliesToMatch[1]!
        .split(/,\s*/)
        .map(p => p.replace(/`/g, '').trim())
        .filter(p => p && p !== '(all paths)')

      constraints.push({
        id,
        appliesTo,
        rule: ruleMatch?.[1] ?? '',
        severity: severityMatch?.[1] ?? 'warning',
      })
    }
  }

  return constraints
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
