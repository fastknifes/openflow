import { z } from 'zod'
import * as fs from 'node:fs/promises'
import { sanitizeFeatureName, createSafePath } from '../../utils/security.js'

// --- Schemas ---

export const ConfidenceSchema = z.enum(['high', 'medium', 'low'])

export const ExtractedItemSchema = z.object({
  type: z.enum(['problem', 'decision', 'constraint', 'nonGoal', 'openQuestion', 'risk', 'example']),
  content: z.string().min(1),
  confidence: ConfidenceSchema,
  source: z.enum(['user', 'assistant']),
  confirmedBy: z.string().optional(),
})

export const BrainstormContextPacketSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  featureHint: z.string().min(1),
  sourceSessionID: z.string().min(1),
  createdAt: z.string().datetime().or(z.string().min(1)),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  items: z.array(ExtractedItemSchema).optional(),
  rawMessages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
})

// --- Inferred types ---

export type Confidence = z.infer<typeof ConfidenceSchema>
export type ExtractedItem = z.infer<typeof ExtractedItemSchema>
export type BrainstormContextPacket = z.infer<typeof BrainstormContextPacketSchema>

// --- Result types ---

export type ReadPacketResult =
  | { ok: true; packet: BrainstormContextPacket }
  | { ok: false; error: string; skipped: true }

export type WritePacketResult =
  | { ok: true }
  | { ok: false; error: string }

export type ListPacketsResult =
  | { ok: true; packets: BrainstormContextPacket[]; errors: string[] }
  | { ok: false; error: string }

// --- Constants ---

export const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const PACKETS_SUBDIR = 'brainstorm/context-packets'

// --- Helpers ---

export function generatePacketId(sourceSessionID: string, featureHint: string): string {
  const sanitizedFeature = sanitizeFeatureName(featureHint)
  return `${sourceSessionID}-${sanitizedFeature}`
}

export function isStale(packet: BrainstormContextPacket): boolean {
  const updatedAt = new Date(packet.updatedAt)
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS)
  return updatedAt < staleThreshold
}

function getPacketDir(projectDir: string): string {
  return createSafePath(projectDir, '.openflow', PACKETS_SUBDIR)
}

function getPacketPath(projectDir: string, id: string): string {
  return createSafePath(projectDir, '.openflow', PACKETS_SUBDIR, `${id}.json`)
}

// --- Storage operations ---

export async function readPacket(projectDir: string, id: string): Promise<ReadPacketResult> {
  try {
    const filePath = getPacketPath(projectDir, id)
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed: unknown = JSON.parse(raw)

    // Upgrade legacy brainstorm summary format (decisions/constraints/nonGoals)
    // to BrainstormContextPacket format
    const upgraded = upgradeLegacyFormat(parsed)
    const result = BrainstormContextPacketSchema.safeParse(upgraded)

    if (!result.success) {
      return {
        ok: false,
        error: `Invalid packet format: ${result.error.message}`,
        skipped: true,
      }
    }

    return { ok: true, packet: result.data }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message, skipped: true }
  }
}

/**
 * Upgrade legacy brainstorm summary format to BrainstormContextPacket.
 *
 * Legacy format has: id, created, topic, decisions[], constraints[], nonGoals[], featureDocs
 * New format needs: id, version, featureHint, sourceSessionID, createdAt, updatedAt, items[]
 */
function upgradeLegacyFormat(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const record = raw as Record<string, unknown>

  // If it already has version and sourceSessionID, it's likely v2 format
  if (typeof record.version === 'number' && typeof record.sourceSessionID === 'string') {
    return raw
  }

  // Check for legacy markers: has 'decisions' or 'constraints' but no 'version'
  if (!Array.isArray(record.decisions) && !Array.isArray(record.constraints)) {
    return raw
  }

  const id = typeof record.id === 'string' ? record.id : 'unknown'
  const created = typeof record.created === 'string' ? record.created : new Date().toISOString()
  const topic = typeof record.topic === 'string' ? record.topic : id

  const items: ExtractedItem[] = []

  // Convert decisions to items
  if (Array.isArray(record.decisions)) {
    for (const decision of record.decisions) {
      if (!decision || typeof decision !== 'object') continue
      const d = decision as Record<string, unknown>
      const topicPart = typeof d.topic === 'string' ? `${d.topic}: ` : ''
      const decisionPart = typeof d.decision === 'string' ? d.decision : ''
      const rationalePart = typeof d.rationale === 'string' ? ` (理由: ${d.rationale})` : ''
      if (decisionPart) {
        items.push({
          type: 'decision',
          content: `${topicPart}${decisionPart}${rationalePart}`,
          confidence: 'high',
          source: 'user',
          confirmedBy: 'legacy-brainstorm',
        })
      }
    }
  }

  // Convert constraints to items
  if (Array.isArray(record.constraints)) {
    for (const constraint of record.constraints) {
      if (typeof constraint === 'string' && constraint.trim()) {
        items.push({
          type: 'constraint',
          content: constraint.trim(),
          confidence: 'high',
          source: 'user',
          confirmedBy: 'legacy-brainstorm',
        })
      }
    }
  }

  // Convert nonGoals to items
  if (Array.isArray(record.nonGoals)) {
    for (const nonGoal of record.nonGoals) {
      if (typeof nonGoal === 'string' && nonGoal.trim()) {
        items.push({
          type: 'nonGoal',
          content: nonGoal.trim(),
          confidence: 'high',
          source: 'user',
          confirmedBy: 'legacy-brainstorm',
        })
      }
    }
  }

  // Convert topic to a problem item so it flows into model.problemStatement
  // via applyConfirmedHarvestToRequirementModel's 'problem' switch case
  if (topic && topic !== id) {
    items.unshift({
      type: 'problem',
      content: topic,
      confidence: 'high',
      source: 'user',
      confirmedBy: 'legacy-brainstorm',
    })
  }

  return {
    id,
    version: 1,
    featureHint: topic,
    sourceSessionID: `legacy-${id}`,
    createdAt: created.includes('T') ? created : `${created}T00:00:00.000Z`,
    updatedAt: created.includes('T') ? created : `${created}T00:00:00.000Z`,
    items,
  }
}

export async function writePacket(
  projectDir: string,
  packet: BrainstormContextPacket
): Promise<WritePacketResult> {
  try {
    const dir = getPacketDir(projectDir)
    await fs.mkdir(dir, { recursive: true })

    const filePath = getPacketPath(projectDir, packet.id)
    const content = JSON.stringify(packet, null, 2)
    await fs.writeFile(filePath, content, 'utf-8')

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}

export async function listPackets(projectDir: string): Promise<ListPacketsResult> {
  try {
    const dir = getPacketDir(projectDir)
    await fs.mkdir(dir, { recursive: true })

    const entries = await fs.readdir(dir, { withFileTypes: true })
    const jsonFiles = entries.filter(
      (entry) => entry.isFile() && entry.name.endsWith('.json')
    )

    const packets: BrainstormContextPacket[] = []
    const errors: string[] = []

    for (const entry of jsonFiles) {
      const id = entry.name.replace(/\.json$/, '')
      const result = await readPacket(projectDir, id)

      if (result.ok) {
        packets.push(result.packet)
      } else {
        errors.push(result.error)
      }
    }

    return { ok: true, packets, errors }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}
