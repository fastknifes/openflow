import type { Hooks } from '@opencode-ai/plugin'
import type { OpenFlowContext } from '../types.js'

// ── Harden Session Registry ────────────────────────────────────────────────

export interface HardenSessionInfo {
  role: 'reviewer' | 'executor' | 'coordinator'
  parentSessionID?: string | undefined
  feature: string
}

const hardenSessionRegistry = new Map<string, HardenSessionInfo>()

export function registerHardenSession(
  sessionID: string,
  info: HardenSessionInfo,
): void {
  hardenSessionRegistry.set(sessionID, info)
}

export function unregisterHardenSession(sessionID: string): void {
  hardenSessionRegistry.delete(sessionID)
}

export function clearHardenSessions(): void {
  hardenSessionRegistry.clear()
}

export function isHardenSession(sessionID: string | undefined): boolean {
  if (!sessionID) return false
  return hardenSessionRegistry.has(sessionID)
}

export function getHardenSessionInfo(sessionID: string): HardenSessionInfo | undefined {
  return hardenSessionRegistry.get(sessionID)
}

// ── Decision-layer skill blocklist ─────────────────────────────────────────

/**
 * Skills that should NOT be visible in harden reviewer/executor sessions.
 * These are workflow-entry skills that could cause recursive quality-gate calls.
 */
const DECISION_LAYER_SKILL_PREFIXES = [
  'openflow-quality-gate',
  'openflow-archive',
  'openflow-feature',
  'openflow-implement',
  'openflow-writing-plan',
  'openflow-change',
  'openflow-migrate-docs',
  'openflow-init',
  'openflow-status',
  'openflow-config',
]

function isDecisionLayerSkill(name: string): boolean {
  return DECISION_LAYER_SKILL_PREFIXES.some((prefix) => name.startsWith(prefix))
}

/**
 * Filter decision-layer skills from an `<available_skills>` XML block.
 *
 * The input format (from opencode's Skill.fmt with verbose=true):
 *   <available_skills>
 *     <skill>
 *       <name>skill-name</name>
 *       <description>...</description>
 *       <location>...</location>
 *     </skill>
 *     ...
 *   </available_skills>
 */
function filterSkillsBlock(block: string): string {
  // Match each <skill>...</skill> block and decide whether to keep it.
  return block.replace(/\s*<skill>([\s\S]*?)<\/skill>/g, (match, inner) => {
    const nameMatch = inner.match(/<name>([^<]+)<\/name>/)
    const name = nameMatch ? nameMatch[1].trim() : ''
    if (isDecisionLayerSkill(name)) {
      return ''
    }
    return match
  })
}

// ── System Transform Hook ──────────────────────────────────────────────────

export function createSystemTransformHook(
  _ctx: OpenFlowContext,
): NonNullable<Hooks['experimental.chat.system.transform']> {
  return async (input, output) => {
    const sessionID = input.sessionID
    if (!isHardenSession(sessionID)) return

    const info = getHardenSessionInfo(sessionID!)

    // 1. Filter decision-layer skills from system prompt
    for (let i = 0; i < output.system.length; i++) {
      const section = output.system[i]
      if (typeof section === 'string' && section.includes('<available_skills>')) {
        const filtered = filterSkillsBlock(section)
        output.system[i] = filtered
      }
    }

    // 2. Inject harden-specific guard prompt to reinforce the boundary.
    //    This acts as a second line of defense in case skill filtering misses something.
    const roleLabel = info?.role === 'reviewer'
      ? 'Harden Reviewer'
      : info?.role === 'executor'
        ? 'Harden Executor'
        : 'Harden Agent'

    output.system.push(
      `\n[OpenFlow Context: ${roleLabel}]\n` +
      `You are running inside an OpenFlow harden session. ` +
      `Your sole task is to ${info?.role === 'reviewer' ? 'review implementation against the approved contract' : info?.role === 'executor' ? 'apply minimal fixes to implementation findings' : 'assist with harden review'}. ` +
      `You MUST NOT invoke any OpenFlow workflow tools or skills (e.g. openflow-quality-gate, openflow-archive, openflow-feature). ` +
      `Do not call the skill tool to load any openflow-* skills. ` +
      `Output your findings or fixes directly in the response text.\n`,
    )
  }
}
