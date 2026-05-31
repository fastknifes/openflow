import * as fs from 'node:fs/promises'
import type { FeatureSession } from '../../state-machine.js'

export async function shouldReturnEarly(session: FeatureSession, _answer?: string): Promise<boolean> {
  if (session.workflowState !== 'complete' || session.generatedDocs.length === 0) {
    return false
  }

  // Verify generated docs still exist on disk
  for (const docPath of session.generatedDocs) {
    try {
      await fs.access(docPath)
    } catch {
      return false
    }
  }

  return true
}

export function hasPendingHarvestResponse(session: FeatureSession, _answer?: string): boolean {
  return Boolean(session.pendingContextHarvest?.awaitingPacketId)
}

export function needsRecovery(session: FeatureSession): boolean {
  return (session.workflowState === 'failed' && session.generatedDocs.length === 0)
    || session.workflowState === 'draft_blocked'
}
