import * as path from 'node:path'
import { z } from 'zod'
import type { OpenFlowConfig, SecurityCheckType, QualityCheckType } from './types.js'
import { defaultConfig } from './types.js'
import { validateConfigPath } from './utils/security.js'
import {
  ensureArchiveUnitDir,
  ensureChangeUnitDir,
  resolveArchiveUnitDir,
  resolveChangeUnitDir,
} from './utils/change-units.js'

export const LEGACY_DESIGN_OUTPUT_DIR = 'docs/design'
export const LEGACY_REQUIREMENTS_OUTPUT_DIR = 'docs/requirements'
export const CHANGE_WORKSPACE_DIR = 'docs/changes'
export const CURRENT_SPEC_DIR = 'docs/current/spec'
export const CURRENT_WORKFLOW_DIR = 'docs/current/workflow'

export type ChangeArtifactKind = 'design' | 'proposal' | 'decisions' | 'prd' | 'plan' | 'behavior'

const CHANGE_ARTIFACT_FILENAMES: Readonly<Record<ChangeArtifactKind, string>> = Object.freeze({
  design: 'design.md',
  proposal: 'proposal.md',
  decisions: 'decisions.md',
  prd: 'prd.md',
  plan: 'plan.md',
  behavior: 'behavior.md',
})

const VALID_SECURITY_CHECKS = ['secret', 'vuln', 'dependency'] as const satisfies readonly SecurityCheckType[]
const VALID_QUALITY_CHECKS = ['lint', 'typecheck', 'test', 'format'] as const satisfies readonly QualityCheckType[]

const configPathSchema = z.string().refine((value) => {
  try {
    validateConfigPath(value)
    return true
  } catch {
    return false
  }
})

const nonEmptyStringArraySchema = z.array(z.string()).min(1)

const adapterConfigSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  timeout: z.number().min(1).optional(),
  onMissing: z.enum(['skip', 'fail']).optional(),
}).partial()

const openFlowConfigOverrideSchema: z.ZodType<Record<string, unknown>> = z.object({
  feature: z.object({
    enabled: z.boolean().optional(),
    output_dir: configPathSchema.optional(),
    auto_trigger: z.boolean().optional(),
    trigger_mode: z.enum(['smart', 'always', 'never']).optional(),
    generate_prd: z.boolean().optional(),
    prd_output_dir: configPathSchema.optional(),
    closure: z.object({
      enabled: z.boolean().optional(),
      auto_transition: z.boolean().optional(),
      strong_signals: nonEmptyStringArraySchema.optional(),
      weak_signals: nonEmptyStringArraySchema.optional(),
      weak_signal_threshold: z.number().min(1).max(10).optional(),
    }).partial().optional(),
  }).partial().optional(),
  tdd: z.object({
    enabled: z.boolean().optional(),
    expand_threshold: z.number().min(1).max(100).optional(),
  }).partial().optional(),
  verification: z.object({
    in_plan: z.boolean().optional(),
    security: z.array(z.enum(VALID_SECURITY_CHECKS)).optional(),
    quality: z.array(z.enum(VALID_QUALITY_CHECKS)).optional(),
    auto_fix: z.boolean().optional(),
    completion_prompt: z.boolean().optional(),
    allow_accept_failures: z.boolean().optional(),
    adapters: z.object({
      secret: adapterConfigSchema.optional(),
      vuln: adapterConfigSchema.optional(),
      dependency: adapterConfigSchema.optional(),
      consistency: z.object({
        drift_check: z.boolean().optional(),
        current_constraints: z.boolean().optional(),
        decisions_constraints: z.boolean().optional(),
        symbol_level: z.boolean().optional(),
      }).partial().optional(),
    }).partial().optional(),
  }).partial().optional(),
  archive: z.object({
    enabled: z.boolean().optional(),
    output_dir: configPathSchema.optional(),
    drift_check: z.boolean().optional(),
    auto_promote_current: z.boolean().optional(),
  }).partial().optional(),
  acceptance: z.object({
    enabled: z.boolean().optional(),
    trigger_words_zh: nonEmptyStringArraySchema.optional(),
    trigger_words_en: nonEmptyStringArraySchema.optional(),
    doc_sync_prompt: z.boolean().optional(),
    drift_detection: z.boolean().optional(),
  }).partial().optional(),
  writingPlan: z.object({
    enabled: z.boolean().optional(),
  }).partial().optional(),
  harden: z.object({
    enabled: z.boolean().optional(),
    maxRounds: z.number().min(1).optional(),
    tokenBudgetPerRound: z.number().min(1).optional(),
    tokenBudgetTotal: z.number().min(1).optional(),
    reviewerModel: z.string().optional(),
    executorModel: z.string().optional(),
  }).partial().optional(),
  guardian: z.object({
    enabled: z.boolean().optional(),
    auto_start: z.boolean().optional(),
    auto_fix: z.boolean().optional(),
    max_retries: z.number().min(1).max(10).optional(),
    state_dir: configPathSchema.optional(),
    contract_cache: z.boolean().optional(),
  }).partial().optional(),
  executionQualityPolicy: z.object({
    enabled: z.boolean().optional(),
    defaultMode: z.enum(['fast', 'balanced', 'strict']).optional(),
  }).partial().optional(),
}).partial()

