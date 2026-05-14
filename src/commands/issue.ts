import * as fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import * as path from 'node:path'
import type { IssueClassification, OpenFlowContext } from '../types.js'
import { issueSlug, resolveIssueWorkspace, ISSUE_CLARIFICATION_FILENAME, ISSUE_RESOLUTION_FILENAME, PROMOTION_CANDIDATE_FILENAME, buildIssueResolution } from '../utils/issue-utils.js'
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

/**
 * Suggest the next step based on the issue classification.
 * Returns markdown lines for the Recommended Next Step section.
 */
function suggestNextStep(classification: string, slug: string): string {
  const readOnlyStop = ['data_issue', 'config_issue', 'environment_issue', 'docs_issue', 'cannot_determine']
  const fixRecommended = ['bugfix', 'regression', 'performance_issue']
  const featureDesignSuggested = ['requirement_change', 'unclear_requirement', 'design_gap']

  if (readOnlyStop.includes(classification)) {
    return `- **classification**: \`${classification}\`\n- **recommendation**: Read-only analysis complete. No code fix required.\n- **next_step**: Continue investigation with \`/openflow-issue ${escapeMarkdown(slug)} --continue\` or gather additional evidence to refine classification.`
  }

  if (fixRecommended.includes(classification)) {
    return `- **classification**: \`${classification}\`\n- **recommendation**: Fix recommended.\n- **next_step**: Run \`/openflow-issue ${escapeMarkdown(slug)} --resolve\` to record the fix.`
  }

  if (featureDesignSuggested.includes(classification)) {
    return `- **classification**: \`${classification}\`\n- **recommendation**: Large-scale change detected.\n- **next_step**: Consider \`/openflow-feature ${escapeMarkdown(slug)}\` for proper design.`
  }

  return `- **classification**: \`${classification}\`\n- **recommendation**: Continue investigation.\n- **next_step**: Run \`/openflow-issue ${escapeMarkdown(slug)} --continue\` to proceed.`
}

/**
 * Build the full 9-section markdown clarification report.
 */
function buildClarificationReport(
  caseText: string,
  slug: string,
  args: IssueArgs,
  continuationNote: string | null,
  historyHint: string = '',
  classification: string = 'cannot_determine',
): string {
  const env = args.env ?? 'local'
  const isReadonly = args.readonly || args.env === 'production'

  // Section 1: Issue Intake
  const intakeSection = `### 1. Issue Intake
- **raw_case_text**: ${caseText ? escapeMarkdown(caseText) : '(no case text provided)'}
- **issue_slug**: ${escapeMarkdown(slug)}
- **environment**: ${escapeMarkdown(env)}
- **mode_flags**: ${formatModeFlags(args)}
- **intake_status**: ${caseText ? 'case_text_received' : 'awaiting_case_text'}
${continuationNote ? `\n- **continuation**: ${escapeMarkdown(continuationNote)}` : ''}
`

  // Section 2: Requirement Clarification
  const requirementSection = `### 2. Requirement Clarification
- **known_requirements**: none (no requirement source provided)
- **implicit_requirements**: issue_intake_only (no design/PRD/spec context referenced)
- **requirement_gaps**: the issue description alone is insufficient to infer concrete requirements; additional evidence or disambiguation is needed
- **recommended_sources**: current design docs, PRD, relevant decisions, test cases, error logs
`

  // Section 3: Constraint Clarification
  const constraintSection = `### 3. Constraint Clarification
${isReadonly ? '- **read_only_guard**: ENABLED — no code changes, data mutations, or config writes are permitted; this is a read-only investigation context\n' : ''}- **environment_constraint**: ${escapeMarkdown(env)}
- **modification_constraint**: ${isReadonly ? 'no writes or mutations allowed' : 'no automatic code or data changes without explicit approval'}
- **docwrite_constraint**: ${args.writeDoc ? `will write clarification to docs/changes/{date}-${escapeMarkdown(slug)}/${ISSUE_CLARIFICATION_FILENAME}` : args.noDoc ? 'docs output suppressed (--no-doc active)' : 'docs output not explicitly requested'}
- **continuation_constraint**: ${args.continue ? 'continuing from prior clarification artifact' : 'fresh issue intake'}
`

  // Section 4: Evidence Investigation
  const evidenceSection = `### 4. Evidence Investigation
- **available_evidence**: ${caseText ? 'user-provided case description only' : 'none'}
- **missing_evidence**: error messages, stack traces, logs, reproduction steps, affected files, configuration context, environment variables, recent changes
${isReadonly ? '- **read_only_guardrails**:\n  - No filesystem writes permitted\n  - No data mutations permitted\n  - No configuration changes permitted\n  - Investigation must be limited to read-only inspection (file reads, log reads, status checks, query operations)\n' : ''}- **evidence_gaps**: high — cannot classify or recommend action without additional evidence
- **next_evidence_step**: gather error logs, reproduction steps, affected code paths, and environment details before attempting classification
`

  // Section 5: Semantic Alignment
  const semanticSection = `### 5. Semantic Alignment
- **semantic_hypothesis**: unknown — insufficient evidence to map the reported issue to a known semantic category
- **potential_alignments**: ${caseText ? 'the case text suggests a problem but no clear semantic category is evident without further investigation' : 'no case text provided'}
- **disambiguation_needed**: yes — user should clarify whether this is a bug, data issue, config issue, environment issue, documentation ambiguity, or behavior change request
- **contradictory_signals**: none detected (no conflict with current decisions or design docs identified at this stage)
`

  // Section 6: Classification
  const classificationSection = `### 6. Classification
- **primary_classification**: \`cannot_determine\`
- **classification_confidence**: low
- **all_classifications**: [cannot_determine]
- **classification_rationale**: insufficient evidence to determine whether this is a bugfix, data issue, config issue, environment issue, doc ambiguity, or behavior change. Classification remains conservative by default — explicit evidence or user disambiguation is required to assign a non-default classification.
${env !== 'local' ? `- **env_note**: running in \`${escapeMarkdown(env)}\` environment — additional caution warranted for classification decisions\n` : ''}`

  // Section 7: Next Action Gate
  const nextActionSection = `### 7. Next Action Gate
