import {
  OPENFLOW_MARKER_BEGIN,
  OPENFLOW_MARKER_END,
  OPENFLOW_DOCS_GUIDE_BLOCK,
  AGENTS_INIT_BASE_TEMPLATE,
  NEWLINE_DEFAULT,
} from './init-content.js'

/**
 * Decision types for AGENTS.md update operations.
 */
export type AgentsUpdateAction =
  | 'create_new_file'
  | 'replace_valid_block'
  | 'append_missing_block'
  | 'append_safe_repair_block'

/**
 * Result of analyzing AGENTS.md content.
 */
export interface AgentsAnalysisResult {
  action: AgentsUpdateAction
  preBlockContent: string
  postBlockContent: string
  hasValidBlock: boolean
  blockCount: number
  hasMalformedMarkers: boolean
}

/**
 * Detect the newline style used in content.
 * Returns '\r\n' if found, otherwise '\n'.
 */
export function detectNewline(content: string): string {
  return content.includes('\r\n') ? '\r\n' : '\n'
}

/**
 * Find all occurrences of a marker in content.
 * Returns array of indices where marker starts.
 */
function findAllMarkers(content: string, marker: string): number[] {
  const indices: number[] = []
  let pos = 0
  while ((pos = content.indexOf(marker, pos)) !== -1) {
    indices.push(pos)
    pos += marker.length
  }
  return indices
}

/**
 * Analyze AGENTS.md content to determine the appropriate update action.
 *
 * Detection rules:
 * - No content → create_new_file
 * - One valid begin/end pair with no overlap → replace_valid_block
 * - No markers → append_missing_block
 * - Partial markers only (begin without end or vice versa) → append_safe_repair_block
 * - Duplicate valid blocks → append_safe_repair_block (treats as corruption)
 * - Nested/overlapping markers → append_safe_repair_block (treats as corruption)
 * - Mixed valid + malformed → append_safe_repair_block
 *
 * @param content - The current AGENTS.md content (may be empty)
 * @returns Analysis result with action and content segments
 */
export function analyzeAgentsContent(content: string): AgentsAnalysisResult {
  // Empty content = create new file
  if (!content || content.trim().length === 0) {
    return {
      action: 'create_new_file',
      preBlockContent: '',
      postBlockContent: '',
      hasValidBlock: false,
      blockCount: 0,
      hasMalformedMarkers: false,
    }
  }

  const beginIndices = findAllMarkers(content, OPENFLOW_MARKER_BEGIN)
  const endIndices = findAllMarkers(content, OPENFLOW_MARKER_END)

  // No markers at all = append new block
  if (beginIndices.length === 0 && endIndices.length === 0) {
    return {
      action: 'append_missing_block',
      preBlockContent: content,
      postBlockContent: '',
      hasValidBlock: false,
      blockCount: 0,
      hasMalformedMarkers: false,
    }
  }

  // Check for malformed: partial markers (only begin or only end)
  const hasPartialMarkers =
    (beginIndices.length === 0 && endIndices.length > 0) ||
    (beginIndices.length > 0 && endIndices.length === 0)

  if (hasPartialMarkers) {
    return {
      action: 'append_safe_repair_block',
      preBlockContent: content,
      postBlockContent: '',
      hasValidBlock: false,
      blockCount: 0,
      hasMalformedMarkers: true,
    }
  }

  // Unequal count of begins and ends = corruption
  if (beginIndices.length !== endIndices.length) {
    return {
      action: 'append_safe_repair_block',
      preBlockContent: content,
      postBlockContent: '',
      hasValidBlock: false,
      blockCount: 0,
      hasMalformedMarkers: true,
    }
  }

  // Check for proper nesting: first begin must be before first end
  // and markers must alternate properly
  const sortedMarkers: Array<{ type: 'begin' | 'end'; pos: number }> = [
    ...beginIndices.map((pos) => ({ type: 'begin' as const, pos })),
    ...endIndices.map((pos) => ({ type: 'end' as const, pos })),
  ].sort((a, b) => a.pos - b.pos)

  // Must start with begin and alternate: begin, end, begin, end...
  let expectBegin = true
  for (const marker of sortedMarkers) {
    if (expectBegin && marker.type !== 'begin') {
      // Found end when expecting begin = corruption
      return {
        action: 'append_safe_repair_block',
        preBlockContent: content,
        postBlockContent: '',
        hasValidBlock: false,
        blockCount: 0,
        hasMalformedMarkers: true,
      }
    }
    if (!expectBegin && marker.type !== 'end') {
      // Found begin when expecting end = nested/corruption
      return {
        action: 'append_safe_repair_block',
        preBlockContent: content,
        postBlockContent: '',
        hasValidBlock: false,
        blockCount: 0,
        hasMalformedMarkers: true,
      }
    }
    expectBegin = !expectBegin
  }

  // Count valid block pairs (properly nested begins and ends)
  const blockCount = beginIndices.length

  // Multiple blocks = corruption
  if (blockCount > 1) {
    return {
      action: 'append_safe_repair_block',
      preBlockContent: content,
      postBlockContent: '',
      hasValidBlock: true,
      blockCount: blockCount,
      hasMalformedMarkers: false,
    }
  }

  // One valid block = replace
  if (blockCount === 1) {
    const beginPos = beginIndices[0]!
    const endPos = endIndices[0]!
    const preBlock = content.slice(0, beginPos)
    const postBlock = content.slice(endPos + OPENFLOW_MARKER_END.length)

    return {
      action: 'replace_valid_block',
      preBlockContent: preBlock,
      postBlockContent: postBlock,
      hasValidBlock: true,
      blockCount: 1,
      hasMalformedMarkers: false,
    }
  }

  // Fallback: append as safe repair
  return {
    action: 'append_safe_repair_block',
    preBlockContent: content,
    postBlockContent: '',
    hasValidBlock: false,
    blockCount: 0,
    hasMalformedMarkers: true,
  }
}

