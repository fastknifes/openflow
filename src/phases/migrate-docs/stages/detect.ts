/**
 * Detect Stage
 *
 * 1. Validate sourcePath exists and is a directory
 * 2. Validate sourcePath via createSafePath — reject path traversal (..), reject symlinks
 * 3. Run adapterRegistry.detect(sourcePath) — get all adapter results sorted by confidence
 * 4. If multiple adapters detected (confidence > 0.5), record all as pending questions
 * 5. If single adapter detected with confidence ≥ 0.5, auto-select
 * 6. If no adapter with confidence > 0.3, use generic adapter
 * 7. Determine targetRoot: if already set from CLI --target, use it; else use sourcePath's parent
 * 8. Detect if targetRoot has OpenFlow init (check for AGENTS.md with OpenFlow markers)
 * 9. If no OpenFlow init, add pending question asking whether to init
 * 10. Update state with detection results, advance to 'scan'
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { MigrationState, AdapterDetectResult, SourceType } from '../types.js'
import { AdapterRegistry } from '../adapters/index.js'
import { createSafePath, SecurityError } from '../../../utils/security.js'
import { ErrorCode, OpenFlowError } from '../../../utils/errors.js'
import { markStageCompleted, addPendingQuestion } from '../state-machine.js'

const ADAPTER_SELECTION_THRESHOLD = 0.5
const GENERIC_FALLBACK_THRESHOLD = 0.3
const AGENTS_MD_MARKER = '<!-- OPENFLOW DOCS GUIDE:BEGIN -->'

/**
 * Validate that the source path exists, is a directory, and is not a symlink.
 */
async function validateSourcePath(sourcePath: string): Promise<void> {
  // Check for path traversal via createSafePath (base = cwd, relative = sourcePath)
  // We resolve sourcePath against process.cwd() to get absolute path
  const resolved = path.resolve(sourcePath)
  const relative = path.relative(process.cwd(), resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    // Outside cwd, but let's also allow absolute paths that are safe
    // Re-validate with createSafePath using / as base for absolute paths check
  }

  try {
    createSafePath(process.cwd(), sourcePath)
  } catch (e) {
    if (e instanceof SecurityError) {
      throw new OpenFlowError(
        ErrorCode.SECURITY_VIOLATION,
        `Path traversal detected: ${sourcePath}`
      )
    }
    throw e
  }

  // Check if path contains explicit '..' segments
  if (sourcePath.includes('..')) {
    throw new OpenFlowError(
      ErrorCode.SECURITY_VIOLATION,
      `Path traversal detected: ${sourcePath}`
    )
  }

  let stats: Awaited<ReturnType<typeof fs.lstat>>
  try {
    stats = await fs.lstat(resolved)
  } catch {
    throw new OpenFlowError(
      ErrorCode.FILE_NOT_FOUND,
      `Source directory not found: ${sourcePath}`
    )
  }

  if (stats.isSymbolicLink()) {
    throw new OpenFlowError(
      ErrorCode.SECURITY_VIOLATION,
      `Symbolic links are not allowed: ${sourcePath}`
    )
  }

  if (!stats.isDirectory()) {
    throw new OpenFlowError(
      ErrorCode.FILE_NOT_FOUND,
      `Source path is not a directory: ${sourcePath}`
    )
  }
}

/**
 * Determine targetRoot: use existing state.targetRoot (from --target CLI option),
 * or default to sourcePath's parent directory.
 */
function determineTargetRoot(state: MigrationState): string {
  // If targetRoot was explicitly provided (truthy), use it
  // Otherwise default to sourcePath's parent
  if (state.targetRoot) {
    return path.resolve(state.targetRoot)
  }
  return path.resolve(path.dirname(state.sourcePath))
}

/**
 * Check whether the target directory already has OpenFlow initialized
 * by looking for AGENTS.md with OpenFlow markers.
 */
async function detectOpenFlowInit(targetRoot: string): Promise<boolean> {
  try {
    const agentsPath = path.join(targetRoot, 'AGENTS.md')
    const content = await fs.readFile(agentsPath, 'utf-8')
    return content.includes(AGENTS_MD_MARKER)
  } catch {
    return false
  }
}

/**
 * Select adapter based on detection results.
 * Returns the selected adapter type and updates state with pending questions if needed.
 */
