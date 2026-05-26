import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { OpenFlowContext } from '../types.js'
import { getChangePlansPath, getDesignCandidatePaths, getPlanPath } from '../config.js'
import { findLatestDocument } from '../utils/index.js'
import { escapeMarkdown, sanitizeFeatureName } from '../utils/security.js'

export async function handleWritingPlan(ctx: OpenFlowContext, feature: string): Promise<string> {
  if (!feature) throw new Error('Feature name is required')

  const sanitizedFeature = sanitizeFeatureName(feature)

  if (!ctx.config.writingPlan.enabled) {
    return '## Writing Plan Disabled\n\nWriting plan feature is disabled in OpenFlow configuration.'
  }

  // Gate: verify feature design is complete before allowing plan generation
  const gateResult = await verifyDesignReadiness(ctx.directory, sanitizedFeature, ctx.config)
  if (!gateResult.ready) {
    return `## Writing Plan Blocked\n\n${gateResult.reason}\n\nResolve the blocking issue(s) before generating a plan.`
  }

  const designContext = await readDesignContextPacket(ctx.directory, sanitizedFeature, ctx.config)
  const primaryPlanPath = await getChangePlansPath(ctx.directory, sanitizedFeature, ctx.config)
  const omoPlanPath = getPlanPath(ctx.directory, sanitizedFeature, ctx.config)

  return `## OpenFlow Writing Plan Packet

**Feature**: \`${escapeMarkdown(sanitizedFeature)}\`

### Design Context
${designContext || `> No design documents found for feature \`${escapeMarkdown(sanitizedFeature)}\`. Consider running \`/openflow-feature ${escapeMarkdown(sanitizedFeature)}\` first.`}

### Agent Target

The execution environment determines which planning agent handles this plan:
- **OMO detected** -> Prometheus (interview, clearance, and execution)
- **Non-OMO** -> OpenCode native \`plan\` agent

OpenFlow prepares the design context and constraints; the target agent owns the planning conversation.

### Plan Output Paths

- **Primary** (change workspace): \`${escapeMarkdown(primaryPlanPath)}\`
- **OMO copy** (active oh-my-openagent / Prometheus execution is detected OR \`.sisyphus/\` directory exists): \`${escapeMarkdown(omoPlanPath)}\`
- If both copies are written, the initial saved content must be identical.
- After execution starts, the \`.sisyphus/plans/\` copy may diverge as OMO / Prometheus records task progress; the \`docs/changes/\` plan remains the canonical planning artifact.
- Paths come from OpenFlow configuration; defaults are shown above.

### Plan Format Rules

The plan file MUST follow this exact structure:

\`\`\`markdown
# Plan: ${escapeMarkdown(sanitizedFeature)}

## Overview
Brief description of what this feature accomplishes.

## Design Context
Reference to the design workspace and relevant constraints.

## Execution Strategy

### Parallel Execution Waves
Tasks grouped by dependency level. Wave 1 has no dependencies; later waves depend on earlier results.
Same-wave tasks are candidates for parallel execution. Keep same-wave concurrency reasonable (default max 3–4).

### Dependency Matrix
| Task | Blocked By | Blocks |

## Tasks

- [ ] 1. Task with concrete file paths, verification commands, and subagent profile
- [ ] 2. Another task
\`\`\`

- Use \`- [ ]\` for checkbox tasks or \`1.\` for numbered tasks.
- **Task decomposition**: Group independent tasks into waves. Each task should be a cohesive work package (may span a few closely related files in the same module).
- **Subagent guidance**: Assign each task a recommended agent category such as \`quick\`, \`writing\`, or \`unspecified-high\`, plus required skills.
- Each task must include: Agent Profile, Parallelization status, QA Scenarios, and Acceptance Criteria.
- After drafting, estimate execution units. If > 20 units or same-wave > 4 tasks, merge smaller tasks or increase wave count.

### Self-Check Checklist

Before writing the plan file, verify:

- [ ] **No placeholders**: No TBD, TODO, or "implement later" in any task.
- [ ] **Concrete file paths**: Every task specifies exact file paths to create or modify.
- [ ] **Verification commands**: Every task includes a runnable command and expected output.
- [ ] **Bounded complexity**: No single task describes an unreasonable scope. Tasks may cover a few closely related files.
- [ ] **Task count proportional to feature**: small 3–5, medium 6–9, large 10–15.

### Overwrite Warning

> If a plan file already exists at either output path, review it carefully before overwriting. Existing task progress may be lost.
> If the \`.sisyphus/plans/\` copy already has checked tasks, treat it as execution state and do not overwrite it just to restore identity with the primary plan.

### Execution Handoff Note

**This packet is for plan writing only. Do NOT execute any tasks.** Write the final plan file to the output paths above using your normal file write tool, not inside this handler. This ensures existing tool-after hooks can enhance the plan. Execution is handled separately after the plan is reviewed and approved.

### OMO / Prometheus Compatibility

This skill does NOT replace or disable any OMO/Prometheus built-in capabilities. Prometheus exploration, brainstorming, and task planning remain fully available. Use this skill to produce the plan artifact, then let Prometheus continue its normal workflow.

### Blocking Clarification

> If the design context above is insufficient or requirements are unclear, **stop and ask clarifying questions** before generating the plan. Do NOT proceed with placeholders or assumptions.

### Next Step

1. Review the plan structure above and write the plan to the output paths
2. After the plan is written, run \`/openflow-implement ${escapeMarkdown(sanitizedFeature)}\` to start implementation
3. Once implementation is complete, invoke the quality gate:

\`\`\`
openflow-quality-gate
\`\`\`

Do not claim completion until the quality gate reports readiness.
`
}

