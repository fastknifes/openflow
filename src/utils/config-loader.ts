import * as fs from 'node:fs/promises'
import * as path from 'node:path'

/**
 * Strip JSONC comments (line // and block /\* … *\/) from raw text using a minimal state machine.
 * Does NOT handle strings containing comment-like sequences perfectly, but is
 * sufficient for typical configuration files.
 */
export function stripJsoncComments(raw: string): string {
  let result = ''
  let i = 0
  const len = raw.length

  while (i < len) {
    const ch = raw[i]
    const next = raw[i + 1]

    if (ch === '"') {
      // String literal: copy until closing quote (no escape handling needed for comments)
      const end = raw.indexOf('"', i + 1)
      if (end === -1) {
        result += raw.slice(i)
        break
      }
      result += raw.slice(i, end + 1)
      i = end + 1
      continue
    }

    if (ch === '/' && next === '/') {
      // Line comment: skip until newline or EOF
      const end = raw.indexOf('\n', i)
      if (end === -1) break
      i = end + 1
      continue
    }

    if (ch === '/' && next === '*') {
      // Block comment: skip until */
      const end = raw.indexOf('*/', i + 2)
      if (end === -1) break
      i = end + 2
      continue
    }

    result += ch
    i++
  }

  return result
}

/**
 * Discover OpenFlow configuration from standalone files or OpenCode context.
 *
 * Source priority (first found wins, no deep-merge across sources):
 *   1. <projectDir>/openflow.json
 *   2. <projectDir>/openflow.jsonc
 *   3. opencodeConfig.openflow
 *
 * Invalid standalone config does NOT fall through; it warns and returns null.
 */
export async function discoverConfig(
  projectDir: string,
  opencodeConfig?: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const jsonPath = path.join(projectDir, 'openflow.json')
  const jsoncPath = path.join(projectDir, 'openflow.jsonc')

  // 1. Try openflow.json
  try {
    const raw = await fs.readFile(jsonPath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object') {
      return { openflow: parsed as Record<string, unknown> }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[OpenFlow] Invalid openflow.json, skipping standalone config:', (error as Error).message)
      return null
    }
  }

  // 2. Try openflow.jsonc
  try {
    const raw = await fs.readFile(jsoncPath, 'utf-8')
    const stripped = stripJsoncComments(raw)
    const parsed = JSON.parse(stripped) as unknown
    if (parsed && typeof parsed === 'object') {
      return { openflow: parsed as Record<string, unknown> }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[OpenFlow] Invalid openflow.jsonc, skipping standalone config:', (error as Error).message)
      return null
    }
  }

  // 3. Fall back to opencode config
  if (opencodeConfig?.openflow && typeof opencodeConfig.openflow === 'object') {
    return opencodeConfig
  }

  return null
}
