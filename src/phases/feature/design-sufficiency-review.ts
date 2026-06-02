import type { RequirementModelV2 } from './requirement-model-v2.js'
import type {
  ConstraintCoverage,
  DesignReadiness,
  DesignReviewCategory,
  DesignReviewFinding,
  DesignReviewReport,
  GeneratedDocumentForReview,
  MissingFactRequest,
  StructuralCompleteness,
} from './design-review-report.js'

const IMPLEMENTATION_DETAIL_PATTERNS = [
  /\b(api|function|method|schema|payload|contract|enum|state|status|field|id|timeout|abort|retry|error|failure|failed|blocked|cancelled|lock|transaction|queue|event)\b/iu,
  /(?:接口|函数|方法|结构|字段|状态|枚举|载荷|契约|超时|中断|失败|错误|级联|取消|锁|事务|队列|事件|命名|前缀|输出|输入)/iu,
]

const FAILURE_PATTERNS = [
  /\b(fail|failed|failure|error|exception|timeout|abort|cancel|cancelled|blocked|retry|rollback)\b/iu,
  /(?:失败|异常|错误|超时|中断|取消|阻塞|重试|回滚|级联)/iu,
]

const DATA_CONTRACT_PATTERNS = [
  /\b(schema|payload|contract|field|enum|type|format|result|output)\b/iu,
  /(?:结构|字段|枚举|类型|格式|契约|输出|结果|载荷|数据)/iu,
]

const VERIFICATION_PATTERNS = [
  /\b(test|verify|verification|assert|inspect|review|e2e|integration|unit)\b/iu,
  /(?:测试|验证|断言|检查|审查|集成|单元|回归)/iu,
]

const ARCHITECTURE_PATTERNS = [
  /\b(component|boundary|integration|flow|dag|engine|service|session|queue|scheduler)\b/iu,
  /(?:组件|边界|集成|流程|引擎|服务|会话|调度|任务图|依赖图)/iu,
]

interface ReviewContext {
  model: RequirementModelV2
  documents: GeneratedDocumentForReview[]
  documentText: string
  architectureText: string
}

export function evaluateDesignSufficiency(
  model: RequirementModelV2,
  documents: GeneratedDocumentForReview[],
): DesignReviewReport {
  const context: ReviewContext = {
    model,
    documents,
    documentText: `${documents.map((document) => document.content).join('\n\n')}\n\n${collectModelText(model)}`,
    architectureText: collectArchitectureText(model),
  }

  const structuralCompleteness = assessStructuralCompleteness(model)
  const coverageMatrix = buildConstraintCoverage(context)
  const findings = buildFindings(context, structuralCompleteness, coverageMatrix)
  const missingImplementationFacts = buildMissingFacts(findings)
  const designReadiness = determineDesignReadiness(structuralCompleteness, findings)
  const status = designReadiness === 'ready_for_planning' ? 'ready' : 'not_ready'

  return {
    status,
    summary: status === 'ready'
      ? 'Design is structurally complete and implementation constraints are sufficient for planning.'
      : 'Design is generated, but implementation constraints are not yet sufficient for reliable planning.',
    structuralCompleteness,
    designReadiness,
    findings,
    coverageMatrix,
    missingImplementationFacts,
  }
}

export function createDesignReviewUnavailable(reason: string): DesignReviewReport {
  return {
    status: 'not_ready',
    summary: reason,
    structuralCompleteness: 'missing_architecture',
    designReadiness: 'not_ready',
    findings: [finding(
      'F-0000',
      'blocking',
      'constraint_specificity',
      reason,
      'Generate documents through the V2 requirement pipeline so design sufficiency can be reviewed structurally.',
    )],
    coverageMatrix: [],
    missingImplementationFacts: [{
      key: 'v2_requirement_model',
      question: 'Can the feature evidence be normalized into the V2 requirement model?',
      reason,
    }],
  }
}

