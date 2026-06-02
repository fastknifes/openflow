/**
 * Gate 1: Requirement Clearance
 *
 * Pre-generation assessment that determines whether collected facts
 * cover enough design dimensions to produce meaningful documents.
 *
 * The clearance loop works as:
 *   collect facts → assess clearance → if insufficient: ask questions → collect answers → repeat
 *   → if sufficient: proceed to document generation
 */

import type { FeatureSession } from './state-machine.js'

// ── Types ──────────────────────────────────────────────────────────────────

export type RequirementDimension =
  | 'problem'
  | 'constraints'
  | 'architecture'
  | 'behavior'
  | 'data_contracts'
  | 'failure_semantics'
  | 'integration_boundaries'
  | 'verification'

export interface ClarificationQuestion {
  dimension: RequirementDimension
  question: string
  reason: string
  exampleAnswer: string
}

export interface RequirementClearanceReport {
  status: 'needs_clarification' | 'ready_for_generation'
  coveredDimensions: RequirementDimension[]
  missingDimensions: RequirementDimension[]
  questions: ClarificationQuestion[]
  round: number
  maxRoundsReached: boolean
}

// ── Dimension definitions ──────────────────────────────────────────────────

interface DimensionCheck {
  dimension: RequirementDimension
  blocking: boolean
  check: (facts: Record<string, string>, allText: string) => boolean
  question: ClarificationQuestion
}

const DIMENSION_CHECKS: DimensionCheck[] = [
  {
    dimension: 'problem',
    blocking: true,
    check: (facts, text) =>
      Boolean(facts.problem?.trim())
      || /(?:问题|痛点|当前|现状|需要|优化|重新设计|fix|issue|problem|pain|current|broken)/iu.test(text),
    question: {
      dimension: 'problem',
      question: 'What is the current problem or pain point this feature addresses?',
      reason: 'No problem statement or motivation was found in the collected facts.',
      exampleAnswer: 'Current handleArchive is 1284 lines with mixed responsibilities, making it hard to test and maintain.',
    },
  },
  {
    dimension: 'constraints',
    blocking: true,
    check: (_facts, _text) => {
      const values = Object.values(_facts)
      return values.filter((v) =>
        /(?:必须|不得|禁止|兼容|隔离|失败|超时|安全|约束|不变|shall|must|forbidden|compat|isolat|timeout|security|constraint|must not|unchanged)/iu.test(v),
      ).length >= 2
    },
    question: {
      dimension: 'constraints',
      question: 'What are the hard constraints this feature must satisfy? (e.g., backward compatibility, performance limits, forbidden changes)',
      reason: 'Fewer than 2 constraint-level facts were found. Constraints define the boundary between acceptable and unacceptable implementations.',
      exampleAnswer: 'Must maintain backward compatibility. Existing module APIs under src/phases/archive/ must not change. Staging must be atomic.',
    },
  },
  {
    dimension: 'architecture',
    blocking: true,
    check: (_facts, text) =>
      /(?:模块|阶段|管道|组件|拆分|拆解|架构|独立|module|phase|pipeline|component|split|refactor|isolate|decouple)/iu.test(text),
    question: {
      dimension: 'architecture',
      question: 'How should the feature be structured? What modules, phases, or components are involved?',
      reason: 'No architectural decisions or component descriptions were found.',
      exampleAnswer: 'Split into 6 phases: resolve, validate, collect, promote, finalize, report. Each phase is an independent module.',
    },
  },
  {
    dimension: 'behavior',
    blocking: true,
    check: (_facts, text) =>
      /(?:场景|用户|触发|流程|操作|行为|步骤|路径|scenario|user|trigger|flow|workflow|step|path)/iu.test(text),
    question: {
      dimension: 'behavior',
      question: 'What are the main user-visible scenarios? What triggers the feature and what should happen?',
      reason: 'No behavior scenarios or user interaction descriptions were found.',
      exampleAnswer: 'Scenario 1: quality-gate confirms readiness → archive validates → collects artifacts → finalizes. Scenario 2: ad-hoc archival without feature workflow.',
    },
  },
  {
    dimension: 'data_contracts',
    blocking: false,
    check: (_facts, text) =>
      /(?:schema|接口|字段|契约|payload|数据|interface|field|contract|result|类型)/iu.test(text),
    question: {
      dimension: 'data_contracts',
      question: 'What are the key data structures, interfaces, or output schemas?',
      reason: 'The design may involve data contracts but none were explicitly described.',
      exampleAnswer: 'ArchiveContext { feature, mode, acceptanceState } — ValidationResult { allowed, blockers[] }',
    },
  },
  {
    dimension: 'failure_semantics',
    blocking: false,
    check: (_facts, text) =>
      /(?:失败|超时|中止|重试|取消|回滚|failure|timeout|abort|retry|cancel|rollback|cleanup)/iu.test(text),
    question: {
      dimension: 'failure_semantics',
      question: 'What should happen on failure, timeout, or abort?',
      reason: 'The design may involve failure scenarios but no failure semantics were described.',
      exampleAnswer: 'On staging failure: delete staging dir, throw error, source workspace unaffected. On merge failure: report warning, don\'t block.',
    },
  },
  {
    dimension: 'integration_boundaries',
    blocking: false,
    check: (_facts, text) =>
      /(?:边界|集成|对接|允许|禁止修改|不变|boundary|integration|allowed|forbidden|unchanged|existing)/iu.test(text),
    question: {
      dimension: 'integration_boundaries',
      question: 'Which existing components may change, which must stay compatible, and what is forbidden?',
      reason: 'Integration boundaries help prevent scope creep and unintended breakage.',
      exampleAnswer: 'src/commands/archive.ts: allowed rewrite. src/phases/archive/current-promotion.ts: forbidden to modify. AcceptanceState type: only add fields.',
    },
  },
  {
    dimension: 'verification',
    blocking: false,
    check: (_facts, text) =>
      /(?:测试|验证|自动化|集成测试|单元测试|test|verify|automated|integration test|unit test|regression)/iu.test(text),
    question: {
      dimension: 'verification',
      question: 'How should the feature be verified? What tests are needed?',
      reason: 'No verification or testing strategy was mentioned.',
      exampleAnswer: 'Unit tests for each phase module. Integration test for end-to-end planned mode. Regression test for existing archive behavior.',
    },
  },
]

