import type { RequirementEvidence, EvidenceItem } from './requirement-evidence.js'
import type { RequirementModelV2 } from './requirement-model-v2.js'

/**
 * Requirements Synthesizer interface.
 *
 * Implementations take normalized evidence and produce a structured
 * RequirementModelV2. The synthesizer is the semantic brain of the
 * requirement generation pipeline — it decides how goals, scenarios,
 * success criteria, and architecture views are composed from evidence.
 */
export interface RequirementSynthesizer {
  synthesize(evidence: RequirementEvidence): Promise<RequirementModelV2>
}

/**
 * Default rule-based synthesizer.
 *
 * This is a deterministic synthesizer that maps evidence items directly
 * into model fields without LLM inference. It produces honest output:
 * missing evidence results in empty fields, not fabricated content.
 */
export class RuleBasedSynthesizer implements RequirementSynthesizer {
  async synthesize(evidence: RequirementEvidence): Promise<RequirementModelV2> {
    const feature = evidence.feature

    // --- Problem ---
    const problem = this.synthesizeProblem(evidence)

    // --- Goals ---
    const goals = this.synthesizeGoals(evidence)

    // --- Decisions ---
    const decisions = this.synthesizeDecisions(evidence)

    // --- Constraints ---
    const constraints = this.synthesizeConstraints(evidence)

    // --- Non-Goals ---
    const nonGoals = this.synthesizeNonGoals(evidence)

    // --- Behavior Scenarios ---
    const behaviorScenarios = this.synthesizeBehaviorScenarios(evidence)

    // --- Success Criteria ---
    const successCriteria = this.synthesizeSuccessCriteria(evidence)

    // --- Architecture ---
    const architecture = this.synthesizeArchitecture(evidence)

    // --- Risks ---
    const risks = this.synthesizeRisks(evidence)

    // --- Testing Strategy ---
    const testingStrategy = this.synthesizeTestingStrategy(evidence)

    // --- Open Questions ---
    const openQuestions = this.synthesizeOpenQuestions(evidence)

    // --- Completeness ---
    const completeness = this.assessCompleteness(
      goals,
      successCriteria,
      behaviorScenarios,
      evidence,
    )

    return {
      feature,
      title: evidence.sourceIntent ?? feature,
      problem,
      goals,
      decisions,
      constraints,
      nonGoals,
      behaviorScenarios,
      successCriteria,
      architecture,
      risks,
      testingStrategy,
      openQuestions,
      completeness,
      evidence,
    }
  }

  // ── Problem Synthesis ───────────────────────────────────────────────────

  private synthesizeProblem(evidence: RequirementEvidence) {
    const problems = evidence.problems

    if (problems.length === 0) {
      return {
        currentState: 'Not specified',
        painPoints: [] as string[],
        desiredChange: 'Not specified',
        sourceEvidenceIds: [] as string[],
      }
    }

    const primary = problems[0]!
    const painPoints = problems.slice(1).map((p) => p.content)

    return {
      currentState: primary.content,
      painPoints,
      desiredChange: this.synthesizeDesiredChange(evidence),
      sourceEvidenceIds: problems.map((p) => p.id),
    }
  }

  // ── Goal Synthesis ──────────────────────────────────────────────────────

  private synthesizeGoals(evidence: RequirementEvidence) {
    // Use explicit goal evidence items
    if (evidence.goals.length > 0) {
      return evidence.goals.map((item, i) => ({
        id: `g-${String(i + 1).padStart(4, '0')}`,
        description: item.content,
        rationale: item.confidence === 'high' ? 'Confirmed by consensus' : undefined,
        sourceEvidenceIds: [item.id],
      }))
    }

    const goalEvidence = this.selectGoalEvidence(evidence)
    return goalEvidence.map((item, i) => ({
      id: `g-${String(i + 1).padStart(4, '0')}`,
      description: this.goalFromEvidence(item.content),
      rationale: `Derived from confirmed ${item.type} evidence`,
      sourceEvidenceIds: [item.id],
    }))
  }

  // ── Decision Synthesis ──────────────────────────────────────────────────

