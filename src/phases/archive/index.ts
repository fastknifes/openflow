export {
  generateImplementationMapper,
  saveImplementationMapperDocument,
  generateAndSaveImplementationMapper,
  type ImplementationMapperOptions,
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
