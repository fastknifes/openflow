import * as fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import * as path from 'node:path'
import type { IssueClassification, IssuePacket, OpenFlowContext } from '../types.js'
import { issueSlug, resolveIssueWorkspace, ISSUE_CLARIFICATION_FILENAME, ISSUE_PACKET_FILENAME, ISSUE_RESOLUTION_FILENAME, PROMOTION_CANDIDATE_FILENAME, buildIssueResolution, buildIssuePacket, readIssuePacket, writeIssuePacket } from '../utils/issue-utils.js'
import { escapeMarkdown } from '../utils/security.js'
import { saveAcceptanceState } from '../utils/acceptance-state.js'

interface IssueArgs {
  name?: string
  env?: 'local' | 'staging' | 'production'
  readonly: boolean
  writeDoc: boolean
  noDoc: boolean
  continue: boolean
  resolve: boolean
  fix: boolean
  close: boolean
}

/**
 * Parse --flag value arguments from a raw command string.
 * Flags: --name <slug>, --env <local|staging|production>, --readonly, --write-doc, --no-doc, --continue, --resolve.
 * Returns parsed flags and the remaining non-flag text as the case description.
 */
function parseArgs(raw: string): { caseText: string; args: IssueArgs } {
  const args: IssueArgs = {
    readonly: false,
    writeDoc: false,
    noDoc: false,
    continue: false,
    resolve: false,
    fix: false,
    close: false,
  }

  const tokens = raw.split(/\s+/)
  const caseTokens: string[] = []
  let i = 0

  while (i < tokens.length) {
    const token = tokens[i]!
    if (!token) {
      i++
      continue
    }

    if (token === '--readonly') {
      args.readonly = true
      i++
    } else if (token === '--write-doc') {
      args.writeDoc = true
      i++
    } else if (token === '--no-doc') {
      args.noDoc = true
      i++
    } else if (token === '--continue') {
      args.continue = true
      i++
    } else if (token === '--resolve') {
      args.resolve = true
      i++
    } else if (token === '--fix') {
      args.fix = true
      i++
    } else if (token === '--close') {
      args.close = true
      i++
    } else if (token === '--name' && i + 1 < tokens.length) {
      const nameVal = tokens[i + 1]
      if (nameVal !== undefined) {
        args.name = nameVal
      }
      i += 2
    } else if (token === '--env' && i + 1 < tokens.length) {
      const envVal = tokens[i + 1]
      if (envVal !== undefined && (envVal === 'local' || envVal === 'staging' || envVal === 'production')) {
        args.env = envVal
      }
      i += 2
    } else {
      caseTokens.push(token)
      i++
    }
  }

  return { caseText: caseTokens.join(' ').trim(), args }
}

function renderIssuePacketReport(packet: IssuePacket, historyHint: string = ''): string {
  const evidence = packet.evidence.length > 0
    ? packet.evidence.map(item => `- **${escapeMarkdown(item.source)}**: ${escapeMarkdown(item.summary)}`).join('\n')
    : '- No evidence recorded yet.'
  const hypotheses = packet.hypotheses.length > 0
    ? packet.hypotheses.map(item => `- ${escapeMarkdown(item)}`).join('\n')
    : '- No hypotheses recorded yet.'
  const requiredChecks = packet.requiredChecks.length > 0
    ? packet.requiredChecks.map(item => `- ${escapeMarkdown(item)}`).join('\n')
    : '- No required checks recorded yet.'

  return `## OpenFlow Issue

### Issue
- **symptom**: ${escapeMarkdown(packet.symptom)}
- **slug**: \`${escapeMarkdown(packet.slug)}\`
- **environment**: \`${escapeMarkdown(packet.environment)}\`
- **status**: \`${escapeMarkdown(packet.status)}\`

### Evidence
${evidence}

### Classification
- **primary**: \`${escapeMarkdown(packet.classification)}\`
- **confidence**: \`${escapeMarkdown(packet.confidence)}\`
- **hypotheses**:
${hypotheses}

### Next Step
- **recommended_action**: ${escapeMarkdown(packet.recommendedAction ?? 'Continue read-only investigation and classify before fixing.')}
- **required_checks**:
${requiredChecks}
${historyHint ? `\n${historyHint}` : ''}`
}

