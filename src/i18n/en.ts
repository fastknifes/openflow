import type { I18nResource } from './types.js'

export const en: I18nResource = {
  // ── Commands: feature ──
  'commands.feature.guardAlreadyPrompted':
    '> This question has already been asked via the interactive tool. Please reply with your choice directly in this conversation, or type "skip" to continue.',
  'commands.feature.nextStepHeader': 'Next Steps',
  'commands.feature.nextStepQuestion':
    'Design documents have been generated. How would you like to proceed?',
  'commands.feature.nextStepOptionPlan': 'Proceed to Plan',
  'commands.feature.nextStepOptionPlanDesc':
    'View the recommended command and manually enter implementation plan generation.',
  'commands.feature.nextStepOptionReview': 'Review Constraint Sufficiency',
  'commands.feature.nextStepOptionReviewDesc':
    'Have the assistant/runtime review whether constraints in design.md and behavior.md are sufficient.',
  'commands.feature.nextStepOptionInspect': 'Inspect Documents',
  'commands.feature.nextStepOptionInspectDesc':
    'Check the generated design documents first before deciding on next steps.',
  'commands.feature.postDesignConfirmProceed': 'Proceed to Plan',
  'commands.feature.postDesignConfirmReview': 'Review Constraint Sufficiency',
  'commands.feature.postDesignConfirmInspect': 'Inspect Documents',

  // ── Commands: verify ──
  'commands.verify.failureHeader': 'Verification Failed',
  'commands.verify.failureQuestion':
    'Some checks did not pass. Please choose the next step:',
  'commands.verify.failureOptionFix': 'Fix Issues',
  'commands.verify.failureOptionFixDesc':
    'Fix the failing checks, then re-run verification',
  'commands.verify.failureOptionAccept': 'Mark as Success',
  'commands.verify.failureOptionAcceptDesc':
    'Accept the current failures and mark verification as passed',
  'commands.verify.acceptedFailuresMessage':
    'Current failures have been accepted; to restore strict verification, fix the failing checks and re-run /openflow-verify.',

  // ── Signals: closure ──
  'signals.closure.strong': [
    'go with this',
    'proceed with this',
    'generate formal docs',
    '按这个做',
    '按这个方案推进',
    '生成正式文档',
    '就按这个方向',
  ],
  'signals.closure.weak': ['done', 'looks good', 'approved', '可以', '好', '确认', '没问题'],

  // ── Signals: acceptance trigger ──
  'signals.acceptance.triggerWords': [
    'adjust',
    'fix',
    'test found',
    'acceptance',
    'check',
    'issue',
    'tweak',
    'modify',
    '调整',
    '改一下',
    '测试发现',
    '验收',
    '检查',
    '问题',
    '还有问题',
    '需要改',
  ],

  // ── Signals: completion ──
  'signals.completion.phrases': [
    'done',
    'finished',
    'ready to archive',
    'implemented',
    'completed',
    'ready for delivery',
    'implementation complete',
    '完成了',
    '好了',
    '可以收尾',
  ],

  // ── Signals: convergence ──
  'signals.convergence.skip': [
    'skip',
    'proceed',
    'generate anyway',
    'draft',
    '跳过',
    '不用问',
    '先按你的判断',
    '按你的判断',
    '先生成',
    '生成草稿',
    '继续生成',
  ],
  'signals.convergence.productLevel': [
    'product',
    'experience',
    'workflow',
    '不讨论代码',
    '代码层面',
    '看不懂',
    '产品',
    '体验',
  ],

  // ── Signals: feature continuation ──
  'signals.feature.continuation.keywords': [
    'proceed',
    'go with',
    'generate.*docs',
    '同意',
    '确认',
    '采用',
    '就按',
    '生成.*文档',
  ],
  'signals.feature.continuation.exclude': [
    'implement',
    'develop',
    'add',
    'fix',
    'login',
    'coupon',
    'quality gate',
    'frontend',
    'preview',
    'naming',
    'stage',
    'applicability',
    '实现',
    '开发',
    '新增',
    '添加',
    '修复',
    '登录',
    '优惠券',
    '质量门',
    '前端',
    '预览',
    '命名',
    '阶段',
    '适用',
  ],

  // ── Feature resolver keywords ──
  'resolver.collectConstraints': ['collect', 'generate', 'create', 'organize', '收集', '生成', '创建', '整理'],
  'resolver.featureKeywords': [
    { pattern: 'quality.gate|质量门', tags: ['quality', 'gate'] },
    { pattern: 'gate|门禁', tags: ['gate'] },
    { pattern: 'stage|阶段', tags: ['stage'] },
    { pattern: 'applicability|适用性', tags: ['applicability'] },
    { pattern: 'classifier|判定|分类', tags: ['classifier'] },
    { pattern: 'trigger|触发', tags: ['trigger'] },
    { pattern: 'boundary|边界', tags: ['boundary'] },
    { pattern: 'naming|命名', tags: ['naming'] },
    { pattern: 'rename|重命名', tags: ['rename'] },
    { pattern: 'login|登录', tags: ['login'] },
    { pattern: 'coupon|优惠券', tags: ['coupon'] },
    { pattern: 'deduction|扣减', tags: ['deduction'] },
    { pattern: 'rule|规则', tags: ['rule'] },
    { pattern: 'config|配置', tags: ['config'] },
    { pattern: 'frontend|前端', tags: ['frontend'] },
    { pattern: 'design|设计', tags: ['design'] },
    { pattern: 'preview|预览', tags: ['preview'] },
    { pattern: 'constraints|约束', tags: ['constraints'] },
  ],

  // ── Contract extractor ──
  'contract.blockingKeywords': ['must not change', 'locked', 'immutable', '禁止修改', '不可变', '不得修改'],
  'contract.warningKeywords': ['forbidden dependency', 'must not introduce', '禁止依赖', '不得引入'],
  'contract.decisionKeywords': ['must', 'shall', 'required', '禁止', '不得'],

  // ── Design renderer ──
  'design.frontendKeywords': [
    'frontend',
    'page',
    'ui',
    'ux',
    'screen',
    'react',
    'vue',
    'svelte',
    'css',
    'html',
    'form',
    'modal',
    'button',
    'sidebar',
    'navbar',
    'dashboard',
    '前端',
    '页面',
    '界面',
    '交互',
    '组件',
    '表单',
    '按钮',
    '弹窗',
    '侧边栏',
    '导航',
    '看板',
    '仪表盘',
  ],
  'design.frontendNegationKeywords': [
    'no',
    'without',
    'not',
    'exclude',
    'avoid',
    'skip',
    'not affected',
    'unchanged',
    'out of scope',
    'not impacted',
    '不涉及',
    '不修改',
    '不变更',
    '不影响',
    '不包含',
    '无需',
    '不受影响',
    '不变',
    '排除',
    '不在范围',
  ],

  // ── Templates: implementation mapper ──
  'templates.implementationMapper.overviewTitle': '1. Overview',
  'templates.implementationMapper.scopeLabel':
    'This change addresses implementation traceability requirements related to `{feature}`.',
  'templates.implementationMapper.traceLabel':
    'This change covers the full traceability chain from requirements to implementation.',
  'templates.implementationMapper.noTrace':
    'No requirement/proposal/design traceability items were recorded, and no code changes were detected.\n',
  'templates.implementationMapper.noMapping': 'No usable traceability mapping was generated.\n',
  'templates.implementationMapper.tableHeader':
    '| Source | Requirement/Decision | Code File | Key Symbol | Relation | Evidence |',
  'templates.implementationMapper.fallbackNotice':
    '> No requirements / proposal traceability items found; falling back to design documents for traceability relationships.\n',

  // ── Templates: PRD ──
  'templates.prd.sectionBackgroundGoals': '1.1 Background and Goals',
  'templates.prd.sectionOverview': '1.2 Overview',
  'templates.prd.sectionAcceptance': '3.1 Acceptance Criteria',
  'templates.prd.sectionPriority': '5. Priority',
  'templates.prd.priorityP0': 'Must have',
  'templates.prd.priorityP1': 'Should have',
  'templates.prd.priorityP2': 'Nice to have',
  'templates.prd.priorityP3': 'Future',

  // ── Templates: draft warning ──
  'templates.draftWarning.title': 'Draft with Assumptions',
  'templates.draftWarning.behavior':
    'Assumptions in this behavior document are not confirmed facts.',

  // ── UI: common ──
  'ui.yesNoPrompt': 'Yes/No',
}
