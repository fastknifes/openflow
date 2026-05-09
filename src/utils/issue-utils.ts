import * as fs from 'node:fs/promises'

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
  const basePath = `${ctx.directory}${ctx.directory.endsWith('/') || ctx.directory.endsWith('\\') ? '' : '/'}`

  const designPath = `${basePath}docs/changes/${name}/design.md`
  const clarificationPath = `${basePath}docs/changes/${name}/${ISSUE_CLARIFICATION_FILENAME}`

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