function buildPromotionCandidate(feature: string, caseText: string, classification: IssueClassification): string {
  return `# Promotion Candidate

## Source Issue
${escapeMarkdown(caseText || feature)}

## Clarified Requirement
The resolved issue must preserve the clarified behavior captured in \`${ISSUE_CLARIFICATION_FILENAME}\`.

## Clarified Constraints
- Issue fixes remain plan-optional.
- Harden is selected automatically through risk-based Work Node policy.
- Global promotion is only a candidate until explicitly confirmed.

## Proposed Current Update
No automatic docs/current update is applied by /openflow-issue --resolve.

## Proposed Decision
Future similar ${escapeMarkdown(classification)} investigations should first inspect this issue's clarification and resolution archive before changing code.

## Approval Needed
User approval required before promoting this candidate into docs/current or docs/decisions.

## Rationale
Durable issue memory prevents repeated diagnosis and keeps issue-specific fixes from silently becoming global rules.
`
}

async function writeResolvedIssueArtifacts(options: {
  ctx: OpenFlowContext
  workspacePath: string
  clarificationPath: string
  report: string
  feature: string
  caseText: string
  packet: IssuePacket
}): Promise<{
  resolutionPath: string
  promotionCandidatePath: string
  hardenDecision: string
}> {
  const { ctx, workspacePath, clarificationPath, report, feature, caseText, packet } = options
  const now = new Date().toISOString()
  const resolutionPath = path.join(workspacePath, ISSUE_RESOLUTION_FILENAME)
  const promotionCandidatePath = path.join(workspacePath, PROMOTION_CANDIDATE_FILENAME)
  const classification: IssueClassification = packet.classification
  await fs.mkdir(workspacePath, { recursive: true })
  await fs.writeFile(clarificationPath, report, 'utf-8')
  await fs.writeFile(
    resolutionPath,
    buildIssueResolution({
      symptom: caseText || `Resolved issue ${feature}`,
      rootCause: packet.rootCause ?? packet.noFixNeededReason ?? `Resolved through /openflow-issue --resolve as a confirmed ${classification}.`,
      fixSummary: packet.fixSummary ?? `Issue Work Node recorded. Quality gate (harden + verify) will be performed by openflow-quality-gate.`,
      filesInvolved: [],
      verificationEvidence: packet.verificationEvidence ?? 'Verification will be performed by openflow-quality-gate after implementation.',
      recurrenceSignature: `Look for recurring reports matching issue slug ${feature} or symptom: ${caseText || feature}.`,
      futureAIGuidance: `Before changing code for a similar symptom, inspect ${ISSUE_CLARIFICATION_FILENAME}, ${ISSUE_RESOLUTION_FILENAME}, and archive history for ${feature}.`,
    }),
    'utf-8',
  )
  await fs.writeFile(promotionCandidatePath, buildPromotionCandidate(feature, caseText, classification), 'utf-8')
  await writeIssuePacket(workspacePath, { ...packet, status: 'resolved', updatedAt: now })

  await saveAcceptanceState(ctx.directory, {
    feature,
    phase: 'verification_pending',
    phaseStartedAt: now,
    implementationEndedAt: now,
    verificationPromptedAt: now,
    pendingDocUpdates: [],
    mode: 'issue',
    issueSlug: feature,
    rawIssue: caseText,
    primaryClassification: classification,
    classifications: [classification],
    governancePromotionStatus: 'candidate_created',
    issueClarificationPath: clarificationPath,
    promotionCandidatePath,
  })

  return { resolutionPath, promotionCandidatePath, hardenDecision: 'Delegated to openflow-quality-gate for repository-level harden and verify.' }
}

