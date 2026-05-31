import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { ensureChangeWorkspacePath } from '../../../../config.js'
import { createSafePath, escapeMarkdown } from '../../../../utils/security.js'
import type { FeatureSession } from '../../../../phases/feature/state-machine.js'
import type { RequirementModel } from '../../../../phases/feature/requirement-model.js'
import type { OpenFlowContext } from '../../../../types.js'
import { getTemplateRequirements, formatTemplateRequirements } from '../../../../phases/feature/readiness-evaluator.js'

export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tempPath, content, 'utf-8')
  await fs.rename(tempPath, filePath)
}

function renderStateHeader(session: FeatureSession, status: string, brief: string): string {
  return `# ${escapeMarkdown(session.feature)} Feature State

- Status: \`${status}\`
- Feature: \`${escapeMarkdown(session.feature)}\`
- Updated At: ${new Date().toISOString()}

## Feature Brief

${escapeMarkdown(brief)}
`
}

export async function updateStateMd(ctx: OpenFlowContext, session: FeatureSession): Promise<void> {
  const workspaceDir = await ensureChangeWorkspacePath(ctx.directory, session.feature, ctx.config)
  const relativeWorkspaceDir = path.relative(ctx.directory, workspaceDir)
  const statePath = createSafePath(ctx.directory, relativeWorkspaceDir, 'state.md')

  const content = renderCollectingStateDocument(session)

  await fs.mkdir(path.dirname(statePath), { recursive: true })
  await writeFileAtomic(statePath, content)
}

export function renderCollectingStateDocument(session: FeatureSession): string {
  const brief = session.sourceIntent ?? session.featureTitle ?? session.feature
  const header = renderStateHeader(session, session.workflowState, brief)

  const requirements = getTemplateRequirements()
  const templateSection = formatTemplateRequirements(requirements)

  const facts = Object.entries(session.collectedFacts)
    .filter(([, value]) => value?.trim())
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n')
  const factsSection = `## Collected Facts

${facts || '- No facts collected yet.'}
`

  const assumptions = session.assumptions.length > 0
    ? session.assumptions.map((a) => `- ${a}`).join('\n')
    : '- None recorded.'
  const assumptionsSection = `## Assumptions

${assumptions}
`

  const pending = session.pendingConfirmations.length > 0
    ? session.pendingConfirmations.map((c) => `- ${c}`).join('\n')
    : '- None.'
  const pendingSection = `## Pending Confirmations

${pending}
`

  return header + '\n' + templateSection + '\n' + factsSection + '\n' + assumptionsSection + '\n' + pendingSection
}

export function renderFeatureStateDocument(session: FeatureSession, model: RequirementModel, generatedDocs?: string[]): string {
  const brief = model.problemStatement ?? model.sourceIntent ?? session.sourceIntent ?? session.feature
  const header = renderStateHeader(session, 'complete', brief)

  const constraints = model.constraints.length > 0
    ? model.constraints.map((constraint) => `- ${escapeMarkdown(constraint.description)}`).join('\n')
    : '- None recorded.'
  const constraintsSection = `## Constraints

${constraints}
`

  const modelAssumptions = model.assumptions ?? []
  const assumptions = modelAssumptions.length > 0
    ? modelAssumptions.map((assumption) => `- ${escapeMarkdown(assumption)}`).join('\n')
    : '- None recorded.'
  const assumptionsSection = `## Assumptions

${assumptions}
`

  const docsList = generatedDocs && generatedDocs.length > 0
    ? generatedDocs.map((p) => `- \`${escapeMarkdown(p)}\``).join('\n')
    : '- None recorded.'
  const docsSection = `## Generated Documents

${docsList}
`

  const nextStepsSection = `## Next Steps

- [ ] Review \`design.md\` and \`behavior.md\` for constraint sufficiency
- [ ] Run \`/openflow-writing-plan ${escapeMarkdown(session.feature)}\` when ready for implementation
`

  return header + '\n' + constraintsSection + '\n' + assumptionsSection + '\n' + docsSection + '\n' + nextStepsSection
}
