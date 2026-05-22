import { gradeComplexityFromDiff } from './harden-utils.js'

// ── Shared constants ──────────────────────────────────────────────────────

const SENSITIVE_PATHS = [
  '/hooks/',
  '/commands/',
  '/config/',
  '/verify/',
  '/archive/',
  '/harden/',
  '/security/',
  '/auth/',
  '/permission/',
  '/payment/',
]

// ── Stable reason codes (machine-readable) ────────────────────────────────

export const RISK_REASON_CODES = {
  FILES_COUNT_GE_3: 'files_count:>=3',
  FILES_COUNT_2: 'files_count:2',
  DIFF_LINES_GE_50: 'diff_lines:>=50',
  EXPORTS_NEW_PUBLIC_API: 'exports:new_public_api',
  PATH_SENSITIVE_PREFIX: 'path:sensitive',
  PATH_CRITICAL_TYPES_OR_INDEX: 'path:critical_src_types_or_index',
  STATEFUL_LOGIC: 'stateful_logic',
  PRODUCTION_DATA_LOSS_RISK: 'production_data_loss_risk',
  COMPLEXITY_COMPLEX: 'complexity:complex',
  LOW_TRIVIAL_CHANGE: 'risk:low_trivial_change',
} as const

export type RiskReasonCode = (typeof RISK_REASON_CODES)[keyof typeof RISK_REASON_CODES]

// ── Input / output shapes ─────────────────────────────────────────────────

export interface QualityGateRiskInput {
  /** Changed file paths (can be empty) */
  files: string[]
  /** Total diff lines (additions + deletions) */
  diffLines: number
  /** Whether the diff introduces new public exports */
  hasNewExports: boolean
  /** Optional raw diff text for complexity grading */
  diffText?: string
  /** True when the change involves stateful logic (DB, sessions, caches, queues) */
  isStateful?: boolean
  /** True when the change risks production data loss or corruption */
  isProductionDataLossRisk?: boolean
}

export interface QualityGateRiskResult {
  /** Final risk level */
  risk: 'high' | 'medium' | 'low'
  /** Whether harden should execute (true for high risk) */
  shouldHarden: boolean
  /** Stable machine-readable reason codes for every active trigger */
  reasons: string[]
}

// ── Existing helpers (unchanged API) ──────────────────────────────────────

export function assessChangeRisk(
  files: string[],
  diffLines: number,
  hasNewExports: boolean,
): 'high' | 'medium' | 'low' {
  const safeFiles = files ?? []

  if (safeFiles.length >= 3) return 'high'
  if (diffLines >= 50) return 'high'
  if (hasNewExports === true) return 'high'

  for (const f of safeFiles) {
    for (const s of SENSITIVE_PATHS) {
      if (f.includes(s)) return 'high'
    }
  }

  if (safeFiles.includes('src/types.ts') || safeFiles.includes('src/index.ts')) return 'high'

  if (safeFiles.length === 2) return 'medium'

  return 'low'
}

export function isHighRisk(risk: string): boolean {
  return risk === 'high'
}

// ── Unified quality gate risk decision ────────────────────────────────────

/**
 * Quality gate risk decision that unifies path/file-size heuristics with
 * complexity grading and optional risk flags (stateful logic, production risk).
 *
 * Returns a machine-readable result so quality-gate orchestration can act on
 * explicit reasons rather than opaque 'high'/'low' strings.
 *
 * **Harden triggers** (any one → shouldHarden = true):
 *  - >=3 changed files
 *  - >=50 diff lines
 *  - new exported functions/classes
 *  - sensitive path (hooks/commands/config/verify/archive/harden/security/auth/permission/payment)
 *  - types.ts or index.ts changed
 *  - stateful logic
 *  - production/data-loss risk
 *
 * **Elevated risk** (→ medium, no harden by itself):
 *  - complexity grading returns 'complex' (forces harden only when combined
 *    with another high trigger)
 */
export function decideQualityGateRisk(input: QualityGateRiskInput): QualityGateRiskResult {
  const reasons: string[] = []
  let risk: 'high' | 'medium' | 'low' = 'low'

  const files = input.files ?? []

  // 1. File-count triggers
  if (files.length >= 3) {
    reasons.push(RISK_REASON_CODES.FILES_COUNT_GE_3)
    risk = 'high'
  }

  // 2. Diff-line threshold
  if (input.diffLines >= 50) {
    reasons.push(RISK_REASON_CODES.DIFF_LINES_GE_50)
    risk = 'high'
  }

  // 3. New public exports
  if (input.hasNewExports) {
    reasons.push(RISK_REASON_CODES.EXPORTS_NEW_PUBLIC_API)
    risk = 'high'
  }

  // 4. Sensitive paths
  for (const f of files) {
    for (const s of SENSITIVE_PATHS) {
      if (f.includes(s)) {
        const pathLabel = s.replace(/\//g, '')
        reasons.push(`${RISK_REASON_CODES.PATH_SENSITIVE_PREFIX}:${pathLabel}`)
        risk = 'high'
        break // one sensitive path match = high, no need to check more
      }
    }
    if (risk === 'high') break // early exit if already high from sensitive path
  }

  // 5. Critical files (types.ts / index.ts)
  if (files.includes('src/types.ts') || files.includes('src/index.ts')) {
    reasons.push(RISK_REASON_CODES.PATH_CRITICAL_TYPES_OR_INDEX)
    risk = 'high'
  }

  // 6. Stateful logic flag
  if (input.isStateful) {
    reasons.push(RISK_REASON_CODES.STATEFUL_LOGIC)
    risk = 'high'
  }

  // 7. Production / data-loss risk flag
  if (input.isProductionDataLossRisk) {
    reasons.push(RISK_REASON_CODES.PRODUCTION_DATA_LOSS_RISK)
    risk = 'high'
  }

  // 8. Complexity grading from diff text
  // Complexity alone elevates to medium; combined with another high trigger
  // it becomes high via that other trigger.
  if (input.diffText) {
    const complexity = gradeComplexityFromDiff(input.diffText)
    if (complexity === 'complex') {
      reasons.push(RISK_REASON_CODES.COMPLEXITY_COMPLEX)
      if (risk !== 'high') risk = 'medium'
    }
    // trivial and simple don't elevate risk on their own
  }

  // 9. Two files with no high triggers → medium
  if (risk === 'low' && files.length === 2) {
    risk = 'medium'
    reasons.push(RISK_REASON_CODES.FILES_COUNT_2)
  }

  // 10. Fallback: no active triggers → low (safe)
  if (reasons.length === 0) {
    reasons.push(RISK_REASON_CODES.LOW_TRIVIAL_CHANGE)
  }

  const shouldHarden = risk === 'high' || reasons.includes(RISK_REASON_CODES.COMPLEXITY_COMPLEX)

  return { risk, shouldHarden, reasons }
}
