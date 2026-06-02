import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createSafePath, sanitizeFeatureName } from './security.js'
import { resolveChangeUnitDir } from './change-units.js'
import { logger } from './logger.js'
import type { GuardedQuestion } from './question-guard.js'

/**
 * Fallback writer for questions that failed to reach the user.
 *
 * When the underlying question tool call fails (e.g. Effect.orDie defect
 * in opencode's question tool, transport interruption, sub-task session
 * scope mismatch), this module persists the unresolved question to
 * `docs/changes/{date}-{feature}/pending-decisions.md` so the AI and
 * human can address it in a follow-up turn instead of silently losing
 * the decision point.
 *
 * This file deliberately avoids `.sisyphus/` — it lives in the change
 * workspace so it is:
 *   - Human-readable and reviewable
 *   - Archivable with the feature
 *   - Traceable via git history
 */

export interface PendingDecision {
  /** Stable question id (e.g. 'impl-constraint-q1') */
  id: string
  /** Short label shown in the picker header */
  header: string
  /** The full question text */
  question: string
  /** Options that were offered to the user */
  options: ReadonlyArray<{ label: string; description: string }>
  /** Whether multiple selections were allowed */
  multiple?: boolean
  /** Failure timestamp (ISO-8601) */
  failedAt: string
  /** Error category, if classified by the guard */
  failureKind?: 'effect-or-die-defect' | 'exception' | 'timeout' | 'unknown'
  /** Short error description (truncated, no stack) */
  errorMessage?: string
}

export interface WriteFallbackInput {
  projectDir: string
  feature: string
  question: GuardedQuestion
  failureKind?: PendingDecision['failureKind']
  errorMessage?: string
}

export interface WriteFallbackResult {
  /** Relative path to the fallback file that was written / appended to */
  path: string
  /** Number of entries now recorded in that file */
  entryCount: number
}

const FALLBACK_FILENAME = 'pending-decisions.md'
const ENTRY_SEPARATOR = '\n---\n'

/**
 * Append a pending decision entry to the change workspace's fallback file.
 *
 * The file lives at `docs/changes/{date}-{feature}/pending-decisions.md`
 * — same directory as `design.md` / `plan.md`, archivable, git-traceable.
 *
 * Returns the write result, or `undefined` if writing failed (never throws).
 */
export async function writePendingDecisionFallback(
  input: WriteFallbackInput,
): Promise<WriteFallbackResult | undefined> {
  const { projectDir, feature, question } = input
  const sanitizedFeature = sanitizeFeatureName(feature)

  try {
    const changeDir = await resolveChangeUnitDir(projectDir, sanitizedFeature)
    const dirPath = createSafePath(projectDir, 'docs/changes', changeDir)
    const filePath = path.join(dirPath, FALLBACK_FILENAME)

    await fs.mkdir(dirPath, { recursive: true })

    const existing = await readExisting(filePath)
    const decision: PendingDecision = {
      id: question.id,
      header: question.header,
      question: question.question,
      options: question.options,
      failedAt: new Date().toISOString(),
    }
    if (typeof question.multiple === 'boolean') decision.multiple = question.multiple
    if (input.failureKind) decision.failureKind = input.failureKind
    if (input.errorMessage) decision.errorMessage = truncate(input.errorMessage, 400)

    const next = appendDecision(existing, decision)
    await fs.writeFile(filePath, next, 'utf-8')

    const entryCount = countEntries(next)
    logger.info('session', 'question fallback written', {
      questionId: question.id,
      path: path.relative(projectDir, filePath),
      entryCount,
    })

    return { path: path.relative(projectDir, filePath), entryCount }
  } catch (error) {
    // Fallback failures must never crash the caller — just log + report.
    logger.warn('session', 'question fallback write failed', {
      questionId: question.id,
      feature,
      error: error instanceof Error ? error.message : String(error),
    })
    return undefined
  }
}

/** Safely read an existing file or return an empty string. */
async function readExisting(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return ''
  }
}

function appendDecision(existing: string, decision: PendingDecision): string {
  if (!existing.trim()) {
    return renderHeader() + ENTRY_SEPARATOR + renderEntry(decision) + '\n'
  }
  return existing.trimEnd() + '\n' + ENTRY_SEPARATOR + renderEntry(decision) + '\n'
}

function renderHeader(): string {
  return [
    '# Pending Decisions',
    '',
    '> Auto-recorded when the question tool failed to capture a user decision.',
    '>',
    '> For each entry below, provide your answer inline or reply to the AI',
    '> in a follow-up message referencing this file.',
    '',
  ].join('\n')
}

function renderEntry(d: PendingDecision): string {
  const optionList = d.options
    .map((opt, i) => `- **${i + 1}. ${opt.label}** — ${opt.description}`)
    .join('\n')
  const meta = [
    `- **id**: \`${d.id}\``,
    `- **header**: ${d.header}`,
    `- **multiple**: ${d.multiple ? 'yes' : 'no'}`,
    `- **failedAt**: ${d.failedAt}`,
    d.failureKind ? `- **failureKind**: ${d.failureKind}` : null,
    d.errorMessage ? `- **error**: ${d.errorMessage}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')

  return [
    `## ${d.header} (${d.id})`,
    '',
    `**Question**: ${d.question}`,
    '',
    '### Options offered',
    '',
    optionList,
    '',
    '### Your answer',
    '',
    '_<write your answer here>_',
    '',
    '### Diagnostic metadata',
    '',
    meta,
  ].join('\n')
}

/** Count markdown entries by their H2 headers (each entry starts with `## `). */
function countEntries(content: string): number {
  let count = 0
  for (const line of content.split('\n')) {
    if (line.startsWith('## ')) count++
  }
  return count
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}