export function renderDesignReviewSummary(report: DesignReviewReport): string {
  const blocking = report.findings.filter((finding) => finding.severity === 'blocking')
  const warnings = report.findings.filter((finding) => finding.severity === 'warning')

  const lines = [
    '<!-- OPENFLOW:DESIGN_REVIEW_SUMMARY:BEGIN -->',
    '## Design Sufficiency Review',
    '',
    `- Status: ${report.status === 'ready' ? 'Ready' : 'Not Ready'}`,
    `- Structural Completeness: ${report.structuralCompleteness}`,
    `- Design Readiness: ${report.designReadiness}`,
    `- Blocking findings: ${blocking.length}`,
    `- Warnings: ${warnings.length}`,
    `- Summary: ${report.summary}`,
  ]

  if (report.findings.length > 0) {
    lines.push('', '### Findings')
    for (const finding of report.findings) {
      lines.push(
        '',
        `#### ${finding.id}: ${finding.category}`,
        `- Severity: ${finding.severity}`,
        `- Finding: ${finding.message}`,
        `- Suggested fix: ${finding.suggestedFix}`,
      )
    }
  }

  if (report.coverageMatrix.length > 0) {
    lines.push('', '### Constraint Coverage Matrix', '')
    lines.push('| Constraint | Goals | Scenarios | Criteria | Architecture | Sufficiency | Missing Details |')
    lines.push('|------------|-------|-----------|----------|--------------|-------------|-----------------|')
    for (const row of report.coverageMatrix) {
      lines.push(`| ${escapeTable(row.constraintText)} | ${row.coveredByGoals.length} | ${row.coveredByScenarios.length} | ${row.coveredBySuccessCriteria.length} | ${row.coveredByArchitecture.length} | ${row.sufficiency} | ${escapeTable(row.missingDetails.join('; ') || '-')} |`)
    }
  }

  if (report.missingImplementationFacts.length > 0) {
    lines.push('', '### Next Required Facts')
    for (const fact of report.missingImplementationFacts) {
      lines.push(`- **${fact.key}**: ${fact.question}`)
      lines.push(`  - Reason: ${fact.reason}`)
      if (fact.exampleAnswer) lines.push(`  - Example: ${fact.exampleAnswer}`)
    }
  }

  lines.push('<!-- OPENFLOW:DESIGN_REVIEW_SUMMARY:END -->')
  return lines.join('\n')
}

function assessStructuralCompleteness(model: RequirementModelV2): StructuralCompleteness {
  if (model.goals.length === 0) return 'missing_goals'
  if (model.successCriteria.length === 0) return 'missing_acceptance_criteria'
  if (model.behaviorScenarios.length === 0) return 'missing_behavior_scenarios'
  if (!model.architecture || (
    model.architecture.components.length === 0 &&
    model.architecture.taskFlows.length === 0 &&
    model.architecture.payloadSchemas.length === 0 &&
    model.architecture.integrationBoundaries.length === 0
  )) {
    return 'missing_architecture'
  }
  return 'structurally_complete'
}

function buildConstraintCoverage(context: ReviewContext): ConstraintCoverage[] {
  const implementationConstraints = parseImplementationConstraints(context.documentText)

  return context.model.constraints
    .filter((constraint) => constraint.severity === 'must' || isHighImportanceConstraint(constraint.description))
    .map((constraint) => {
      const coveredByGoals = context.model.goals
        .filter((goal) => overlaps(constraint.description, goal.description))
        .map((goal) => goal.id)
      const coveredByScenarios = context.model.behaviorScenarios
        .filter((scenario) => overlaps(constraint.description, `${scenario.title} ${scenario.given.join(' ')} ${scenario.when} ${scenario.then.join(' ')}`))
        .map((scenario) => scenario.id)
      const coveredBySuccessCriteria = context.model.successCriteria
        .filter((criterion) => overlaps(constraint.description, `${criterion.outcome} ${criterion.verificationMethod}`))
        .map((criterion) => criterion.id)
      const coveredByArchitecture = architectureCoverageIds(context, constraint.description)
      const coveredByImplementation = implementationConstraints.filter((ic) =>
        overlaps(constraint.description, `${ic.id} ${ic.title} ${ic.description}`),
      )
      const missingDetails = missingConstraintDetails(context, constraint.description, coveredByImplementation.length > 0)
      const coverageCount = [coveredByGoals, coveredByScenarios, coveredBySuccessCriteria, coveredByArchitecture]
        .filter((items) => items.length > 0).length + (coveredByImplementation.length > 0 ? 1 : 0)

      // If covered by Implementation Constraints, never mark as 'missing'
      const baseSufficiency = missingDetails.length === 0 && coverageCount >= 3
        ? 'sufficient'
        : coverageCount === 0
          ? 'missing'
          : 'partial'

      return {
        constraintId: constraint.id,
        constraintText: constraint.description,
        coveredByGoals,
        coveredByScenarios,
        coveredBySuccessCriteria,
        coveredByArchitecture,
        sufficiency: coveredByImplementation.length > 0 && baseSufficiency === 'missing'
          ? 'partial'
          : baseSufficiency,
        missingDetails,
      }
    })
}

