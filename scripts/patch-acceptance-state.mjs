import { readFileSync, writeFileSync } from 'node:fs';

let content = readFileSync('src/utils/acceptance-state.ts', 'utf8');

// 1. Add type imports
content = content.replace(
  "type GovernancePromotionStatus } from '../types.js'",
  "type GovernancePromotionStatus, type ImplementationState, type ImplementationStateMetadata, type QualityGateApplicabilityResult } from '../types.js'"
);

// 2. Add FIELD_PREFIXES
content = content.replace(
  "promotionCandidatePath: 'promotionCandidatePath:',",
  "promotionCandidatePath: 'promotionCandidatePath:',\n  implementationState: 'implementationState:',\n  qualityGateApplicability: 'qualityGateApplicability:',"
);

// 3. Add deserialization in parseStateFile
content = content.replace(
  "} else if (trimmed === PENDING_UPDATES_HEADER) {",
  "} else if (trimmed.startsWith(FIELD_PREFIXES.implementationState)) {\n      try { result.implementationState = JSON.parse(extractFieldValue(trimmed, FIELD_PREFIXES.implementationState)) } catch { /* ignore */ }\n      inPendingUpdates = false\n    } else if (trimmed.startsWith(FIELD_PREFIXES.qualityGateApplicability)) {\n      try { result.qualityGateApplicability = JSON.parse(extractFieldValue(trimmed, FIELD_PREFIXES.qualityGateApplicability)) } catch { /* ignore */ }\n      inPendingUpdates = false\n    } else if (trimmed === PENDING_UPDATES_HEADER) {"
);

// 4. Add carry-over in parseStateFile
content = content.replace(
  "if (result.promotionCandidatePath) {\n    state.promotionCandidatePath = result.promotionCandidatePath\n  }\n  \n  return state",
  "if (result.promotionCandidatePath) {\n    state.promotionCandidatePath = result.promotionCandidatePath\n  }\n  if (result.implementationState) {\n    state.implementationState = result.implementationState\n  }\n  if (result.qualityGateApplicability) {\n    state.qualityGateApplicability = result.qualityGateApplicability\n  }\n  \n  return state"
);

// 5. Add serialization in serializeState
content = content.replace(
  "pushOptionalLine(lines, FIELD_PREFIXES.mode, state.mode)",
  "if (state.implementationState) {\n    pushOptionalLine(lines, FIELD_PREFIXES.implementationState, JSON.stringify(state.implementationState))\n  }\n  if (state.qualityGateApplicability) {\n    pushOptionalLine(lines, FIELD_PREFIXES.qualityGateApplicability, JSON.stringify(state.qualityGateApplicability))\n  }\n  pushOptionalLine(lines, FIELD_PREFIXES.mode, state.mode)"
);

