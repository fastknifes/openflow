import * as fs from 'node:fs/promises'
import { resolveChangeUnitDir } from './change-units.js'

export const ISSUE_CLARIFICATION_FILENAME = 'issue-clarification.md'
export const PROMOTION_CANDIDATE_FILENAME = 'promotion-candidate.md'
export const ISSUE_RESOLUTION_FILENAME = 'issue-resolution.md'

/**
 * Derive a safe filesystem slug from raw text.
 * Uses the same logic as sanitizeFeatureName(): lowercase, replace non-alphanumeric
 * with hyphens, collapse consecutive hyphens, trim leading/trailing hyphens.
 * The slug is safe for paths — no spaces, no special chars, no Chinese.
 */
export function issueSlug(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Issue text is required')
  }

  const trimmed = rawText.trim()
  if (trimmed.length === 0) {
    throw new Error('Issue text cannot be empty')
  }

  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (slug.length < 2) {
    throw new Error('Issue text is too short after slugification')
  }

  return slug
}

/**
 * Resolve an issue workspace path from a name or raw case text.
 * Derives today's date and combines with slug to produce
 * docs/changes/{YYYY-MM-DD-slug} path.
 * Does NOT create directories on disk.
 */
export function resolveIssueWorkspace(
  ctx: { directory: string },
  nameOrCase: string,
): { slug: string; workspacePath: string } {
  const slug = issueSlug(nameOrCase)
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const datePrefix = `${year}-${month}-${day}`
  const workspaceName = `${datePrefix}-${slug}`
  const workspacePath = `${ctx.directory}${ctx.directory.endsWith('/') || ctx.directory.endsWith('\\') ? '' : '/'}docs/changes/${workspaceName}`

  return { slug, workspacePath }
}

export type IssueMode = 'feature' | 'issue' | 'mixed'

/**
 * Detect whether a workspace is in feature, issue, or mixed mode
 * based on the existence of key artifacts.
 *
 * - `issue` when only issue-clarification.md exists
 * - `feature` when only design.md exists
 * - `mixed` when both exist
 * - `feature` when neither exists (default)
 */
export async function detectMode(
  ctx: { directory: string },
  name: string,
): Promise<IssueMode> {
  const changeDir = await resolveChangeUnitDir(ctx.directory, name)
  const basePath = `${ctx.directory}${ctx.directory.endsWith('/') || ctx.directory.endsWith('\\') ? '' : '/'}`

  const designPath = `${basePath}docs/changes/${changeDir}/design.md`
  const clarificationPath = `${basePath}docs/changes/${changeDir}/${ISSUE_CLARIFICATION_FILENAME}`

  const designExists = await pathExists(designPath)
  const clarificationExists = await pathExists(clarificationPath)

  if (designExists && clarificationExists) return 'mixed'
  if (clarificationExists) return 'issue'
  return 'feature'
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Issue Resolution Builder
// ---------------------------------------------------------------------------

/**
 * Input for the issue-resolution.md generator.
 *
 * `symptom`, `rootCause`, and `fixSummary` are required — a resolution
 * without them would be meaningless. Everything else is optional and will
 * be replaced with useful fallback text when missing.
 */
export interface IssueResolutionInput {
  /** Original problem description */
  symptom: string
  /** Identified root cause */
  rootCause: string
  /** Summary of the fix approach */
  fixSummary: string
  /** Files that were changed (paths) */
  filesInvolved?: string[]
  /** What confirmed the fix works */
  verificationEvidence?: string
  /** How to recognise the same problem in the future */
  recurrenceSignature?: string
  /** What the next AI should check first for similar issues */
  futureAIGuidance?: string
}

/**
 * Prevent user-provided markdown from injecting ##-level headings that
 * would collide with the section headings in the generated document.
 * Lighter than `escapeMarkdown` — preserves intentional formatting
 * (bold, code, lists) while demoting any heading lines to bold text.
 */
function safeSectionContent(text: string): string {
  return text
    .replace(/^#{1,4}\s+(.+)$/gm, '**$1**')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function contentOr(value: string | undefined, fallback: string): string {
  if (!value || value.trim().length === 0) return fallback
  return safeSectionContent(value)
}

/**
 * Build the markdown content for an issue-resolution document.
 * Pure string generation — does NOT write to disk.
 *
 * Required sections: Symptom, Root Cause, Fix Summary, Files Involved,
 * Verification Evidence, Recurrence Signature, Future AI Guidance.
 */
export function buildIssueResolution(input: IssueResolutionInput): string {
  const sections: string[] = []

  sections.push('# Issue Resolution')
  sections.push('')

  // Symptom (required)
  sections.push('## Symptom')
  sections.push('')
  sections.push(safeSectionContent(input.symptom))
  sections.push('')

  // Root Cause (required)
  sections.push('## Root Cause')
  sections.push('')
  sections.push(safeSectionContent(input.rootCause))
  sections.push('')

  // Fix Summary (required)
  sections.push('## Fix Summary')
  sections.push('')
  sections.push(safeSectionContent(input.fixSummary))
  sections.push('')

  // Files Involved (optional)
  sections.push('## Files Involved')
  sections.push('')
  const files = input.filesInvolved?.filter(f => f.trim().length > 0)
  if (files && files.length > 0) {
    for (const f of files) {
      sections.push(`- ${safeSectionContent(f)}`)
    }
  } else {
    sections.push('_No files recorded._')
  }
  sections.push('')

  // Verification Evidence (optional)
  sections.push('## Verification Evidence')
  sections.push('')
  sections.push(contentOr(
    input.verificationEvidence,
    '_No verification evidence recorded._',
  ))
  sections.push('')

  // Recurrence Signature (optional)
  sections.push('## Recurrence Signature')
  sections.push('')
  sections.push(contentOr(
    input.recurrenceSignature,
    '_No recurrence signature recorded. Consider adding one to help future investigations._',
  ))
  sections.push('')

  // Future AI Guidance (optional)
  sections.push('## Future AI Guidance')
  sections.push('')
  sections.push(contentOr(
    input.futureAIGuidance,
    '_No AI guidance recorded. Consider adding hints about what to check first when similar symptoms appear._',
  ))
  sections.push('')

  return sections.join('\n')
}
