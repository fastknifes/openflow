import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { updateAgentsFile } from '../../src/commands/init-persistence.js'
import {
  OPENFLOW_MARKER_BEGIN,
  OPENFLOW_MARKER_END,
  OPENFLOW_DOCS_GUIDE_BLOCK,
  AGENTS_INIT_BASE_TEMPLATE,
} from '../../src/commands/init-content.js'
import type { InitResult } from '../../src/commands/init-content.js'

describe('init-persistence', () => {
  const testDir = path.join(process.cwd(), '.test-init-persistence')

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('updateAgentsFile', () => {
    test('creates new AGENTS.md when file does not exist', async () => {
      const result = await updateAgentsFile({ projectDir: testDir })

      expect(result.isNewFile).toBe(true)
      expect(result.action).toBe('initialized')
      expect(result.filePath).toBe(path.join(testDir, 'AGENTS.md'))

      // Verify file content
      const content = await fs.readFile(result.filePath, 'utf-8')
      expect(content).toContain(AGENTS_INIT_BASE_TEMPLATE)
      expect(content).toContain(OPENFLOW_DOCS_GUIDE_BLOCK)
      expect(content).toContain(OPENFLOW_MARKER_BEGIN)
      expect(content).toContain(OPENFLOW_MARKER_END)
    })

    test('created file has exactly one trailing newline', async () => {
      await updateAgentsFile({ projectDir: testDir })

      const content = await fs.readFile(path.join(testDir, 'AGENTS.md'), 'utf-8')
      expect(content.endsWith('\n')).toBe(true)
      expect(content.endsWith('\n\n')).toBe(false)
    })

    test('appends block to existing file without markers', async () => {
      const existingContent = '# My Project\n\nDescription here.'
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), existingContent, 'utf-8')

      const result = await updateAgentsFile({ projectDir: testDir })

      expect(result.isNewFile).toBe(false)
      expect(result.action).toBe('appended')

      const content = await fs.readFile(result.filePath, 'utf-8')
      expect(content).toContain('# My Project')
      expect(content).toContain('Description here')
      expect(content).toContain(OPENFLOW_DOCS_GUIDE_BLOCK)
    })

    test('replaces existing valid block', async () => {
      const existingContent = `# Header

${OPENFLOW_MARKER_BEGIN}
Old content here
${OPENFLOW_MARKER_END}

Footer text.`
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), existingContent, 'utf-8')

      const result = await updateAgentsFile({ projectDir: testDir })

      expect(result.isNewFile).toBe(false)
      expect(result.action).toBe('refreshed')

      const content = await fs.readFile(result.filePath, 'utf-8')
      expect(content).toContain('# Header')
      expect(content).toContain('Footer text')
      expect(content).toContain(OPENFLOW_DOCS_GUIDE_BLOCK)
      expect(content).not.toContain('Old content here')
    })

    test('appends safe repair for corrupted markers', async () => {
      const corruptedContent = `# Header
${OPENFLOW_MARKER_BEGIN}
Partial content without end marker`
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), corruptedContent, 'utf-8')

      const result = await updateAgentsFile({ projectDir: testDir })

      expect(result.isNewFile).toBe(false)
      expect(result.action).toBe('safe_repair')

      const content = await fs.readFile(result.filePath, 'utf-8')
      expect(content).toContain('# Header')
      expect(content).toContain('Partial content')
      expect(content).toContain(OPENFLOW_DOCS_GUIDE_BLOCK)
    })

    test('preserves CRLF line endings', async () => {
      const existingContent = '# Project\r\n\r\nDescription.'
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), existingContent, 'utf-8')

      await updateAgentsFile({ projectDir: testDir })

      const content = await fs.readFile(path.join(testDir, 'AGENTS.md'), 'utf-8')
      // Should preserve CRLF in original content
      expect(content.includes('\r\n')).toBe(true)
      // Original content should have CRLF
      expect(content).toContain('# Project\r\n')
    })

    test('preserves LF line endings', async () => {
      const existingContent = '# Project\n\nDescription.'
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), existingContent, 'utf-8')

      await updateAgentsFile({ projectDir: testDir })

      const content = await fs.readFile(path.join(testDir, 'AGENTS.md'), 'utf-8')
      expect(content).toContain('# Project\n')
      // Should not introduce CRLF
      expect(content.includes('\r\n')).toBe(false)
    })

    test('idempotent: running twice on new file refreshes the block', async () => {
      // First run
      const result1 = await updateAgentsFile({ projectDir: testDir })
      expect(result1.action).toBe('initialized')

      // Second run
      const result2 = await updateAgentsFile({ projectDir: testDir })
      expect(result2.action).toBe('refreshed')
      expect(result2.isNewFile).toBe(false)

      // Should still have exactly one managed block
      const content = await fs.readFile(result2.filePath, 'utf-8')
      const beginCount = (content.match(new RegExp(OPENFLOW_MARKER_BEGIN, 'g')) || []).length
      expect(beginCount).toBe(1)
    })

    test('file is written atomically (no partial files on success)', async () => {
      await updateAgentsFile({ projectDir: testDir })

      // Check no temp files remain
      const files = await fs.readdir(testDir)
      const tempFiles = files.filter((f) => f.startsWith('.agents-md-temp'))
      expect(tempFiles).toHaveLength(0)

      // Check file is valid
      const content = await fs.readFile(path.join(testDir, 'AGENTS.md'), 'utf-8')
      expect(content).toContain(AGENTS_INIT_BASE_TEMPLATE)
    })

    test('returns correct file path', async () => {
      const result = await updateAgentsFile({ projectDir: testDir })
      expect(result.filePath).toBe(path.join(testDir, 'AGENTS.md'))
    })
  })

  describe('edge cases', () => {
    test('handles empty file as initialized action (file exists but empty)', async () => {
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), '', 'utf-8')

      const result = await updateAgentsFile({ projectDir: testDir })
      // File exists, so isNewFile is false
      expect(result.isNewFile).toBe(false)
      // But action is initialized because content was effectively empty
      expect(result.action).toBe('initialized')
    })

    test('handles whitespace-only file as initialized action (file exists)', async () => {
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), '   \n\t  ', 'utf-8')

      const result = await updateAgentsFile({ projectDir: testDir })
      // File exists, so isNewFile is false
      expect(result.isNewFile).toBe(false)
      // But action is initialized because content was effectively empty
      expect(result.action).toBe('initialized')
    })

    test('handles file with only newline characters as initialized action', async () => {
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), '\n\n\n', 'utf-8')

      const result = await updateAgentsFile({ projectDir: testDir })
      // File exists, so isNewFile is false
      expect(result.isNewFile).toBe(false)
      // But action is initialized because content was effectively empty
      expect(result.action).toBe('initialized')
    })

    test('duplicate blocks trigger safe repair', async () => {
      const duplicateContent = `${OPENFLOW_MARKER_BEGIN}
Block 1
${OPENFLOW_MARKER_END}

Text

${OPENFLOW_MARKER_BEGIN}
Block 2
${OPENFLOW_MARKER_END}`
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), duplicateContent, 'utf-8')

      const result = await updateAgentsFile({ projectDir: testDir })
      expect(result.action).toBe('safe_repair')

      // Should have preserved original and added new block
      const content = await fs.readFile(path.join(testDir, 'AGENTS.md'), 'utf-8')
      expect(content).toContain('Block 1')
      expect(content).toContain('Block 2')
    })
  })
})
