import type { OpenFlowContext } from '../../../../types.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { tArray } from '../../../../i18n/index.js'
import { deriveFeatureIdentity, type DerivedFeatureIdentity } from '../../../../utils/feature-resolver.js'
import { loadFeatureSessionIndex, saveFeatureSessionIndex } from '../infra/session-store.js'

function getToolSessionID(toolContext: unknown): string | undefined {
  if (!toolContext || typeof toolContext !== 'object') {
    return undefined
  }
  return typeof (toolContext as { sessionID?: unknown }).sessionID === 'string'
    ? (toolContext as { sessionID: string }).sessionID
    : undefined
}

/**
 * Verify the workspace directory for a session-bound feature still exists
 * AND contains actual files (not just an empty directory).
 */
async function isSessionFeatureWorkspaceValid(
  ctx: OpenFlowContext,
  feature: string,
): Promise<boolean> {
  const changesDir = path.join(ctx.directory, ctx.config.paths.changes ?? 'docs/changes')
  try {
    const entries = await fs.readdir(changesDir, { withFileTypes: true })
    const matchingDir = entries.find(
      (entry) => entry.isDirectory()
        && (entry.name === feature || entry.name.endsWith(`-${feature}`)),
    )
    if (!matchingDir) return false

    // Directory exists — verify it contains at least one .md file
    const dirPath = path.join(changesDir, matchingDir.name)
    const files = await fs.readdir(dirPath)
    return files.some((f) => f.endsWith('.md'))
  } catch {
    return false
  }
}

async function clearStaleSessionBinding(
  ctx: OpenFlowContext,
  sessionID: string,
): Promise<void> {
  const index = await loadFeatureSessionIndex(ctx.directory, ctx.config.paths.feature_state)
  delete index.bySessionID[sessionID]
  await saveFeatureSessionIndex(ctx.directory, index, ctx.config.paths.feature_state)
}

export type FeatureResolution =
  | { kind: 'resolved'; identity: DerivedFeatureIdentity }
  | { kind: 'missing' }

export async function resolveFeature(ctx: OpenFlowContext, feature: string | undefined, toolContext: unknown): Promise<FeatureResolution> {
  if (feature?.trim()) {
    if (looksLikeFeatureContinuationRequest(feature)) {
      const continued = await resolveContinuationFeature(ctx, toolContext)
      if (continued) return { kind: 'resolved', identity: continued }
    }

    // Reject same-session feature switching: if this session already has a feature,
    // don't allow switching to a different one
    const sessionID = getToolSessionID(toolContext)
    if (sessionID) {
      const index = await loadFeatureSessionIndex(ctx.directory, ctx.config.paths.feature_state)
      const activeFeature = index.bySessionID[sessionID]?.feature
      if (activeFeature) {
        // If workspace was deleted, clear stale binding and resolve from input
        if (!(await isSessionFeatureWorkspaceValid(ctx, activeFeature))) {
          await clearStaleSessionBinding(ctx, sessionID)
        } else {
          // Session already has a feature - check if the new text refers to the same feature
          const newIdentity = deriveFeatureIdentity(feature)
          if (newIdentity.slug !== activeFeature) {
            // Different feature - explicit session-guard rejection
            return {
              kind: 'resolved',
              identity: {
                slug: activeFeature,
                sourceIntent: feature,
                lowConfidenceReason: 'generic_instruction' as const,
              },
            }
          }
          // Same feature - allow (re-entry/continuation)
          return { kind: 'resolved', identity: { slug: activeFeature, sourceIntent: feature } }
        }
      }
    }

    return { kind: 'resolved', identity: deriveFeatureIdentity(feature) }
  }

  const sessionID = getToolSessionID(toolContext)
  if (sessionID) {
    const index = await loadFeatureSessionIndex(ctx.directory, ctx.config.paths.feature_state)
    const activeFeature = index.bySessionID[sessionID]?.feature
    if (activeFeature) {
      if (await isSessionFeatureWorkspaceValid(ctx, activeFeature)) {
        return { kind: 'resolved', identity: { slug: activeFeature } }
      }
      // Workspace deleted — clear stale binding and fall through
      await clearStaleSessionBinding(ctx, sessionID)
    }
  }

  // No session binding and no explicit feature text — let the AI ask the user
  return { kind: 'missing' }
}

export function looksLikeFeatureContinuationRequest(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  const continuationKeywords = tArray('signals.feature.continuation.keywords')
  const excludeKeywords = tArray('signals.feature.continuation.exclude')
  return new RegExp(`(?:${continuationKeywords.join('|')})`, 'iu').test(normalized)
    && !new RegExp(`(?:${excludeKeywords.join('|')})`, 'u').test(value)
}

export async function resolveContinuationFeature(ctx: OpenFlowContext, toolContext: unknown): Promise<DerivedFeatureIdentity | undefined> {
  const sessionID = getToolSessionID(toolContext)
  if (sessionID) {
    const index = await loadFeatureSessionIndex(ctx.directory, ctx.config.paths.feature_state)
    const activeFeature = index.bySessionID[sessionID]?.feature
    if (activeFeature) {
      if (await isSessionFeatureWorkspaceValid(ctx, activeFeature)) {
        return { slug: activeFeature }
      }
      // Workspace deleted — clear stale binding
      await clearStaleSessionBinding(ctx, sessionID)
    }
  }

  return undefined
}