- **gate_status**: blocked_on_evidence
- **recommended_action**: gather_additional_evidence
- **alternative_action**: ${args.continue ? 'continue_from_prior_clarification' : 'user_disambiguation'}
- **required_inputs**: case description with error details, reproduction steps, affected code paths, environment specifics
- **deferred_actions**: ${args.writeDoc ? `clarification doc will be written to docs/changes/{date}-${slug}/` : 'no doc write requested'}
- **blocked_by**: insufficient_evidence_for_classification
`

  // Section 8: Governance Promotion
  const governanceSection = `### 8. Governance Promotion
- **governance_status**: \`none\`
- **promotion_blockers**: classification is \`cannot_determine\` — promotion requires a confirmed classification with supporting evidence
- **required_for_promotion**: confirmed issue classification, verified evidence, explicit user approval
- **decision_impact**: no decisions or current-state changes are proposed at this stage
- **next_governance_step**: complete evidence gathering and classification before considering promotion to \`candidate_created\` or further governance states
`

  // Section 9: Recommended Next Step
  const suggestionSection = `### 9. Recommended Next Step
${suggestNextStep(classification, slug)}
`

  const header = `## OpenFlow Issue Clarification
${continuationNote ? `\n> **Continuation**: ${escapeMarkdown(continuationNote)}\n` : ''}
Case: ${caseText ? escapeMarkdown(caseText) : '(awaiting case text)'}
Slug: \`${escapeMarkdown(slug)}\`
Environment: \`${escapeMarkdown(env)}\`
`

  const sections = [
    intakeSection,
    requirementSection,
    constraintSection,
    evidenceSection,
    semanticSection,
    classificationSection,
    nextActionSection,
  ]
  if (historyHint) {
    sections.push(historyHint)
  }
  sections.push(governanceSection)
  sections.push(suggestionSection)

  return header + '\n' + sections.join('\n')
}