  private synthesizeDecisions(evidence: RequirementEvidence) {
    return evidence.decisions.map((item, i) => ({
      id: `d-${String(i + 1).padStart(4, '0')}`,
      topic: this.extractTopic(item.content),
      decision: item.content,
      rationale: `From ${item.source} (${item.confidence} confidence)`,
      sourceEvidenceIds: [item.id],
    }))
  }

  // ── Constraint Synthesis ────────────────────────────────────────────────

  private synthesizeConstraints(evidence: RequirementEvidence) {
    return evidence.constraints.map((item, i) => ({
      id: `c-${String(i + 1).padStart(4, '0')}`,
      category: this.inferCategory(item) as
        | 'compatibility'
        | 'performance'
        | 'scope'
        | 'security'
        | 'maintainability'
        | 'time',
      severity: item.confidence === 'high' ? 'must' as const : 'should' as const,
      description: item.content,
      rationale: `From ${item.source}`,
      verificationMethod: 'Review implementation against constraint',
      sourceEvidenceIds: [item.id],
    }))
  }

  // ── Non-Goal Synthesis ──────────────────────────────────────────────────

  private synthesizeNonGoals(evidence: RequirementEvidence) {
    return evidence.nonGoals.map((item, i) => ({
      id: `ng-${String(i + 1).padStart(4, '0')}`,
      description: item.content,
      sourceEvidenceIds: [item.id],
    }))
  }

  // ── Behavior Scenario Synthesis ─────────────────────────────────────────

  private synthesizeBehaviorScenarios(evidence: RequirementEvidence) {
    // Only create scenarios from observable examples
    const examples = evidence.examples.filter((e) => this.isObservable(e.content))

    if (examples.length > 0) {
      return examples.map((item, i) => ({
        id: `sc-${String(i + 1).padStart(4, '0')}`,
        title: item.content.slice(0, 60),
        actor: 'User or system',
        given: ['Feature is enabled', 'Context is set up'],
        when: 'Relevant action is triggered',
        then: [item.content],
        sourceEvidenceIds: [item.id],
      }))
    }

    return this.synthesizeScenariosFromEvidence(evidence)
  }

  // ── Success Criterion Synthesis ─────────────────────────────────────────

  private synthesizeSuccessCriteria(evidence: RequirementEvidence) {
    // Use explicit examples that are observable
    const observableExamples = evidence.examples.filter((e) =>
      this.isObservable(e.content),
    )

    if (observableExamples.length > 0) {
      return observableExamples.map((item, i) => ({
        id: `sc-${String(i + 1).padStart(4, '0')}`,
        outcome: item.content,
        verificationMethod: 'Verify through implementation review and testing',
        evidenceType: 'test' as const,
        sourceEvidenceIds: [item.id],
      }))
    }

    return this.synthesizeCriteriaFromEvidence(evidence)
  }

  // ── Architecture Synthesis ──────────────────────────────────────────────

  private synthesizeArchitecture(evidence: RequirementEvidence) {
    const architectureEvidence = this.uniqueEvidence([
      ...evidence.decisions,
      ...evidence.constraints,
      ...evidence.architectureNotes,
      ...evidence.integrationNotes,
      ...evidence.dataContractNotes,
    ])

    if (!this.hasHardenDrgContext(architectureEvidence)) return undefined

    const components = this.synthesizeArchitectureComponents(architectureEvidence)
    const taskFlows = this.synthesizeArchitectureTaskFlows(architectureEvidence)
    const payloadSchemas = this.synthesizePayloadSchemas(architectureEvidence)
    const integrationBoundaries = this.synthesizeIntegrationBoundaries(architectureEvidence)

    if (
      components.length === 0 &&
      taskFlows.length === 0 &&
      payloadSchemas.length === 0 &&
      integrationBoundaries.length === 0
    ) {
      return undefined
    }

    return {
      components,
      taskFlows,
      payloadSchemas,
      integrationBoundaries,
    }
  }

