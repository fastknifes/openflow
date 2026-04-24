import type { OpenFlowContext } from '../types.js'
import { sanitizeFeatureName, createSafePath } from '../utils/security.js'
import { logger } from '../utils/logger.js'
import { fileExists } from './file-utils.js'
import { clearWaitingForDocUpdateConfirm, enterAcceptancePhase, loadAcceptanceState, saveAcceptanceState } from '../utils/acceptance-state.js'
import * as fs from 'node:fs/promises'

function containsAcceptanceTrigger(message: string, triggersZh: string[], triggersEn: string[]): boolean {
  const lowerMessage = message.toLowerCase()
  return triggersZh.some(trigger => message.includes(trigger)) || triggersEn.some(trigger => lowerMessage.includes(trigger))
}

async function findActiveFeature(ctx: OpenFlowContext): Promise<string | null> {
  const plansDir = createSafePath(ctx.directory, '.sisyphus', 'plans')
  
  try {
    const files = await fs.readdir(plansDir)
    const mdFiles = files.filter(f => f.endsWith('.md'))
    
    if (mdFiles.length === 0) return null

    let latestFeature: { name: string; mtime: number } | null = null

    for (const file of mdFiles) {
      const filePath = createSafePath(ctx.directory, '.sisyphus', 'plans', file)
      const stat = await fs.stat(filePath)

      if (!latestFeature || stat.mtimeMs > latestFeature.mtime) {
        latestFeature = {
          name: file.replace('.md', ''),
          mtime: stat.mtimeMs,
        }
      }
    }

    return latestFeature?.name ?? null
  } catch {
    return null
  }
}

async function shouldEnterAcceptancePhase(ctx: OpenFlowContext, message: string): Promise<string | null> {
  if (!containsAcceptanceTrigger(message, ctx.config.acceptance.trigger_words_zh, ctx.config.acceptance.trigger_words_en)) {
    return null
  }

  const existingState = await loadAcceptanceState(ctx.directory)
  if (existingState && existingState.phase === 'acceptance') {
    return null
  }

  const activeFeature = await findActiveFeature(ctx)
  if (!activeFeature) {
    return null
  }

  const planPath = createSafePath(ctx.directory, '.sisyphus', 'plans', `${activeFeature}.md`)
  const planExists = await fileExists(planPath)
  return planExists ? activeFeature : null
}

function isDocUpdateConfirmationResponse(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('yes') ||
    lower.includes('no') ||
    lower.includes('update') ||
    lower.includes('skip') ||
    message.includes('需要') ||
    message.includes('不需要') ||
    message.includes('不用')
  )
}

function isDocUpdateConfirmationAccepted(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('yes') ||
    lower.includes('update') ||
    message.includes('需要')
  )
}

export function createAcceptanceHook(ctx: OpenFlowContext) {
  return async (input: { sessionID?: string; message?: unknown }): Promise<void> => {
    if (!ctx.config.acceptance.enabled) return
    
    const message = input.message
    if (typeof message !== 'string') return

    const currentState = await loadAcceptanceState(ctx.directory)
    if (currentState?.phase === 'acceptance' && currentState.waitingForDocUpdateConfirm) {
      if (isDocUpdateConfirmationResponse(message)) {
        await clearWaitingForDocUpdateConfirm(ctx.directory, isDocUpdateConfirmationAccepted(message) ? 'confirmed' : 'declined')
        logger.info('Resolved doc update confirmation state', { feature: currentState.feature })
      }
      return
    }

    const activeFeature = await shouldEnterAcceptancePhase(ctx, message)
    if (!activeFeature) return
    
    try {
      const sanitizedFeature = sanitizeFeatureName(activeFeature)
      await enterAcceptancePhase(ctx.directory, sanitizedFeature, input.sessionID)
      
      logger.info('Entered acceptance phase', { 
        feature: sanitizedFeature,
        trigger: 'user message'
      })
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      logger.error('Failed to enter acceptance phase', err)
    }
  }
}
