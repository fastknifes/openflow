import type { Hooks } from '@opencode-ai/plugin'
import type { OpenFlowContext } from '../types.js'
import { getSkillContent } from '../skills/index.js'
import { getVerifySkill } from '../skills/verify-skill.js'
import { logger } from '../utils/logger.js'
import { formatSecurityChecks, formatQualityChecks } from '../utils/verification-checks.js'
import { buildImplementationContextPrompt } from './implementation-context.js'
import { isImplementationTask, isVerificationTask } from './task-classification.js'

function buildVerificationPrompt(ctx: OpenFlowContext, currentPrompt: string): string | undefined {
  const verifySkillContent = getSkillContent('openflow-verify') ?? getVerifySkill().content
  if (!verifySkillContent) return undefined

  if (currentPrompt.includes('OpenFlow Verification') || currentPrompt.includes('NO COMPLETION CLAIMS')) {
    return undefined
  }

  const securityChecks = formatSecurityChecks(ctx.config.verification.security, 'task')
  const qualityChecks = formatQualityChecks(ctx.config.verification.quality, 'task')

  return `

---
## OpenFlow Verification Requirements

${verifySkillContent}

### Configured Checks for This Project

**Security Checks:**
${securityChecks}

**Quality Checks:**
${qualityChecks}

---

${currentPrompt}`
}

function buildArchiveVerificationReminder(ctx: OpenFlowContext, currentPrompt: string): string | undefined {
  if (!ctx.config.verification.completion_prompt) return undefined
  if (!/\barchive\b/i.test(currentPrompt)) return undefined
  if (currentPrompt.includes('OpenFlow Archive Verification Reminder')) return undefined

  return `

## OpenFlow Archive Verification Reminder

Before archive, verify completion state with:
- quality checks (lint/typecheck/test)
- security checks (secret/vuln)
- doc/code consistency

This reminder is non-blocking.

${currentPrompt}`
}

export function createToolBeforeHook(ctx: OpenFlowContext) {
  const hook: NonNullable<Hooks['tool.execute.before']> = async (input, output): Promise<void> => {
    if (input.tool !== 'task') return

    const args = output.args as Record<string, unknown> | undefined
    const taskArgs = args as { subagent_type?: string; prompt?: string; category?: string } | undefined
    if (!taskArgs) return

    const currentPrompt = taskArgs.prompt || ''

    if (ctx.config.verification.in_plan && isVerificationTask(taskArgs)) {
      const verificationPrompt = buildVerificationPrompt(ctx, currentPrompt)
      if (verificationPrompt) {
        output.args = { ...taskArgs, prompt: verificationPrompt }
        logger.debug('Injected verification requirements', { sessionID: input.sessionID })
      }
      return
    }

    const archiveReminderPrompt = buildArchiveVerificationReminder(ctx, currentPrompt)
    if (archiveReminderPrompt) {
      output.args = { ...taskArgs, prompt: archiveReminderPrompt }
      logger.debug('Injected archive verification reminder', { sessionID: input.sessionID })
      return
    }

    if (isImplementationTask(taskArgs) && !currentPrompt.includes('OpenFlow Implementation Context')) {
      output.args = {
        ...taskArgs,
        prompt: await buildImplementationContextPrompt(ctx, currentPrompt),
      }
      logger.debug('Injected implementation context requirements', { sessionID: input.sessionID })
    }
  }

  return hook
}

export { isImplementationTask, isVerificationTask }