function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target } as T

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key]
      const targetValue = result[key]

      if (
        sourceValue !== undefined &&
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue !== undefined &&
        targetValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        (result as Record<string, unknown>)[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        ) as unknown as T[keyof T]
      } else if (sourceValue !== undefined) {
        (result as Record<string, unknown>)[key] = sourceValue
      }
    }
  }

  return result
}

function validateConfigValue(config: unknown): config is Record<string, unknown> {
  return openFlowConfigOverrideSchema.safeParse(config).success
}

export function loadConfig(opencodeConfig?: Record<string, unknown>): OpenFlowConfig {
  const openflowConfig = opencodeConfig?.openflow

  if (!openflowConfig) {
    return { ...defaultConfig }
  }

  if (!validateConfigValue(openflowConfig)) {
    console.warn('[OpenFlow] Invalid configuration detected, using defaults')
    return { ...defaultConfig }
  }

  const merged = deepMerge(
    defaultConfig as unknown as Record<string, unknown>,
    openflowConfig as unknown as Record<string, unknown>
  )
  return merged as unknown as OpenFlowConfig
}

export function getBuildsPath(projectDir: string): string {
  return `${projectDir}/.sisyphus/builds`
}

export function getBuildPath(projectDir: string, buildId: string): string {
  return `${projectDir}/.sisyphus/builds/${buildId}`
}

export function getChangesPath(projectDir: string, buildId: string): string {
  return `${projectDir}/.sisyphus/builds/${buildId}/changes.json`
}

export function getDesignPath(projectDir: string, featureName: string, config?: OpenFlowConfig): string {
  const outputDir = config?.feature?.output_dir ?? defaultConfig.feature.output_dir
  return path.join(projectDir, outputDir, featureName)
}

export function getLegacyDesignPath(projectDir: string, featureName: string): string {
  return path.join(projectDir, LEGACY_DESIGN_OUTPUT_DIR, featureName)
}

export async function getArchivePath(projectDir: string, featureName: string, config?: OpenFlowConfig): Promise<string> {
  const outputDir = config?.archive?.output_dir ?? defaultConfig.archive.output_dir
  const archiveDir = await resolveArchiveUnitDir(projectDir, featureName)
  return path.join(projectDir, outputDir, archiveDir)
}

export function getAcceptanceStatePath(projectDir: string): string {
  return path.join(projectDir, '.sisyphus', 'acceptance.local.md')
}

export function getPlanPath(projectDir: string, featureName: string): string {
  return path.join(projectDir, '.sisyphus', 'plans', `${featureName}.md`)
}

