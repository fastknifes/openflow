import type { OpenFlowContext } from '../types.js'
import { loadAcceptanceState, addPendingDocUpdate, setWaitingForDocUpdateConfirm } from '../utils/acceptance-state.js'
import { logger } from '../utils/logger.js'

const DOC_SYNC_PROMPT = `📝 **验收阶段变更已记录**

变更文件: {{file}}

是否需要我帮你同步更新相关设计/需求文档？`

export function createAcceptancePromptHook(ctx: OpenFlowContext) {
  return async (input: { tool: string; args?: Record<string, unknown> }): Promise<string | void> => {
    if (!ctx.config.acceptance.enabled || !ctx.config.acceptance.doc_sync_prompt) return
    if (input.tool !== 'write' && input.tool !== 'edit') return
    
    const state = await loadAcceptanceState(ctx.directory)
    if (!state || state.phase !== 'acceptance') return
    
    const filePath = input.args?.filePath as string | undefined
    if (!filePath) return
    
    if (filePath.includes('.sisyphus/') || filePath.includes('node_modules/')) return
    
    await addPendingDocUpdate(ctx.directory, {
      file: filePath,
      timestamp: new Date().toISOString()
    })
    
    await setWaitingForDocUpdateConfirm(ctx.directory, filePath)
    
    logger.info('Acceptance phase code change detected', { file: filePath })
    
    return DOC_SYNC_PROMPT.replace('{{file}}', filePath)
  }
}

