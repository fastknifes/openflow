import { describe, expect, test, beforeEach } from 'bun:test'
import { cleanBuild, cleanAllBuilds, formatBytes } from '../../src/utils/build-cleaner'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

describe('build-cleaner', () => {
  describe('formatBytes', () => {
    test('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B')
      expect(formatBytes(1024)).toBe('1 KB')
      expect(formatBytes(1048576)).toBe('1 MB')
      expect(formatBytes(1073741824)).toBe('1 GB')
    })

    test('should handle fractional values', () => {
      expect(formatBytes(1536)).toBe('1.5 KB')
      expect(formatBytes(2560)).toBe('2.5 KB')
    })
  })

  describe('cleanBuild', () => {
    test('should handle non-existent build', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openflow-test-'))
      
      await cleanBuild({
        projectDir: tempDir,
        buildId: 'build-nonexistent-test',
      })
      
      await fs.rm(tempDir, { recursive: true, force: true })
    })
  })

  describe('cleanAllBuilds', () => {
    test('should return 0 for non-existent builds directory', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openflow-test-'))
      
      const count = await cleanAllBuilds({
        projectDir: tempDir,
      })
      
      expect(count).toBe(0)
      
      await fs.rm(tempDir, { recursive: true, force: true })
    })
  })
})
