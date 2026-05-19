import type { Hooks } from '@opencode-ai/plugin'
import type { AcceptanceState, OpenFlowContext, FileChangeRecord } from '../types.js'
import { extractPlanName } from '../plan/parser.js'
import { enhancePlan } from '../plan/enhancer.js'
import { loadAcceptanceState, markImplementationDirty, markImplementationStale, mergeLimitedContextState } from '../utils/acceptance-state.js'
import { trackFileChange } from '../utils/file-tracker.js'
import { logger } from '../utils/logger.js'
import { getContractRuntime } from '../contracts/runtime.js'
import { createAcceptancePromptHook } from './acceptance-prompt.js'
import {
  appendToolAfterPrompt,
  extractFeatureFromDesignPath,
  isImplementationLikeFile,
  isDesignDoc,
  isPlanFile,
  normalizePath,
  resolveBuildId,
  shouldPromptForAcceptanceDocSync,
  shouldTrackChange,
  toProjectRelativePath,
} from './tool-after-policy.js'
import {
  evaluateDocumentBundle,
  ensureDecisionsDocument,
  generatePrd,
  hasDecisionsDocument,
  hasPrdDocument,
  isPrdGenerationEnabled,
} from '../phases/feature/prd-generator.js'

export function createToolAfterHook(ctx: OpenFlowContext) {
  const acceptancePromptHook = createAcceptancePromptHook(ctx)
  const featureWorkflowConfig = (ctx.config as unknown as Record<string, { enabled: boolean }>)['feature']!

  const hook: NonNullable<Hooks['tool.execute.after']> = async (input, _output): Promise<void> => {
    if (input.tool !== 'write' && input.tool !== 'edit') return

    const output = _output as unknown as Record<string, unknown>

    const args = input.args as Record<string, unknown> | undefined
    const filePath = typeof args?.filePath === 'string' ? args.filePath : undefined
    if (!filePath) return

    const projectRelativePath = toProjectRelativePath(ctx.directory, filePath)

    // Check for design document writes to trigger PRD generation
    if (isDesignDoc(projectRelativePath) && isPrdGenerationEnabled(ctx.config)) {
      const feature = extractFeatureFromDesignPath(filePath)
      
      if (feature) {
        // Only generate PRD when the primary design doc is written
        if (projectRelativePath.endsWith('/design.md') || projectRelativePath.endsWith('-design.md')) {
          const bundle = await evaluateDocumentBundle(ctx.directory, feature, ctx.config)

          if (bundle.generatePrd) {
            const alreadyHasPrd = await hasPrdDocument(ctx.directory, feature, ctx.config)

            if (!alreadyHasPrd) {
              logger.info('Design document detected, generating PRD by semantic decision', {
                feature,
                path: filePath,
                reason: bundle.reason,
              })

              try {
                const prdPath = await generatePrd({
                  feature,
                  projectDir: ctx.directory,
                  config: ctx.config,
                })
                logger.info('PRD document generated', { path: prdPath, feature })
              } catch (error) {
                logger.error('Failed to generate PRD document', error instanceof Error ? error : undefined)
              }
            }
          }

          if (bundle.generateDecisions) {
            const alreadyHasDecisions = await hasDecisionsDocument(ctx.directory, feature, ctx.config)

            if (!alreadyHasDecisions) {
              try {
                const decisionsPath = await ensureDecisionsDocument(ctx.directory, feature, ctx.config)
                logger.info('Decisions document generated', { path: decisionsPath, feature })
              } catch (error) {
                logger.error('Failed to generate decisions document', error instanceof Error ? error : undefined)
              }
            }
          }
        }
      }
    }

    if (isPlanFile(projectRelativePath)) {
      const planName = extractPlanName(filePath)

      if (planName && !ctx.enhancedPlans.has(planName)) {
        logger.info('Plan file detected', { path: filePath })

        if (ctx.config.tdd.enabled || ctx.config.verification.in_plan || featureWorkflowConfig.enabled) {
          const enhanced = await enhancePlan({
            planPath: filePath,
            config: ctx.config,
            baseDir: ctx.directory,
          })
          if (enhanced) {
            ctx.enhancedPlans.add(planName)
          }
        }
      }
    } else if (shouldTrackChange(projectRelativePath)) {
      const buildId = resolveBuildId(input.sessionID)

      const change: FileChangeRecord = {
        filePath,
        tool: input.tool as 'write' | 'edit',
        timestamp: Date.now(),
      }

      try {
        await trackFileChange(ctx.directory, buildId, change)
        logger.debug('Tracked file change', { filePath, buildId })
      } catch (error) {
        logger.error('Failed to track file change', error instanceof Error ? error : undefined)
      }

      await updateImplementationStateForChange(ctx, projectRelativePath, input.sessionID)

      // Dispatch file change event to ContractRuntime for Guardian
      if (ctx.config.guardian?.enabled) {
        try {
          const runtime = getContractRuntime()
          if (runtime.isStarted) {
            await runtime.processFileChange({
              type: 'file_changed',
              filePath,
              tool: input.tool as 'write' | 'edit',
              timestamp: Date.now(),
              sessionId: input.sessionID,
            })
          }
        } catch (error) {
          logger.debug('Guardian event dispatch failed', {
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      if (shouldPromptForAcceptanceDocSync(projectRelativePath)) {
        const acceptancePromptInput = args
          ? { tool: input.tool, args }
          : { tool: input.tool }
        const acceptancePrompt = await acceptancePromptHook(acceptancePromptInput)
        if (acceptancePrompt) {
          appendToolAfterPrompt(output, acceptancePrompt)
        }
      }
    }
  }

  return hook
}

async function updateImplementationStateForChange(
  ctx: OpenFlowContext,
  normalizedPath: string,
  sessionID?: string,
): Promise<void> {
  if (!isImplementationLikeFile(normalizedPath)) {
    return
  }

  const acceptanceState = await loadAcceptanceState(ctx.directory)
  if (!acceptanceState) {
    // Issue 2: No acceptance state → create limited-context dirty state.
    // This prevents AI from modifying code and claiming completion without
    // going through a quality gate. Subsequent writes merge into this state.
    await mergeLimitedContextState(ctx.directory, normalizedPath, sessionID)
    return
  }

  if (!matchesActiveAcceptanceState(acceptanceState, normalizedPath, sessionID)) {
    return
  }

  const changedFiles = mergeChangedFiles(acceptanceState, normalizedPath)
  const shouldMarkStale = acceptanceState.implementationState?.state === 'verified'
    || acceptanceState.implementationState?.state === 'stale'
    || Boolean(acceptanceState.readiness || acceptanceState.verifyResult)

  try {
    if (shouldMarkStale) {
      await markImplementationStale(ctx.directory, { changedFiles })
      logger.info('Marked implementation state stale after implementation-like change', {
        filePath: normalizedPath,
        feature: acceptanceState.feature,
        mode: acceptanceState.mode ?? 'feature',
      })
      return
    }

    await markImplementationDirty(ctx.directory, { changedFiles })
    logger.info('Marked implementation state dirty after implementation-like change', {
      filePath: normalizedPath,
      feature: acceptanceState.feature,
      mode: acceptanceState.mode ?? 'feature',
    })
  } catch (error) {
    logger.error('Failed to update implementation state after file change', error instanceof Error ? error : undefined)
  }
}

function matchesActiveAcceptanceState(
  state: AcceptanceState,
  normalizedPath: string,
  sessionID?: string,
): boolean {
  if (state.sessionID && sessionID && state.sessionID === sessionID) {
    return true
  }

  const workspaceSlug = extractWorkspaceSlug(normalizedPath)
  if (!workspaceSlug) {
    return true
  }

  const acceptedSlugs = new Set<string>([
    state.feature,
    state.issueSlug,
    state.issueClarificationPath ? extractWorkspaceSlug(normalizePath(state.issueClarificationPath)) : null,
  ].filter((value): value is string => Boolean(value)).map(value => value.toLowerCase()))

  return acceptedSlugs.has(workspaceSlug)
}

function mergeChangedFiles(state: AcceptanceState, normalizedPath: string): string[] {
  const existing = state.implementationState?.changedFiles ?? []
  return [...new Set([...existing, normalizedPath])].sort()
}

function extractWorkspaceSlug(normalizedPath: string): string | null {
  const match = normalizedPath.match(/(?:^|\/)docs\/changes\/([^/]+)(?:\/|$)/u)
  if (!match?.[1]) {
    return null
  }

  return match[1].replace(/^\d{4}-\d{2}-\d{2}-/u, '')
}
