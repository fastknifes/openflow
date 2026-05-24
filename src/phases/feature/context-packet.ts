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
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  items: z.array(ExtractedItemSchema).optional(),
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
  return createSafePath(projectDir, '.sisyphus', PACKETS_SUBDIR)
}

function getPacketPath(projectDir: string, id: string): string {
  return createSafePath(projectDir, '.sisyphus', PACKETS_SUBDIR, `${id}.json`)
}

// --- Storage operations ---

export async function readPacket(projectDir: string, id: string): Promise<ReadPacketResult> {
  try {
    const filePath = getPacketPath(projectDir, id)
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    const result = BrainstormContextPacketSchema.safeParse(parsed)

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
