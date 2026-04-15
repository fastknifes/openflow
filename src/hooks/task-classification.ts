const VERIFICATION_KEYWORDS = ['verify', 'verification', 'check', 'test', 'validate', 'review', 'pass', 'fail', 'assert', 'confirm', 'build']
const VERIFICATION_CATEGORIES = ['test', 'verification', 'quality', 'review']
const VERIFICATION_SUBAGENT_TYPES = ['oracle', 'momus']
const VERIFICATION_CONTEXT_PATTERNS = [
  'before completion',
  'after implementation',
  'run tests',
  'run lint',
  'run build',
  'type check',
  'lsp_diagnostics',
  'build command',
  'ensure passing',
  'verify that',
  'check that',
  'confirm that',
]
const ORACLE_VERIFICATION_PATTERNS = [
  'verify',
  'validation',
  'after implementation',
  'before completion',
  'is complete',
  'assess whether',
  'evaluate whether',
  'assess if',
  'evaluate if',
]
const CHECK_TARGET_PATTERNS = ['test', 'code', 'lint', 'type', 'build']

const IMPLEMENTATION_CATEGORIES = ['quick', 'deep', 'unspecified-low', 'unspecified-high', 'artistry', 'visual-engineering', 'ultrabrain']
const IMPLEMENTATION_KEYWORDS = ['implement', 'implementation', 'add', 'create', 'build', 'develop', 'fix', 'update', 'modify', 'refactor', 'integrate', 'write code', 'code', 'ship', '实现', '开发', '添加', '新增', '创建', '修复', '更新', '修改', '重构', '集成', '编写']
const IMPLEMENTATION_NOUNS = ['feature', 'module', 'component', 'page', 'api', 'endpoint', 'bug', 'issue', 'workflow', 'flow', 'logic', 'code', 'file', 'service', '功能', '模块', '页面', '接口', '缺陷', '问题', '流程', '逻辑', '代码', '文件']

function containsAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern))
}

function hasOracleVerificationIntent(lowerPrompt: string): boolean {
  const hasDirectPattern = containsAny(lowerPrompt, ORACLE_VERIFICATION_PATTERNS)
  const hasCheckIntent = lowerPrompt.includes('check') && containsAny(lowerPrompt, CHECK_TARGET_PATTERNS)
  const hasTestIntent = lowerPrompt.includes('test') && !lowerPrompt.includes('test plan')
  return hasDirectPattern || hasCheckIntent || hasTestIntent
}

function hasPromptVerificationContext(lowerPrompt: string): boolean {
  return containsAny(lowerPrompt, VERIFICATION_CONTEXT_PATTERNS)
}

export function isVerificationTask(args?: Record<string, unknown>): boolean {
  if (!args) return false

  const category = (args.category as string | undefined)?.toLowerCase()
  if (category && VERIFICATION_CATEGORIES.includes(category)) {
    return true
  }

  const subagentType = (args.subagent_type as string | undefined)?.toLowerCase()
  const prompt = args.prompt as string | undefined
  const lowerPrompt = prompt?.toLowerCase() ?? ''

  if (subagentType && VERIFICATION_SUBAGENT_TYPES.includes(subagentType)) {
    return hasOracleVerificationIntent(lowerPrompt)
  }

  if (prompt) {
    const hasVerificationKeyword = VERIFICATION_KEYWORDS.some((kw) => lowerPrompt.includes(kw))
    const hasVerificationContext = hasPromptVerificationContext(lowerPrompt)
    return hasVerificationKeyword && hasVerificationContext
  }

  return false
}

export function isImplementationTask(args?: Record<string, unknown>): boolean {
  if (!args || isVerificationTask(args)) return false

  const category = (args.category as string | undefined)?.toLowerCase()
  const prompt = (args.prompt as string | undefined)?.toLowerCase() ?? ''

  if (!prompt) {
    return Boolean(category && IMPLEMENTATION_CATEGORIES.includes(category))
  }

  const hasImplementationKeyword = containsAny(prompt, IMPLEMENTATION_KEYWORDS)
  const hasImplementationNoun = containsAny(prompt, IMPLEMENTATION_NOUNS)

  if (hasImplementationKeyword) return true
  if (category && IMPLEMENTATION_CATEGORIES.includes(category) && hasImplementationNoun) return true

  return false
}
