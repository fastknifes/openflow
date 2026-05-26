import type { OpenFlowContext } from '../types.js'
import { escapeMarkdown } from '../utils/security.js'

export function handleConfig(ctx: OpenFlowContext): string {
  const config = ctx.config

  return `## OpenFlow Configuration

\`\`\`json
{
  "openflow": {
    "paths": {
      "changes": "${escapeMarkdown(config.paths.changes)}",
      "archive": "${escapeMarkdown(config.paths.archive)}",
      "current_requirements": "${escapeMarkdown(config.paths.current_requirements)}",
      "current_design": "${escapeMarkdown(config.paths.current_design)}",
      "current_spec": "${escapeMarkdown(config.paths.current_spec)}",
      "current_workflow": "${escapeMarkdown(config.paths.current_workflow)}",
      "builds": "${escapeMarkdown(config.paths.builds)}",
      "plans": "${escapeMarkdown(config.paths.plans)}",
      "acceptance_state": "${escapeMarkdown(config.paths.acceptance_state)}",
      "feature_state": "${escapeMarkdown(config.paths.feature_state)}",
      "change_units": "${escapeMarkdown(config.paths.change_units)}",
      "guardian_state": "${escapeMarkdown(config.paths.guardian_state)}"
    },
    "feature": {
      "auto_trigger": ${config.feature.auto_trigger},
      "trigger_mode": "${escapeMarkdown(config.feature.trigger_mode)}"
    },
    "tdd": {
      "enabled": ${config.tdd.enabled}
    },
    "verification": {
      "in_plan": ${config.verification.in_plan},
      "security": ${JSON.stringify(config.verification.security)},
      "quality": ${JSON.stringify(config.verification.quality)},
      "auto_fix": ${config.verification.auto_fix}
    },
    "archive": {
      "enabled": ${config.archive.enabled},
      "drift_check": ${config.archive.drift_check ?? false},
      "auto_promote_current": ${config.archive.auto_promote_current ?? false}
    }
  }
}
\`\`\`
`
}