export async function getChangeWorkspacePath(projectDir: string, featureName: string): Promise<string> {
  const changeDir = await resolveChangeUnitDir(projectDir, featureName)
  return path.join(projectDir, CHANGE_WORKSPACE_DIR, changeDir)
}

export async function getChangeDesignPath(projectDir: string, featureName: string): Promise<string> {
  return getChangeDocumentPath(projectDir, featureName, 'design')
}

export async function getChangeRequirementsPath(projectDir: string, featureName: string): Promise<string> {
  return getChangeDocumentPath(projectDir, featureName, 'prd')
}

export async function getChangePlansPath(projectDir: string, featureName: string): Promise<string> {
  return getChangeDocumentPath(projectDir, featureName, 'plan')
}

export async function getChangeBehaviorPath(projectDir: string, featureName: string): Promise<string> {
  return getChangeDocumentPath(projectDir, featureName, 'behavior')
}

export async function getChangeDocumentPath(projectDir: string, featureName: string, kind: ChangeArtifactKind): Promise<string> {
  const workspacePath = await getChangeWorkspacePath(projectDir, featureName)
  return path.join(workspacePath, CHANGE_ARTIFACT_FILENAMES[kind])
}

export function getRequirementsPath(projectDir: string, featureName: string, config?: OpenFlowConfig): string {
  const outputDir = config?.feature?.prd_output_dir ?? defaultConfig.feature.prd_output_dir
  return path.join(projectDir, outputDir, featureName)
}

export function getLegacyRequirementsPath(projectDir: string, featureName: string): string {
  return path.join(projectDir, LEGACY_REQUIREMENTS_OUTPUT_DIR, featureName)
}

export async function getDesignCandidatePaths(projectDir: string, featureName: string, config?: OpenFlowConfig): Promise<string[]> {
  const changeWorkspacePath = await getChangeWorkspacePath(projectDir, featureName)
  const changeDesignPath = await getChangeDocumentPath(projectDir, featureName, 'design')
  return uniquePaths([
    changeDesignPath,
    path.join(changeWorkspacePath, 'design'),
    getDesignPath(projectDir, featureName, config),
    getLegacyDesignPath(projectDir, featureName),
  ])
}

export async function getRequirementsCandidatePaths(projectDir: string, featureName: string, config?: OpenFlowConfig): Promise<string[]> {
  const changeWorkspacePath = await getChangeWorkspacePath(projectDir, featureName)
  const changeRequirementsPath = await getChangeDocumentPath(projectDir, featureName, 'prd')
  return uniquePaths([
    changeRequirementsPath,
    path.join(changeWorkspacePath, 'requirements'),
    getRequirementsPath(projectDir, featureName, config),
    getLegacyRequirementsPath(projectDir, featureName),
  ])
}

export async function getBehaviorCandidatePaths(projectDir: string, featureName: string): Promise<string[]> {
  const changeWorkspacePath = await getChangeWorkspacePath(projectDir, featureName)
  const changeBehaviorPath = await getChangeDocumentPath(projectDir, featureName, 'behavior')
  return uniquePaths([
    changeBehaviorPath,
    path.join(changeWorkspacePath, 'behavior'),
  ])
}

export async function ensureChangeWorkspacePath(projectDir: string, featureName: string): Promise<string> {
  const changeDir = await ensureChangeUnitDir(projectDir, featureName)
  return path.join(projectDir, CHANGE_WORKSPACE_DIR, changeDir)
}

export async function ensureArchivePath(projectDir: string, featureName: string, config?: OpenFlowConfig): Promise<string> {
  const outputDir = config?.archive?.output_dir ?? defaultConfig.archive.output_dir
  const archiveDir = await ensureArchiveUnitDir(projectDir, featureName)
  return path.join(projectDir, outputDir, archiveDir)
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)]
}

export { defaultConfig }
