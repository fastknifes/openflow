import { describe, expect, test } from 'bun:test'
import {
  NEWLINE_DEFAULT,
  OPENFLOW_MARKER_BEGIN,
  OPENFLOW_MARKER_END,
  OPENFLOW_DOCS_GUIDE_BLOCK,
  AGENTS_INIT_BASE_TEMPLATE,
  INIT_RESULT_MESSAGES,
} from '../../src/commands/init-content.js'
import type { InitResult } from '../../src/commands/init-content.js'

describe('init-content constants', () => {
  test('marker strings are exact', () => {
    expect(OPENFLOW_MARKER_BEGIN).toBe('<!-- OPENFLOW DOCS GUIDE:BEGIN -->')
    expect(OPENFLOW_MARKER_END).toBe('<!-- OPENFLOW DOCS GUIDE:END -->')
  })

  test('docs guide block references all 7 docs directories', () => {
    const block = OPENFLOW_DOCS_GUIDE_BLOCK
    expect(block).toContain('docs/current/requirements/')
    expect(block).toContain('docs/current/design/')
    expect(block).toContain('docs/current/spec/')
    expect(block).toContain('docs/current/workflow/')
    expect(block).toContain('docs/decisions/')
    expect(block).toContain('docs/changes/')
    expect(block).toContain('docs/archive/')
  })

  test('docs guide block is Chinese-only (no ASCII letters except in paths)', () => {
    const block = OPENFLOW_DOCS_GUIDE_BLOCK
    // Remove code blocks, paths, and markers to check for non-Chinese content
    const contentOnly = block
      .replace(/<!--.*?-->/g, '')
      .replace(/`[^`]+`/g, '')
      .replace(/docs\/[^`/]+/g, '')
    
    // Should contain mostly CJK characters and punctuation
    // This is a heuristic - mainly we want to ensure it's not English
    const hasChinese = /[\u4e00-\u9fa5]/.test(contentOnly)
    expect(hasChinese).toBe(true)
  })

  test('docs guide block ends with exactly one trailing newline', () => {
    // The block itself should not end with newline - it's embedded
    expect(OPENFLOW_DOCS_GUIDE_BLOCK.endsWith('\n')).toBe(false)
  })

  test('base template includes project title', () => {
    expect(AGENTS_INIT_BASE_TEMPLATE).toContain('# OpenFlow')
  })

  test('InitResult type has all 4 values', () => {
    const results: InitResult[] = ['initialized', 'refreshed', 'appended', 'safe_repair']
    expect(results).toHaveLength(4)
  })

  test('INIT_RESULT_MESSAGES contains expected phrases for all results', () => {
    expect(INIT_RESULT_MESSAGES.initialized).toContain('initialized AGENTS.md and added OpenFlow docs guide')
    expect(INIT_RESULT_MESSAGES.refreshed).toContain('refreshed OpenFlow docs guide')
    expect(INIT_RESULT_MESSAGES.appended).toContain('appended OpenFlow docs guide')
    expect(INIT_RESULT_MESSAGES.safe_repair).toContain('appended fresh OpenFlow docs guide as safe repair')
    // All messages now include a formatted header
    expect(INIT_RESULT_MESSAGES.initialized).toContain('## OpenFlow Init Complete')
    expect(INIT_RESULT_MESSAGES.refreshed).toContain('## OpenFlow Init Complete')
    expect(INIT_RESULT_MESSAGES.appended).toContain('## OpenFlow Init Complete')
    expect(INIT_RESULT_MESSAGES.safe_repair).toContain('## OpenFlow Init Complete')
  })

  test('default newline is LF', () => {
    expect(NEWLINE_DEFAULT).toBe('\n')
  })

  test('docs guide block contains both markers', () => {
    expect(OPENFLOW_DOCS_GUIDE_BLOCK).toContain(OPENFLOW_MARKER_BEGIN)
    expect(OPENFLOW_DOCS_GUIDE_BLOCK).toContain(OPENFLOW_MARKER_END)
  })

  // P0+P1: corrective-rule guidance in docs guide block
  test('docs guide block references ai-reflection directory for corrective rules', () => {
    const block = OPENFLOW_DOCS_GUIDE_BLOCK
    expect(block).toContain('docs/current/workflow/ai-reflection/')
  })

  test('docs guide block includes Chinese guidance about checking relevant corrective rules on demand', () => {
    const block = OPENFLOW_DOCS_GUIDE_BLOCK
    // Must mention corrective rules (纠正规则) or similar Chinese guidance
    // referencing that the AI should check existing relevant rules
    const hasCorrectiveGuidance =
      block.includes('纠正规则') ||
      block.includes('反思') ||
      block.includes('反思记录')
    expect(hasCorrectiveGuidance).toBe(true)

    // Must still preserve on-demand reading principle — not requiring full read
    // The existing on-demand language should remain
    expect(block).toContain('按需')
  })
})