function getResolveBlockers(packet: IssuePacket): string[] {
  const blockers: string[] = []
  if (packet.classification === 'cannot_determine') {
    blockers.push('classification is still cannot_determine')
  }
  if (!packet.rootCause && !packet.noFixNeededReason) {
    blockers.push('rootCause or noFixNeededReason is missing')
  }
  if (packet.requiredChecks.length === 0) {
    blockers.push('requiredChecks is empty')
  }
  if (!packet.verificationEvidence) {
    blockers.push('verificationEvidence is missing')
  }
  return blockers
}

/**
 * Search for an existing issue workspace directory by slug suffix.
 * Scans docs/changes/ for directories matching *-{slug}.
 */
async function findExistingWorkspace(ctx: OpenFlowContext, slug: string): Promise<string | null> {
  const changesDir = path.join(ctx.directory, 'docs', 'changes')
  try {
    const entries = await fs.readdir(changesDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.endsWith(`-${slug}`)) {
        return path.join(changesDir, entry.name)
      }
    }
  } catch {
    // changes dir doesn't exist yet
  }
  return null
}

function extractSlugFromDirName(dirName: string): string {
  const match = dirName.match(/^\d{4}-\d{2}-\d{2}-(.+)$/)
  return match ? match[1]! : dirName
}

function extractKeywords(text: string): string[] {
  if (!text) return []
  const stopWords = new Set([
    'the', 'this', 'that', 'with', 'from', 'what', 'when', 'where', 'which',
    'have', 'been', 'were', 'was', 'are', 'has', 'had', 'but', 'not', 'for',
    'and', 'nor', 'yet', 'all', 'can', 'its', 'may', 'also', 'into', 'more',
    'than', 'then', 'some', 'such', 'only', 'other', 'over', 'very', 'just',
    'about', 'would', 'could', 'should', 'after', 'before', 'between',
    'through', 'during', 'without', 'within', 'along', 'upon',
  ])
  const words = text.toLowerCase().split(/[^a-z0-9]+/)
  return [...new Set(words.filter(w => w.length >= 3 && !stopWords.has(w)))]
}

