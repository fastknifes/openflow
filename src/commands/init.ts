import type { OpenFlowContext } from '../types.js'
import { OpenFlowError, ErrorCode } from '../utils/errors.js'
import { updateAgentsFile } from './init-persistence.js'
import { INIT_RESULT_MESSAGES } from './init-content.js'

/**
 * Handle the `openflow-init` command.
 *
 * This command initializes or updates the root `AGENTS.md` file with OpenFlow's
 * managed docs guide block. It supports four operation modes:
 * - initialized: Created new AGENTS.md with base content and guide
 * - refreshed: Replaced existing valid managed block
 * - appended: Added new block to file without any block
 * - safe_repair: Appended fresh block due to corrupted/ambiguous markers
 *
 * @param ctx - OpenFlow context with configuration and project directory
 * @returns User-facing message describing what action was taken
 * @throws OpenFlowError for filesystem or validation errors
 */
export async function handleInit(ctx: OpenFlowContext): Promise<string> {
  try {
    const result = await updateAgentsFile({
      projectDir: ctx.directory,
    })

    // Return the appropriate message based on action
    return INIT_RESULT_MESSAGES[result.action]
  } catch (error) {
    // Re-throw OpenFlowError as-is
    if (error instanceof OpenFlowError) {
      throw error
    }

    // Wrap unexpected errors
    throw new OpenFlowError(
      ErrorCode.OPERATION_FAILED,
      `Failed to initialize AGENTS.md: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    )
  }
}