export async function readDesignContextPacket(baseDir: string, feature: string, config?: import('../types.js').OpenFlowConfig): Promise<string | null> {
  const candidatePaths = [
    ...await getDesignCandidatePaths(baseDir, feature, config),
    ...await findDatedChangeCandidatePaths(baseDir, feature, config),
  ]

  for (const candidatePath of candidatePaths) {
    const candidate = await resolveDesignCandidate(candidatePath)
    if (!candidate) continue

    const designPath = candidate.isFile
      ? candidatePath
      : await findLatestDocument(candidate.workspacePath, /^(?:design|\d{8}-design)\.md$/)
    if (!designPath) continue

    const behaviorPath = await findLatestDocument(candidate.workspacePath, /^(?:behavior|\d{8}-behavior)\.md$/)
    if (!behaviorPath) {
      return formatIncompleteDesignContext(candidate.workspacePath, ['behavior.md'])
    }

    const markdownContext = await extractKeySections(designPath)
    const behaviorContext = await extractKeySections(behaviorPath)
    if (markdownContext && behaviorContext) {
      return `### ${path.basename(designPath)}\n\n${markdownContext}\n\n### ${path.basename(behaviorPath)}\n\n${behaviorContext}`
    }
  }

  return formatIncompleteDesignContext(feature, ['design.md', 'behavior.md'])
}

function formatIncompleteDesignContext(workspacePath: string, missingFiles: string[]): string {
  return `> Design context incomplete for \`${escapeMarkdown(workspacePath)}\`.
>
> Missing mandatory document(s): ${missingFiles.map((fileName) => `\`${fileName}\``).join(', ')}.
> Do NOT generate a plan until the design workspace contains both \`design.md\` and \`behavior.md\`.`
}

async function findDatedChangeCandidatePaths(baseDir: string, feature: string, config?: import('../types.js').OpenFlowConfig): Promise<string[]> {
  const changesDir = path.join(baseDir, config?.paths.changes ?? 'docs/changes')
  const suffix = `-${feature}`

  try {
    const entries = await fs.readdir(changesDir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}-/.test(entry.name) && entry.name.endsWith(suffix))
      .map((entry) => path.join(changesDir, entry.name))
  } catch {
    return []
  }
}