// 6. Add implementation state functions
const implStateFunctions = `
type ImplementationStateTransitionOptions = {
  changedFiles?: string[]
  gitHead?: string
  fromVerify?: boolean
}

function normalizeImplementationState(state: AcceptanceState): ImplementationStateMetadata {
  return state.implementationState ?? { state: 'clean', updatedAt: state.phaseStartedAt }
}

function createImplementationStateMetadata(nextState: ImplementationState, options?: ImplementationStateTransitionOptions): ImplementationStateMetadata {
  const metadata: ImplementationStateMetadata = { state: nextState, updatedAt: formatTimestamp() }
  if (options?.changedFiles?.length) metadata.changedFiles = [...new Set(options.changedFiles)].sort()
  if (options?.gitHead) metadata.gitHead = options.gitHead
  if (options?.fromVerify !== undefined) metadata.fromVerify = options.fromVerify
  return metadata
}

async function updateImplementationState(projectDir: string, nextState: ImplementationState, options?: ImplementationStateTransitionOptions): Promise<void> {
  const state = await loadAcceptanceState(projectDir)
  if (!state) { logger.warn('Cannot update implementation state: no active acceptance state', { nextState }); return }
  state.implementationState = createImplementationStateMetadata(nextState, options)
  await saveAcceptanceState(projectDir, state)
}

export async function markImplementationDirty(projectDir: string, options?: ImplementationStateTransitionOptions): Promise<void> {
  await updateImplementationState(projectDir, 'dirty', options)
}

export async function markImplementationVerified(projectDir: string, options?: ImplementationStateTransitionOptions): Promise<void> {
  await updateImplementationState(projectDir, 'verified', { ...options, fromVerify: options?.fromVerify ?? true })
}

export async function markImplementationStale(projectDir: string, options?: ImplementationStateTransitionOptions): Promise<void> {
  await updateImplementationState(projectDir, 'stale', options)
}

export async function markImplementationBlocked(projectDir: string, options?: ImplementationStateTransitionOptions): Promise<void> {
  await updateImplementationState(projectDir, 'blocked', options)
}

export async function clearImplementationState(projectDir: string): Promise<void> {
  const state = await loadAcceptanceState(projectDir)
  if (!state) return
  delete state.implementationState
  await saveAcceptanceState(projectDir, state)
}

export async function getImplementationState(projectDir: string): Promise<ImplementationStateMetadata | null> {
  const state = await loadAcceptanceState(projectDir)
  if (!state) return null
  return normalizeImplementationState(state)
}

export async function isFreshReadiness(projectDir: string): Promise<boolean> {
  const state = await loadAcceptanceState(projectDir)
  if (!state || (!state.readiness && !state.verifyResult)) return false
  const impl = normalizeImplementationState(state)
  return impl.state === 'clean' || impl.state === 'verified'
}

`;

content = content.replace(
  'export async function saveVerifyResult(',
  implStateFunctions + 'export async function saveVerifyResult('
);

// 7. Add limited-context functions at end
const limitedContextFunctions = `

export async function createLimitedContextState(projectDir: string, changedFilePath: string, sessionID?: string): Promise<void> {
  const existingState = await loadAcceptanceState(projectDir)
  if (existingState) return
  const featureSlug = sessionID ? \`limited-context-\${sessionID.slice(0, 16)}\` : \`limited-context-\${Date.now()}\`
  const state: AcceptanceState = {
    feature: featureSlug, phase: 'implementation', phaseStartedAt: formatTimestamp(),
    mode: 'feature', pendingDocUpdates: [],
    implementationState: createImplementationStateMetadata('dirty', { changedFiles: [changedFilePath] }),
    qualityGateApplicability: {
      status: 'limited_context', reasonCode: 'implementation_without_workflow_context',
      reason: 'Implementation-like change detected without active OpenFlow workflow context.',
      taskKind: 'implementation_done', shouldRunVerify: true, shouldRunHarden: false,
      archiveReadinessEligible: false,
      nextStep: 'Run openflow-quality-gate. Consider /openflow-feature or /openflow-issue.',
    },
  }
  if (sessionID) state.sessionID = sessionID
  await saveAcceptanceState(projectDir, state)
  logger.info('Created limited-context acceptance state', { feature: featureSlug, changedFilePath })
}

export async function mergeLimitedContextState(projectDir: string, changedFilePath: string, sessionID?: string): Promise<void> {
  const existingState = await loadAcceptanceState(projectDir)
  if (!existingState) { await createLimitedContextState(projectDir, changedFilePath, sessionID); return }
  const isLimitedContext = existingState.feature.startsWith('limited-context-') && existingState.qualityGateApplicability?.status === 'limited_context'
  if (!isLimitedContext) return
  const existingFiles = existingState.implementationState?.changedFiles ?? []
  if (existingFiles.includes(changedFilePath)) return
  existingState.implementationState = createImplementationStateMetadata('dirty', { changedFiles: [...existingFiles, changedFilePath] })
  await saveAcceptanceState(projectDir, existingState)
  logger.info('Merged changed file into limited-context state', { feature: existingState.feature, changedFilePath, totalFiles: existingState.implementationState!.changedFiles!.length })
}
`;

writeFileSync('src/utils/acceptance-state.ts', content + limitedContextFunctions, 'utf8');
console.log('Done. Original lines:', content.split('\n').length, '+', limitedContextFunctions.split('\n').length);