// ── Public API ─────────────────────────────────────────────────────────────

const DEFAULT_MAX_ROUNDS = 5

export function assessRequirementClearance(
  session: FeatureSession,
): RequirementClearanceReport {
  const facts = session.collectedFacts
  const allText = Object.values(facts).join(' ')
  const round = (session.clarificationState?.round ?? 0) + 1

  const coveredDimensions: RequirementDimension[] = []
  const missingDimensions: RequirementDimension[] = []
  const questions: ClarificationQuestion[] = []

  for (const dim of DIMENSION_CHECKS) {
    if (dim.check(facts, allText)) {
      coveredDimensions.push(dim.dimension)
    } else {
      // Non-blocking dimensions only generate questions if they've been asked before
      // (meaning the user had a chance to answer but didn't)
      // On first round, only blocking dimensions generate questions
      if (dim.blocking || round > 1) {
        missingDimensions.push(dim.dimension)
        questions.push(dim.question)
      }
    }
  }

  const hasBlockingGap = missingDimensions.some((dim) =>
    DIMENSION_CHECKS.find((d) => d.dimension === dim)?.blocking === true,
  )

  const maxRoundsReached = round >= (session.clarificationState?.maxRounds ?? DEFAULT_MAX_ROUNDS)

  return {
    status: hasBlockingGap ? 'needs_clarification' : 'ready_for_generation',
    coveredDimensions,
    missingDimensions,
    questions: hasBlockingGap ? questions : [],
    round,
    maxRoundsReached,
  }
}

export function createInitialClarificationState(): FeatureSession['clarificationState'] {
  return {
    round: 0,
    maxRounds: DEFAULT_MAX_ROUNDS,
  }
}

export function advanceClarificationRound(
  session: FeatureSession,
  report: RequirementClearanceReport,
): FeatureSession {
  return {
    ...session,
    clarificationState: {
      round: report.round,
      maxRounds: session.clarificationState?.maxRounds ?? DEFAULT_MAX_ROUNDS,
      unresolvedDimensions: report.missingDimensions,
    },
  }
}
