import type { OpenFlowContext } from '../types.js'
import { escapeMarkdown } from '../utils/security.js'

export function handleStatus(ctx: OpenFlowContext): string {
  const config = ctx.config

  const enhancedPlansStr =
    ctx.enhancedPlans.size > 0
      ? Array.from(ctx.enhancedPlans)
          .map((p) => `- ${escapeMarkdown(p)}`)
          .join('\n')
      : 'No plans enhanced yet'

  return `## OpenFlow Status

**Directory**: ${escapeMarkdown(ctx.directory)}

### Configuration
| Phase | Enabled |
|-------|---------|
| Brainstorming | ${config.brainstorming.enabled ? '✅' : '❌'} |
| TDD Expansion | ${config.tdd.enabled ? '✅' : '❌'} |
| Verification | ${config.verification.in_plan ? '✅' : '❌'} |
| Archive | ${config.archive.enabled ? '✅' : '❌'} |
| Writing Plan | ${config.writingPlan.enabled ? '✅' : '❌'} |

### Brainstorm Trigger
- mode: ${escapeMarkdown(config.brainstorming.trigger_mode)}
- behavior: standalone command with one-question workflow

### Enhanced Plans
${enhancedPlansStr}

### Note
File changes are tracked by OpenCode Session API.
Use \`client.session.messages()\` to retrieve change history.
`
}
