import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { OpenFlowError, ErrorCode } from '../../../../utils/errors.js'
import { createSafePath } from '../../../../utils/security.js'
import type { FeatureSession } from '../../state-machine.js'
import { normalizeFeatureSession, createInitialFeatureSession } from '../../state-machine.js'
import { getToolSessionID } from './command-context.js'

export interface FeatureSessionIndex {
  bySessionID: Record<string, { feature: string; updatedAt: string }>
}

async function loadFeatureSession(projectDir: string, feature: string, featureStateDir: string): Promise<FeatureSession> {
  const sessionPath = getFeatureSessionPath(projectDir, feature, featureStateDir)

  try {
    const content = await fs.readFile(sessionPath, 'utf-8')
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== 'object') {
      throw new OpenFlowError(
        ErrorCode.INVALID_INPUT,
        `Feature session for "${feature}" is corrupt or unreadable. Please re-describe the feature with /openflow-feature to reinitialize, or delete the session file manually: ${sessionPath}`
      )
    }
    return normalizeFeatureSession(feature, parsed)
  } catch (error) {
    if (error instanceof OpenFlowError) {
      throw error
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return createInitialFeatureSession(feature)
    }
    throw new OpenFlowError(
      ErrorCode.INVALID_INPUT,
      `Feature session for "${feature}" is corrupt or unreadable. Please re-describe the feature with /openflow-feature to reinitialize, or delete the session file manually: ${sessionPath}`
    )
  }
}

async function saveFeatureSession(projectDir: string, session: FeatureSession, featureStateDir: string): Promise<void> {
  const sessionDir = createSafePath(projectDir, featureStateDir)
  const sessionPath = getFeatureSessionPath(projectDir, session.feature, featureStateDir)
  session.updatedAt = new Date().toISOString()
  await fs.mkdir(sessionDir, { recursive: true })
  await fs.writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8')
}

function getFeatureSessionPath(projectDir: string, feature: string, featureStateDir: string): string {
  return createSafePath(projectDir, featureStateDir, `${feature}.json`)
}

function getFeatureSessionIndexPath(projectDir: string, featureStateDir: string): string {
  return createSafePath(projectDir, featureStateDir, 'active.json')
}

async function loadFeatureSessionIndex(projectDir: string, featureStateDir: string): Promise<FeatureSessionIndex> {
  const indexPath = getFeatureSessionIndexPath(projectDir, featureStateDir)

  try {
    const content = await fs.readFile(indexPath, 'utf-8')
    const parsed = JSON.parse(content) as Partial<FeatureSessionIndex>
    return {
      bySessionID: parsed.bySessionID && typeof parsed.bySessionID === 'object' ? parsed.bySessionID : {},
    }
  } catch {
    return { bySessionID: {} }
  }
}

async function saveFeatureSessionIndex(projectDir: string, index: FeatureSessionIndex, featureStateDir: string): Promise<void> {
  const indexPath = getFeatureSessionIndexPath(projectDir, featureStateDir)
  await fs.mkdir(path.dirname(indexPath), { recursive: true })
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8')
}

async function bindSessionToFeature(projectDir: string, toolContext: unknown, feature: string, featureStateDir: string): Promise<void> {
  const sessionID = getToolSessionID(toolContext)
  if (!sessionID) return

  const index = await loadFeatureSessionIndex(projectDir, featureStateDir)
  index.bySessionID[sessionID] = {
    feature,
    updatedAt: new Date().toISOString(),
  }
  await saveFeatureSessionIndex(projectDir, index, featureStateDir)
}

export {
  loadFeatureSession,
  saveFeatureSession,
  getFeatureSessionPath,
  getFeatureSessionIndexPath,
  loadFeatureSessionIndex,
  saveFeatureSessionIndex,
  bindSessionToFeature,
}
