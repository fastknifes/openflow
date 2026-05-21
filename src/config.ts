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

// Path constants removed — all paths now come from config.paths or defaultConfig.paths

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

const pathsConfigSchema = z.object({
  changes: configPathSchema.optional(),
  archive: configPathSchema.optional(),
  current_requirements: configPathSchema.optional(),
  current_design: configPathSchema.optional(),
  current_spec: configPathSchema.optional(),
  current_workflow: configPathSchema.optional(),
  builds: configPathSchema.optional(),
  plans: configPathSchema.optional(),
  acceptance_state: configPathSchema.optional(),
  feature_state: configPathSchema.optional(),
  change_units: configPathSchema.optional(),
  guardian_state: configPathSchema.optional(),
  boulder_state: configPathSchema.optional(),
  evidence_dir: configPathSchema.optional(),
  implementation_runs: configPathSchema.optional(),
  worktree_dir: configPathSchema.optional(),
}).strict().optional()

const openFlowConfigOverrideSchema: z.ZodType<Record<string, unknown>> = z.object({
  paths: pathsConfigSchema,
  feature: z.object({
    enabled: z.boolean().optional(),
    auto_trigger: z.boolean().optional(),
    trigger_mode: z.enum(['smart', 'always', 'never']).optional(),
    generate_prd: z.boolean().optional(),
    closure: z.object({
      enabled: z.boolean().optional(),
      auto_transition: z.boolean().optional(),
      strong_signals: nonEmptyStringArraySchema.optional(),
      weak_signals: nonEmptyStringArraySchema.optional(),
      weak_signal_threshold: z.number().min(1).max(10).optional(),
    }).partial().optional(),
  }).strict().optional(),
  tdd: z.object({
    enabled: z.boolean().optional(),
  }).passthrough().optional(),
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
  }).strict().optional(),
  archive: z.object({
    enabled: z.boolean().optional(),
    drift_check: z.boolean().optional(),
    auto_promote_current: z.boolean().optional(),
  }).strict().optional(),
  acceptance: z.object({
    enabled: z.boolean().optional(),
    trigger_words_zh: nonEmptyStringArraySchema.optional(),
    trigger_words_en: nonEmptyStringArraySchema.optional(),
    doc_sync_prompt: z.boolean().optional(),
    drift_detection: z.boolean().optional(),
  }).strict().optional(),
  writingPlan: z.object({
    enabled: z.boolean().optional(),
  }).strict().optional(),
  harden: z.object({
    enabled: z.boolean().optional(),
    maxRounds: z.number().min(1).optional(),
    tokenBudgetPerRound: z.number().min(1).optional(),
    tokenBudgetTotal: z.number().min(1).optional(),
    maxArgumentRoundsPerFinding: z.number().min(1).optional(),
    reviewerModel: z.string().optional(),
    executorModel: z.string().optional(),
  }).strict().optional(),
  guardian: z.object({
    enabled: z.boolean().optional(),
    auto_start: z.boolean().optional(),
    auto_fix: z.boolean().optional(),
    max_retries: z.number().min(1).max(10).optional(),
    contract_cache: z.boolean().optional(),
  }).strict().optional(),
  executionQualityPolicy: z.object({
    enabled: z.boolean().optional(),
    defaultMode: z.enum(['fast', 'balanced', 'strict']).optional(),
  }).strict().optional(),
}).strict()

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

  // Strip legacy harden token fields before deep-merge
  const sanitized = structuredClone(openflowConfig as Record<string, unknown>)
  if (sanitized.harden && typeof sanitized.harden === 'object' && sanitized.harden !== null) {
    const harden = sanitized.harden as Record<string, unknown>
    delete harden.tokenBudgetPerRound
    delete harden.tokenBudgetTotal
  }

  const merged = deepMerge(
    defaultConfig as unknown as Record<string, unknown>,
    sanitized as unknown as Record<string, unknown>
  )
  return merged as unknown as OpenFlowConfig
}

export function getBuildsPath(projectDir: string, config?: OpenFlowConfig): string {
  return path.join(projectDir, config?.paths.builds ?? defaultConfig.paths.builds)
}

export function getBuildPath(projectDir: string, buildId: string, config?: OpenFlowConfig): string {
  return path.join(getBuildsPath(projectDir, config), buildId)
}

export function getChangesPath(projectDir: string, buildId: string, config?: OpenFlowConfig): string {
  return path.join(getBuildsPath(projectDir, config), `${buildId}/changes.json`)
}

export function getDesignPath(projectDir: string, featureName: string, config?: OpenFlowConfig): string {
  const outputDir = config?.paths.changes ?? defaultConfig.paths.changes
  return path.join(projectDir, outputDir, featureName)
}

