import type { OpenFlowContract } from '../contracts/openflow-contract.js'
import type { GuardianPendingItem, GuardianJobState, GuardianEvidence } from '../types.js'
import { checkDrift } from './diff-engine.js'
import { executeRepair, isDeterministicRepair } from './repair-coordinator.js'
import {
  writeSessionPending,
  readSessionPending,
  readGuardianRepairs,
} from './state-store.js'

export class ScopedDriftJob {
  private pendingItems: GuardianPendingItem[] = []
  private repairCount = 0

  constructor(
    readonly feature: string,
    readonly sessionId: string,
    private projectDir: string,
  ) {}

  /**
   * Run drift check on a file change and handle results:
   * - auto_repaired → execute repair
   * - ambiguous/violation → add to pending queue
   * - no_drift → skip
   */
  async run(filePath: string, contract: OpenFlowContract): Promise<void> {
    const { results, disposition } = await checkDrift(filePath, contract, this.projectDir)

    if (disposition === 'no_drift') return

    if (disposition === 'auto_repaired') {
      for (const result of results) {
        if (isDeterministicRepair(result)) {
          const repairResult = await executeRepair(result, filePath, this.projectDir, this.feature)
          if (repairResult.success) {
            this.repairCount++
          } else {
            this.addPending(filePath, result.item, 'ambiguous_needs_confirmation',
              `Auto-repair failed: ${repairResult.reason}`)
          }
        }
      }
      return
    }

    if (disposition === 'ambiguous_needs_confirmation' || disposition === 'violation_needs_fix') {
      for (const result of results) {
        if (result.reason.includes('matches') || result.reason.includes('no drift')) continue
        this.addPending(filePath, result.item, disposition, result.reason, result.suggestedFix)
      }
    }
  }

  private addPending(
    filePath: string,
    item: string,
    disposition: 'ambiguous_needs_confirmation' | 'violation_needs_fix',
    reason: string,
    suggestedFix?: string,
  ): void {
    const pending: GuardianPendingItem = {
      timestamp: new Date().toISOString(),
      feature: this.feature,
      filePath,
      item,
      disposition,
      reason,
    }
    if (suggestedFix !== undefined) {
      pending.suggestedFix = suggestedFix
    }
    this.pendingItems.push(pending)
  }

  /** Write pending items to disk */
  async flushPending(): Promise<void> {
    if (this.pendingItems.length > 0) {
      await writeSessionPending(this.projectDir, this.sessionId, this.pendingItems)
    }
  }

  /** Load pending items from previous session (for resume) */
  async loadPending(): Promise<void> {
    this.pendingItems = await readSessionPending(this.projectDir, this.sessionId)
  }

  /** Get evidence summary for verify/mapper */
  async getEvidence(): Promise<GuardianEvidence> {
    const repairs = await readGuardianRepairs(this.projectDir)
    const featureRepairs = repairs.filter(r => r.feature === this.feature)

    return {
      autoRepairs: this.repairCount,
      pendingAmbiguities: this.pendingItems.filter(p => p.disposition === 'ambiguous_needs_confirmation').length,
      unresolvedViolations: this.pendingItems.filter(p => p.disposition === 'violation_needs_fix').length,
      contractSource: `docs/changes/*-${this.feature}`,
      repairRecords: featureRepairs,
      pendingItems: [...this.pendingItems],
    }
  }

  /** Get current job state for persistence */
  getState(): GuardianJobState {
    return {
      feature: this.feature,
      sessionId: this.sessionId,
      startedAt: new Date().toISOString(),
      repairsCount: this.repairCount,
      pendingCount: this.pendingItems.length,
    }
  }

  /** Get pending count */
  get pendingCount(): number {
    return this.pendingItems.length
  }

  /** Get repair count */
  get repairsCount(): number {
    return this.repairCount
  }
}