function selectAdapter(
  state: MigrationState,
  results: AdapterDetectResult[]
): { state: MigrationState; selectedAdapter: SourceType; detectedAdapters: Array<{ type: SourceType; confidence: number; metadata?: Record<string, string> }> } {
  const detected = results.filter((r) => r.detected && r.confidence > 0)

  const detectedAdapters = detected.map((r) => ({
    type: r.adapter,
    confidence: r.confidence,
    ...(r.metadata ? { metadata: r.metadata } : {}),
  }))

  const highConfidence = detected.filter((r) => r.confidence > ADAPTER_SELECTION_THRESHOLD)

  if (highConfidence.length === 1) {
    // Single adapter with confidence ≥ 0.5 — auto-select
    return {
      state,
      selectedAdapter: highConfidence[0]!.adapter,
      detectedAdapters,
    }
  }

  if (highConfidence.length > 1) {
    // Multiple adapters detected — add pending question for user choice
    const options = highConfidence.map((r) => ({
      label: r.adapter,
      description: `Confidence: ${(r.confidence * 100).toFixed(0)}%`,
      value: r.adapter,
    }))

    const updatedState = addPendingQuestion(state, {
      header: 'Adapter Selection',
      question: 'Multiple document sources detected. Which adapter should take priority?',
      options,
      batchTopic: 'adapter-selection',
    })

    // Select the highest confidence one as default, but user will be asked
    return {
      state: updatedState,
      selectedAdapter: highConfidence[0]!.adapter,
      detectedAdapters,
    }
  }

  // No high-confidence adapter — check if any adapter has confidence > 0.3
  const mediumConfidence = detected.filter((r) => r.confidence > GENERIC_FALLBACK_THRESHOLD)

  if (mediumConfidence.length === 1) {
    return {
      state,
      selectedAdapter: mediumConfidence[0]!.adapter,
      detectedAdapters,
    }
  }

  if (mediumConfidence.length > 1) {
    const options = mediumConfidence.map((r) => ({
      label: r.adapter,
      description: `Confidence: ${(r.confidence * 100).toFixed(0)}%`,
      value: r.adapter,
    }))

    const updatedState = addPendingQuestion(state, {
      header: 'Adapter Selection',
      question: 'Multiple document sources detected with medium confidence. Which adapter should take priority?',
      options,
      batchTopic: 'adapter-selection',
    })

    return {
      state: updatedState,
      selectedAdapter: mediumConfidence[0]!.adapter,
      detectedAdapters,
    }
  }

  // Fallback to generic adapter
  return {
    state,
    selectedAdapter: 'generic' as SourceType,
    detectedAdapters,
  }
}

/**
 * Run the detect stage.
 */
export async function runDetectStage(
  state: MigrationState,
  adapterRegistry: AdapterRegistry
): Promise<MigrationState> {
  // 1. Validate sourcePath
  await validateSourcePath(state.sourcePath)

  // 2. Determine targetRoot
  const targetRoot = determineTargetRoot(state)

  // 3. Detect adapters
  const detectionResults = await adapterRegistry.detect(state.sourcePath)

  // 4. Select adapter
  let updatedState = { ...state, targetRoot }
  const { state: stateAfterSelection, selectedAdapter, detectedAdapters } = selectAdapter(
    updatedState,
    detectionResults
  )
  updatedState = stateAfterSelection

  // 5. Detect OpenFlow init
  const hasOpenFlowInit = await detectOpenFlowInit(targetRoot)

  if (!hasOpenFlowInit) {
    updatedState = addPendingQuestion(updatedState, {
      header: 'OpenFlow Initialization',
      question: 'No OpenFlow initialization detected in the target directory. Would you like to initialize OpenFlow before migrating?',
      options: [
        { label: 'Yes, initialize OpenFlow', description: 'Run openflow/init to set up AGENTS.md and docs structure', value: 'yes' },
        { label: 'No, continue without init', description: 'Proceed with migration without initializing OpenFlow', value: 'no' },
      ],
      batchTopic: 'openflow-init',
    })
  }

  // 6. Update state with detection results
  updatedState = {
    ...updatedState,
    sourceType: selectedAdapter,
    detectedAdapters,
    selectedAdapter,
    needsOpenFlowInit: !hasOpenFlowInit,
  }

  // 7. Mark detect stage as completed and advance to scan
  return markStageCompleted(updatedState, 'detect', {
    metadata: {
      detectedAdapters: detectedAdapters.map((a) => a.type),
      selectedAdapter,
      targetRoot,
      needsOpenFlowInit: !hasOpenFlowInit,
    },
  })
}
