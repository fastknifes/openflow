import type { OpenFlowContext } from '../types.js'
import { sanitizeFeatureName, createSafePath } from '../utils/security.js'
import { logger } from '../utils/logger.js'
import { fileExists } from './file-utils.js'
import { enterAcceptancePhase, loadAcceptanceState } from '../utils/acceptance-state.js'

function containsAcceptanceTrigger(message: string, triggersZh: string[], triggersEn: string[]): boolean {
  const lowerMessage = message.toLowerCase()
  
  for (const trigger of triggersZh) {
    if (message.includes(trigger)) return true
  }
  
  for (const trigger of triggersEn) {
    if (lowerMessage.includes(trigger)) return true
  }
  
  return false
}

async function findActiveFeature(ctx: OpenFlowContext): Promise<string | null> {
  const plansDir = createSafePath(ctx.directory, '.sisyphus', 'plans')
  
  try {
    const fs = await import('node:fs/promises')
    const files = await fs.readdir(plansDir)
    const mdFiles = files.filter(f => f.endsWith('.md'))
    
    if (mdFiles.length === 0) return null
    
    let latestTime = 0
    let latestFeature: string | null = null
    
    for (const file of mdFiles) {
      const filePath = createSafePath(ctx.directory, '.sisyphus', 'plans', file)
      const stat = await fs.stat(filePath)
      
      if (stat.mtimeMs > latestTime) {
        latestTime = stat.mtimeMs
        latestFeature = file.replace('.md', '')
      }
    }
    
    return latestFeature
  } catch {
    return null
  }
}

export function createAcceptanceHook(ctx: OpenFlowContext) {
  return async (input: { sessionID?: string; message?: unknown }): Promise<void> => {
    if (!ctx.config.acceptance.enabled) return
    
    const message = input.message
    if (typeof message !== 'string') return
    
    if (!containsAcceptanceTrigger(message, ctx.config.acceptance.trigger_words_zh, ctx.config.acceptance.trigger_words_en)) {
      return
    }
    
    const existingState = await loadAcceptanceState(ctx.directory)
    if (existingState && existingState.phase === 'acceptance') {
      return
    }
    
    const activeFeature = await findActiveFeature(ctx)
    if (!activeFeature) {
      return
    }
    
    const planPath = createSafePath(ctx.directory, '.sisyphus', 'plans', `${activeFeature}.md`)
    const planExists = await fileExists(planPath)
    
    if (!planExists) {
      return
    }
    
    try {
      const sanitizedFeature = sanitizeFeatureName(activeFeature)
      await enterAcceptancePhase(ctx.directory, sanitizedFeature)
      
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
