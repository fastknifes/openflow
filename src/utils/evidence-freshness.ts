import { execSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { join } from 'node:path'

import type {
  AcceptanceState,
  BehaviorFreshness,
  CurrentWorkspaceState,
  EvidenceFreshnessMetadata,
  EvidenceFreshnessResult,
} from '../types.js'

export interface ScenarioEvidenceFreshnessInput {
  timestamp?: string
  gitHead?: string
  scenarioId?: string
  evidenceType?: string
  testFileOrMethod?: string
  commandOrSteps?: string
  result?: string
  coverageRationale?: string
  coreCodeMapping?: string
}

export interface ScenarioEvidenceFreshnessResult {
  freshness: BehaviorFreshness
  reason: string
  missingFields?: string[]
}

/**
 * Classify stored evidence freshness by comparing stored git/workspace
 * metadata against the current workspace state.
 *
 * Classification rules:
 *   - **missing**: No acceptance state OR no stored verify/readiness evidence at all.
 *   - **stale**: Evidence exists but stored git HEAD differs from current HEAD,
 *     changed files differ, or the last workspace change post-dates the recorded
 *     evidence timestamp.
 *   - **fresh**: Stored git HEAD matches current HEAD AND stored changed files
 *     match current changed files AND no workspace change is newer than the
 *     recorded timestamp.
 *
 * Natural-language claims like "tests passed" are NOT accepted as evidence.
 * If the workspace snapshot cannot be computed, the result is stale/missing
 * with an explicit reason string.
 */
export function classifyEvidenceFreshness(
  acceptanceState: AcceptanceState | null,
  currentState: CurrentWorkspaceState,
): EvidenceFreshnessResult {
  // No acceptance state at all → missing
  if (!acceptanceState) {
    return {
      status: 'missing',
      reason: 'No acceptance state exists — evidence has never been recorded.',
    }
  }

  // No verify result and no readiness → missing
  if (!acceptanceState.verifyResult && !acceptanceState.readiness) {
    return {
      status: 'missing',
      reason: 'No verify result or readiness evidence has been recorded for this feature.',
    }
  }

  // Has verify evidence but no freshness metadata → stale
  const metadata = acceptanceState.evidenceFreshness
  if (!metadata) {
    return {
      status: 'stale',
      reason: 'Evidence was recorded without freshness metadata — cannot verify if workspace state has changed since.',
      staleDetails: ['no freshness metadata attached to acceptance state'],
    }
  }

  // Validate metadata completeness
  if (!metadata.gitHead || !metadata.recordedAt) {
    return {
      status: 'stale',
      metadata,
      reason: 'Freshness metadata is incomplete (missing gitHead or recordedAt).',
      staleDetails: ['incomplete freshness metadata fields'],
    }
  }

  // Validate current state completeness
  if (!currentState.gitHead) {
    return {
      status: 'stale',
      metadata,
      reason: 'Current git HEAD is unavailable — cannot verify freshness.',
      staleDetails: ['current git HEAD is empty or unavailable'],
    }
  }

  const staleDetails: string[] = []

  // Git HEAD mismatch
  if (metadata.gitHead !== currentState.gitHead) {
    staleDetails.push(`git HEAD changed: stored ${metadata.gitHead.slice(0, 8)} vs current ${currentState.gitHead.slice(0, 8)}`)
  }

  // Changed files mismatch
  const storedFiles = new Set(metadata.changedFiles || [])
  const currentFiles = new Set(currentState.changedFiles || [])
  if (!setsEqual(storedFiles, currentFiles)) {
    const addedFiles = [...currentFiles].filter(f => !storedFiles.has(f))
    const removedFiles = [...storedFiles].filter(f => !currentFiles.has(f))
    const detailParts: string[] = []
    if (addedFiles.length > 0) detailParts.push(`${addedFiles.length} new`)
    if (removedFiles.length > 0) detailParts.push(`${removedFiles.length} absent`)
    staleDetails.push(`working tree changed: ${detailParts.join(', ')} files differ from stored snapshot`)
  }

  // Diff hash comparison — catches cases where git HEAD and changed files
  // match but the workspace identity hash differs (e.g. timestamp drift)
  if (metadata.diffHash) {
    const currentHash = computeSimpleDiffHash(currentState)
    if (metadata.diffHash !== currentHash) {
      staleDetails.push(`diff hash mismatch: stored ${metadata.diffHash} vs current ${currentHash}`)
    }
  }

  // Timestamp check: if workspace has newer changes than recorded evidence
  if (currentState.latestChangeTimestamp != null) {
    const recordedMs = new Date(metadata.recordedAt).getTime()
    if (!Number.isNaN(recordedMs) && currentState.latestChangeTimestamp > recordedMs) {
      staleDetails.push(
        `workspace modified after evidence was recorded (latest change: ${new Date(currentState.latestChangeTimestamp).toISOString()}, recorded: ${metadata.recordedAt})`,
      )
    }
  }

  if (staleDetails.length > 0) {
    return {
      status: 'stale',
      metadata,
      reason: `${staleDetails.length} difference(s) detected between stored evidence and current workspace.`,
      staleDetails,
    }
  }

  return {
    status: 'fresh',
    metadata,
    reason: 'Stored evidence matches current workspace state — evidence can be reused.',
  }
}

/**
 * Create freshness metadata from verify result and current workspace state.
 * Call this after verify completes to attach freshness tracking.
 */
export function createEvidenceFreshnessMetadata(
  currentState: CurrentWorkspaceState,
  evidenceChecks: string[],
  evidenceSummary: string,
  diffHash?: string,
): EvidenceFreshnessMetadata {
  return {
    gitHead: currentState.gitHead,
    changedFiles: [...currentState.changedFiles].sort(),
    diffHash: diffHash || computeSimpleDiffHash(currentState),
    recordedAt: new Date().toISOString(),
    evidenceChecks,
    evidenceSummary,
  }
}

/**
 * Classify one behavior scenario evidence file against the current workspace.
 * Evidence without both timestamp and git HEAD is intentionally unknown, not
 * fresh, because behavior evidence must be tied to an executable snapshot.
 */
export function classifyScenarioEvidenceFreshness(
  evidence: ScenarioEvidenceFreshnessInput,
  currentState: CurrentWorkspaceState,
): ScenarioEvidenceFreshnessResult {
  const missingFields = collectMissingScenarioEvidenceFields(evidence)

  if (!evidence.timestamp && !evidence.gitHead) {
    return {
      freshness: 'unknown',
      reason: 'Evidence is missing timestamp and git HEAD.',
      missingFields,
    }
  }

  const staleDetails: string[] = []

  if (evidence.gitHead && !currentState.gitHead) {
    return {
      freshness: 'unknown',
      reason: 'Current git HEAD is unavailable.',
      missingFields,
    }
  }

  if (evidence.gitHead && currentState.gitHead && evidence.gitHead !== currentState.gitHead) {
    staleDetails.push(`git HEAD changed: evidence ${evidence.gitHead.slice(0, 8)} vs current ${currentState.gitHead.slice(0, 8)}`)
  }

  if (evidence.timestamp) {
    const evidenceMs = new Date(evidence.timestamp).getTime()
    if (Number.isNaN(evidenceMs)) {
      staleDetails.push('evidence timestamp is invalid')
    } else if (currentState.latestChangeTimestamp != null && currentState.latestChangeTimestamp > evidenceMs) {
      staleDetails.push(
        `workspace modified after evidence timestamp (latest change: ${new Date(currentState.latestChangeTimestamp).toISOString()}, evidence: ${evidence.timestamp})`,
      )
    }
  }

  if (staleDetails.length > 0) {
    return {
      freshness: 'stale',
      reason: staleDetails.join('; '),
      missingFields,
    }
  }

  return {
    freshness: 'fresh',
    reason: 'Evidence timestamp and git HEAD match the current workspace.',
    missingFields,
  }
}

export function parseScenarioEvidenceMetadata(content: string): ScenarioEvidenceFreshnessInput {
  const metadata: ScenarioEvidenceFreshnessInput = {}
  const fields: Array<[keyof ScenarioEvidenceFreshnessInput, RegExp]> = [
    ['scenarioId', /(?:^|\n)\s*(?:[-*]\s*)?(?:scenario(?:\s+id)?|scenario)\s*:\s*(.+)/i],
    ['evidenceType', /(?:^|\n)\s*(?:[-*]\s*)?evidence\s+type\s*:\s*(.+)/i],
    ['testFileOrMethod', /(?:^|\n)\s*(?:[-*]\s*)?(?:test\s+(?:file|method)|test)\s*:\s*(.+)/i],
    ['commandOrSteps', /(?:^|\n)\s*(?:[-*]\s*)?(?:command|steps?)\s*:\s*(.+)/i],
    ['result', /(?:^|\n)\s*(?:[-*]\s*)?result\s*:\s*(.+)/i],
    ['timestamp', /(?:^|\n)\s*(?:[-*]\s*)?(?:timestamp|recorded\s+at)\s*:\s*(.+)/i],
    ['gitHead', /(?:^|\n)\s*(?:[-*]\s*)?(?:git\s+head|head|commit)\s*:\s*([0-9a-f]{7,40})/i],
    ['coverageRationale', /(?:^|\n)\s*(?:[-*]\s*)?(?:coverage\s+rationale|rationale)\s*:\s*(.+)/i],
    ['coreCodeMapping', /(?:^|\n)\s*(?:[-*]\s*)?(?:core\s+code\s+mapping|code\s+mapping|core\s+code)\s*:\s*(.+)/i],
  ]

  for (const [field, pattern] of fields) {
    const value = content.match(pattern)?.[1]?.trim()
    if (value) metadata[field] = value
  }

  return metadata
}

function collectMissingScenarioEvidenceFields(evidence: ScenarioEvidenceFreshnessInput): string[] {
  const required: Array<[keyof ScenarioEvidenceFreshnessInput, string]> = [
    ['scenarioId', 'scenario reference'],
    ['evidenceType', 'evidence type'],
    ['testFileOrMethod', 'test file or method'],
    ['commandOrSteps', 'command or steps'],
    ['result', 'result'],
    ['coverageRationale', 'coverage rationale'],
    ['coreCodeMapping', 'core code mapping'],
  ]

  return required.filter(([field]) => !evidence[field]).map(([, label]) => label)
}

/**
 * Compute a simple deterministic diff identity hash from the current
 * workspace state. Not cryptographically secure — used only for quick
 * equality comparison.
 */
export function computeSimpleDiffHash(state: CurrentWorkspaceState): string {
  const normalized = [
    state.gitHead,
    ...[...state.changedFiles].sort(),
    state.latestChangeTimestamp ?? '',
  ].join('\n')
  return simpleHash(normalized)
}

function simpleHash(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false
  for (const item of a) {
    if (!b.has(item)) return false
  }
  return true
}

/**
 * Capture the current workspace state for evidence freshness tracking.
 * Runs git commands to get HEAD and changed files, then stat's each
 * changed file for the latest modification timestamp.
 *
 * When git is unavailable or the directory is not a repo, returns a
 * minimal snapshot so the freshness classifier can still produce
 * stale/missing results with an explicit reason.
 */
export function captureCurrentWorkspaceState(projectDir: string): CurrentWorkspaceState {
  let gitHead = ''
  let changedFiles: string[] = []

  try {
    gitHead = runGitCommand(projectDir, ['rev-parse', 'HEAD'])
  } catch {
    // Not a git repo or git unavailable — leave empty
  }

  try {
    const output = runGitCommand(projectDir, ['diff', '--name-only'])
    changedFiles = output.split('\n').map(line => line.trim()).filter(Boolean)
  } catch {
    // Not a git repo or no diff — leave empty
  }

  let latestChangeTimestamp: number | undefined
  for (const file of changedFiles) {
    try {
      const filePath = join(projectDir, file)
      const stat = statSync(filePath)
      const mtimeMs = stat.mtimeMs
      if (latestChangeTimestamp === undefined || mtimeMs > latestChangeTimestamp) {
        latestChangeTimestamp = mtimeMs
      }
    } catch {
      // File may not exist (deleted in working tree) — skip
    }
  }

  const result: CurrentWorkspaceState = { gitHead, changedFiles }
  if (latestChangeTimestamp !== undefined) {
    result.latestChangeTimestamp = latestChangeTimestamp
  }
  return result
}

function runGitCommand(cwd: string, args: string[]): string {
  return execSync(`git ${args.join(' ')}`, {
    cwd,
    encoding: 'utf-8',
    timeout: 5000,
    windowsHide: true,
  }).trim()
}
