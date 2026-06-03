import * as fs from 'node:fs/promises'
import type { OpenFlowContext } from '../types.js'
import {
  getChangePlansPath,
  getDesignCandidatePaths,
  getPlanPath,
  getRequirementsCandidatePaths,
} from '../config.js'
import { parsePlanProgress } from '../plan/parser.js'
import { fileExists } from './file-utils.js'

const FEATURE_PATTERNS = [
  /\.(?:openflow|sisyphus)[\\/]plans[\\/]([^\\/\s]+)\.md/i,
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

  // ── Completion Gate: read plan progress ────────────────────────────────────
  const completionGateSection = feature
    ? await buildCompletionGateSection(ctx, feature)
    : ''

  return `

---
## OpenFlow Implementation Context

### Required Sources
${sources.join('\n')}

### Hard Constraints
- **MUST call \`/openflow-implement${featureHint}\` BEFORE starting any code changes.** This creates an isolated git worktree and an ImplementationRun. Do not edit files in the main worktree directly.
- Read every existing source above before writing code.
- Use the active plan and current/change docs as the source of truth.
- Follow TDD when tests are applicable: RED -> GREEN -> REFACTOR.
- Before any completion claim, call \`skill(name="openflow-quality-gate"${featureHint})\` and use fresh evidence.
- If implementation drifts from design or requirements, update the docs or surface the drift before archive.
${completionGateSection}
---

${currentPrompt}`
}

/**
 * Build the Completion Gate prompt section from the current plan progress.
 * This enforces that AI marks plan.md checkboxes as tasks are completed.
 */
async function buildCompletionGateSection(
  ctx: OpenFlowContext,
  feature: string
): Promise<string> {
  const planContent = await readPlanContent(ctx, feature)
  if (!planContent) return ''

  const progress = parsePlanProgress(planContent)
  if (progress.totalTasks === 0) return ''

  const progressLine = progress.allCompleted
    ? `All ${progress.totalTasks} plan tasks are completed.`
    : `${progress.uncheckedTasks} of ${progress.totalTasks} plan tasks remain unchecked.`

  return `

### Completion Gate (Plan Progress)
${progressLine}

**plan.md is the single source of truth for task progress.** todowrite is only a session scratchpad.

After completing each plan task:
1. Verify the task implementation and tests pass.
2. Edit plan.md: change \`- [ ]\` to \`- [x]\` for that task.
3. Re-read plan.md to confirm the checkbox is updated.
4. **Do not continue to the next task until the above is done.**

Sub-agents (fixer, explorer, reviewer) MUST NOT edit plan.md. Only the orchestrator session may mark tasks as completed.`
}

/**
 * Read plan.md content from the canonical location.
 * Tries change workspace plan first, then sisyphus plans dir.
 */
async function readPlanContent(
  ctx: OpenFlowContext,
  feature: string
): Promise<string | null> {
  // Try change workspace plan first
  const changePlansPath = await getChangePlansPath(ctx.directory, feature, ctx.config)
  if (await fileExists(changePlansPath)) {
    try {
      return await fs.readFile(changePlansPath, 'utf-8')
    } catch { /* fall through */ }
  }

  // Try sisyphus plans dir
  const planPath = getPlanPath(ctx.directory, feature, ctx.config)
  if (await fileExists(planPath)) {
    try {
      return await fs.readFile(planPath, 'utf-8')
    } catch { /* fall through */ }
  }

  return null
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
