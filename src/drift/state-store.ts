import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { GuardianRepairRecord, GuardianPendingItem, GuardianJobState } from '../types.js'

const GUARDIAN_STATE_DIR = '.sisyphus/openflow/guardian'

export async function ensureGuardianStateDir(projectDir: string): Promise<string> {
  const dir = path.join(projectDir, GUARDIAN_STATE_DIR)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

// Repairs log (JSONL: one JSON object per line)
export async function readGuardianRepairs(projectDir: string): Promise<GuardianRepairRecord[]> {
  const repairsPath = path.join(projectDir, GUARDIAN_STATE_DIR, 'repairs.jsonl')
  try {
    const content = await fs.readFile(repairsPath, 'utf-8')
    const lines = content.split('\n').filter(line => line.trim().length > 0)
    return lines.map(line => JSON.parse(line) as GuardianRepairRecord)
  } catch {
    return []
  }
}

export async function appendGuardianRepair(projectDir: string, record: GuardianRepairRecord): Promise<void> {
  const dir = await ensureGuardianStateDir(projectDir)
  const repairsPath = path.join(dir, 'repairs.jsonl')
  const line = JSON.stringify(record) + '\n'
  await fs.appendFile(repairsPath, line, 'utf-8')
}

// Session pending items
export async function writeSessionPending(projectDir: string, sessionId: string, items: GuardianPendingItem[]): Promise<void> {
  const dir = path.join(projectDir, GUARDIAN_STATE_DIR, 'pending')
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `${sessionId}.json`)
  await fs.writeFile(filePath, JSON.stringify(items, null, 2), 'utf-8')
}

export async function readSessionPending(projectDir: string, sessionId: string): Promise<GuardianPendingItem[]> {
  const filePath = path.join(projectDir, GUARDIAN_STATE_DIR, 'pending', `${sessionId}.json`)
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content) as GuardianPendingItem[]
  } catch {
    return []
  }
}

export async function deleteSessionPending(projectDir: string, sessionId: string): Promise<void> {
  const filePath = path.join(projectDir, GUARDIAN_STATE_DIR, 'pending', `${sessionId}.json`)
  try {
    await fs.unlink(filePath)
  } catch {
    // File doesn't exist — that's fine
  }
}

// Feature state
export async function writeFeatureGuardianState(projectDir: string, feature: string, state: GuardianJobState): Promise<void> {
  const dir = path.join(projectDir, GUARDIAN_STATE_DIR, 'feature')
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `${feature}.json`)
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8')
}

export async function readFeatureGuardianState(projectDir: string, feature: string): Promise<GuardianJobState | null> {
  const filePath = path.join(projectDir, GUARDIAN_STATE_DIR, 'feature', `${feature}.json`)
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content) as GuardianJobState
  } catch {
    return null
  }
}

export async function deleteFeatureGuardianState(projectDir: string, feature: string): Promise<void> {
  const filePath = path.join(projectDir, GUARDIAN_STATE_DIR, 'feature', `${feature}.json`)
  try {
    await fs.unlink(filePath)
  } catch {
    // File doesn't exist — that's fine
  }
}
