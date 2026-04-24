import { describe, expect, test } from 'bun:test'
import {
  analyzeAgentsContent,
  renderAgentsContent,
  updateAgentsContent,
  detectNewline,
  type AgentsAnalysisResult,
} from '../../src/commands/init-agents.js'
import {
  OPENFLOW_MARKER_BEGIN,
  OPENFLOW_MARKER_END,
  OPENFLOW_DOCS_GUIDE_BLOCK,
  AGENTS_INIT_BASE_TEMPLATE,
} from '../../src/commands/init-content.js'

describe('init-agents analyzer', () => {
  describe('detectNewline', () => {
    test('detects CRLF when present', () => {
      expect(detectNewline('line1\r\nline2')).toBe('\r\n')
    })

    test('defaults to LF when no CRLF', () => {
      expect(detectNewline('line1\nline2')).toBe('\n')
    })

    test('defaults to LF for empty string', () => {
      expect(detectNewline('')).toBe('\n')
    })
  })

  describe('analyzeAgentsContent', () => {
    test('empty content returns create_new_file', () => {
      const result = analyzeAgentsContent('')
      expect(result.action).toBe('create_new_file')
      expect(result.hasValidBlock).toBe(false)
      expect(result.blockCount).toBe(0)
    })

    test('whitespace-only content returns create_new_file', () => {
      const result = analyzeAgentsContent('   \n\t  ')
      expect(result.action).toBe('create_new_file')
    })

    test('content without markers returns append_missing_block', () => {
      const content = '# My Project\n\nSome description here.'
      const result = analyzeAgentsContent(content)
      expect(result.action).toBe('append_missing_block')
      expect(result.preBlockContent).toBe(content)
    })

    test('single valid block returns replace_valid_block', () => {
      const content = `# Project

${OPENFLOW_MARKER_BEGIN}
Old managed content
${OPENFLOW_MARKER_END}

Footer here.`
      const result = analyzeAgentsContent(content)
      expect(result.action).toBe('replace_valid_block')
      expect(result.hasValidBlock).toBe(true)
      expect(result.blockCount).toBe(1)
      expect(result.preBlockContent).toContain('# Project')
      expect(result.postBlockContent).toContain('Footer here')
    })

    test('begin marker without end returns append_safe_repair_block', () => {
      const content = `# Project

${OPENFLOW_MARKER_BEGIN}
Partial content here.`
      const result = analyzeAgentsContent(content)
      expect(result.action).toBe('append_safe_repair_block')
      expect(result.hasMalformedMarkers).toBe(true)
    })

    test('end marker without begin returns append_safe_repair_block', () => {
      const content = `Partial content here.
${OPENFLOW_MARKER_END}

Footer.`
      const result = analyzeAgentsContent(content)
      expect(result.action).toBe('append_safe_repair_block')
      expect(result.hasMalformedMarkers).toBe(true)
    })

    test('duplicate valid blocks returns append_safe_repair_block', () => {
      const content = `${OPENFLOW_MARKER_BEGIN}
Block 1
${OPENFLOW_MARKER_END}

Some text

${OPENFLOW_MARKER_BEGIN}
Block 2
${OPENFLOW_MARKER_END}`
      const result = analyzeAgentsContent(content)
      expect(result.action).toBe('append_safe_repair_block')
      expect(result.hasValidBlock).toBe(true)
      expect(result.blockCount).toBe(2)
    })

    test('multiple begins with single end returns append_safe_repair_block', () => {
      const content = `${OPENFLOW_MARKER_BEGIN}
${OPENFLOW_MARKER_BEGIN}
Content
${OPENFLOW_MARKER_END}`
      const result = analyzeAgentsContent(content)
      expect(result.action).toBe('append_safe_repair_block')
    })

    test('overlapping markers scenario returns append_safe_repair_block', () => {
      // Simulate overlapping by having end before begin in a weird way
      const content = `${OPENFLOW_MARKER_END}
Content
${OPENFLOW_MARKER_BEGIN}
More content
${OPENFLOW_MARKER_END}`
      const result = analyzeAgentsContent(content)
      // This creates one valid block from the second begin to second end
      // but there's also a stray end at the start
      expect(result.hasMalformedMarkers || result.action === 'append_safe_repair_block').toBe(true)
    })
  })

  describe('renderAgentsContent', () => {
    test('create_new_file produces correct structure', () => {
      const result: AgentsAnalysisResult = {
        action: 'create_new_file',
        preBlockContent: '',
        postBlockContent: '',
        hasValidBlock: false,
        blockCount: 0,
        hasMalformedMarkers: false,
      }
      const content = renderAgentsContent(result, '\n')

      expect(content).toContain(AGENTS_INIT_BASE_TEMPLATE)
      expect(content).toContain(OPENFLOW_DOCS_GUIDE_BLOCK)
      expect(content).toContain(OPENFLOW_MARKER_BEGIN)
      expect(content).toContain(OPENFLOW_MARKER_END)
      expect(content.endsWith('\n')).toBe(true)
    })

    test('replace_valid_block preserves surrounding content', () => {
      const result: AgentsAnalysisResult = {
        action: 'replace_valid_block',
        preBlockContent: '# Header\n\n',
        postBlockContent: '\n\n# Footer',
        hasValidBlock: true,
        blockCount: 1,
        hasMalformedMarkers: false,
      }
      const content = renderAgentsContent(result, '\n')

      expect(content).toContain('# Header')
      expect(content).toContain('# Footer')
      expect(content).toContain(OPENFLOW_DOCS_GUIDE_BLOCK)
      expect(content.indexOf(OPENFLOW_MARKER_BEGIN)).toBeGreaterThan(content.indexOf('# Header'))
      expect(content.indexOf('# Footer')).toBeGreaterThan(content.indexOf(OPENFLOW_MARKER_END))
    })

    test('append_missing_block adds block at EOF', () => {
      const originalContent = '# My Project\n\nDescription.'
      const result: AgentsAnalysisResult = {
        action: 'append_missing_block',
        preBlockContent: originalContent,
        postBlockContent: '',
        hasValidBlock: false,
        blockCount: 0,
        hasMalformedMarkers: false,
      }
      const content = renderAgentsContent(result, '\n')

      expect(content.startsWith('# My Project')).toBe(true)
      expect(content).toContain(OPENFLOW_DOCS_GUIDE_BLOCK)
      expect(content.indexOf(OPENFLOW_MARKER_BEGIN)).toBeGreaterThan(content.indexOf('Description.'))
    })

    test('append_safe_repair_block appends fresh block', () => {
      const corruptedContent = '# Project\n<!-- OPENFLOW DOCS GUIDE:BEGIN -->\nPartial'
      const result: AgentsAnalysisResult = {
        action: 'append_safe_repair_block',
        preBlockContent: corruptedContent,
        postBlockContent: '',
        hasValidBlock: false,
        blockCount: 0,
        hasMalformedMarkers: true,
      }
      const content = renderAgentsContent(result, '\n')

      // Should preserve original
      expect(content).toContain('# Project')
      expect(content).toContain('Partial')
      // Should add new valid block at end
      expect(content).toContain(OPENFLOW_DOCS_GUIDE_BLOCK)
      expect(content.indexOf(OPENFLOW_MARKER_END)).toBeGreaterThan(content.indexOf('Partial'))
    })

    test('preserves CRLF when specified', () => {
      const result: AgentsAnalysisResult = {
        action: 'append_missing_block',
        preBlockContent: 'Header\r\n',
        postBlockContent: '',
        hasValidBlock: false,
        blockCount: 0,
        hasMalformedMarkers: false,
      }
      const content = renderAgentsContent(result, '\r\n')

      expect(content).toContain('\r\n')
      expect(content.includes('\n') && !content.includes('\r\n')).toBe(false)
    })

    test('output always ends with trailing newline', () => {
      const result: AgentsAnalysisResult = {
        action: 'append_missing_block',
        preBlockContent: 'Content',
        postBlockContent: '',
        hasValidBlock: false,
        blockCount: 0,
        hasMalformedMarkers: false,
      }
      const content = renderAgentsContent(result, '\n')
      expect(content.endsWith('\n')).toBe(true)
    })
  })

  describe('updateAgentsContent', () => {
    test('returns correct action and content for new file', () => {
      const { action, content } = updateAgentsContent('')
      expect(action).toBe('create_new_file')
      expect(content).toContain(AGENTS_INIT_BASE_TEMPLATE)
      expect(content).toContain(OPENFLOW_DOCS_GUIDE_BLOCK)
    })

    test('returns correct action and content for existing without block', () => {
      const original = '# Existing\n\nContent.'
      const { action, content } = updateAgentsContent(original)
      expect(action).toBe('append_missing_block')
      expect(content).toContain('# Existing')
      expect(content).toContain(OPENFLOW_DOCS_GUIDE_BLOCK)
    })

    test('returns correct action for file with valid block', () => {
      const original = `# Header

${OPENFLOW_MARKER_BEGIN}
Old content
${OPENFLOW_MARKER_END}

Footer`
      const { action, content } = updateAgentsContent(original)
      expect(action).toBe('replace_valid_block')
      expect(content).toContain('# Header')
      expect(content).toContain('Footer')
      expect(content).toContain(OPENFLOW_DOCS_GUIDE_BLOCK)
      expect(content).not.toContain('Old content')
    })

    test('returns safe_repair for corrupted markers', () => {
      const corrupted = '# Header\n' + OPENFLOW_MARKER_BEGIN + '\nPartial'
      const { action, content } = updateAgentsContent(corrupted)
      expect(action).toBe('append_safe_repair_block')
      expect(content).toContain('# Header')
      expect(content).toContain('Partial')
      expect(content).toContain(OPENFLOW_DOCS_GUIDE_BLOCK)
    })
  })
})
