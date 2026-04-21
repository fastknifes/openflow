import * as fs from 'node:fs/promises'
import type { OpenFlowContext } from '../types.js'
import { VerifyReadinessStatus } from '../types.js'
import { createSafePath, escapeMarkdown, sanitizeFeatureName } from '../utils/security.js'
import { fileExists } from '../hooks/file-utils.js'

interface VerifyEvidencePacket {
  checksRun: string[]
  observedBehaviorSummary: string
  intendedVsActualDelta: string
  docAlignmentSummary: string
  constraintConflictSummary: string
  knownRisksOrMissingEvidence: string
}

interface VerifyReadinessResult {
  status: VerifyReadinessStatus
  reason: string
  nextStep: string
}

export async function handleVerify(ctx: OpenFlowContext, feature?: string): Promise<string> {
  const resolvedFeature = feature?.trim() ? feature.trim() : await findActiveFeature(ctx)

  if (!resolvedFeature) {
    return `## Verify

### Evidence
- checks_run: active_feature_resolution ❌ (no explicit feature and no active plan in .sisyphus/plans)
- observed_behavior_summary: no verification context was resolved
- intended_vs_actual_delta: unknown (feature context missing)
- doc_alignment_summary: skipped (feature context missing)
- current_decisions_conflict_summary: skipped (feature context missing)
- known_risks_or_missing_evidence: missing active feature context

### Readiness
- status: ${VerifyReadinessStatus.NotReady}
- reason: active feature is required to build an evidence packet
- next_step: run /openflow/verify <feature-name> or create an active plan under .sisyphus/plans/
`
  }

  const sanitizedFeature = sanitizeFeatureName(resolvedFeature)
  const evidence = await collectEvidence(ctx, sanitizedFeature)
  const readiness = classifyReadinessStub(sanitizedFeature, evidence)

  return formatVerifyResult(sanitizedFeature, evidence, readiness)
}

async function findActiveFeature(ctx: OpenFlowContext): Promise<string | null> {
  const plansDir = createSafePath(ctx.directory, '.sisyphus', 'plans')

  try {
    const files = await fs.readdir(plansDir)
    const mdFiles = files.filter(file => file.endsWith('.md'))
    if (mdFiles.length === 0) return null

    let latestFeature: { name: string; mtime: number } | null = null

    for (const file of mdFiles) {
      const filePath = createSafePath(ctx.directory, '.sisyphus', 'plans', file)
      const stat = await fs.stat(filePath)

      if (!latestFeature || stat.mtimeMs > latestFeature.mtime) {
        latestFeature = {
          name: file.replace('.md', ''),
          mtime: stat.mtimeMs,
        }
      }
    }

    return latestFeature?.name ?? null
  } catch {
    return null
  }
}

async function collectEvidence(ctx: OpenFlowContext, feature: string): Promise<VerifyEvidencePacket> {
  const planPath = createSafePath(ctx.directory, '.sisyphus', 'plans', `${feature}.md`)
  const changesPath = createSafePath(ctx.directory, 'docs', 'changes', feature)
  const currentPath = createSafePath(ctx.directory, 'docs', 'current')
  const decisionsPath = createSafePath(ctx.directory, 'docs', 'decisions')

  const planExists = await fileExists(planPath)
  const changesExists = await fileExists(changesPath)
  const currentExists = await fileExists(currentPath)
  const decisionsExists = await fileExists(decisionsPath)

  const checksRun = [
    `active_feature_resolution ✅ (${feature})`,
    `plan_exists ${planExists ? '✅' : '⚠️'} (${planExists ? 'found' : 'missing'} .sisyphus/plans/${feature}.md)`,
    `changes_workspace ${changesExists ? '✅' : '⚠️'} (${changesExists ? 'found' : 'missing'} docs/changes/${feature})`,
    `stable_constraints_current ${currentExists ? '✅' : '⚠️'} (${currentExists ? 'found' : 'missing'} docs/current)`,
    `stable_constraints_decisions ${decisionsExists ? '✅' : '⚠️'} (${decisionsExists ? 'found' : 'missing'} docs/decisions)`,
  ]

  const missingEvidence: string[] = []
  if (!planExists) missingEvidence.push('active plan file')
  if (!changesExists) missingEvidence.push('change workspace')

  return {
    checksRun,
    observedBehaviorSummary: 'Initial Verify shell executed. Evidence and readiness stubs are active.',
    intendedVsActualDelta: 'Delta computation is not implemented yet; this is a placeholder summary.',
    docAlignmentSummary: changesExists
      ? 'Change workspace exists; detailed document alignment analysis is pending implementation.'
      : 'Change workspace missing; document alignment cannot be fully assessed.',
    constraintConflictSummary: currentExists || decisionsExists
      ? 'Current/decisions presence checked. Conflict classifier is not implemented yet.'
      : 'No current/decisions baseline detected; conflict analysis deferred.',
    knownRisksOrMissingEvidence: missingEvidence.length > 0
      ? `Missing evidence: ${missingEvidence.join(', ')}.`
      : 'No blocking evidence gaps detected by initial shell checks.',
  }
}

function classifyReadinessStub(feature: string, evidence: VerifyEvidencePacket): VerifyReadinessResult {
  void evidence

  return {
    status: VerifyReadinessStatus.Ready,
    reason: `Initial Readiness stub classifies ${feature} as ready (placeholder behavior).`,
    nextStep: 'Task 4 will replace this stub with the real readiness classifier.',
  }
}

function formatVerifyResult(feature: string, evidence: VerifyEvidencePacket, readiness: VerifyReadinessResult): string {
  return `## Verify

Feature: ${escapeMarkdown(feature)}

### Evidence
- checks_run:
${evidence.checksRun.map(check => `  - ${check}`).join('\n')}
- observed_behavior_summary: ${escapeMarkdown(evidence.observedBehaviorSummary)}
- intended_vs_actual_delta: ${escapeMarkdown(evidence.intendedVsActualDelta)}
- doc_alignment_summary: ${escapeMarkdown(evidence.docAlignmentSummary)}
- current_decisions_conflict_summary: ${escapeMarkdown(evidence.constraintConflictSummary)}
- known_risks_or_missing_evidence: ${escapeMarkdown(evidence.knownRisksOrMissingEvidence)}

### Readiness
- status: ${readiness.status}
- reason: ${escapeMarkdown(readiness.reason)}
- next_step: ${escapeMarkdown(readiness.nextStep)}
`
}
