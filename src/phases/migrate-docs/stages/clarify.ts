import * as path from 'node:path'
import type {
  ClassificationResult,
  MigrationState,
  PendingQuestion,
  QuestionOption,
  TargetCategory,
} from '../types.js'
import {
  hasPendingQuestions,
  getNextPendingQuestion,
  markStageCompleted,
  removePendingQuestion,
  resolvePendingQuestion,
} from '../state-machine.js'
import {
  askGuardedQuestion,
  hasAskQuestion,
  type QuestionToolContext,
} from '../../../utils/question-guard.js'

export interface ClarifyStageResult {
  state: MigrationState
  output: string
  awaitingUserInput: boolean
}

export async function runClarifyStage(
  state: MigrationState,
  toolContext?: unknown
): Promise<ClarifyStageResult> {
  if (!hasPendingQuestions(state)) {
    const advanced = markStageCompleted(state, 'clarify', {
      metadata: {
        skippedClarification: true,
        resolvedCount: state.resolvedQuestions.length,
      },
    })

    return {
      state: advanced,
      output: 'No pending clarification questions. Skipping to plan stage.',
      awaitingUserInput: false,
    }
  }

  const question = getNextPendingQuestion(state)
  if (!question) {
    const advanced = markStageCompleted(state, 'clarify', {
      metadata: {
        skippedClarification: true,
        resolvedCount: state.resolvedQuestions.length,
      },
    })
    return {
      state: advanced,
      output: 'No unresolved clarification questions. Skipping to plan stage.',
      awaitingUserInput: false,
    }
  }

  if (!hasAskQuestion(toolContext)) {
    return {
      state,
      output: formatQuestionPrompt(state, question),
      awaitingUserInput: true,
    }
  }

  const answer = await askSingleQuestion(question, toolContext)
  if (!answer) {
    return {
      state,
      output: formatQuestionPrompt(state, question),
      awaitingUserInput: true,
    }
  }

  let updatedState = applyQuestionResolution(state, question, answer)
  updatedState = resolvePendingQuestion(updatedState, question.id, answer)
  updatedState = removePendingQuestion(updatedState, question.id)

  if (hasPendingQuestions(updatedState)) {
    const nextQuestion = getNextPendingQuestion(updatedState)
    if (!nextQuestion) {
      const advanced = markStageCompleted(updatedState, 'clarify', {
        metadata: {
          resolvedCount: updatedState.resolvedQuestions.length,
        },
      })

      return {
        state: advanced,
        output: 'All clarification batches resolved. Advancing to plan stage.',
        awaitingUserInput: false,
      }
    }

    return {
      state: updatedState,
      output: formatQuestionPrompt(updatedState, nextQuestion),
      awaitingUserInput: true,
    }
  }

  const advanced = markStageCompleted(updatedState, 'clarify', {
    metadata: {
      resolvedCount: updatedState.resolvedQuestions.length,
    },
  })

  return {
    state: advanced,
    output: 'All clarification batches resolved. Advancing to plan stage.',
    awaitingUserInput: false,
  }
}

async function askSingleQuestion(
  question: PendingQuestion,
  toolContext: QuestionToolContext
): Promise<string | undefined> {
  const result = await askGuardedQuestion(
    toolContext,
    {
      id: question.id,
      header: question.header,
      question: question.question,
      options: getQuestionOptions(question),
      multiple: false,
      custom: true,
    },
  )

  return result.answer
}

function applyQuestionResolution(
  state: MigrationState,
  question: PendingQuestion,
  answer: string
): MigrationState {
  const decision = normalizeDecision(answer)
  const affected = getAffectedRelativePaths(question)
  if (affected.size === 0) {
    return state
  }

  const isAdr = isAdrCandidateQuestion(question)

  const updatedClassifications = state.classifications.map<ClassificationResult>((classification) => {
    const relativePath = classification.inventoryItem.relativePath
    if (!affected.has(relativePath)) {
      return classification
    }

    if (decision === 'skip') {
      return removeProposedTargetPath(classification, 'Clarify: user selected skip')
    }

    if (decision === 'alternative') {
      const targetType = (isAdr ? 'references/notes' : 'references/raw') as TargetCategory
      return {
        ...classification,
        targetType,
        proposedTargetPath: buildTargetPath(targetType, classification),
        reasoning: `${classification.reasoning} (Clarify: rerouted by user decision)`,
      }
    }

    if (isAdr && decision === 'accept') {
      return {
        ...classification,
        targetType: 'decisions',
        proposedTargetPath: buildTargetPath('decisions', classification),
        reasoning: `${classification.reasoning} (Clarify: confirmed as ADR)`,
      }
    }

    return classification
  })

  return {
    ...state,
    classifications: updatedClassifications,
  }
}

