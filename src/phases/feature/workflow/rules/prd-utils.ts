/**
 * PRD workspace utilities — path resolution, file discovery, and configuration helpers.
 */
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { createSafePath, sanitizeFeatureName, findLatestDocument } from '../../../../utils/security.js'
import { getChangeWorkspacePath } from '../../../../config.js'
import { defaultConfig } from '../../../../types.js'
import type { OpenFlowContext } from '../../../../types.js'

type FeaturePhaseConfig = {
  enabled: boolean
  generate_prd: boolean
}

export async function resolveWorkspacePaths(
  projectDir: string,
  feature: string,
  config: OpenFlowContext['config'],
): Promise<{ designDir: string; requirementsDir: string }> {
  const changeWorkspaceDir = await findExistingChangeWorkspacePath(projectDir, feature)

  if (changeWorkspaceDir && (await hasAnyDesignDoc(changeWorkspaceDir))) {
    return {
      designDir: changeWorkspaceDir,
      requirementsDir: changeWorkspaceDir,
    }
  }

  const changesDir = config.paths?.changes ?? defaultConfig.paths.changes
  return {
    designDir: createSafePath(projectDir, changesDir, feature),
    requirementsDir: createSafePath(projectDir, changesDir, feature),
  }
}

export function resolveFeaturePhaseConfig(config: OpenFlowContext['config']): FeaturePhaseConfig {
  const candidates: unknown[] = Object.values(config)

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') {
      continue
    }

    const value = candidate as Partial<FeaturePhaseConfig>
    if (typeof value.enabled === 'boolean' && typeof value.generate_prd === 'boolean') {
      return value as FeaturePhaseConfig
    }
  }

  throw new Error('Feature phase configuration is missing required output settings.')
}

export async function findExistingChangeWorkspacePath(
  projectDir: string,
  feature: string,
): Promise<string | null> {
  const sanitizedFeature = sanitizeFeatureName(feature)
  const candidates = [await getChangeWorkspacePath(projectDir, sanitizedFeature)]
  const changesDir = createSafePath(projectDir, defaultConfig.paths.changes)

  try {
    const entries = await fs.readdir(changesDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }

      if (entry.name === sanitizedFeature || entry.name.endsWith(`-${sanitizedFeature}`)) {
        candidates.push(path.join(changesDir, entry.name))
      }
    }
  } catch {
    void 0
  }

  const uniqueCandidates = [...new Set(candidates)].sort((left, right) => right.localeCompare(left))
  for (const candidate of uniqueCandidates) {
    if (await hasAnyDesignDoc(candidate)) {
      return candidate
    }
  }

  return null
}

export async function hasAnyDesignDoc(designDir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(designDir, { withFileTypes: true })
    return (
      entries.some((entry) => entry.isFile() && /^(?:design|proposal|decisions)\.md$/i.test(entry.name)) ||
      entries.some((entry) => entry.isFile() && /^\d{8}-(proposal|design|decisions)\.md$/i.test(entry.name))
    )
  } catch {
    return false
  }
}

export async function findPreferredDocument(
  dir: string,
  preferredNames: string[],
  fallbackPattern: RegExp,
): Promise<string | null> {
  for (const preferredName of preferredNames) {
    const preferredPath = path.join(dir, preferredName)
    try {
      await fs.access(preferredPath)
      return preferredPath
    } catch {
      void 0
    }
  }

  return findLatestDocument(dir, fallbackPattern)
}
