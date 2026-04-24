import type { OpenFlowContext } from '../types.js'
import {
  getChangePlansPath,
  getDesignCandidatePaths,
  getPlanPath,
  getRequirementsCandidatePaths,
} from '../config.js'
import { fileExists } from './file-utils.js'

const FEATURE_PATTERNS = [
  /\.sisyphus[\\/]plans[\\/]([^\\/\s]+)\.md/i,
  /docs[\\/]current[\\/]design[\\/]([^\\/\s]+)/i,
  /docs[\\/]current[\\/]requirements[\\/]([^\\/\s]+)/i,
  /docs[\\/]changes[\\/]([^\\/\s]+)[\\/](?:design|proposal|decisions|prd|plan)\.md/i,
  /docs[\\/]changes[\\/]([^\\/\s]+)[\\/](?:design|requirements|plans)/i,
  /docs[\\/]design[\\/]([^\\/\s]+)/i,
  /docs[\\/]requirements[\\/]([^\\/\s]+)/i,
  /feature[:=\s"']+([a-z0-9_-]+)/i,
]

export async function buildImplementationContextPrompt(
  ctx: OpenFlowContext,
  currentPrompt: string
): Promise<string> {
  const feature = extractFeature(currentPrompt)
  const sources = feature
    ? await getFeatureSources(ctx, feature)
    : ['- Read the relevant OpenFlow plan, design docs, and requirements docs before coding.']

  const featureHint = feature ? `, user_message="${feature}"` : ''

  return `

---
## OpenFlow Implementation Context

### Required Sources
${sources.join('\n')}

### Hard Constraints
- Read every existing source above before writing code.
- Use the active plan and current/change docs as the source of truth.
- Follow TDD when tests are applicable: RED -> GREEN -> REFACTOR.
- Before any completion claim, call \`skill(name="openflow/verify"${featureHint})\` and use fresh evidence.
- If implementation drifts from design or requirements, update the docs or surface the drift before archive.

---

${currentPrompt}`
}

function extractFeature(prompt: string): string | undefined {
  for (const pattern of FEATURE_PATTERNS) {
    const match = prompt.match(pattern)
    if (match?.[1]) return normalizeFeatureFromPath(match[1])
  }

  return undefined
}

function normalizeFeatureFromPath(value: string): string {
  return value.replace(/^\d{4}-\d{2}-\d{2}-/, '')
}

async function getFeatureSources(ctx: OpenFlowContext, feature: string): Promise<string[]> {
  const items: string[] = []
  const planPath = getPlanPath(ctx.directory, feature)
  const changePlansPath = await getChangePlansPath(ctx.directory, feature)
  const designPaths = await getDesignCandidatePaths(ctx.directory, feature, ctx.config)
  const requirementsPaths = await getRequirementsCandidatePaths(ctx.directory, feature, ctx.config)

  if (await fileExists(planPath)) {
    items.push(`- Plan: \`${planPath}\``)
  }

  if (await fileExists(changePlansPath)) {
    items.push(`- Change plans: \`${changePlansPath}\``)
  }

  for (const designPath of designPaths) {
    if (await fileExists(designPath)) {
      items.push(`- Design: \`${designPath}\``)
      break
    }
  }

  for (const requirementsPath of requirementsPaths) {
    if (await fileExists(requirementsPath)) {
      items.push(`- Requirements: \`${requirementsPath}\``)
      break
    }
  }

  if (items.length === 0) {
    items.push(`- Feature: \`${feature}\` (no concrete OpenFlow artifact paths were resolved from disk)`)
  }

  return items
}
