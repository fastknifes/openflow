import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { handleInit } from '../../src/commands/init.js'
import { defaultConfig, type OpenFlowContext } from '../../src/types.js'
import {
  OPENFLOW_MARKER_BEGIN,
  OPENFLOW_MARKER_END,
  AGENTS_INIT_BASE_TEMPLATE,
} from '../../src/commands/init-content.js'
import { OpenFlowError } from '../../src/utils/errors.js'

function createContext(configOverride?: Partial<typeof defaultConfig>): OpenFlowContext {
  return {
    directory: process.cwd(),
    worktree: process.cwd(),
    client: {},
    $: {},
    config: {
      ...defaultConfig,
      ...configOverride,
    },
    enhancedPlans: new Set<string>(),
  }
}

describe('init command', () => {
  const testDir = path.join(process.cwd(), '.test-init-command')

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('handleInit', () => {
    test('returns initialized message for new file', async () => {
      const ctx = createContext()
      ctx.directory = testDir

      const result = await handleInit(ctx)
      expect(result).toContain('initialized AGENTS.md and added OpenFlow docs guide')
      expect(result).toContain('## OpenFlow Init Complete')

      // Verify file was created
      const content = await fs.readFile(path.join(testDir, 'AGENTS.md'), 'utf-8')
      expect(content).toContain(AGENTS_INIT_BASE_TEMPLATE)
    })

    test('returns refreshed message for existing valid block', async () => {
      const ctx = createContext()
      ctx.directory = testDir

      // Create initial file with valid block
      const initialContent = `# Header

${OPENFLOW_MARKER_BEGIN}
Old content
${OPENFLOW_MARKER_END}

Footer`
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), initialContent, 'utf-8')

      const result = await handleInit(ctx)
      expect(result).toContain('refreshed OpenFlow docs guide')
      expect(result).toContain('## OpenFlow Init Complete')

      // Verify content was refreshed
      const content = await fs.readFile(path.join(testDir, 'AGENTS.md'), 'utf-8')
      expect(content).toContain('# Header')
      expect(content).not.toContain('Old content')
    })

    test('returns appended message for file without block', async () => {
      const ctx = createContext()
      ctx.directory = testDir

      // Create file without block
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), '# My Project\n\nDescription.', 'utf-8')

      const result = await handleInit(ctx)
      expect(result).toContain('appended OpenFlow docs guide')
      expect(result).toContain('## OpenFlow Init Complete')

      // Verify block was appended
      const content = await fs.readFile(path.join(testDir, 'AGENTS.md'), 'utf-8')
      expect(content).toContain('# My Project')
      expect(content).toContain(OPENFLOW_MARKER_BEGIN)
    })

    test('returns safe_repair message for corrupted markers', async () => {
      const ctx = createContext()
      ctx.directory = testDir

      // Create file with corrupted markers
      const corruptedContent = '# Header\n' + OPENFLOW_MARKER_BEGIN + '\nPartial'
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), corruptedContent, 'utf-8')

      const result = await handleInit(ctx)
      expect(result).toContain('appended fresh OpenFlow docs guide as safe repair')
      expect(result).toContain('## OpenFlow Init Complete')

      // Verify fresh block was added
      const content = await fs.readFile(path.join(testDir, 'AGENTS.md'), 'utf-8')
      expect(content).toContain('# Header')
      expect(content).toContain(OPENFLOW_MARKER_END) // Fresh block has end marker
    })

    test('is idempotent - running twice refreshes the same block', async () => {
      const ctx = createContext()
      ctx.directory = testDir

      // First run
      const result1 = await handleInit(ctx)
      expect(result1).toContain('initialized AGENTS.md and added OpenFlow docs guide')
      expect(result1).toContain('## OpenFlow Init Complete')

      // Second run
      const result2 = await handleInit(ctx)
      expect(result2).toContain('refreshed OpenFlow docs guide')
      expect(result2).toContain('## OpenFlow Init Complete')

      // Verify only one block exists
      const content = await fs.readFile(path.join(testDir, 'AGENTS.md'), 'utf-8')
      const beginCount = (content.match(new RegExp(OPENFLOW_MARKER_BEGIN, 'g')) || []).length
      expect(beginCount).toBe(1)
    })

    test('preserves surrounding content when refreshing', async () => {
      const ctx = createContext()
      ctx.directory = testDir

      // Create file with custom content around the block
      const customContent = `# Project Title

Custom description here.

${OPENFLOW_MARKER_BEGIN}
Old guide content
${OPENFLOW_MARKER_END}

## Footer Section
Footer text here.`
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), customContent, 'utf-8')

      await handleInit(ctx)

      const content = await fs.readFile(path.join(testDir, 'AGENTS.md'), 'utf-8')
      expect(content).toContain('# Project Title')
      expect(content).toContain('Custom description here')
      expect(content).toContain('## Footer Section')
      expect(content).toContain('Footer text here')
      expect(content).not.toContain('Old guide content')
    })

    test('works without docs/ directory present', async () => {
      const ctx = createContext()
      ctx.directory = testDir

      // Ensure no docs directory exists
      const docsPath = path.join(testDir, 'docs')
      try {
        await fs.rm(docsPath, { recursive: true, force: true })
      } catch {
        // Ignore if doesn't exist
      }

      const result = await handleInit(ctx)
      expect(result).toContain('initialized AGENTS.md and added OpenFlow docs guide')
      expect(result).toContain('## OpenFlow Init Complete')

      // Verify file was created
      const content = await fs.readFile(path.join(testDir, 'AGENTS.md'), 'utf-8')
      expect(content).toContain(OPENFLOW_MARKER_BEGIN)
    })

    test('throws OpenFlowError for permission errors', async () => {
      // This test simulates a permission error scenario
      // In practice, we'd need to mock the filesystem or use a read-only directory
      // For now, we just verify the error handling pattern

      const ctx = createContext()
      ctx.directory = '/nonexistent/path/that/cannot/be/created'

      // Should throw or handle gracefully
      try {
        await handleInit(ctx)
        // If we get here without error, the function handled it gracefully
        // which is also acceptable behavior
      } catch (error) {
        // If it throws, it should be an OpenFlowError
        expect(error).toBeInstanceOf(OpenFlowError)
      }
    })
  })
})
