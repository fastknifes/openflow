import { applyPromotionSuggestions } from './current-promotion.js'
import type { ExecutorFunction } from '../../orchestrator/types.js'
import type { CurrentPromotionSuggestion } from '../../types.js'

interface CurrentPromotionPayload {
  projectDir: string
  suggestions: CurrentPromotionSuggestion[]
}

export const currentPromotionExecutor: ExecutorFunction = async (task, context) => {
  const payload = task.payload as CurrentPromotionPayload | undefined
  if (!payload) {
    throw new Error('Missing payload for current-promotion task')
  }

  context.logger.info(
    `current-promotion executor starting: ${payload.suggestions.length} suggestions`,
  )

  const result = await applyPromotionSuggestions({
    projectDir: payload.projectDir,
    suggestions: payload.suggestions,
    signal: context.signal,
  })

  context.logger.info(
    `current-promotion executor completed: ${result.applied.length} applied, ${result.skipped.length} skipped`,
  )

  return result
}
