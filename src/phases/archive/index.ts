export {
  generateImplementationMapper,
  saveImplementationMapperDocument,
  generateAndSaveImplementationMapper,
  generateBehaviorCodeMapper,
  type ImplementationMapperOptions,
  type BehaviorCodeMapperOptions,
  type BehaviorCodeMapperResult,
} from './implementation-mapper.js'
export {
  collectTraceabilityItems,
  type TraceabilityItem,
  type TraceabilityResult,
} from './traceability.js'
export { 
  extractCodeSymbols, 
  generateCodeMappingTable, 
  generateApiEndpointsTable,
  generateDependenciesTable,

  type CodeMappingEntry,
  type GenerateCodeMappingOptions,
  type ApiEndpoint,
  type Dependency,
} from './code-mapper.js'
export {
  buildPromotionSuggestions,
  applyPromotionSuggestions,
  type BuildPromotionSuggestionsOptions,
  type ApplyPromotionSuggestionsOptions,
  type PromotionResult,
} from './current-promotion.js'

// Archive pipeline stages
export { resolveArchiveContext } from './resolve.js'
export { validateArchive } from './validate.js'
export { collectArchiveArtifacts } from './collect.js'
export { finalizeArchive, cleanupStaging } from './finalize.js'
export { formatBlockerMessage, formatArchiveReport, type ReportOptions } from './report.js'
export { generateAdHocIssueArtifacts, shouldGeneratePostHocPromotionCandidate } from './issue.js'
export type {
  ArchiveMode,
  ArchiveContext,
  ArchiveSourcePaths,
  ArchiveBlockerType,
  ArchiveBlocker,
  ValidationResult,
  ArchiveFileChange,
  FinalizeResult,
} from './types.js'