function extractHistorySnippet(content: string): string {
  const match = content.match(/## Symptom\s*\n+\s*([^\n]+)/)
  if (match) {
    const snippet = match[1]!.trim()
    return snippet.length > 120 ? snippet.slice(0, 117) + '...' : snippet
  }
  return '(resolved issue)'
}

interface HistoricalIssue {
  slug: string
  score: number
  snippet: string
}

/**
 * Search docs/archive and docs/changes for historical issue-resolution.md files.
 * Matches by slug substring overlap and keyword intersection with the case description.
 * Returns a markdown hint section, or empty string if no matches found.
 */
async function searchIssueHistory(
  ctx: OpenFlowContext,
  caseSlug: string,
  caseText: string,
): Promise<string> {
  const candidates: HistoricalIssue[] = []
  const caseKeywords = extractKeywords(caseText)

  const searchPaths = [
    path.join(ctx.directory, 'docs', 'archive'),
    path.join(ctx.directory, 'docs', 'changes'),
  ]

  for (const searchPath of searchPaths) {
    let entries: Dirent[]
    try {
      entries = await fs.readdir(searchPath, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const resolutionPath = path.join(searchPath, entry.name, ISSUE_RESOLUTION_FILENAME)
      let content: string
      try {
        content = await fs.readFile(resolutionPath, 'utf-8')
      } catch {
        continue
      }

      const dirSlug = extractSlugFromDirName(entry.name)
      let score = 0

      // Slug substring overlap
      if (caseSlug.includes(dirSlug) || dirSlug.includes(caseSlug)) {
        score += 10
      }

      // Keyword intersection
      const contentKeywords = extractKeywords(content)
      const intersection = contentKeywords.filter(k => caseKeywords.includes(k))
      score += intersection.length

      if (score > 0) {
        candidates.push({
          slug: dirSlug,
          score,
          snippet: extractHistorySnippet(content),
        })
      }
    }
  }

  if (candidates.length === 0) return ''

  candidates.sort((a, b) => b.score - a.score)
  const top = candidates.slice(0, 3)

  const lines = ['\n### Similar Historical Issues\n']
  for (const issue of top) {
    lines.push(`- **\`${escapeMarkdown(issue.slug)}\`** (relevance: ${issue.score}) — ${escapeMarkdown(issue.snippet)}`)
  }
  lines.push('')

  return lines.join('\n')
}

export async function handleIssue(
  ctx: OpenFlowContext,
  caseText?: string,
  _args?: string,
  _toolContext?: unknown,
): Promise<string> {
  // No case text → ask for concrete issue
  if (!caseText || !caseText.trim()) {
    return `## OpenFlow Issue Clarification

No issue description provided.

Please describe the issue you are investigating. Examples:

\`\`\`
/openflow-issue "api returning 500 on login endpoint"
/openflow-issue "wrong data displayed in dashboard panel" --readonly
/openflow-issue "config drift detected in staging" --env staging
\`\`\`

Optional flags:
- \`--name <slug>\` — override the auto-derived issue slug
- \`--env <local|staging|production>\` — specify the environment (default: local)
- \`--readonly\` — enforce read-only investigation mode
- \`--write-doc\` — write clarification report to \`docs/changes/{date}-{slug}/issue-clarification.md\`
- \`--no-doc\` — suppress all file output (markdown output only)
- \`--continue --name <slug>\` — resume from a prior clarification
- \`--fix\` — enter fix routing after classification is available
- \`--resolve\` — record a resolved issue Work Node after evidence gates pass
- \`--close\` — close the active issue packet without archiving
The command clarifies expectations, constraints, evidence, and current semantics before any implementation. It does NOT make changes to code, data, or configuration. Use \`--resolve\` to record a completed fix after investigation.`
  }

  // Parse flags from the raw case text
  const { caseText: cleanCase, args } = parseArgs(caseText.trim())

  // Derive slug from --name or from case text
  let slug: string
  if (args.name) {
    slug = issueSlug(args.name)
  } else if (cleanCase) {
    slug = issueSlug(cleanCase)
  } else {
    return `## OpenFlow Issue Clarification

A name or case description is required to derive an issue slug.

Provide at least one of:
- A case description (e.g., \`/openflow-issue "api timeout in production"\`)
- A \`--name <slug>\` flag (e.g., \`/openflow-issue --name api-timeout\`)
`
  }

  // Resolve workspace path. Stateful actions prefer an existing dated workspace
  // so older issue packets can be fixed/resolved/closed across days.
  const resolvedWorkspace = resolveIssueWorkspace(ctx, args.name ?? cleanCase)
  const existingWorkspace = await findExistingWorkspace(ctx, slug)
  const workspacePath = existingWorkspace ?? resolvedWorkspace.workspacePath
  const clarificationPath = path.join(workspacePath, ISSUE_CLARIFICATION_FILENAME)
  const packetPath = path.join(workspacePath, ISSUE_PACKET_FILENAME)
  const env = args.env ?? 'local'

  // --continue: continue from the packet first; markdown is only a legacy fallback.
  if (args.continue) {
    const existingPacket = await readIssuePacket(workspacePath)
    if (existingPacket) {
      const historyHint = await searchIssueHistory(ctx, slug, cleanCase)
      return `## OpenFlow Issue (Continuation)

> **Continuation**: loaded issue packet from \`${escapeMarkdown(packetPath)}\`

${renderIssuePacketReport(existingPacket, historyHint)}`
    }

    try {
      const existingContent = await fs.readFile(clarificationPath, 'utf-8')
      return `## OpenFlow Issue Clarification (Continuation)

> **Continuation**: loaded legacy clarification from \`${escapeMarkdown(clarificationPath)}\`

${existingContent}`
    } catch {
      return `## OpenFlow Issue Clarification

--continue specified but no existing issue-packet.json or issue-clarification.md found for slug \`${escapeMarkdown(slug)}\`.

Searched: \`${escapeMarkdown(packetPath)}\` and \`${escapeMarkdown(clarificationPath)}\`

Run the issue command without --continue to generate a fresh clarification, or verify the --name slug matches an existing issue workspace in \`docs/changes/\`.`
    }
  }

  // Search for similar historical issues before generating the report
  const historyHint = await searchIssueHistory(ctx, slug, cleanCase)
  const existingPacket = await readIssuePacket(workspacePath)
  const packet = existingPacket ?? buildIssuePacket({
    slug,
    symptom: cleanCase,
    environment: env,
    status: 'reported',
  })

  const report = renderIssuePacketReport(packet, historyHint)
  const isReadonly = args.readonly || args.env === 'production'

  if (args.close) {
    const now = new Date().toISOString()
    const closedPacket = { ...packet, status: 'closed' as const, updatedAt: now }
    const closedReport = renderIssuePacketReport(closedPacket, historyHint)
    await writeIssuePacket(workspacePath, closedPacket)
    return `${closedReport}

---

## Issue Closed
- issue packet: \`${escapeMarkdown(packetPath)}\`
- archive: not run automatically`
  }

  if (args.fix) {
    if (packet.classification === 'cannot_determine') {
      return `${report}

---

**Fix blocked**: classify the issue before entering fix mode.`
    }
    const fixingPacket = { ...packet, status: 'fixing' as const, updatedAt: new Date().toISOString() }
    const fixingReport = renderIssuePacketReport(fixingPacket, historyHint)
    await writeIssuePacket(workspacePath, fixingPacket)
    return `${fixingReport}

---

## Fix Routing Ready
- classification: \`${escapeMarkdown(packet.classification)}\`
- next: implement the routed action, then invoke \`openflow-quality-gate\`.`
  }

  if (args.resolve) {
    if (isReadonly) {
      return `${report}

---

**Resolve skipped**: --resolve is disabled when --readonly or --env production is active.`
    }

    if (args.noDoc) {
      return `${report}

---

**Resolve skipped**: --resolve requires durable issue artifacts; remove --no-doc to write ${ISSUE_RESOLUTION_FILENAME}.`
    }

    const blockers = getResolveBlockers(packet)
    if (blockers.length > 0) {
      return `${report}

---

## Resolve Blocked
${blockers.map(blocker => `- ${escapeMarkdown(blocker)}`).join('\n')}

Update \`${escapeMarkdown(packetPath)}\` with classification, root cause/no-fix reason, required checks, and verification evidence before resolving.`
    }

    const resolved = await writeResolvedIssueArtifacts({
      ctx,
      workspacePath,
      clarificationPath,
      report,
      feature: slug,
      caseText: cleanCase,
      packet,
    })

    return `${report}

---

## Issue Work Node Recorded
- execute: ✅ resolved issue state recorded
- verification evidence: ✅ recorded in issue packet
- quality gate: required before archive / final readiness
- issue clarification: \`${escapeMarkdown(clarificationPath)}\`
- issue resolution: \`${escapeMarkdown(resolved.resolutionPath)}\`
- promotion candidate: \`${escapeMarkdown(resolved.promotionCandidatePath)}\`
- plan required: no`
  }

  // Persist packet by default (unless explicitly no-doc/readonly) so the issue
  // node is state-first; markdown is an optional projection.
  if (!args.noDoc) {
    if (isReadonly) {
      if (!args.writeDoc) return report
      return `${report}

---

**Write skipped**: --write-doc is disabled when --readonly or --env production is active.`
    }
    await fs.mkdir(workspacePath, { recursive: true })
    if (args.writeDoc) await fs.writeFile(clarificationPath, report, 'utf-8')
    await writeIssuePacket(workspacePath, packet)
  }

  return report
}
