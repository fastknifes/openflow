import type { OpenFlowConfig, SecurityCheckType, QualityCheckType } from './types.js'
import { defaultConfig } from './types.js'
import { validateConfigPath } from './utils/security.js'

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
    try {
      if (b.output_dir !== undefined) validateConfigPath(b.output_dir as string)
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
  }

  if (c.archive !== undefined) {
    const a = c.archive as Record<string, unknown>
    if (a.enabled !== undefined && typeof a.enabled !== 'boolean') return false
    if (a.output_dir !== undefined && typeof a.output_dir !== 'string') return false
    if (a.generate_srs !== undefined && typeof a.generate_srs !== 'boolean') return false
    try {
      if (a.output_dir !== undefined) validateConfigPath(a.output_dir as string)
    } catch {
      return false
    }
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

export function getDesignPath(projectDir: string, featureName: string): string {
  return `${projectDir}/${defaultConfig.brainstorming.output_dir}/${featureName}`
}

export function getArchivePath(projectDir: string, featureName: string): string {
  return `${projectDir}/${defaultConfig.archive.output_dir}/${featureName}`
}

export { defaultConfig }
