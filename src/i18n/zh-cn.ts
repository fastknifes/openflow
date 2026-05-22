import type { I18nResource } from './types.js'

export const zhCN: I18nResource = {
  // ── Commands: feature ──
  'commands.feature.guardAlreadyPrompted':
    '> 该问题已通过交互工具询问过。请在当前对话中直接回复你的选择，或输入"跳过"继续。',
  'commands.feature.nextStepHeader': '下一步行动',
  'commands.feature.nextStepQuestion': '设计文档已生成。您希望如何继续？',
  'commands.feature.nextStepOptionPlan': '进入开发计划',
  'commands.feature.nextStepOptionPlanDesc': '查看推荐命令，手动进入 implementation plan 生成。',
  'commands.feature.nextStepOptionReview': '检查约束充分性',
  'commands.feature.nextStepOptionReviewDesc': '让 assistant/runtime 复查 design.md 与 behavior.md 的约束是否充分。',
  'commands.feature.nextStepOptionInspect': '查看文档',
  'commands.feature.nextStepOptionInspectDesc': '先检查已生成的设计文档，再决定后续动作。',
  'commands.feature.postDesignConfirmProceed': '进入开发计划',
  'commands.feature.postDesignConfirmReview': '检查约束充分性',
  'commands.feature.postDesignConfirmInspect': '查看文档',

  // ── Commands: verify ──
  'commands.verify.failureHeader': '验证失败',
  'commands.verify.failureQuestion': '验证发现未通过的检查。请选择下一步操作：',
  'commands.verify.failureOptionFix': '修复问题',
  'commands.verify.failureOptionFixDesc': '修复失败的检查，然后重新运行验证',
  'commands.verify.failureOptionAccept': '标记成功',
  'commands.verify.failureOptionAcceptDesc': '接受当前失败，标记验证通过',
  'commands.verify.acceptedFailuresMessage':
    '已接受当前失败项；如需恢复严格验证，请修复失败检查后重新运行 /openflow-verify。',

  // ── Signals: closure ──
  'signals.closure.strong': [
    '按这个做',
    '按这个方案推进',
    '生成正式文档',
    '就按这个方向',
    'go with this',
    'proceed with this',
    'generate formal docs',
  ],
  'signals.closure.weak': ['可以', '好', '确认', '没问题', 'done', 'looks good', 'approved'],

  // ── Signals: acceptance trigger ──
  'signals.acceptance.triggerWords': [
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
    '完成了',
    '好了',
    '可以收尾',
    'done',
    'finished',
    'ready to archive',
    'implemented',
    'completed',
    'ready for delivery',
    'implementation complete',
  ],

  // ── Signals: convergence ──
  'signals.convergence.skip': [
    '跳过',
    '不用问',
    '先按你的判断',
    '按你的判断',
    '先生成',
    '生成草稿',
    '继续生成',
    'proceed',
    'generate anyway',
    'draft',
    'skip',
  ],
  'signals.convergence.productLevel': [
    '不讨论代码',
    '代码层面',
    '看不懂',
    '产品',
    '体验',
    'workflow',
    'experience',
  ],

  // ── Signals: feature continuation ──
  'signals.feature.continuation.keywords': [
    '同意',
    '确认',
    '采用',
    '就按',
    '生成.*文档',
    'proceed',
    'go with',
    'generate.*docs',
  ],
  'signals.feature.continuation.exclude': [
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
  'resolver.collectConstraints': ['收集', '生成', '创建', '整理'],
  'resolver.featureKeywords': [
    { pattern: '质量门|quality.gate', tags: ['quality', 'gate'] },
    { pattern: '门禁', tags: ['gate'] },
    { pattern: '阶段', tags: ['stage'] },
    { pattern: '适用性', tags: ['applicability'] },
    { pattern: '判定|分类', tags: ['classifier'] },
    { pattern: '触发', tags: ['trigger'] },
    { pattern: '边界', tags: ['boundary'] },
    { pattern: '命名', tags: ['naming'] },
    { pattern: '重命名', tags: ['rename'] },
    { pattern: '登录', tags: ['login'] },
    { pattern: '优惠券', tags: ['coupon'] },
    { pattern: '扣减', tags: ['deduction'] },
    { pattern: '规则', tags: ['rule'] },
    { pattern: '配置', tags: ['config'] },
    { pattern: '前端', tags: ['frontend'] },
    { pattern: '设计', tags: ['design'] },
    { pattern: '预览', tags: ['preview'] },
    { pattern: '约束', tags: ['constraints'] },
  ],

  // ── Contract extractor ──
  'contract.blockingKeywords': ['禁止修改', '不可变', '不得修改'],
  'contract.warningKeywords': ['禁止依赖', '不得引入'],
  'contract.decisionKeywords': ['禁止', '不得'],

  // ── Design renderer ──
  'design.frontendKeywords': [
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
  'templates.implementationMapper.overviewTitle': '1. 概述',
  'templates.implementationMapper.scopeLabel': '本次变更解决了与 `{feature}` 相关的实现追溯需求。',
  'templates.implementationMapper.traceLabel': '本次变更覆盖需求到实现的完整追溯链。',
  'templates.implementationMapper.noTrace':
    '未记录到需求/提案/设计追溯项，也没有检测到代码变更。\n',
  'templates.implementationMapper.noMapping': '未生成可用的追溯映射。\n',
  'templates.implementationMapper.tableHeader':
    '| 追溯来源 | 需求/决策 | 代码文件 | 关键符号 | 关联说明 | 验证证据 |',
  'templates.implementationMapper.fallbackNotice':
    '> 未发现 requirements / proposal 追溯项，已回退使用 design 文档生成追溯关系。\n',

  // ── Templates: PRD ──
  'templates.prd.sectionBackgroundGoals': '1.1 背景与目标',
  'templates.prd.sectionOverview': '1.2 功能概述',
  'templates.prd.sectionAcceptance': '3.1 功能验收',
  'templates.prd.sectionPriority': '5. 优先级',
  'templates.prd.priorityP0': '必须实现',
  'templates.prd.priorityP1': '应该实现',
  'templates.prd.priorityP2': '可以实现',
  'templates.prd.priorityP3': '暂不实现',

  // ── Templates: draft warning ──
  'templates.draftWarning.title': 'Draft with Assumptions / 带假设的草稿',
  'templates.draftWarning.behavior':
    'Assumptions in this behavior document are not confirmed facts.',

  // ── UI: common ──
  'ui.yesNoPrompt': '是/否',
}