async function verifyDesignReadiness(
  baseDir: string,
  feature: string,
  config?: import('../types.js').OpenFlowConfig
): Promise<{ ready: boolean; reason: string }> {
  const candidatePaths = [
    ...await getDesignCandidatePaths(baseDir, feature, config),
    ...await findDatedChangeCandidatePaths(baseDir, feature, config),
  ]

  const workspacePaths: string[] = []
  for (const candidatePath of candidatePaths) {
    const candidate = await resolveDesignCandidate(candidatePath)
    if (!candidate) continue

    if (!workspacePaths.includes(candidate.workspacePath)) {
      workspacePaths.push(candidate.workspacePath)
    }
  }

  if (workspacePaths.length === 0) {
    return { ready: false, reason: `No design workspace found for feature "${feature}". Run /openflow-feature first.` }
  }

  if (workspacePaths.length > 1) {
    return { ready: false, reason: `Ambiguous feature match: ${workspacePaths.length} dated directories match "${feature}". Use the full dated directory name to disambiguate.` }
  }

  const workspacePath = workspacePaths[0]!
  const designPath = path.join(workspacePath, 'design.md')
  const behaviorPath = path.join(workspacePath, 'behavior.md')

  try {
    await fs.access(designPath)
  } catch {
    return { ready: false, reason: 'design.md not found in workspace. Design generation may not be complete.' }
  }

  try {
    await fs.access(behaviorPath)
  } catch {
    return { ready: false, reason: 'behavior.md not found in workspace. Design generation may not be complete.' }
  }

  // Check Cross-Validation status by recomputing from document bodies
  try {
    const docOrder = ['requirements.md', 'prd.md', 'design.md', 'behavior.md', 'decisions.md']
    const documents: Array<{ name: string; content: string }> = []
    for (const docName of docOrder) {
      const docPath = path.join(workspacePath, docName)
      try {
        const body = await fs.readFile(docPath, 'utf-8')
        if (body.trim()) {
          documents.push({ name: docName, content: body })
        }
      } catch {
        // Optional document — skip
      }
    }

    if (documents.length === 0) {
      return { ready: false, reason: 'No formal documents found in workspace for body-based Cross-Validation.' }
    }

    // Check for blocking/critical gaps in existing Cross-Validation Summary
    const designDoc = documents.find((d) => d.name === 'design.md')
    if (designDoc) {
      const cvMatch = designDoc.content.match(/Cross-Validation Summary[\s\S]*?- Status: (Passed|Blocking|Critical Blocking)/)
      if (!cvMatch) {
        return { ready: false, reason: 'Cross-Validation Summary not found in design.md. Design may not be finalized.' }
      }
      if (cvMatch[1] !== 'Passed') {
        return { ready: false, reason: `Cross-Validation status is "${cvMatch[1]}", not "Passed". Resolve blocking gaps first.` }
      }
    }

    // Verify feature session state is complete
    const stateMdPath = path.join(workspacePath, 'state.md')
    try {
      const stateContent = await fs.readFile(stateMdPath, 'utf-8')
      if (!stateContent.includes('`complete`') && !stateContent.includes('complete')) {
        return { ready: false, reason: 'Feature state in state.md is not "complete". Design must be finalized before planning.' }
      }
    } catch {
      return { ready: false, reason: 'state.md not found. Feature design may not be finalized.' }
    }
  } catch {
    return { ready: false, reason: 'Could not verify Cross-Validation status.' }
  }

  return { ready: true, reason: '' }
}

async function resolveDesignCandidate(candidatePath: string): Promise<{ workspacePath: string; isFile: boolean } | null> {
  try {
    const stats = await fs.stat(candidatePath)
    if (stats.isFile()) {
      return { workspacePath: path.dirname(candidatePath), isFile: true }
    }
    if (stats.isDirectory()) {
      return { workspacePath: candidatePath, isFile: false }
    }
  } catch {
    return null
  }

  return null
}

async function extractKeySections(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const lines = content.split('\n')
    const keySections: string[] = []
    let currentSection: string[] = []
    let inKeySection = false
    let sectionTitle = ''

    for (const line of lines) {
      const isHeader = /^#{1,3}\s+/.test(line)

      if (isHeader) {
        if (inKeySection && currentSection.length > 0) {
          keySections.push(`### ${sectionTitle}\n${currentSection.join('\n').trim()}`)
        }
        currentSection = []
        sectionTitle = line.replace(/^#{1,3}\s+/, '').trim()

        const lowerTitle = sectionTitle.toLowerCase()
        inKeySection = /overview|概述|summary|problem|问题|solution|方案|approach|方法|architecture|架构|decision|决策|constraint|约束|requirement|需求|goal|目标|behavior|行为|expected/.test(lowerTitle)
      } else if (inKeySection) {
        currentSection.push(line)
      }
    }

    if (inKeySection && currentSection.length > 0) {
      keySections.push(`### ${sectionTitle}\n${currentSection.join('\n').trim()}`)
    }

    if (keySections.length === 0) {
      const firstParagraphs = content.split('\n\n').slice(0, 3).join('\n\n')
      return firstParagraphs.length > 500 ? firstParagraphs.substring(0, 500) + '...' : firstParagraphs
    }

    return keySections.slice(0, 5).join('\n\n')
  } catch {
    return ''
  }
}
