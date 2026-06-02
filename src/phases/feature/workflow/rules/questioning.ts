import type { PostDesignDecision } from '../../../../phases/feature/state-machine.js'
import type { RequirementModel } from '../../../../phases/feature/requirement-model.js'
import type { DesignReviewReport } from '../../../../phases/feature/design-review-report.js'
import { askGuardedQuestion, hasAskQuestion } from '../../../../utils/question-guard.js'
import { t } from '../../../../i18n/index.js'

export async function askPostDesignConfirmation(toolContext: unknown, _model?: RequirementModel, designReview?: DesignReviewReport): Promise<PostDesignDecision | undefined> {
  if (!hasAskQuestion(toolContext)) return undefined

  if (designReview?.status === 'not_ready') {
    const reviewLabel = 'Review sufficiency report'
    const inspectLabel = t('commands.feature.nextStepOptionInspect')
    const result = await askGuardedQuestion(
      toolContext,
      {
        id: 'post-design-confirmation',
        header: t('commands.feature.nextStepHeader'),
        question: 'Design documents were generated, but implementation constraints are not sufficient for planning. What would you like to do next?',
        options: [
          { label: reviewLabel, description: 'Show the structured Design Sufficiency Review and required next facts.' },
          { label: inspectLabel, description: t('commands.feature.nextStepOptionInspectDesc') },
        ],
        multiple: false,
        custom: false,
      },
    )

    if (result.answer === reviewLabel) return 'review_docs'
    if (result.answer === inspectLabel) return 'inspect'
    return undefined
  }

  const result = await askGuardedQuestion(
    toolContext,
    {
      id: 'post-design-confirmation',
      header: t('commands.feature.nextStepHeader'),
      question: t('commands.feature.nextStepQuestion'),
      options: [
        { label: t('commands.feature.nextStepOptionPlan'), description: t('commands.feature.nextStepOptionPlanDesc') },
        { label: t('commands.feature.nextStepOptionReview'), description: t('commands.feature.nextStepOptionReviewDesc') },
        { label: t('commands.feature.nextStepOptionInspect'), description: t('commands.feature.nextStepOptionInspectDesc') },
      ],
      multiple: false,
      custom: false,
    },
  )

  const answer = result.answer
  if (answer === t('commands.feature.nextStepOptionPlan')) {
    return 'proceed_to_plan'
  }

  if (answer === t('commands.feature.nextStepOptionReview')) {
    return 'review_docs'
  }

  if (answer === t('commands.feature.nextStepOptionInspect')) {
    return 'inspect'
  }

  return undefined
}
