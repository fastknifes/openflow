import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { escapeMarkdown } from '../../utils/security.js'
import { logger } from '../../utils/logger.js'
import type { OpenFlowContext } from '../../types.js'
import {
  readRequirementModelFromWorkspace,
  designInfoFromRequirementModel,
  extractDesignInfo,
} from './workflow/rules/prd-extractor.js'
import {
  fillPrdTemplate,
  getDefaultPrdTemplate,
  assertPrdHasSubstantiveSource,
} from './workflow/rules/prd-template.js'
import {
  resolveWorkspacePaths,
  resolveFeaturePhaseConfig,
  findPreferredDocument,
} from './workflow/rules/prd-utils.js'

export interface PrdGenerationOptions {
  feature: string
  projectDir: string
  config: OpenFlowContext['config']
}

export interface DocumentBundleDecision {
  generateDesign: true
  generatePrd: boolean
  generateDecisions: boolean
  reason: string
}

/**
 * Generate PRD document from design documents
 */
export async function generatePrd(options: PrdGenerationOptions): Promise<string> {
  const { feature, projectDir, config } = options

  const date = new Date().toISOString().split('T')[0] || new Date().toISOString()
  const safeFeature = escapeMarkdown(feature)

  // Resolve workspace paths (prefer docs/changes workspace when available)
  const workspace = await resolveWorkspacePaths(projectDir, feature, config)
  const designDir = workspace.designDir
  const prdDir = workspace.requirementsDir

  // Use default template (project-level templates no longer supported)
  const templateContent = getDefaultPrdTemplate()

  // Prefer structured sidecar model, fallback to legacy markdown extraction
  const requirementModel = await readRequirementModelFromWorkspace(designDir)
  const designInfo = requirementModel
    ? designInfoFromRequirementModel(requirementModel)
    : await extractDesignInfo(designDir, findPreferredDocument)

  assertPrdHasSubstantiveSource(feature, designDir, designInfo)

  // Fill template
  const content = fillPrdTemplate(templateContent, {
    feature: safeFeature,
    date,
    designInfo,
  })

  // Write to file
  await fs.mkdir(prdDir, { recursive: true })
  const prdPath = path.join(prdDir, 'prd.md')
  await fs.writeFile(prdPath, content, 'utf-8')

  logger.info('Generated PRD document', { path: prdPath, feature })

  return prdPath
}

/**
 * Check if PRD generation is enabled
 */
export function isPrdGenerationEnabled(config: OpenFlowContext['config']): boolean {
  const featureConfig = resolveFeaturePhaseConfig(config)
  return featureConfig.enabled && featureConfig.generate_prd
}

/**
 * Check if PRD document already exists for a feature
 */
export async function hasPrdDocument(
  projectDir: string,
  feature: string,
  config: OpenFlowContext['config']
): Promise<boolean> {
  const { requirementsDir } = await resolveWorkspacePaths(projectDir, feature, config)
  const prdPath = path.join(requirementsDir, 'prd.md')

  try {
    await fs.access(prdPath)
    return true
  } catch {
    try {
      const entries = await fs.readdir(requirementsDir, { withFileTypes: true })
      return entries.some(entry => entry.isFile() && /^\d{8}-prd\.md$/.test(entry.name))
    } catch {
      return false
    }
  }
}

export async function hasDecisionsDocument(
  projectDir: string,
  feature: string,
  config: OpenFlowContext['config']
): Promise<boolean> {
  const { designDir } = await resolveWorkspacePaths(projectDir, feature, config)

  try {
    await fs.access(path.join(designDir, 'decisions.md'))
    return true
  } catch {
    try {
      const entries = await fs.readdir(designDir, { withFileTypes: true })
      return entries.some(entry => entry.isFile() && /^\d{8}-decisions\.md$/.test(entry.name))
    } catch {
      return false
    }
  }
}

export async function evaluateDocumentBundle(
  projectDir: string,
  feature: string,
  config: OpenFlowContext['config'],
  explicitScope?: Array<'design' | 'prd' | 'decisions'>
): Promise<DocumentBundleDecision> {
  if (explicitScope && explicitScope.length > 0) {
    return {
      generateDesign: true,
      generatePrd: explicitScope.includes('prd'),
      generateDecisions: explicitScope.includes('decisions'),
      reason: 'explicit scope provided by user',
    }
  }

  const { designDir } = await resolveWorkspacePaths(projectDir, feature, config)
  const requirementModel = await readRequirementModelFromWorkspace(designDir)

  if (requirementModel) {
    const hasProductLevelSignal =
      Boolean(requirementModel.targetUsers?.trim()) &&
      (
        requirementModel.acceptanceCriteria.length >= 3 ||
        requirementModel.goals.some((g) => /用户|user|客户|customer|价值|value|体验|experience/i.test(g)) ||
        requirementModel.scopeBoundary.inScope.length >= 3
      )

    const generateDecisions =
      requirementModel.constraints.length >= 3 ||
      ((requirementModel.expectedModules?.length ?? 0) >= 2)

    if (!hasProductLevelSignal && !generateDecisions) {
      return {
        generateDesign: true,
        generatePrd: false,
        generateDecisions: false,
        reason: 'insufficient product-level signals, generating design only',
      }
    }

    return {
      generateDesign: true,
      generatePrd: hasProductLevelSignal,
      generateDecisions,
      reason: 'structured bundle decision from requirement model metadata',
    }
  }

  const designInfo = await extractDesignInfo(designDir, findPreferredDocument)

  const hasPrdSignal =
    designInfo.problemStatement.trim().length > 0 ||
    designInfo.successCriteria.length > 0 ||
    /(user|用户|value|价值|验收|acceptance|goal|目标)/i.test(designInfo.overview)

  if (!hasPrdSignal) {
    return {
      generateDesign: true,
      generatePrd: false,
      generateDecisions: false,
      reason: 'insufficient semantic signals, generating design only',
    }
  }

  return {
    generateDesign: true,
    generatePrd: hasPrdSignal,
    generateDecisions: false,
    reason: 'semantic bundle decision from design context',
  }
}

export async function ensureDecisionsDocument(
  projectDir: string,
  feature: string,
  config: OpenFlowContext['config']
): Promise<string> {
  const { designDir } = await resolveWorkspacePaths(projectDir, feature, config)
  await fs.mkdir(designDir, { recursive: true })
  const decisionsPath = path.join(designDir, 'decisions.md')
  const requirementModel = await readRequirementModelFromWorkspace(designDir)
  const keyDecisions = requirementModel?.constraints
    .map((constraint) => `- [ ] ${constraint.description} (${constraint.severity}/${constraint.category})`)
    .join('\n')

  if (!keyDecisions) {
    throw new Error(
      `Cannot generate decisions document for '${feature}' because no concrete constraints or decisions were found in ${designDir}.`
    )
  }

  const content = `# ${feature} - Decisions

**Date**: ${new Date().toISOString().split('T')[0] || new Date().toISOString()}
**Status**: Draft

## Decision Summary

- Document generated by OpenFlow semantic bundle policy.
- Design is the primary source of truth.

## Key Decisions

${keyDecisions}

## Trade-offs

- Option considered:
- Why chosen:
- Risk and mitigation:
`

  await fs.writeFile(decisionsPath, content, 'utf-8')
  logger.info('Generated decisions document', { feature, path: decisionsPath })
  return decisionsPath
}
