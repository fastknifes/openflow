import type { OpenFlowContext } from '../types.js'
import { loadAcceptanceState, addPendingDocUpdate } from '../utils/acceptance-state.js'
import { logger } from '../utils/logger.js'

const DOC_SYNC_PROMPT = `
📝 **验收阶段变更已记录**

变更文件: {{file}}
是否更新设计文档？

[Y] 更新设计文档（推荐）
[N] 仅代码变更，稍后处理
[S] 跳过，归档时再处理
`

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
    
    logger.info('Acceptance phase code change detected', { file: filePath })
    
    if (ctx.config.acceptance.doc_sync_prompt) {
      return DOC_SYNC_PROMPT.replace('{{file}}', filePath)
    }
  }
}
