import * as fs from 'node:fs/promises'
import * as nodePath from 'node:path'
import { loadAcceptanceState } from '../utils/acceptance-state.js'
import { ISSUE_CLARIFICATION_FILENAME } from '../utils/issue-utils.js'

export interface ActiveIssueWorkspace {
  slug: string
  workspacePath: string
}

export async function findActiveIssueWorkspace(directory: string): Promise<ActiveIssueWorkspace | null> {
  const state = await loadAcceptanceState(directory)
  if (state?.mode === 'issue' && state.issueClarificationPath) {
    const clarificationPath = nodePath.isAbsolute(state.issueClarificationPath)
      ? state.issueClarificationPath
      : nodePath.join(directory, state.issueClarificationPath)
    const workspace = nodePath.dirname(clarificationPath)
    if (await pathExists(clarificationPath) && !(await pathExists(nodePath.join(workspace, 'design.md')))) {
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
      const clarificationPath = nodePath.join(workspace, ISSUE_CLARIFICATION_FILENAME)
      const designPath = nodePath.join(workspace, 'design.md')
      if (await pathExists(clarificationPath) && !(await pathExists(designPath))) {
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
