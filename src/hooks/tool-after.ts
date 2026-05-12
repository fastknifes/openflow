import type { Hooks } from '@opencode-ai/plugin'
import type { OpenFlowContext, FileChangeRecord } from '../types.js'
import { extractPlanName } from '../plan/parser.js'
import { enhancePlan } from '../plan/enhancer.js'
import { trackFileChange } from '../utils/file-tracker.js'
import { generateBuildId } from '../utils/security.js'
import { logger } from '../utils/logger.js'
import { getContractRuntime } from '../contracts/runtime.js'
import { createAcceptancePromptHook } from './acceptance-prompt.js'
import {
  evaluateDocumentBundle,
  ensureDecisionsDocument,
  generatePrd,
  hasDecisionsDocument,
  hasPrdDocument,
  isPrdGenerationEnabled,
} from '../phases/brainstorm/prd-generator.js'

const sessionBuildIds = new Map<string, string>()

function normalizePath(filePath: string): string {
  return filePath.toLowerCase().replace(/\\/g, '/')
}

function isPlanFile(normalizedPath: string): boolean {
  return normalizedPath.includes('.sisyphus/plans/') && normalizedPath.endsWith('.md')
}

function isDesignDoc(normalizedPath: string): boolean {
  return /^(?:\d{8}-(proposal|design|decisions)|(proposal|design|decisions))\.md$/.test(normalizedPath.split('/').pop() || '')
}

function extractFeatureFromDesignPath(filePath: string): string | null {
  const parts = filePath.split(/[/\\]/)
  const changesIdx = parts.lastIndexOf('changes')
  if (changesIdx !== -1) {
    const featurePart = parts[changesIdx + 1]
    if (featurePart && !/\.md$/i.test(featurePart)) {
      return featurePart.replace(/^\d{4}-\d{2}-\d{2}-/, '')
    }
  }

  const designIdx = parts.lastIndexOf('design')
  if (designIdx === -1) return null
  return parts[designIdx - 1] || null
}

function shouldTrackChange(normalizedPath: string): boolean {
  return !normalizedPath.includes('node_modules/') && !normalizedPath.includes('.sisyphus/')
}

function resolveBuildId(sessionID?: string): string {
  if (sessionID) {
    const existingBuildId = sessionBuildIds.get(sessionID)
    if (existingBuildId) {
      return existingBuildId
    }

    const newBuildId = generateBuildId()
    sessionBuildIds.set(sessionID, newBuildId)
    return newBuildId
  }

  const buildId = generateBuildId()
  logger.debug('Generated isolated build ID for no-session change tracking', { buildId })
  return buildId
}

function shouldPromptForAcceptanceDocSync(normalizedPath: string): boolean {
  return !normalizedPath.startsWith('docs/') && !normalizedPath.includes('/docs/')
}

function appendToolAfterPrompt(output: unknown, prompt: string): void {
  if (!output || typeof output !== 'object') {
    return
  }

  const rawOutput = output as Record<string, unknown>
  const existingOutput = typeof rawOutput.output === 'string' ? rawOutput.output : ''
  rawOutput.output = existingOutput ? `${existingOutput}\n\n${prompt}` : prompt
}

export function createToolAfterHook(ctx: OpenFlowContext) {
  const acceptancePromptHook = createAcceptancePromptHook(ctx)

  const hook: NonNullable<Hooks['tool.execute.after']> = async (input, _output): Promise<void> => {
    if (input.tool !== 'write' && input.tool !== 'edit') return

    const output = _output as unknown as Record<string, unknown>

    const args = input.args as Record<string, unknown> | undefined
    const filePath = typeof args?.filePath === 'string' ? args.filePath : undefined
    if (!filePath) return

    const normalizedPath = normalizePath(filePath)

    // Check for design document writes to trigger PRD generation
    if (isDesignDoc(normalizedPath) && isPrdGenerationEnabled(ctx.config)) {
      const feature = extractFeatureFromDesignPath(filePath)
      
      if (feature) {
        // Only generate PRD when the primary design doc is written
        if (normalizedPath.endsWith('/design.md') || normalizedPath.endsWith('-design.md')) {
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

    if (isPlanFile(normalizedPath)) {
      const planName = extractPlanName(filePath)

      if (planName && !ctx.enhancedPlans.has(planName)) {
        logger.info('Plan file detected', { path: filePath })

        if (ctx.config.tdd.enabled || ctx.config.verification.in_plan || ctx.config.brainstorming.enabled) {
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
    } else if (shouldTrackChange(normalizedPath)) {
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

      if (shouldPromptForAcceptanceDocSync(normalizedPath)) {
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
