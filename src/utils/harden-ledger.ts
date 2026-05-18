import type {
  Disposition,
  HardenFinding,
  HardenFindingStatus,
  HardenResult,
  HardenTraceEntry,
} from '../types.js'

function normalizeText(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/lines?\s*[:#-]?\s*\d+(?:\s*[-~]\s*\d+)?/gu, 'line')
    .replace(/\d+/gu, '#')
    .replace(/[^a-z0-9/]+/gu, ' ')
    .replace(/\b(?:a|an|the)\b/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function normalizeFiles(files: string[]): string {
  return [...new Set(files.map(file => normalizeText(file)).filter(Boolean))]
    .sort()
    .join(',')
}

function normalizeLines(lines?: string): string {
  return normalizeText(lines)
}

function resolveFindingStatus(current: HardenFindingStatus | undefined, disposition: Disposition): HardenFindingStatus {
  if (disposition === 'false_positive' || disposition === 'superseded') {
    return 'dismissed'
  }

  if (disposition === 'accepted_known_issue') {
    return current ?? 'confirmed'
  }

  if (disposition === 'design_divergence' || disposition === 'needs_decision') {
    if (current === 'fixed' || current === 'verified' || current === 'dismissed') {
      return current
    }
    return 'needs_decision'
  }

  if (current === 'fixed' || current === 'verified') {
    return current
  }

  return current ?? 'confirmed'
}

function isResolvedFinding(finding: HardenFinding): boolean {
  return finding.status === 'fixed' || finding.status === 'verified' || finding.status === 'dismissed'
}

function flattenLatestFindings(result: HardenResult): HardenFinding[] {
  const latestByKey = new Map<string, HardenFinding>()

  for (const round of result.rounds) {
    for (const finding of round.findings) {
      const identity = finding.id ?? finding.normalizedKey ?? normalizeFinding(finding)
      latestByKey.set(identity, finding)
    }
  }

  return [...latestByKey.values()]
}

export function normalizeFinding(finding: HardenFinding): string {
  const textSignature = normalizeText(`${finding.description} ${finding.evidence}`)
  const fileSignature = normalizeFiles(finding.files)
  const lineSignature = normalizeLines(finding.lines)
  return `level=${finding.level}|files=${fileSignature}|lines=${lineSignature}|text=${textSignature}`
}

export function incrementRepeatCount(finding: HardenFinding): HardenFinding {
  return {
    ...finding,
    normalizedKey: finding.normalizedKey ?? normalizeFinding(finding),
    repeatCount: (finding.repeatCount ?? 0) + 1,
  }
}

export function updateDisposition(finding: HardenFinding, disposition: Disposition): HardenFinding {
  return {
    ...finding,
    normalizedKey: finding.normalizedKey ?? normalizeFinding(finding),
    disposition,
    status: resolveFindingStatus(finding.status, disposition),
  }
}

export function buildTraceEntry(round: number, agent: string, tokens: number, result: string): HardenTraceEntry {
  return {
    round,
    agent,
    tokens,
    result,
    timestamp: new Date().toISOString(),
  }
}

export function buildMinimalSummary(result: HardenResult): string {
  const latestFindings = flattenLatestFindings(result)
  const unresolvedMustFixCount = latestFindings.filter(finding => finding.disposition === 'must_fix' && !isResolvedFinding(finding)).length
  const unresolvedNeedsDecisionCount = latestFindings.filter(
    finding => !isResolvedFinding(finding) && (
      finding.disposition === 'needs_decision'
      || finding.disposition === 'design_divergence'
      || finding.status === 'needs_decision'
    ),
  ).length
  const acceptedKnownIssueCount = latestFindings.filter(finding => finding.disposition === 'accepted_known_issue').length

  return JSON.stringify({
    status: result.status,
    stopReason: result.stopReason ?? 'unknown',
    unresolvedMustFixCount,
    unresolvedNeedsDecisionCount,
    acceptedKnownIssueCount,
    acceptedFindingsSummary: result.acceptedFindingsSummary ?? '',
  })
}