function buildFindings(
  context: ReviewContext,
  structuralCompleteness: StructuralCompleteness,
  coverageMatrix: ConstraintCoverage[],
): DesignReviewFinding[] {
  const findings: DesignReviewFinding[] = []

  if (structuralCompleteness !== 'structurally_complete') {
    findings.push(finding('F-0001', 'blocking', 'constraint_specificity',
      `Structural completeness is ${structuralCompleteness}.`,
      'Add the missing structural sections before implementation planning.'))
  }

  const insufficient = coverageMatrix.filter((row) => row.sufficiency !== 'sufficient')
  if (insufficient.length > 0) {
    findings.push(finding('F-0002', 'blocking', 'constraint_specificity',
      `${insufficient.length} important constraint(s) are not sufficiently covered by scenarios, criteria, and architecture.`,
      'Add implementation-level constraints that name owners, triggers, state changes, failure behavior, and verification methods.'))
  }

  if (context.model.behaviorScenarios.length < 2) {
    findings.push(finding('F-0003', 'warning', 'behavior_coverage',
      'Behavior coverage is thin; fewer than two scenarios were synthesized.',
      'Add observable examples for the main success path and at least one failure/edge path.'))
  }

  if (needsDataContract(context) && !hasDataContracts(context)) {
    findings.push(finding('F-0004', 'blocking', 'data_contract',
      'The design references outputs, payloads, compatibility, or result contracts without a concrete data contract.',
      'Define required fields, optional fields, enum/status values, and compatibility expectations.'))
  }

  if (needsFailureSemantics(context) && !hasFailureSemantics(context.documentText)) {
    findings.push(finding('F-0005', 'blocking', 'failure_semantics',
      'The design involves execution, tasks, or state transitions but lacks explicit failure/timeout/abort semantics.',
      'Specify failed/blocked/cancelled states, timeout behavior, abort propagation, and retry policy.'))
  }

  if (needsIntegrationBoundary(context) && !hasIntegrationBoundaries(context)) {
    findings.push(finding('F-0006', 'blocking', 'integration_boundary',
      'The design references integration with existing systems but lacks explicit allowed and forbidden boundary changes.',
      'Document integration boundaries, allowed changes, forbidden changes, and compatibility guarantees.'))
  }

  if (!hasStrongVerification(context)) {
    findings.push(finding('F-0007', 'warning', 'verification',
      'Verification is mostly review-based and may not catch behavior regressions.',
      'Add automated unit/integration/regression checks for the main workflow and failure paths.'))
  }

  return findings
}

function determineDesignReadiness(
  structuralCompleteness: StructuralCompleteness,
  findings: DesignReviewFinding[],
): DesignReadiness {
  if (structuralCompleteness !== 'structurally_complete') return 'not_ready'
  const blocking = findings.filter((finding) => finding.severity === 'blocking')
  if (blocking.length === 0) return 'ready_for_planning'
  if (blocking.some((finding) => finding.category === 'data_contract')) return 'needs_data_contracts'
  if (blocking.some((finding) => finding.category === 'failure_semantics')) return 'needs_failure_semantics'
  if (blocking.some((finding) => finding.category === 'behavior_coverage')) return 'needs_behavior_examples'
  return 'needs_implementation_constraints'
}

