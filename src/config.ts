import * as path from 'node:path'
import type { OpenFlowConfig, SecurityCheckType, QualityCheckType } from './types.js'
import { defaultConfig } from './types.js'
import { validateConfigPath } from './utils/security.js'

export const LEGACY_DESIGN_OUTPUT_DIR = 'docs/design'
export const LEGACY_REQUIREMENTS_OUTPUT_DIR = 'docs/requirements'
export const CHANGE_WORKSPACE_DIR = 'docs/changes'
export const CURRENT_SPEC_DIR = 'docs/current/spec'
export const CURRENT_WORKFLOW_DIR = 'docs/current/workflow'

const VALID_SECURITY_CHECKS: readonly SecurityCheckType[] = ['secret', 'vuln', 'dependency']
const VALID_QUALITY_CHECKS: readonly QualityCheckType[] = ['lint', 'typecheck', 'test', 'format']

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isValidSecurityChecks(value: unknown): value is SecurityCheckType[] {
  if (!isStringArray(value)) return false
  return value.every(item => (VALID_SECURITY_CHECKS as readonly string[]).includes(item))
}

function isValidQualityChecks(value: unknown): value is QualityCheckType[] {
  if (!isStringArray(value)) return false
  return value.every(item => (VALID_QUALITY_CHECKS as readonly string[]).includes(item))
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return isStringArray(value) && value.length > 0
}

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

function validateConfigValue(config: unknown): boolean {
  if (typeof config !== 'object' || config === null) {
    return false
  }

  const c = config as Record<string, unknown>

  if (c.brainstorming !== undefined) {
    const b = c.brainstorming as Record<string, unknown>
    if (b.enabled !== undefined && typeof b.enabled !== 'boolean') return false
    if (b.output_dir !== undefined && typeof b.output_dir !== 'string') return false
    if (b.auto_trigger !== undefined && typeof b.auto_trigger !== 'boolean') return false
    if (b.trigger_mode !== undefined && !['smart', 'always', 'never'].includes(String(b.trigger_mode))) return false
    if (b.generate_prd !== undefined && typeof b.generate_prd !== 'boolean') return false
    if (b.prd_output_dir !== undefined && typeof b.prd_output_dir !== 'string') return false
    if (b.closure !== undefined) {
      const closure = b.closure as Record<string, unknown>
      if (closure.enabled !== undefined && typeof closure.enabled !== 'boolean') return false
      if (closure.auto_transition !== undefined && typeof closure.auto_transition !== 'boolean') return false
      if (closure.strong_signals !== undefined && !isNonEmptyStringArray(closure.strong_signals)) return false
      if (closure.weak_signals !== undefined && !isNonEmptyStringArray(closure.weak_signals)) return false
      if (closure.weak_signal_threshold !== undefined && typeof closure.weak_signal_threshold !== 'number') return false
      if (closure.weak_signal_threshold !== undefined && (closure.weak_signal_threshold as number) < 1) return false
      if (closure.weak_signal_threshold !== undefined && (closure.weak_signal_threshold as number) > 10) return false
    }
    try {
      if (b.output_dir !== undefined) validateConfigPath(b.output_dir as string)
      if (b.prd_output_dir !== undefined) validateConfigPath(b.prd_output_dir as string)
    } catch {
      return false
    }
  }

  if (c.tdd !== undefined) {
    const t = c.tdd as Record<string, unknown>
    if (t.enabled !== undefined && typeof t.enabled !== 'boolean') return false
    if (t.expand_threshold !== undefined && typeof t.expand_threshold !== 'number') return false
    if (t.expand_threshold !== undefined && (t.expand_threshold as number) < 1) return false
    if (t.expand_threshold !== undefined && (t.expand_threshold as number) > 100) return false
  }

  if (c.verification !== undefined) {
    const v = c.verification as Record<string, unknown>
    if (v.in_plan !== undefined && typeof v.in_plan !== 'boolean') return false
    if (v.security !== undefined && !isValidSecurityChecks(v.security)) return false
    if (v.quality !== undefined && !isValidQualityChecks(v.quality)) return false
    if (v.auto_fix !== undefined && typeof v.auto_fix !== 'boolean') return false
    if (v.completion_prompt !== undefined && typeof v.completion_prompt !== 'boolean') return false
  }

  if (c.archive !== undefined) {
    const a = c.archive as Record<string, unknown>
    if (a.enabled !== undefined && typeof a.enabled !== 'boolean') return false
    if (a.output_dir !== undefined && typeof a.output_dir !== 'string') return false
    if (a.drift_check !== undefined && typeof a.drift_check !== 'boolean') return false
    if (a.auto_promote_current !== undefined && typeof a.auto_promote_current !== 'boolean') return false
    try {
      if (a.output_dir !== undefined) validateConfigPath(a.output_dir as string)
    } catch {
      return false
    }
  }

  if (c.acceptance !== undefined) {
    const ac = c.acceptance as Record<string, unknown>
    if (ac.enabled !== undefined && typeof ac.enabled !== 'boolean') return false
    if (ac.trigger_words_zh !== undefined && !isNonEmptyStringArray(ac.trigger_words_zh)) return false
    if (ac.trigger_words_en !== undefined && !isNonEmptyStringArray(ac.trigger_words_en)) return false
    if (ac.doc_sync_prompt !== undefined && typeof ac.doc_sync_prompt !== 'boolean') return false
    if (ac.drift_detection !== undefined && typeof ac.drift_detection !== 'boolean') return false
  }

  return true
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
  const outputDir = config?.brainstorming?.output_dir ?? defaultConfig.brainstorming.output_dir
  return path.join(projectDir, outputDir, featureName)
}