/**
 * Render the final AGENTS.md content based on analysis result.
 *
 * @param result - Analysis result from analyzeAgentsContent
 * @param newline - Newline character(s) to use
 * @returns Complete AGENTS.md content
 */
export function renderAgentsContent(
  result: AgentsAnalysisResult,
  newline: string = NEWLINE_DEFAULT
): string {
  const managedBlock = OPENFLOW_DOCS_GUIDE_BLOCK

  switch (result.action) {
    case 'create_new_file':
      // Base template + blank line + managed block + trailing newline
      return AGENTS_INIT_BASE_TEMPLATE + newline + newline + managedBlock + newline

    case 'replace_valid_block': {
      // Preserve pre and post content, insert new block in middle
      const pre = result.preBlockContent
      const post = result.postBlockContent

      // Ensure one blank line before block if pre ends with content
      const separatorBefore = pre.length > 0 && !pre.endsWith(newline) ? newline : ''
      const normalizedPre = pre.endsWith(newline) ? pre : pre

      // Combine: pre + (optional newline) + block + (post with leading newline handling)
      let output = normalizedPre
      if (separatorBefore) {
        output += separatorBefore
      }
      output += managedBlock

      // Add post content with proper newline handling
      if (post.length > 0) {
        // Ensure block and post are separated by newline
        if (!post.startsWith(newline)) {
          output += newline
        }
        output += post
      }

      // Ensure trailing newline
      if (!output.endsWith(newline)) {
        output += newline
      }

      return output
    }

    case 'append_missing_block':
    case 'append_safe_repair_block': {
      // Append new block at EOF
      let content = result.preBlockContent

      // Ensure content ends with newline before adding block
      if (!content.endsWith(newline)) {
        content += newline
      }

      // Add blank line separator then block
      content += newline + managedBlock + newline

      return content
    }

    default:
      // Should never reach here
      throw new Error(`Unknown action: ${result.action}`)
  }
}

/**
 * Convenience function to analyze and render in one step.
 *
 * @param content - Current AGENTS.md content
 * @returns Object with action taken and final content
 */
export function updateAgentsContent(content: string): {
  action: AgentsUpdateAction
  content: string
} {
  const newline = content.length > 0 ? detectNewline(content) : NEWLINE_DEFAULT
  const result = analyzeAgentsContent(content)
  const newContent = renderAgentsContent(result, newline)

  return {
    action: result.action,
    content: newContent,
  }
}