function removeProposedTargetPath(
  classification: ClassificationResult,
  reason: string
): ClassificationResult {
  const { proposedTargetPath: _omit, ...rest } = classification
  return {
    ...rest,
    reasoning: `${classification.reasoning} (${reason})`,
  }
}

function buildTargetPath(targetType: TargetCategory, classification: ClassificationResult): string {
  const preferredName = path.basename(
    classification.proposedTargetPath || classification.inventoryItem.relativePath
  )
  const filename = preferredName.toLowerCase().endsWith('.md')
    ? preferredName
    : `${preferredName}.md`

  return `docs/${targetType}/${filename}`
}

function getAffectedRelativePaths(question: PendingQuestion): Set<string> {
  const paths = new Set<string>()

  for (const file of question.affectedFiles ?? []) {
    paths.add(file)
  }

  for (const item of question.classificationProposal ?? []) {
    paths.add(item.inventoryItem.relativePath)
  }

  return paths
}

function normalizeDecision(answer: string): 'accept' | 'alternative' | 'skip' {
  const normalized = answer.trim().toLowerCase()

  if (
    normalized === 'skip' ||
    normalized.includes('skip') ||
    normalized.includes('cancel')
  ) {
    return 'skip'
  }

  if (
    normalized === 'alternative' ||
    normalized.includes('route to') ||
    normalized.includes('alternative') ||
    normalized.includes('references/notes') ||
    normalized.includes('references')
  ) {
    return 'alternative'
  }

  return 'accept'
}

function getQuestionOptions(question: PendingQuestion): QuestionOption[] {
  if (isAdrCandidateQuestion(question)) {
    return [
      {
        label: 'Confirm as ADR',
        description: 'Keep these files in docs/decisions/ as ADR records',
        value: 'confirm-adr',
      },
      {
        label: 'Route to references/notes',
        description: 'Move these files to docs/references/notes/ instead of ADRs',
        value: 'route-notes',
      },
      {
        label: 'Skip file',
        description: 'Do not migrate these files',
        value: 'skip',
      },
    ]
  }

  return [
    {
      label: 'Accept classification',
      description: 'Keep the proposed category for this batch',
      value: 'accept',
    },
    {
      label: 'Route to alternative category',
      description: 'Route this batch to docs/references/raw/',
      value: 'alternative',
    },
    {
      label: 'Skip file',
      description: 'Do not migrate these files',
      value: 'skip',
    },
  ]
}

function isAdrCandidateQuestion(question: PendingQuestion): boolean {
  return (
    question.batchTopic === 'adr-candidates' ||
    question.header.toLowerCase().includes('adr') ||
    (question.classificationProposal ?? []).some((item) => item.targetType === 'decisions')
  )
}

function hasAskQuestion(value: unknown): value is ClarifyInteractiveToolContext {
  if (!value || typeof value !== 'object') {
    return false
  }

  return 'askQuestion' in value && typeof value.askQuestion === 'function'
}

function normalizeInteractiveAnswer(answer: ClarifyQuestionAnswer | undefined): string | undefined {
  const first = answer?.[0]?.trim()
  if (!first) {
    return undefined
  }

  return first.replace(/\s*\(Recommended\)$/u, '').trim()
}

function formatQuestionPrompt(state: MigrationState, question: PendingQuestion): string {
  const options = getQuestionOptions(question)
    .map((option) => `- ${option.label}: ${option.description}`)
    .join('\n')

  return `## Migration Clarification Question

### ${question.header}
${question.question}

Options:
${options}

Reply with your answer through the question picker when available.
Otherwise continue the migrate-docs flow in the same session and provide your answer.

Progress:
- resolved ${state.resolvedQuestions.length}/${state.resolvedQuestions.length + state.pendingQuestions.length}
- next question id: \`${question.id}\``
}
