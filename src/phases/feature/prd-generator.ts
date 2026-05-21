import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { escapeMarkdown, findLatestDocument, createSafePath, sanitizeFeatureName } from '../../utils/security.js'
import { logger } from '../../utils/logger.js'
import type { OpenFlowContext } from '../../types.js'
import { defaultConfig } from '../../types.js'
import { getChangeWorkspacePath } from '../../config.js'
import { RequirementModelSchema, type RequirementModel } from './requirement-model.js'

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

const PRD_TEMPLATE_PATH = 'templates/prd.md'

type FeaturePhaseConfig = {
  enabled: boolean
  generate_prd: boolean
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
  
  // Read template
  const templateContent = await readPrdTemplate(projectDir)
  
  // Prefer structured sidecar model, fallback to legacy markdown extraction
  const requirementModel = await readRequirementModelFromWorkspace(designDir)
  const designInfo = requirementModel
    ? designInfoFromRequirementModel(requirementModel)
    : await extractDesignInfo(designDir)

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

async function readPrdTemplate(projectDir: string): Promise<string> {
  // Try to read from project templates first, then fallback to package templates
  const projectTemplatePath = path.join(projectDir, PRD_TEMPLATE_PATH)
  
  try {
    return await fs.readFile(projectTemplatePath, 'utf-8')
  } catch {
    // Fallback to default template
    return getDefaultPrdTemplate()
  }
}

interface DesignInfo {
  problemStatement: string
  successCriteria: string[]
  overview: string
  components: string[]
  goals: string[]
  constraints: string[]
  outOfScope: string[]
}

async function readRequirementModelFromWorkspace(designDir: string): Promise<RequirementModel | null> {
  for (const fileName of ['design.meta.json', 'requirements.json']) {
    const filePath = path.join(designDir, fileName)

    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return RequirementModelSchema.parse(JSON.parse(content) as unknown)
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        continue
      }

      logger.debug('Failed to read requirement model for PRD generation', {
        designDir,
        filePath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return null
}

function designInfoFromRequirementModel(model: RequirementModel): DesignInfo {
  const constraints = model.constraints.map((constraint) => (
    `[${constraint.severity.toUpperCase()} / ${constraint.category}] ${constraint.description}`
  ))

  return {
    problemStatement: model.problemStatement ?? model.feature,
    successCriteria: model.acceptanceCriteria.map((criterion) => criterion.description),
    overview: '',
    components: model.scopeBoundary.inScope,
    goals: model.goals,
    constraints,
    outOfScope: model.scopeBoundary.outOfScope,
  }
}

async function extractDesignInfo(designDir: string): Promise<DesignInfo> {
  const info: DesignInfo = {
    problemStatement: '',
    successCriteria: [],
    overview: '',
    components: [],
    goals: [],
    constraints: [],
    outOfScope: [],
  }
  
  // Try to read proposal.md for problem statement and success criteria
  const proposalPath = await findPreferredDocument(designDir, ['proposal.md'], /^\d{8}-proposal\.md$/)
  if (proposalPath) {
    try {
      const content = await fs.readFile(proposalPath, 'utf-8')
      info.problemStatement = extractSection(content, 'Problem Statement', '## Success Criteria')
      info.successCriteria = extractChecklist(content, 'Success Criteria')
    } catch (error) {
      logger.debug('Failed to extract proposal details for PRD generation', {
        proposalPath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  
  // Try to read design.md for overview and components
  const designPath = await findPreferredDocument(designDir, ['design.md'], /^\d{8}-design\.md$/)
  if (designPath) {
    try {
      const content = await fs.readFile(designPath, 'utf-8')
      info.overview = extractSection(content, 'Overview', '## Architecture')
      info.components = extractComponentNames(content)
    } catch (error) {
      logger.debug('Failed to extract design details for PRD generation', {
        designPath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  
  return info
}

function extractSection(content: string, startMarker: string, endMarker: string): string {
  const startIdx = content.indexOf(`## ${startMarker}`)
  if (startIdx === -1) return ''
  
  const endIdx = content.indexOf(endMarker, startIdx)
  const sectionContent = endIdx === -1 
    ? content.substring(startIdx) 
    : content.substring(startIdx, endIdx)
  
  // Clean up the section
  return sectionContent
    .replace(`## ${startMarker}`, '')
    .replace(/\n+/g, ' ')
    .trim()
    .substring(0, 500) // Limit length
}

function extractChecklist(content: string, sectionName: string): string[] {
  const startIdx = content.indexOf(`## ${sectionName}`)
  if (startIdx === -1) return []
  
  const endIdx = content.indexOf('##', startIdx + 1)
  const sectionContent = endIdx === -1 
    ? content.substring(startIdx) 
    : content.substring(startIdx, endIdx)
  
  const items: string[] = []
  const lines = sectionContent.split('\n')
  
  for (const line of lines) {
    const match = line.match(/^-\s*\[?\s*[x\s]?\s*\]?\s*(.+)$/)
    if (match && match[1]) {
      const trimmed = match[1].trim()
      if (trimmed) {
        items.push(trimmed)
      }
    }
  }
  
  return items
}

function extractComponentNames(content: string): string[] {
  const components: string[] = []
  const lines = content.split('\n')
  
  for (const line of lines) {
    const match = line.match(/^###\s+(.+)$/)
    if (match && match[1]) {
      const name = match[1]
      if (!name.includes('Component Name')) {
        components.push(name.trim())
      }
    }
  }
  
  return components
}

interface TemplateData {
  feature: string
  date: string
  designInfo: DesignInfo
}

function fillPrdTemplate(template: string, data: TemplateData): string {
  let result = template
  
  // Replace simple placeholders
  result = result.replace(/\{\{feature\}\}/g, data.feature)
  result = result.replace(/\{\{date\}\}/g, data.date)
  result = result.replace(/\{\{priority\}\}/g, 'P1') // Default priority
  
  // Fill in sections from design info
  const backgroundAndGoals = buildBackgroundAndGoalsSection(data.designInfo)
  if (backgroundAndGoals) {
    result = fillSection(result, '1.1 背景与目标', backgroundAndGoals)
  }
  
  const overviewAndConstraints = buildOverviewAndConstraintsSection(data.designInfo)
  if (overviewAndConstraints) {
    result = fillSection(result, '1.2 功能概述', overviewAndConstraints)
  }
  
  if (data.designInfo.successCriteria.length > 0) {
    const criteriaList = data.designInfo.successCriteria
      .map(c => `- [ ] ${c}`)
      .join('\n')
    result = fillSection(result, '3.1 功能验收', criteriaList)
  }
  
  if (data.designInfo.components.length > 0) {
    const componentList = data.designInfo.components
      .map(c => `- ${c}`)
      .join('\n')
    result = fillSection(result, '4.1 In Scope', componentList)
  }

  if (data.designInfo.outOfScope.length > 0) {
    const outOfScopeList = data.designInfo.outOfScope
      .map(item => `- ${item}`)
      .join('\n')
    result = fillSection(result, '4.2 Out of Scope', outOfScopeList)
  }
  
  return result
}

function buildBackgroundAndGoalsSection(designInfo: DesignInfo): string {
  const sections: string[] = []

  if (designInfo.problemStatement) {
    sections.push(designInfo.problemStatement)
  }

  if (designInfo.goals.length > 0) {
    sections.push(`Goals:\n${designInfo.goals.map((goal) => `- ${goal}`).join('\n')}`)
  }

  return sections.join('\n\n').trim()
}

function buildOverviewAndConstraintsSection(designInfo: DesignInfo): string {
  const sections: string[] = []

  if (designInfo.overview) {
    sections.push(designInfo.overview)
  }

  if (designInfo.constraints.length > 0) {
    sections.push(`Constraints:\n${designInfo.constraints.map((constraint) => `- ${constraint}`).join('\n')}`)
  }

  return sections.join('\n\n').trim()
}

function assertPrdHasSubstantiveSource(feature: string, designDir: string, designInfo: DesignInfo): void {
  const hasSubstantiveSource =
    designInfo.problemStatement.trim().length > 0 ||
    designInfo.overview.trim().length > 0 ||
    designInfo.goals.length > 0 ||
    designInfo.successCriteria.length > 0 ||
    designInfo.components.length > 0 ||
    designInfo.constraints.length > 0 ||
    designInfo.outOfScope.length > 0

  if (!hasSubstantiveSource) {
    throw new Error(
      `Cannot generate PRD for '${feature}' because no substantive design or requirement model was found in ${designDir}.`
    )
  }
}

function fillSection(content: string, sectionName: string, value: string): string {
  const sectionPattern = new RegExp(
    `(###\\s+${escapeRegExp(sectionName)}\\s*\\n\\n)([\\s\\S]*?)(?=\\n###\\s+|\\n##\\s+|$)`
  )
  
  return content.replace(sectionPattern, (_match, prefix: string) => `${prefix}${value}\n`)
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getDefaultPrdTemplate(): string {
  return `# {{feature}} - Product Requirements Document

**Date**: {{date}}
**Version**: 1.0
**Priority**: {{priority}}
**Status**: Draft

---

## 1. 功能描述

### 1.1 背景与目标

*此功能要解决什么问题？为什么需要这个功能？*

### 1.2 功能概述

*简要描述功能的核心内容*

---

## 2. 用户故事

| ID | 角色 | 需求 | 目的 |
|----|------|------|------|
| US-001 | {{role}} | {{need}} | {{goal}} |
| US-002 | {{role}} | {{need}} | {{goal}} |

---

## 3. 验收标准

### 3.1 功能验收

- [ ] 验收标准 1
- [ ] 验收标准 2
- [ ] 验收标准 3

### 3.2 非功能验收

- [ ] 性能要求
- [ ] 安全要求
- [ ] 兼容性要求

---

## 4. 功能范围

### 4.1 In Scope

- 功能点 1
- 功能点 2
- 功能点 3

### 4.2 Out of Scope

- 非功能点 1
- 非功能点 2

---

## 5. 优先级

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 核心功能 | P0 | 必须实现 |
| 重要功能 | P1 | 应该实现 |
| 增强功能 | P2 | 可以实现 |
| 未来功能 | P3 | 暂不实现 |

---

## 6. 相关文档

- [设计文档](./design.md)
- [执行计划](../../.sisyphus/plans/{{feature}}.md)

---

## 7. 变更历史

| 日期 | 版本 | 变更内容 | 作者 |
|------|------|----------|------|
| {{date}} | 1.0 | 初始版本 | - |
`
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
    const generatePrd =
      requirementModel.constraints.length > 0 ||
      requirementModel.acceptanceCriteria.length > 0

    const generateDecisions =
      requirementModel.constraints.length >= 3 ||
      ((requirementModel.expectedModules?.length ?? 0) >= 2)

    if (!generatePrd && !generateDecisions) {
      return {
        generateDesign: true,
        generatePrd: false,
        generateDecisions: false,
        reason: 'insufficient requirement model signals, generating design only',
      }
    }

    return {
      generateDesign: true,
      generatePrd,
      generateDecisions,
      reason: 'structured bundle decision from requirement model metadata',
    }
  }

  const designInfo = await extractDesignInfo(designDir)

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

async function resolveWorkspacePaths(
  projectDir: string,
  feature: string,
  config: OpenFlowContext['config']
): Promise<{ designDir: string; requirementsDir: string }> {
  const changeWorkspaceDir = await findExistingChangeWorkspacePath(projectDir, feature)

  if (changeWorkspaceDir && await hasAnyDesignDoc(changeWorkspaceDir)) {
    return {
      designDir: changeWorkspaceDir,
      requirementsDir: changeWorkspaceDir,
    }
  }

  const changesDir = config.paths?.changes ?? defaultConfig.paths.changes
  return {
    designDir: createSafePath(projectDir, changesDir, feature),
    requirementsDir: createSafePath(projectDir, changesDir, feature),
  }
}

function resolveFeaturePhaseConfig(config: OpenFlowContext['config']): FeaturePhaseConfig {
  const candidates: unknown[] = Object.values(config)

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') {
      continue
    }

    const value = candidate as Partial<FeaturePhaseConfig>
    if (
      typeof value.enabled === 'boolean'
      && typeof value.generate_prd === 'boolean'
    ) {
      return value as FeaturePhaseConfig
    }
  }

  throw new Error('Feature phase configuration is missing required output settings.')
}

async function findExistingChangeWorkspacePath(projectDir: string, feature: string): Promise<string | null> {
  const sanitizedFeature = sanitizeFeatureName(feature)
  const candidates = [await getChangeWorkspacePath(projectDir, sanitizedFeature)]
  const changesDir = createSafePath(projectDir, defaultConfig.paths.changes)

  try {
    const entries = await fs.readdir(changesDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }

      if (entry.name === sanitizedFeature || entry.name.endsWith(`-${sanitizedFeature}`)) {
        candidates.push(path.join(changesDir, entry.name))
      }
    }
  } catch {
    void 0
  }

  const uniqueCandidates = [...new Set(candidates)].sort((left, right) => right.localeCompare(left))
  for (const candidate of uniqueCandidates) {
    if (await hasAnyDesignDoc(candidate)) {
      return candidate
    }
  }

  return null
}

async function hasAnyDesignDoc(designDir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(designDir, { withFileTypes: true })
    return entries.some(entry => entry.isFile() && /^(?:design|proposal|decisions)\.md$/i.test(entry.name))
      || entries.some(entry => entry.isFile() && /^\d{8}-(proposal|design|decisions)\.md$/i.test(entry.name))
  } catch {
    return false
  }
}

async function findPreferredDocument(dir: string, preferredNames: string[], fallbackPattern: RegExp): Promise<string | null> {
  for (const preferredName of preferredNames) {
    const preferredPath = path.join(dir, preferredName)
    try {
      await fs.access(preferredPath)
      return preferredPath
    } catch {
      void 0
    }
  }

  return findLatestDocument(dir, fallbackPattern)
}
