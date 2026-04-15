export {
  generateImplementationMapper,
  saveImplementationMapperDocument,
  generateAndSaveImplementationMapper,
  type ImplementationMapperOptions,
} from './implementation-mapper.js'
export { 
  extractCodeSymbols, 
  generateCodeMappingTable, 
  generateApiEndpointsTable,
  generateDependenciesTable,
  generateCodeMappingMarkdown,
  saveCodeMapping,
  type CodeMappingEntry,
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