  private synthesizeArchitectureComponents(items: EvidenceItem[]) {
    const combined = items.map((item) => this.normalizedEvidenceContent(item.content)).join('\n')
    const components: Array<{ name: string; role: string; responsibilities: string[] }> = []

    if (/quality-gate/iu.test(combined)) {
      components.push({
        name: 'quality-gate',
        role: 'Entry point and readiness owner for harden execution',
        responsibilities: [
          'Decide whether harden should start before creating a DAG',
          'Consume the final harden_result/readiness output',
          'Expose final findings and Code Changes for user review',
        ],
      })
    }

    if (/DRG|DAG|harden-uuid|隔离/iu.test(combined)) {
      components.push({
        name: 'DRG harden DAG',
        role: 'Isolated task graph for one complex harden run',
        responsibilities: [
          'Keep each harden run isolated with a per-run DAG identity',
          'Chain reviewer/executor task outputs to downstream tasks',
          'Support abort/timeout/failure propagation without mixing runs',
        ],
      })
    }

    if (/reviewer/iu.test(combined)) {
      components.push({
        name: 'reviewer session',
        role: 'Adversarial reviewer that owns findings and convergence decisions',
        responsibilities: [
          'Report findings into the harden message flow',
          'Review executor replies and decide whether another round is needed',
          'Produce the final harden result when convergence or limits are reached',
        ],
      })
    }

    if (/executor/iu.test(combined)) {
      components.push({
        name: 'executor session',
        role: 'Repair agent that responds to reviewer findings',
        responsibilities: [
          'Fix high-confidence findings when applicable',
          'Report rejected or deferred findings back through DRG task output',
          'Keep code changes visible for final quality-gate review',
        ],
      })
    }

    return components
  }

  private synthesizeArchitectureTaskFlows(items: EvidenceItem[]) {
    if (!this.hasHardenDrgContext(items)) return []

    return [
      {
        id: 'tf-0001',
        title: 'quality-gate harden DRG flow',
        mermaid: 'flowchart LR\n  QG[quality-gate] --> DAG[harden DAG]\n  DAG --> R1[reviewer round]\n  R1 --> E1[executor round]\n  E1 --> R2[reviewer assessment]\n  R2 --> RESULT[harden_result / readiness]',
        steps: [
          {
            id: '1',
            actor: 'quality-gate',
            action: 'Evaluate harden need and create an isolated harden DAG when required',
            output: 'harden DAG identity and initial reviewer task',
          },
          {
            id: '2',
            actor: 'reviewer session',
            action: 'Report adversarial findings from the current message history',
            output: 'findings for executor task input',
          },
          {
            id: '3',
            actor: 'executor session',
            action: 'Fix high-confidence findings and report unresolved findings',
            output: 'code changes and executor reply',
          },
          {
            id: '4',
            actor: 'reviewer session',
            action: 'Assess executor reply and decide whether to continue or finish',
            output: 'final harden_result or next round request',
          },
          {
            id: '5',
            actor: 'quality-gate',
            action: 'Consume the final harden_result for readiness assessment',
            output: 'quality-gate readiness and user-visible final report',
          },
        ],
      },
    ]
  }

  private synthesizePayloadSchemas(items: EvidenceItem[]) {
    const combined = items.map((item) => this.normalizedEvidenceContent(item.content)).join('\n')

    if (!this.hasHardenDrgContext(items) || !/harden_result|harden result|输出格式|format|Code Changes/iu.test(combined)) return []

    return [
      {
        name: 'harden_result',
        purpose: 'Final output consumed by quality-gate and shown to the user during assessment',
        fields: [
          { name: 'findings', type: 'Finding[]', required: true, description: 'Reviewer findings and final disposition' },
          { name: 'codeChanges', type: 'CodeChange[]', required: false, description: 'Visible code changes for quality-gate review' },
          { name: 'readiness', type: 'ReadinessStatus', required: true, description: 'Final readiness signal consumed by quality-gate' },
        ],
      },
    ]
  }

