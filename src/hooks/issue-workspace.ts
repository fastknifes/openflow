import * as fs from 'node:fs/promises'
import * as nodePath from 'node:path'
import { loadAcceptanceState } from '../utils/acceptance-state.js'
import { ISSUE_PACKET_FILENAME } from '../utils/issue-utils.js'

export interface ActiveIssueWorkspace {
  slug: string
  workspacePath: string
}

/** Inactive issue statuses that should not block normal conversation. */
const INACTIVE_ISSUE_STATUSES: ReadonlySet<string> = new Set(['resolved', 'closed'])

export async function findActiveIssueWorkspace(
  directory: string,
  sessionID?: string,
): Promise<ActiveIssueWorkspace | null> {
  const state = await loadAcceptanceState(directory)
  if (state?.mode === 'issue' && state.issueClarificationPath) {
    const clarificationPath = nodePath.isAbsolute(state.issueClarificationPath)
      ? state.issueClarificationPath
      : nodePath.join(directory, state.issueClarificationPath)
    const workspace = nodePath.dirname(clarificationPath)
    // Detect active issue by issue-packet.json (always written) instead of
    // issue-clarification.md (only written with --write-doc or --resolve).
    if (await pathExists(nodePath.join(workspace, ISSUE_PACKET_FILENAME)) && !(await pathExists(nodePath.join(workspace, 'design.md')))) {
      // Skip resolved/closed issues — they should not block unrelated conversations.
      if (await isIssueInactive(workspace)) return null
      // Session-scoped: only block if the issue belongs to the current session (or has no sessionID for backward compatibility)
      if (!(await isIssueRelevantToSession(workspace, sessionID))) return null
      return {
        slug: nodePath.basename(workspace),
        workspacePath: toProjectRelativePath(directory, workspace),
      }
    }
  }

  const changesDir = nodePath.join(directory, 'docs', 'changes')
  try {
    const entries = (await fs.readdir(changesDir, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .sort((a, b) => b.name.localeCompare(a.name))
    for (const entry of entries) {
      const workspace = nodePath.join(changesDir, entry.name)
      const packetPath = nodePath.join(workspace, ISSUE_PACKET_FILENAME)
      const designPath = nodePath.join(workspace, 'design.md')
      // Detect active issue by issue-packet.json (always written) instead of
      // issue-clarification.md (only written with --write-doc or --resolve).
      if (await pathExists(packetPath) && !(await pathExists(designPath))) {
        // Skip resolved/closed issues — they should not block unrelated conversations.
        if (await isIssueInactive(workspace)) continue
        // Session-scoped: only block if the issue belongs to the current session (or has no sessionID for backward compatibility)
        if (!(await isIssueRelevantToSession(workspace, sessionID))) continue
        return {
          slug: entry.name,
          workspacePath: toProjectRelativePath(directory, workspace),
        }
      }
    }
  } catch {
    return null
  }

  return null
}

/**
 * Check whether an issue workspace has been resolved or closed.
 * Returns true when the issue should be treated as inactive.
 * Fails-safe: treats missing or unreadable packet files as still-active.
 */
async function isIssueInactive(workspace: string): Promise<boolean> {
  const packetPath = nodePath.join(workspace, ISSUE_PACKET_FILENAME)
  try {
    const content = await fs.readFile(packetPath, 'utf-8')
    const packet = JSON.parse(content) as { status?: string }
    return typeof packet.status === 'string' && INACTIVE_ISSUE_STATUSES.has(packet.status)
  } catch {
    // Missing or malformed packet → treat as active (fail-safe)
    return false
  }
}

/**
 * Check whether an issue workspace is relevant to the current session.
 * - If sessionID is not provided, treats all active issues as relevant.
 * - If the issue packet has no sessionID (legacy), it blocks all sessions for safety.
 * - If the issue packet has a sessionID, it only blocks the matching session.
 */
async function isIssueRelevantToSession(workspace: string, sessionID?: string): Promise<boolean> {
  // When no sessionID is provided, we cannot do session-scoped filtering;
  // fall back to the legacy behavior of treating the issue as relevant.
  if (!sessionID) return true

  const packetPath = nodePath.join(workspace, ISSUE_PACKET_FILENAME)
  try {
    const content = await fs.readFile(packetPath, 'utf-8')
    const packet = JSON.parse(content) as { sessionID?: string }
    // Legacy issues without sessionID block all sessions (backward-compatible safety).
    // Issues with sessionID only block the session that created them.
    return packet.sessionID === undefined || packet.sessionID === sessionID
  } catch {
    // Missing or malformed packet → treat as relevant (fail-safe)
    return true
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function toProjectRelativePath(directory: string, filePath: string): string {
  const relative = nodePath.relative(directory, filePath)
  return relative && !relative.startsWith('..') && !nodePath.isAbsolute(relative)
    ? relative.replace(/\\/g, '/')
    : filePath
}
