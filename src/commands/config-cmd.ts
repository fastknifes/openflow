import type { OpenFlowContext } from '../types.js'
import { escapeMarkdown } from '../utils/security.js'

export function handleConfig(ctx: OpenFlowContext): string {
  const config = ctx.config

  return `## OpenFlow Configuration

\`\`\`json
{
  "openflow": {
    "brainstorming": {
      "enabled": ${config.brainstorming.enabled},
      "output_dir": "${escapeMarkdown(config.brainstorming.output_dir)}",
      "auto_trigger": ${config.brainstorming.auto_trigger}
    },
    "tdd": {
      "enabled": ${config.tdd.enabled},
      "expand_threshold": ${config.tdd.expand_threshold}
    },
    "verification": {
      "in_plan": ${config.verification.in_plan},
      "security": ${JSON.stringify(config.verification.security)},
      "quality": ${JSON.stringify(config.verification.quality)},
      "auto_fix": ${config.verification.auto_fix}
    },
    "archive": {
      "enabled": ${config.archive.enabled},
      "output_dir": "${escapeMarkdown(config.archive.output_dir)}"
    }
  }
}
\`\`\`
`
}