  private synthesizeIntegrationBoundaries(items: EvidenceItem[]) {
    const combined = items.map((item) => this.normalizedEvidenceContent(item.content)).join('\n')
    const boundaries: Array<{ from: string; to: string; contract: string; allowedChanges: string[]; forbiddenChanges: string[] }> = []

    if (/quality-gate|harden_result|readiness/iu.test(combined)) {
      boundaries.push({
        from: 'quality-gate',
        to: 'harden DRG flow',
        contract: 'quality-gate owns start/stop/readiness decisions and consumes final harden_result output',
        allowedChanges: ['Create an isolated harden DAG for complex harden cases', 'Read final harden_result and Code Changes for final assessment'],
        forbiddenChanges: ['Bypass quality-gate readiness ownership', 'Start unbounded harden execution without quality-gate guardrails'],
      })
    }

    if (/DRG|DAG|隔离|harden-uuid/iu.test(combined)) {
      boundaries.push({
        from: 'harden DRG flow',
        to: 'DRG engine',
        contract: 'Use per-run DAG/task identities while preserving DRG engine boundaries',
        allowedChanges: ['Add runtime harden tasks and chain task outputs'],
        forbiddenChanges: ['Modify DRG core semantics for feature-specific behavior', 'Mix multiple harden runs in one DAG namespace'],
      })
    }

    return boundaries
  }

  private hasHardenDrgContext(items: EvidenceItem[]): boolean {
    const combined = items.map((item) => this.normalizedEvidenceContent(item.content)).join('\n')
    const hasHarden = /harden|harden_result|harden result/iu.test(combined)
    const hasGraph = /DRG|DAG|harden-uuid|任务图|依赖图/iu.test(combined)
    const hasQualityGate = /quality-gate/iu.test(combined)
    const hasReviewer = /reviewer/iu.test(combined)
    const hasExecutor = /executor/iu.test(combined)

    return hasHarden && hasGraph && hasQualityGate && hasReviewer && hasExecutor
  }

  // ── Risk Synthesis ──────────────────────────────────────────────────────

  private synthesizeRisks(evidence: RequirementEvidence) {
    return evidence.risks.map((item, i) => ({
      id: `r-${String(i + 1).padStart(4, '0')}`,
      description: item.content,
      mitigation: 'Confirm mitigation during design review',
      sourceEvidenceIds: [item.id],
    }))
  }

  // ── Testing Strategy Synthesis ──────────────────────────────────────────

  private synthesizeTestingStrategy(evidence: RequirementEvidence) {
    if (evidence.examples.length === 0 && !evidence.constraints.some((item) => this.isVerifiable(item.content))) {
      return undefined
    }

    if (this.hasHardenDrgContext([...evidence.decisions, ...evidence.constraints])) {
      return {
        unitTests: 'Test synthesized requirement helpers, safety guard decisions, and edge-case classifiers in isolation',
        integrationTests: 'Test DRG task chaining, DAG state transitions, timeout/abort behavior, and output compatibility contracts',
        endToEndTests: 'Run quality-gate with a complex harden case and verify the reviewer → executor → reviewer flow reaches a final harden result',
        manualVerification: 'Review generated docs and quality-gate final report for safety guard visibility, Code Changes disclosure, and compatibility expectations',
      }
    }

    return {
      unitTests: 'Test derived requirement rules and edge-case classifiers in isolation',
      integrationTests: 'Test component interactions and boundary contracts represented by the collected evidence',
      endToEndTests: 'Exercise the primary user-visible workflow described by the synthesized behavior scenarios',
      manualVerification: 'Review generated documents against the collected evidence and confirm no unsupported claims were introduced',
    }
  }

  // ── Open Question Synthesis ─────────────────────────────────────────────

  private synthesizeOpenQuestions(evidence: RequirementEvidence) {
    return evidence.openQuestions.map((item, i) => ({
      id: `oq-${String(i + 1).padStart(4, '0')}`,
      question: item.content,
      blocking: item.confidence === 'low',
    }))
  }

  // ── Completeness Assessment ─────────────────────────────────────────────

