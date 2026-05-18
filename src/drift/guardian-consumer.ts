import type { FileChangedEvent, ContractConsumer } from '../types.js'
import { getContractRuntime } from '../contracts/runtime.js'
import { ScopedDriftJob } from './scoped-job.js'
import {
  writeFeatureGuardianState,
  deleteFeatureGuardianState,
  deleteSessionPending,
} from './state-store.js'

export class GuardianConsumer implements ContractConsumer {
  private jobs = new Map<string, ScopedDriftJob>() // feature → job
  private projectDir: string

  constructor(projectDir: string) {
    this.projectDir = projectDir
  }

  async onEvent(event: FileChangedEvent): Promise<void> {
    const runtime = getContractRuntime()
    if (!runtime.isStarted) return

    // Find which contracts reference this file
    const hits = runtime.registry.findByFile(event.filePath)
    if (hits.length === 0) return

    // Multiple contracts hit same file → ambiguous, skip auto-repair
    if (hits.length > 1) {
      // Don't auto-repair when multiple features hit same file
      return
    }

    const { feature, contract } = hits[0]!

    // Get or create scoped job
    let job = this.jobs.get(feature)
    if (!job) {
      const sessionId = event.sessionId || 'unknown'
      job = new ScopedDriftJob(feature, sessionId, this.projectDir)
      this.jobs.set(feature, job)
    }

    // Run drift check + repair
    await job.run(event.filePath, contract)

    // Persist state
    await writeFeatureGuardianState(this.projectDir, feature, job.getState())
  }

  async onSessionEvent(event: { type: string; sessionId?: string }): Promise<void> {
    if (event.type === 'session_end' || event.type === 'interrupt') {
      // Flush all pending items to disk
      for (const [feature, job] of this.jobs) {
        await job.flushPending()
        await writeFeatureGuardianState(this.projectDir, feature, job.getState())
      }
    }

    if (event.type === 'verify_start' || event.type === 'archive_complete') {
      // Clean up completed feature states
      for (const [feature, job] of this.jobs) {
        await deleteFeatureGuardianState(this.projectDir, feature)
        if (event.type === 'archive_complete') {
          await deleteSessionPending(this.projectDir, job.getState().sessionId)
        }
      }
    }
  }

  /** Resume from disk after restart */
  async resumeFromDisk(sessionId: string): Promise<void> {
    // Restore jobs from persisted state if needed
    // For now, jobs are created on-demand when events arrive
    void sessionId // Reserved for future use
  }

  /** Get a job by feature name */
  getJob(feature: string): ScopedDriftJob | undefined {
    return this.jobs.get(feature)
  }
}
