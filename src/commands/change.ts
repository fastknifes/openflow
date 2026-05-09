import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { AcceptanceState, OpenFlowContext, PendingDocUpdate } from '../types.js'
import { getChangeWorkspacePath, getDesignCandidatePaths } from '../config.js'
import { loadAcceptanceState, saveAcceptanceState } from '../utils/acceptance-state.js'
import { ErrorCode, OpenFlowError } from '../utils/errors.js'
import { escapeMarkdown, sanitizeFeatureName } from '../utils/security.js'
import { findActiveFeature } from '../utils/feature-resolver.js'

export async function handleChange(ctx: OpenFlowContext, feature?: string, description?: string): Promise<string> {
  const resolvedFeature = feature?.trim() || await findActiveFeature(ctx)
  if (!resolvedFeature) {
    throw new OpenFlowError(
      ErrorCode.INVALID_INPUT,
      'Feature name is required. Use /openflow-change <feature> "<change description>"'
    )
  }

  const sanitizedFeature = sanitizeFeatureName(resolvedFeature)
  const changeDescription = description?.trim() || 'No description provided'
  let workspacePath: string

  try {
    workspacePath = await getChangeWorkspacePath(ctx.directory, sanitizedFeature)
    const workspaceStats = await fs.stat(workspacePath)
    if (!workspaceStats.isDirectory()) {
      return formatMissingWorkspace(sanitizedFeature)
    }
  } catch {
    return formatMissingWorkspace(sanitizedFeature)
  }

  const foundDocs = await findDesignDocuments(ctx, sanitizedFeature)
  if (foundDocs.length === 0) {
    return formatMissingDesignDocs(sanitizedFeature, workspacePath)
  }

  const acceptanceState = await loadAcceptanceState(ctx.directory)
  if (acceptanceState?.feature === sanitizedFeature && acceptanceState.phase === 'archived') {
    throw new OpenFlowError(
      ErrorCode.INVALID_INPUT,
      `Feature '${sanitizedFeature}' has been archived. Requirement changes are not allowed on archived features. Start a new /openflow-brainstorm session for a new change cycle.`
    )
  }

  const timestamp = new Date().toISOString()
  const primaryDesignPath = foundDocs[0] ?? path.join(workspacePath, 'design.md')
  const recordedDesignPath = toProjectRelativePath(ctx.directory, primaryDesignPath)
  const pendingUpdate: PendingDocUpdate = {
    file: recordedDesignPath,
    timestamp,
    reason: `openflow-change requested: ${changeDescription}`,
  }

  const nextState: AcceptanceState = acceptanceState?.feature === sanitizedFeature
    ? { ...acceptanceState }
    : {
      feature: sanitizedFeature,
      phase: 'implementation',
      phaseStartedAt: timestamp,
      pendingDocUpdates: [],
    }
  nextState.pendingDocUpdates = [...(nextState.pendingDocUpdates ?? []), pendingUpdate]
  await saveAcceptanceState(ctx.directory, nextState)

  return formatChangePacket({
    feature: sanitizedFeature,
    description: changeDescription,
    workspacePath,
    foundDocs,
    acceptanceState,
    recordedDesignPath,
    timestamp,
  })
}

async function findDesignDocuments(ctx: OpenFlowContext, feature: string): Promise<string[]> {
  const docs: string[] = []
  const candidates = await getDesignCandidatePaths(ctx.directory, feature, ctx.config)

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate)
      if (stat.isFile()) {
        docs.push(candidate)
      } else if (stat.isDirectory()) {
        const entries = await fs.readdir(candidate)
        for (const entry of entries) {
          if (/^(?:design|\d{8}-design)\.md$/u.test(entry)) {
            docs.push(path.join(candidate, entry))
          }
        }
      }
    } catch {
      // Candidate paths are compatibility fallbacks; missing paths are expected.
    }
  }

  return [...new Set(docs)]
}

function toProjectRelativePath(projectDir: string, filePath: string): string {
  const relativePath = path.relative(projectDir, filePath)
  return (relativePath || filePath).replace(/\\/g, '/')
}

function formatMissingWorkspace(feature: string): string {
  return `## OpenFlow Change - Workspace Not Found

**Feature**: \`${escapeMarkdown(feature)}\`

No changes workspace found for this feature.

### Next Step
Run \`/openflow-brainstorm ${escapeMarkdown(feature)}\` to create a design workspace first, then use \`/openflow-change ${escapeMarkdown(feature)}\` for requirement changes.
`
}

function formatMissingDesignDocs(feature: string, workspacePath: string): string {
  return `## OpenFlow Change - No Design Documents

**Feature**: \`${escapeMarkdown(feature)}\`
**Workspace**: \`${escapeMarkdown(workspacePath)}\`

No design documents found in this workspace.

### Next Step
Run \`/openflow-brainstorm ${escapeMarkdown(feature)}\` to generate design documents first.
`
}

function formatChangePacket(input: {
  feature: string
  description: string
  workspacePath: string
  foundDocs: string[]
  acceptanceState: AcceptanceState | null
  recordedDesignPath: string
  timestamp: string
}): string {
  const docsList = input.foundDocs.map((doc) => `- \`${escapeMarkdown(doc)}\``).join('\n')
  const state = input.acceptanceState?.feature === input.feature ? input.acceptanceState : null
  const acceptanceInfo = state
    ? `**Phase**: ${escapeMarkdown(state.phase)}${state.readiness ? ` | **Readiness**: ${escapeMarkdown(state.readiness)}` : ''}`
    : 'No active acceptance state'
  const reverifyWarning = state?.readiness === 'ready' || state?.readiness === 'ready_with_doc_updates'
    ? `\n\n> This feature has already been verified. After applying changes, run \`/openflow-verify ${escapeMarkdown(input.feature)}\` again to re-validate readiness.`
    : ''

  return `## OpenFlow Change Packet

**Feature**: \`${escapeMarkdown(input.feature)}\`
**Date**: ${input.timestamp}

### Change Description
${escapeMarkdown(input.description)}

### Workspace
- \`${escapeMarkdown(input.workspacePath)}\`

### Design Documents Found
${docsList}

### Current Acceptance State
${acceptanceInfo}${reverifyWarning}

### Pending Doc Update Recorded
- \`${escapeMarkdown(input.recordedDesignPath)}\` - openflow-change requested

### Docs-First Procedure
1. Read the design documents listed above
2. Update \`${escapeMarkdown(input.recordedDesignPath)}\` to reflect the change
3. Update \`decisions.md\` in the same change workspace if new trade-offs are introduced
4. Update \`prd.md\` in the same change workspace if requirements shifted

### Code-Update Procedure
1. Identify code modules referenced by the updated design
2. Modify code to align with the updated design document
3. Ensure existing tests still pass; add tests for new behavior

### Verification Commands
\`\`\`
npm run typecheck
bun test
\`\`\`

### Next Step
1. Complete the Docs-First and Code-Update procedures above
2. Run \`/openflow-verify ${escapeMarkdown(input.feature)}\` to re-validate readiness
3. After verification passes, run \`/openflow-archive ${escapeMarkdown(input.feature)}\` to finalize
`
}