function formatModeFlags(args: IssueArgs): string {
  const flags: string[] = []
  if (args.readonly) flags.push('readonly')
  if (args.writeDoc) flags.push('write-doc')
  if (args.noDoc) flags.push('no-doc')
  if (args.continue) flags.push('continue')
  if (args.resolve) flags.push('resolve')
  if (args.name) flags.push(`name=${args.name}`)
  if (args.env) flags.push(`env=${args.env}`)
  return flags.length > 0 ? flags.join(', ') : 'none'
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
}): Promise<{
  resolutionPath: string
  promotionCandidatePath: string
  hardenDecision: string
}> {
  const { ctx, workspacePath, clarificationPath, report, feature, caseText } = options
  const now = new Date().toISOString()
  const resolutionPath = path.join(workspacePath, ISSUE_RESOLUTION_FILENAME)
  const promotionCandidatePath = path.join(workspacePath, PROMOTION_CANDIDATE_FILENAME)
  const classification: IssueClassification = 'bugfix'
  const hardenDecision = 'Delegated to openflow-quality-gate for risk assessment and evidence-aware verify.'

  await fs.mkdir(workspacePath, { recursive: true })
  await fs.writeFile(clarificationPath, report, 'utf-8')
  await fs.writeFile(
    resolutionPath,
    buildIssueResolution({
      symptom: caseText || `Resolved issue ${feature}`,
      rootCause: `Resolved through /openflow-issue --resolve as a confirmed ${classification}.`,
      fixSummary: `Issue Work Node recorded. Quality gate (harden + verify) will be performed by openflow-quality-gate.`,
      filesInvolved: [],
      verificationEvidence: 'Verification will be performed by openflow-quality-gate after implementation.',
      recurrenceSignature: `Look for recurring reports matching issue slug ${feature} or symptom: ${caseText || feature}.`,
      futureAIGuidance: `Before changing code for a similar symptom, inspect ${ISSUE_CLARIFICATION_FILENAME}, ${ISSUE_RESOLUTION_FILENAME}, and archive history for ${feature}.`,
    }),
    'utf-8',
  )
  await fs.writeFile(promotionCandidatePath, buildPromotionCandidate(feature, caseText, classification), 'utf-8')

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

  return { resolutionPath, promotionCandidatePath, hardenDecision }
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
- \`--resolve\` — record a resolved issue Work Node; quality gate (harden + verify) will be delegated to openflow-quality-gate after implementation
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

  // Resolve workspace path
  const { workspacePath } = resolveIssueWorkspace(ctx, args.name ?? cleanCase)
  const clarificationPath = path.join(workspacePath, ISSUE_CLARIFICATION_FILENAME)

  // --continue: read existing clarification
  let continuationNote: string | null = null
  if (args.continue) {
    let existingPath = clarificationPath

    // Try exact path first, then fall back to scanning existing workspaces
    try {
      await fs.access(existingPath)
    } catch {
      const found = await findExistingWorkspace(ctx, slug)
      if (found) {
        existingPath = path.join(found, ISSUE_CLARIFICATION_FILENAME)
      }
    }

    try {
      const existingContent = await fs.readFile(existingPath, 'utf-8')
      continuationNote = `loaded prior clarification from \`${existingPath}\``
      return `## OpenFlow Issue Clarification (Continuation)

> **Continuation**: loaded prior clarification from \`${escapeMarkdown(existingPath)}\`

${existingContent}`
    } catch {
      return `## OpenFlow Issue Clarification

--continue specified but no existing issue-clarification.md found for slug \`${escapeMarkdown(slug)}\`.

Searched: \`${escapeMarkdown(clarificationPath)}\`

Run the issue command without --continue to generate a fresh clarification, or verify the --name slug matches an existing issue workspace in \`docs/changes/\`.`
    }
  }

  // Search for similar historical issues before generating the report
  const historyHint = await searchIssueHistory(ctx, slug, cleanCase)

  // Generate 9-section report
  const classification = args.resolve ? 'bugfix' : 'cannot_determine'
  const report = buildClarificationReport(cleanCase, slug, args, continuationNote, historyHint, classification)
  const isReadonly = args.readonly || args.env === 'production'

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

    const resolved = await writeResolvedIssueArtifacts({
      ctx,
      workspacePath,
      clarificationPath,
      report,
      feature: slug,
      caseText: cleanCase,
    })

    return `${report}

---

## Issue Work Node Recorded
- execute: ✅ resolved issue state recorded
- quality gate: Delegated to openflow-quality-gate (invoke after implementation for risk-based harden + evidence-aware verify)
- issue clarification: \`${escapeMarkdown(clarificationPath)}\`
- issue resolution: \`${escapeMarkdown(resolved.resolutionPath)}\`
- promotion candidate: \`${escapeMarkdown(resolved.promotionCandidatePath)}\`
- plan required: no`
  }

  // Write doc if requested (and --no-doc is not active)
  if (args.writeDoc && !args.noDoc) {
    if (isReadonly) {
      return `${report}

---

**Write skipped**: --write-doc is disabled when --readonly or --env production is active.`
    }
    await fs.mkdir(workspacePath, { recursive: true })
    await fs.writeFile(clarificationPath, report, 'utf-8')
  }

  return report
}