export async function getArchivePath(projectDir: string, featureName: string, config?: OpenFlowConfig): Promise<string> {
  const outputDir = config?.paths.archive ?? defaultConfig.paths.archive
  const archiveDir = await resolveArchiveUnitDir(projectDir, featureName, config?.paths.change_units)
  return path.join(projectDir, outputDir, archiveDir)
}

export function getAcceptanceStatePath(projectDir: string, config?: OpenFlowConfig): string {
  return path.join(projectDir, config?.paths.acceptance_state ?? defaultConfig.paths.acceptance_state)
}

export function getPlanPath(projectDir: string, featureName: string, config?: OpenFlowConfig): string {
  return path.join(projectDir, config?.paths.plans ?? defaultConfig.paths.plans, `${featureName}.md`)
}

export async function getChangeWorkspacePath(projectDir: string, featureName: string, config?: OpenFlowConfig): Promise<string> {
  const changeDir = await resolveChangeUnitDir(projectDir, featureName, config?.paths.changes ?? defaultConfig.paths.changes, config?.paths.change_units)
  return path.join(projectDir, config?.paths.changes ?? defaultConfig.paths.changes, changeDir)
}

export async function getChangeDesignPath(projectDir: string, featureName: string, config?: OpenFlowConfig): Promise<string> {
  return getChangeDocumentPath(projectDir, featureName, 'design', config)
}

export async function getChangeRequirementsPath(projectDir: string, featureName: string, config?: OpenFlowConfig): Promise<string> {
  return getChangeDocumentPath(projectDir, featureName, 'prd', config)
}

export async function getChangePlansPath(projectDir: string, featureName: string, config?: OpenFlowConfig): Promise<string> {
  return getChangeDocumentPath(projectDir, featureName, 'plan', config)
}

export async function getChangeBehaviorPath(projectDir: string, featureName: string, config?: OpenFlowConfig): Promise<string> {
  return getChangeDocumentPath(projectDir, featureName, 'behavior', config)
}

export async function getChangeDocumentPath(projectDir: string, featureName: string, kind: ChangeArtifactKind, config?: OpenFlowConfig): Promise<string> {
  const workspacePath = await getChangeWorkspacePath(projectDir, featureName, config)
  return path.join(workspacePath, CHANGE_ARTIFACT_FILENAMES[kind])
}

export function getRequirementsPath(projectDir: string, featureName: string, config?: OpenFlowConfig): string {
  const outputDir = config?.paths.changes ?? defaultConfig.paths.changes
  return path.join(projectDir, outputDir, featureName)
}

export async function getDesignCandidatePaths(projectDir: string, featureName: string, config?: OpenFlowConfig): Promise<string[]> {
  const changeWorkspacePath = await getChangeWorkspacePath(projectDir, featureName, config)
  const changeDesignPath = await getChangeDocumentPath(projectDir, featureName, 'design', config)
  return uniquePaths([
    changeDesignPath,
    path.join(changeWorkspacePath, 'design'),
    getDesignPath(projectDir, featureName, config),
  ])
}

export async function getRequirementsCandidatePaths(projectDir: string, featureName: string, config?: OpenFlowConfig): Promise<string[]> {
  const changeWorkspacePath = await getChangeWorkspacePath(projectDir, featureName, config)
  const changeRequirementsPath = await getChangeDocumentPath(projectDir, featureName, 'prd', config)
  return uniquePaths([
    changeRequirementsPath,
    path.join(changeWorkspacePath, 'requirements'),
    getRequirementsPath(projectDir, featureName, config),
  ])
}

export async function getBehaviorCandidatePaths(projectDir: string, featureName: string, config?: OpenFlowConfig): Promise<string[]> {
  const changeWorkspacePath = await getChangeWorkspacePath(projectDir, featureName, config)
  const changeBehaviorPath = await getChangeDocumentPath(projectDir, featureName, 'behavior', config)
  return uniquePaths([
    changeBehaviorPath,
    path.join(changeWorkspacePath, 'behavior'),
  ])
}

export async function ensureChangeWorkspacePath(projectDir: string, featureName: string, config?: OpenFlowConfig): Promise<string> {
  const changeDir = await ensureChangeUnitDir(projectDir, featureName, config?.paths.change_units)
  return path.join(projectDir, config?.paths.changes ?? defaultConfig.paths.changes, changeDir)
}

export async function ensureArchivePath(projectDir: string, featureName: string, config?: OpenFlowConfig): Promise<string> {
  const outputDir = config?.paths.archive ?? defaultConfig.paths.archive
  const archiveDir = await ensureArchiveUnitDir(projectDir, featureName, config?.paths.change_units)
  return path.join(projectDir, outputDir, archiveDir)
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)]
}

export { defaultConfig }