export function getLegacyDesignPath(projectDir: string, featureName: string): string {
  return path.join(projectDir, LEGACY_DESIGN_OUTPUT_DIR, featureName)
}

export function getArchivePath(projectDir: string, featureName: string, config?: OpenFlowConfig): string {
  const outputDir = config?.archive?.output_dir ?? defaultConfig.archive.output_dir
  return path.join(projectDir, outputDir, featureName)
}

export function getAcceptanceStatePath(projectDir: string): string {
  return path.join(projectDir, '.sisyphus', 'acceptance.local.md')
}

export function getPlanPath(projectDir: string, featureName: string): string {
  return path.join(projectDir, '.sisyphus', 'plans', `${featureName}.md`)
}

export function getChangeWorkspacePath(projectDir: string, featureName: string): string {
  return path.join(projectDir, CHANGE_WORKSPACE_DIR, featureName)
}

export function getChangeDesignPath(projectDir: string, featureName: string): string {
  return path.join(getChangeWorkspacePath(projectDir, featureName), 'design')
}

export function getChangeRequirementsPath(projectDir: string, featureName: string): string {
  return path.join(getChangeWorkspacePath(projectDir, featureName), 'requirements')
}

export function getChangePlansPath(projectDir: string, featureName: string): string {
  return path.join(getChangeWorkspacePath(projectDir, featureName), 'plans')
}

export function getRequirementsPath(projectDir: string, featureName: string, config?: OpenFlowConfig): string {
  const outputDir = config?.brainstorming?.prd_output_dir ?? defaultConfig.brainstorming.prd_output_dir
  return path.join(projectDir, outputDir, featureName)
}

export function getLegacyRequirementsPath(projectDir: string, featureName: string): string {
  return path.join(projectDir, LEGACY_REQUIREMENTS_OUTPUT_DIR, featureName)
}

export function getDesignCandidatePaths(projectDir: string, featureName: string, config?: OpenFlowConfig): string[] {
  return uniquePaths([
    getChangeDesignPath(projectDir, featureName),
    getDesignPath(projectDir, featureName, config),
    getLegacyDesignPath(projectDir, featureName),
  ])
}

export function getRequirementsCandidatePaths(projectDir: string, featureName: string, config?: OpenFlowConfig): string[] {
  return uniquePaths([
    getChangeRequirementsPath(projectDir, featureName),
    getRequirementsPath(projectDir, featureName, config),
    getLegacyRequirementsPath(projectDir, featureName),
  ])
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)]
}

export { defaultConfig }
