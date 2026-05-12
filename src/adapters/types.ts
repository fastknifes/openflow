import type { AdapterConfig, GuardianEvidence, VerifyEvidenceCheckResult } from '../types.js'

export interface EvidenceAdapter {
  readonly name: string
  run(ctx: AdapterContext): Promise<VerifyEvidenceCheckResult[]>
}

export interface AdapterContext {
  projectDir: string
  feature: string
  config: AdapterConfig
  cache: AdapterCache
  guardianEvidence?: GuardianEvidence
}

export interface AdapterCache {
  getOrCompute<T>(key: string, compute: () => Promise<T>): Promise<T>
}
