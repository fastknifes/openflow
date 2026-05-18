import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { ExecutionQualityPolicy, QualityMode } from '../types.js'

const POLICY_FILENAME = 'execution-policy.json'

function getPolicyPath(directory: string): string {
  return path.join(directory, '.sisyphus', 'openflow', POLICY_FILENAME)
}

function isValidPolicy(value: unknown): value is ExecutionQualityPolicy {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.feature === 'string' &&
    typeof obj.plan_name === 'string' &&
    typeof obj.executor === 'string' &&
    typeof obj.quality_mode === 'string' &&
    typeof obj.harden_policy === 'string' &&
    typeof obj.verify_policy === 'string' &&
    typeof obj.selected_at === 'string' &&
    typeof obj.selected_by === 'string'
  )
}

export async function loadExecutionPolicy(
  directory: string,
  feature: string
): Promise<ExecutionQualityPolicy | null> {
  const filePath = getPolicyPath(directory)

  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed: unknown = JSON.parse(raw)

    if (!isValidPolicy(parsed)) {
      return null
    }

    if (parsed.feature !== feature) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export async function saveExecutionPolicy(
  directory: string,
  policy: ExecutionQualityPolicy
): Promise<void> {
  const filePath = getPolicyPath(directory)
  const dir = path.dirname(filePath)

  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(policy, null, 2), 'utf-8')
}

export function createDefaultPolicy(
  feature: string,
  planName: string,
  mode: QualityMode
): ExecutionQualityPolicy {
  return {
    feature,
    plan_name: planName,
    executor: 'opencode',
    quality_mode: mode,
    harden_policy: 'none',
    verify_policy: 'standard',
    selected_at: new Date().toISOString(),
    selected_by: 'user',
  }
}
