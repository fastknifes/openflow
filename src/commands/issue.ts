import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { OpenFlowContext } from '../types.js'
import { issueSlug, resolveIssueWorkspace, ISSUE_CLARIFICATION_FILENAME } from '../utils/issue-utils.js'
import { escapeMarkdown } from '../utils/security.js'

interface IssueArgs {
  name?: string
  env?: 'local' | 'staging' | 'production'
  readonly: boolean
  writeDoc: boolean
  noDoc: boolean
  continue: boolean
}

/**
 * Parse --flag value arguments from a raw command string.
 * Flags: --name <slug>, --env <local|staging|production>, --readonly, --write-doc, --no-doc, --continue.
 * Returns parsed flags and the remaining non-flag text as the case description.
 */
function parseArgs(raw: string): { caseText: string; args: IssueArgs } {
  const args: IssueArgs = {
    readonly: false,
    writeDoc: false,
    noDoc: false,
    continue: false,
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
 * Build the full 8-section markdown clarification report.
 */
function buildClarificationReport(
  caseText: string,
  slug: string,
  args: IssueArgs,
  continuationNote: string | null,
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

  const header = `## OpenFlow Issue Clarification
${continuationNote ? `\n> **Continuation**: ${escapeMarkdown(continuationNote)}\n` : ''}
Case: ${caseText ? escapeMarkdown(caseText) : '(awaiting case text)'}
Slug: \`${escapeMarkdown(slug)}\`
Environment: \`${escapeMarkdown(env)}\`
`

  return header + '\n' + [
    intakeSection,
    requirementSection,
    constraintSection,
    evidenceSection,
    semanticSection,
    classificationSection,
    nextActionSection,
    governanceSection,
  ].join('\n')
}

function formatModeFlags(args: IssueArgs): string {
  const flags: string[] = []
  if (args.readonly) flags.push('readonly')
  if (args.writeDoc) flags.push('write-doc')
  if (args.noDoc) flags.push('no-doc')
  if (args.continue) flags.push('continue')
  if (args.name) flags.push(`name=${args.name}`)
  if (args.env) flags.push(`env=${args.env}`)
  return flags.length > 0 ? flags.join(', ') : 'none'
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

The command clarifies expectations, constraints, evidence, and current semantics before any implementation. It does NOT make changes to code, data, or configuration.`
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

  // Generate 8-section report
  const report = buildClarificationReport(cleanCase, slug, args, continuationNote)
  const isReadonly = args.readonly || args.env === 'production'

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