function buildMissingFacts(findings: DesignReviewFinding[]): MissingFactRequest[] {
  const facts: MissingFactRequest[] = []
  const add = (fact: MissingFactRequest) => {
    if (!facts.some((item) => item.key === fact.key)) facts.push(fact)
  }

  for (const finding of findings.filter((item) => item.severity === 'blocking')) {
    if (finding.category === 'constraint_specificity') {
      add({
        key: 'implementation_constraints',
        question: 'Which concrete APIs, state transitions, payload fields, and ownership rules must the implementation follow?',
        reason: finding.message,
        exampleAnswer: 'Define task ids, output schema, state transitions, and ownership for each workflow step.',
      })
    }
    if (finding.category === 'data_contract') {
      add({
        key: 'data_contracts',
        question: 'What are the exact required/optional fields, enum values, and compatibility rules for each output contract?',
        reason: finding.message,
        exampleAnswer: 'harden_result = { findings: Finding[], codeChanges?: CodeChange[], readiness: ReadinessStatus } with status enum ...',
      })
    }
    if (finding.category === 'failure_semantics') {
      add({
        key: 'failure_semantics',
        question: 'How should failures, timeouts, aborts, blocked downstream work, and retries be handled?',
        reason: finding.message,
        exampleAnswer: 'On timeout, abort DAG, mark running/pending tasks cancelled, and return a timeout harden_result.',
      })
    }
    if (finding.category === 'integration_boundary') {
      add({
        key: 'integration_boundaries',
        question: 'Which existing components may change, which must remain compatible, and what changes are forbidden?',
        reason: finding.message,
      })
    }
  }

  return facts
}

function missingConstraintDetails(context: ReviewContext, constraint: string, coveredByImplementation: boolean): string[] {
  const details: string[] = []
  if (!hasAnyPattern(constraint, IMPLEMENTATION_DETAIL_PATTERNS) && !hasAnyPattern(context.documentText, IMPLEMENTATION_DETAIL_PATTERNS)) {
    details.push('implementation detail')
  }
  if (isExecutionConstraint(constraint) && !hasFailureSemantics(context.documentText)) {
    details.push('failure/timeout/abort semantics')
  }
  if (isContractConstraint(constraint) && !hasDataContracts(context)) {
    details.push('data contract')
  }
  if (!coveredByImplementation && !hasStrongVerificationForConstraint(context, constraint)) {
    details.push('strong verification')
  }
  return details
}

function architectureCoverageIds(context: ReviewContext, constraint: string): string[] {
  if (!context.model.architecture) return []
  const ids: string[] = []
  for (const component of context.model.architecture.components) {
    if (overlaps(constraint, `${component.name} ${component.role} ${component.responsibilities.join(' ')}`)) ids.push(component.name)
  }
  for (const flow of context.model.architecture.taskFlows) {
    if (overlaps(constraint, `${flow.title} ${flow.steps.map((step) => `${step.actor} ${step.action} ${step.output ?? ''}`).join(' ')}`)) ids.push(flow.id)
  }
  for (const schema of context.model.architecture.payloadSchemas) {
    if (overlaps(constraint, `${schema.name} ${schema.purpose} ${schema.fields.map((field) => `${field.name} ${field.description}`).join(' ')}`)) ids.push(schema.name)
  }
  for (const boundary of context.model.architecture.integrationBoundaries) {
    if (overlaps(constraint, `${boundary.from} ${boundary.to} ${boundary.contract} ${boundary.allowedChanges.join(' ')} ${boundary.forbiddenChanges.join(' ')}`)) ids.push(`${boundary.from}->${boundary.to}`)
  }
  return ids
}

function collectArchitectureText(model: RequirementModelV2): string {
  if (!model.architecture) return ''
  return JSON.stringify(model.architecture)
}

function collectModelText(model: RequirementModelV2): string {
  return JSON.stringify({
    problem: model.problem,
    goals: model.goals,
    constraints: model.constraints,
    scenarios: model.behaviorScenarios,
    criteria: model.successCriteria,
    architecture: model.architecture,
  })
}

function isHighImportanceConstraint(text: string): boolean {
  return /(?:must|必须|shall|不得|禁止|安全|兼容|隔离|失败|超时|abort|critical|required|hard limit|上限)/iu.test(text)
}

