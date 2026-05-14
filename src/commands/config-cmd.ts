import type { OpenFlowContext } from '../types.js'
import { escapeMarkdown } from '../utils/security.js'

export function handleConfig(ctx: OpenFlowContext): string {
  const config = ctx.config
  const featureWorkflowConfig = (config as unknown as Record<string, {
    enabled: boolean
    output_dir: string
    auto_trigger: boolean
    trigger_mode: string
  }>)['feature']!

  return `## OpenFlow Configuration

\`\`\`json
{
  "openflow": {
    "feature": {
      "enabled": ${featureWorkflowConfig.enabled},
      "output_dir": "${escapeMarkdown(featureWorkflowConfig.output_dir)}",
      "auto_trigger": ${featureWorkflowConfig.auto_trigger},
      "trigger_mode": "${escapeMarkdown(featureWorkflowConfig.trigger_mode)}"
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