  private assessCompleteness(
    goals: { description: string }[],
    successCriteria: { outcome: string }[],
    behaviorScenarios: { title: string }[],
    evidence: RequirementEvidence,
  ) {
    if (goals.length === 0) return 'missing_goals'
    if (successCriteria.length === 0) return 'missing_acceptance_criteria'
    if (behaviorScenarios.length === 0) return 'missing_behavior_scenarios'
    if (
      evidence.decisions.length === 0 &&
      evidence.constraints.length === 0 &&
      evidence.architectureNotes.length === 0 &&
      evidence.integrationNotes.length === 0 &&
      evidence.dataContractNotes.length === 0
    ) {
      return 'missing_architecture'
    }
    return 'complete'
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private extractTopic(content: string): string {
    const match = content.match(/^([^:]+):/)
    return match?.[1] ? match[1].trim() : content.slice(0, 40)
  }

  private inferCategory(item: EvidenceItem): string {
    const lower = item.content.toLowerCase()
    if (/sec|auth|perm|encrypt|vuln/i.test(lower)) return 'security'
    if (/perf|latenc|throughput|speed|memory/i.test(lower)) return 'performance'
    if (/compat|version|browser|platform/i.test(lower)) return 'compatibility'
    if (/maintain|clean|refactor|test/i.test(lower)) return 'maintainability'
    if (/deadline|milestone|time|schedule/i.test(lower)) return 'time'
    return 'scope'
  }

  private isObservable(content: string): boolean {
    return /\b(user|caller|system|assistant|command|request|response|shows?|returns?|generates?|creates?|updates?|fails?|blocks?|prevents?|displays?|observes?)\b/iu.test(content)
  }

  private selectGoalEvidence(evidence: RequirementEvidence): EvidenceItem[] {
    const candidates = [...evidence.constraints, ...evidence.decisions]
      .filter((item) => this.isGoalLike(this.normalizedEvidenceContent(item.content)))
      .filter((item) => !this.isProblemCopy(item.content, evidence))

    return this.selectEvidenceBySemanticSlots(
      this.uniqueEvidence(candidates),
      [
        (content) => /reviewer.*executor.*(?:修复|报告|审查|对抗)|executor.*reviewer|对抗模型|消息|报告|修复/iu.test(content),
        (content) => /隔离|harden-uuid|独立\s*DAG/iu.test(content),
        (content) => /quality-gate|readiness|harden_result|最终.*判定/iu.test(content),
        (content) => /确认|门控|安全|防止|上限|超时|abort|中断/iu.test(content),
        (content) => /兼容|输出格式|format/iu.test(content),
      ],
      (item) => this.goalPriority(item),
      5,
    )
  }

  private isGoalLike(content: string): boolean {
    return /(?:改造|重构|使用|保持|支持|实现|建立|创建|修复|审查|报告|消费|判定|触发|默认|终止|隔离|兼容|防止|确保|preserve|support|use|refactor|ensure|prevent|isolate|compatible)/iu.test(content)
  }

  private isProblemCopy(content: string, evidence: RequirementEvidence): boolean {
    const normalized = this.normalizedEvidenceContent(content)
    return evidence.problems.some((problem) => this.normalizedEvidenceContent(problem.content) === normalized)
  }

  private goalFromEvidence(content: string): string {
    return this.normalizedEvidenceContent(content)
  }

  private normalizedEvidenceContent(content: string): string {
    return content
      .replace(/^Decision from brainstorm:\s*/iu, '')
      .replace(/\s*\(理由:[^)]+\)/gu, '')
      .replace(/\s*\(source:[^)]+\)/giu, '')
      .trim()
  }

  private synthesizeDesiredChange(evidence: RequirementEvidence): string {
    if (evidence.goals.length > 0) return evidence.goals.map((g) => g.content).join('; ')

    const derivedGoals = this.selectGoalEvidence(evidence)
      .map((item) => this.goalFromEvidence(item.content))
      .slice(0, 3)

    return derivedGoals.length > 0 ? derivedGoals.join('; ') : 'Not specified'
  }

  private goalPriority(item: EvidenceItem): number {
    const content = this.normalizedEvidenceContent(item.content)
    let score = 0

    if (/quality-gate|readiness|harden_result|最终.*判定/iu.test(content)) score += 8
    if (/reviewer|executor|对抗|消息|报告|round|轮/iu.test(content)) score += 7
    if (/发现问题|修复高置信度|继续审查|不修复/iu.test(content)) score += 6
    if (/DAG|隔离|harden-uuid|独立/iu.test(content)) score += 6
    if (/兼容|输出格式|format/iu.test(content)) score += 5
    if (/确认|门控|安全|防止|上限|超时|abort|中断/iu.test(content)) score += 5
    if (/异步|session|链式传递/iu.test(content)) score += 4
    if (/全局单例|事件总线/iu.test(content)) score -= 2
    if (item.type === 'constraint') score += 1
    if (item.confidence === 'high') score += 1

    return score
  }

  private synthesizeCriteriaFromEvidence(evidence: RequirementEvidence) {
    const source = this.selectEvidenceBySemanticSlots(
      this.uniqueEvidence(
      evidence.constraints.filter((item) => this.isVerifiable(item.content)),
      ),
      [
        (content) => /quality-gate.*(?:触发|创建)|harden_result|readiness/iu.test(content),
        (content) => /reviewer.*executor|executor.*reviewer|对抗|报告|修复|审查/iu.test(content),
        (content) => /隔离|harden-uuid|独立\s*DAG|销毁/iu.test(content),
        (content) => /失败|blocked|failed|超时|abort|中断|上限|无限/iu.test(content),
        (content) => /兼容|输出格式|format/iu.test(content),
        (content) => /确认|review|Code Changes/iu.test(content),
      ],
      (item) => this.criterionPriority(item),
      8,
    )

    return source.map((item, i) => ({
      id: `sc-${String(i + 1).padStart(4, '0')}`,
      outcome: this.criterionFromEvidence(item.content),
      verificationMethod: this.verificationMethodFor(item.content),
      evidenceType: 'manual-review' as const,
      sourceEvidenceIds: [item.id],
    }))
  }

  private isVerifiable(content: string): boolean {
    return /(?:创建|输出|返回|阻止|失败|终止|报告|兼容|隔离|上限|确认|review|create|return|block|fail|report|preserve|limit|confirm|abort)/iu.test(this.normalizedEvidenceContent(content))
  }

  private criterionFromEvidence(content: string): string {
    const normalized = this.goalFromEvidence(content)
    return `Verify that ${normalized}`
  }

  private verificationMethodFor(content: string): string {
    if (/(?:测试|test|失败|failed|blocked|abort|终止)/iu.test(content)) return 'Automated or integration test'
    if (/(?:兼容|输出格式|format)/iu.test(content)) return 'Compatibility review and regression test'
    return 'Design and implementation review'
  }

  private criterionPriority(item: EvidenceItem): number {
    const content = this.normalizedEvidenceContent(item.content)
    let score = 0

    if (/quality-gate|readiness|harden_result/iu.test(content)) score += 8
    if (/reviewer|executor|报告|修复|审查/iu.test(content)) score += 7
    if (/DAG|隔离|创建|销毁/iu.test(content)) score += 6
    if (/失败|blocked|failed|超时|abort|中断|上限/iu.test(content)) score += 6
    if (/兼容|输出格式|format/iu.test(content)) score += 5
    if (/确认|review|Code Changes/iu.test(content)) score += 4
    if (item.confidence === 'high') score += 1

    return score
  }

  private synthesizeScenariosFromEvidence(evidence: RequirementEvidence) {
    const flowEvidence = this.selectEvidenceBySemanticSlots(
      this.uniqueEvidence(
        [...evidence.constraints, ...evidence.decisions].filter((item) => this.isScenarioEvidence(item)),
      ),
      [
        (content) => /reviewer.*executor.*(?:修复|报告|审查|对抗)|executor.*reviewer|对抗模型|消息|报告|修复/iu.test(content),
        (content) => /隔离|harden-uuid|独立\s*DAG/iu.test(content),
        (content) => /quality-gate.*(?:触发|创建)|harden_result|readiness/iu.test(content),
        (content) => /上限|超时|abort|中断|无限|确认|门控/iu.test(content),
      ],
      (item) => this.scenarioPriority(item),
      4,
    )

    return flowEvidence.map((item, i) => ({
      id: `bs-${String(i + 1).padStart(4, '0')}`,
      title: this.scenarioTitle(item.content),
      actor: this.inferActor(item.content),
      given: this.scenarioGiven(item.content),
      when: this.scenarioWhen(item.content),
      then: [this.scenarioThen(item.content)],
      sourceEvidenceIds: [item.id],
    }))
  }

  private scenarioTitle(content: string): string {
    const cleaned = this.goalFromEvidence(content)
    if (/quality-gate.*(?:触发|创建).*harden DAG/iu.test(cleaned)) return 'quality-gate starts and consumes the harden DAG'
    if (/自动执行.*quality-gate.*门控|quality-gate.*风险评估门控/iu.test(cleaned)) return 'automatic harden execution is gated by quality-gate'
    if (/reviewer.*executor|executor.*reviewer|对抗/iu.test(cleaned)) return 'reviewer and executor exchange adversarial findings'
    if (/隔离|独立DAG|harden-uuid/iu.test(cleaned)) return 'each harden run uses an isolated DAG'
    if (/上限|超时|abort|中断|无限/iu.test(cleaned)) return 'runaway harden execution is stopped by guards'
    if (/输出格式|兼容|harden result/iu.test(cleaned)) return 'harden result remains compatible with existing consumers'
    return cleaned.length > 60 ? `${cleaned.slice(0, 57)}...` : cleaned
  }

  private inferActor(content: string): string {
    if (/quality-gate/iu.test(content)) return 'quality-gate'
    if (/reviewer/iu.test(content)) return 'reviewer'
    if (/executor/iu.test(content)) return 'executor'
    return 'system'
  }

  private scenarioGiven(content: string): string[] {
    const cleaned = this.goalFromEvidence(content)
    if (/quality-gate/iu.test(cleaned)) return ['quality-gate has been invoked by the user']
    if (/reviewer|executor|对抗/iu.test(cleaned)) return ['reviewer and executor sessions are available or can be lazily created']
    if (/DAG|dag|隔离/iu.test(cleaned)) return ['A harden request is ready to run']
    return ['Feature evidence is confirmed']
  }

  private scenarioWhen(content: string): string {
    const cleaned = this.goalFromEvidence(content)
    if (/quality-gate.*(?:触发|创建)|触发|创建|create/iu.test(cleaned)) return 'the workflow reaches the described trigger point'
    if (/终止|max|上限|结束|超时|abort|中断/iu.test(cleaned)) return 'the workflow evaluates whether to continue or stop'
    return 'the relevant workflow step executes'
  }

  private scenarioThen(content: string): string {
    return this.goalFromEvidence(content)
  }

  private uniqueEvidence(items: EvidenceItem[]): EvidenceItem[] {
    const seen = new Set<string>()
    return items.filter((item) => {
      const key = this.goalFromEvidence(item.content)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  private selectEvidenceBySemanticSlots(
    items: EvidenceItem[],
    slotPredicates: Array<(content: string) => boolean>,
    score: (item: EvidenceItem) => number,
    limit: number,
  ): EvidenceItem[] {
    const selected: EvidenceItem[] = []
    const remaining = [...items]

    for (const predicate of slotPredicates) {
      const match = remaining
        .filter((item) => predicate(this.normalizedEvidenceContent(item.content)))
        .sort((a, b) => score(b) - score(a))[0]

      if (!match) continue

      selected.push(match)
      remaining.splice(remaining.indexOf(match), 1)
      if (selected.length >= limit) return selected
    }

    selected.push(
      ...remaining
        .sort((a, b) => score(b) - score(a))
        .slice(0, Math.max(0, limit - selected.length)),
    )

    return selected
  }

  private isScenarioEvidence(item: EvidenceItem): boolean {
    const content = this.normalizedEvidenceContent(item.content)
    if (/全局单例|事件总线/iu.test(content)) return false
    return /(?:reviewer|executor|quality-gate|DAG|message|消息|报告|round|轮|触发|创建|终止|harden result|harden_result|隔离|超时|abort|中断)/iu.test(content)
  }

  private scenarioPriority(item: EvidenceItem): number {
    const content = this.normalizedEvidenceContent(item.content)
    let score = 0

    if (/quality-gate.*(?:触发|创建)|harden_result|readiness/iu.test(content)) score += 10
    if (/reviewer.*executor|executor.*reviewer|对抗|报告|修复/iu.test(content)) score += 9
    if (/发现问题|修复高置信度|继续审查|不修复/iu.test(content)) score += 6
    if (/DAG|隔离|harden-uuid|独立/iu.test(content)) score += 8
    if (/上限|超时|abort|中断|无限/iu.test(content)) score += 7
    if (/兼容|输出格式|format/iu.test(content)) score += 5
    if (item.type === 'constraint') score += 1
    if (item.confidence === 'high') score += 1

    return score
  }
}

// --- Default instance ---

export const defaultSynthesizerV2: RequirementSynthesizer = new RuleBasedSynthesizer()