function isExecutionConstraint(text: string): boolean {
  return /(?:执行|任务|DAG|DRG|workflow|flow|run|trigger|schedule|自动|quality-gate|reviewer|executor|session|状态)/iu.test(text)
}

function isContractConstraint(text: string): boolean {
  return /(?:输出|结果|兼容|格式|schema|payload|contract|result|Code Changes|harden_result|readiness)/iu.test(text)
}

function needsDataContract(context: ReviewContext): boolean {
  return hasAnyPattern(context.documentText, DATA_CONTRACT_PATTERNS)
}

function hasDataContracts(context: ReviewContext): boolean {
  return Boolean(context.model.architecture?.payloadSchemas.length)
}

function needsFailureSemantics(context: ReviewContext): boolean {
  return /(?:执行|任务|DAG|DRG|workflow|run|trigger|自动|session|quality-gate|reviewer|executor)/iu.test(context.documentText)
}

function hasFailureSemantics(text: string): boolean {
  return hasAnyPattern(text, FAILURE_PATTERNS)
}

function needsIntegrationBoundary(context: ReviewContext): boolean {
  return hasAnyPattern(context.documentText, ARCHITECTURE_PATTERNS)
}

function hasIntegrationBoundaries(context: ReviewContext): boolean {
  return Boolean(context.model.architecture?.integrationBoundaries.length)
}

function hasStrongVerification(context: ReviewContext): boolean {
  return context.model.successCriteria.some((criterion) =>
    /(?:test|integration|unit|regression|automated|测试|集成|单元|回归|自动)/iu.test(criterion.verificationMethod),
  ) || hasAnyPattern(context.documentText, VERIFICATION_PATTERNS)
}

function hasStrongVerificationForConstraint(context: ReviewContext, constraint: string): boolean {
  return context.model.successCriteria.some((criterion) =>
    overlaps(constraint, criterion.outcome) && /(?:test|integration|unit|regression|automated|测试|集成|单元|回归|自动|compatibility)/iu.test(criterion.verificationMethod),
  )
}

function hasAnyPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text))
}

interface ImplementationConstraint {
  id: string
  title: string
  description: string
}

function parseImplementationConstraints(documentText: string): ImplementationConstraint[] {
  const constraints: ImplementationConstraint[] = []
  const icSectionMatch = documentText.match(/##\s+Implementation\s+Constraints[\s\S]*?(?=##\s|$)/i)
  if (!icSectionMatch) return constraints

  const section = icSectionMatch[0]
  // Support multiple formats: ### IC-XX: Title, ### N. Title, **IC-XX**: Title
  const icBlocks = section.matchAll(/###\s+(?:IC-)?(\d+):?\s*(.+?)\n([\s\S]*?)(?=###\s+(?:IC-)?\d+|$)/gi)

  for (const block of icBlocks) {
    const num = block[1]!.trim()
    const title = block[2]!.trim()
    const body = block[3]!.trim()
    constraints.push({
      id: `IC-${num}`,
      title,
      description: `${title}\n${body}`,
    })
  }

  return constraints
}

function overlaps(left: string, right: string): boolean {
  const leftTokens = tokenize(left)
  const rightTokens = tokenize(right)
  if (leftTokens.length === 0 || rightTokens.length === 0) return false

  let hits = 0
  for (const token of leftTokens) {
    if (rightTokens.includes(token)) hits++
  }

  return hits >= Math.min(3, leftTokens.length)
}

function tokenize(text: string): string[] {
  const normalized = text.toLowerCase()
  const ascii = normalized.match(/[a-z0-9_-]{3,}/g) ?? []
  const cjk = normalized.match(/[\p{Script=Han}]{2,}/gu) ?? []
  return Array.from(new Set([...ascii, ...cjk]))
    .filter((token) => !['must', 'should', 'verify', 'implementation', 'review', '通过', '必须', '确认'].includes(token))
}

function finding(
  id: string,
  severity: 'blocking' | 'warning' | 'info',
  category: DesignReviewCategory,
  message: string,
  suggestedFix: string,
): DesignReviewFinding {
  return {
    id,
    severity,
    category,
    message,
    evidenceIds: [],
    suggestedFix,
  }
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>')
}
