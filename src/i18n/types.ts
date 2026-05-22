export type Locale = 'zh-CN' | 'en'

export interface I18nResource {
  // ── Commands: feature ──
  'commands.feature.guardAlreadyPrompted': string
  'commands.feature.nextStepHeader': string
  'commands.feature.nextStepQuestion': string
  'commands.feature.nextStepOptionPlan': string
  'commands.feature.nextStepOptionPlanDesc': string
  'commands.feature.nextStepOptionReview': string
  'commands.feature.nextStepOptionReviewDesc': string
  'commands.feature.nextStepOptionInspect': string
  'commands.feature.nextStepOptionInspectDesc': string
  'commands.feature.postDesignConfirmProceed': string
  'commands.feature.postDesignConfirmReview': string
  'commands.feature.postDesignConfirmInspect': string

  // ── Commands: verify ──
  'commands.verify.failureHeader': string
  'commands.verify.failureQuestion': string
  'commands.verify.failureOptionFix': string
  'commands.verify.failureOptionFixDesc': string
  'commands.verify.failureOptionAccept': string
  'commands.verify.failureOptionAcceptDesc': string
  'commands.verify.acceptedFailuresMessage': string

  // ── Signals: closure ──
  'signals.closure.strong': string[]
  'signals.closure.weak': string[]

  // ── Signals: acceptance trigger ──
  'signals.acceptance.triggerWords': string[]

  // ── Signals: completion ──
  'signals.completion.phrases': string[]

  // ── Signals: convergence ──
  'signals.convergence.skip': string[]
  'signals.convergence.productLevel': string[]

  // ── Signals: feature continuation ──
  'signals.feature.continuation.keywords': string[]
  'signals.feature.continuation.exclude': string[]

  // ── Feature resolver keywords ──
  'resolver.collectConstraints': string[]
  'resolver.featureKeywords': Array<{ pattern: string; tags: string[] }>

  // ── Contract extractor ──
  'contract.blockingKeywords': string[]
  'contract.warningKeywords': string[]
  'contract.decisionKeywords': string[]

  // ── Design renderer ──
  'design.frontendKeywords': string[]
  'design.frontendNegationKeywords': string[]

  // ── Templates: implementation mapper ──
  'templates.implementationMapper.overviewTitle': string
  'templates.implementationMapper.scopeLabel': string
  'templates.implementationMapper.traceLabel': string
  'templates.implementationMapper.noTrace': string
  'templates.implementationMapper.noMapping': string
  'templates.implementationMapper.tableHeader': string
  'templates.implementationMapper.fallbackNotice': string

  // ── Templates: PRD ──
  'templates.prd.sectionBackgroundGoals': string
  'templates.prd.sectionOverview': string
  'templates.prd.sectionAcceptance': string
  'templates.prd.sectionPriority': string
  'templates.prd.priorityP0': string
  'templates.prd.priorityP1': string
  'templates.prd.priorityP2': string
  'templates.prd.priorityP3': string

  // ── Templates: draft warning ──
  'templates.draftWarning.title': string
  'templates.draftWarning.behavior': string

  // ── UI: common ──
  'ui.yesNoPrompt': string
}
