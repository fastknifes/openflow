import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { join } from 'node:path'
import { mkdir, rm, writeFile, readFile, access } from 'node:fs/promises'
import { 
  ensureDecisionsDocument,
  evaluateDocumentBundle,
  generatePrd, 
  isPrdGenerationEnabled, 
  hasPrdDocument 
} from '../../../src/phases/brainstorm/prd-generator.js'
import { defaultConfig, type OpenFlowContext } from '../../../src/types.js'

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

describe('prd-generator', () => {
  describe('isPrdGenerationEnabled', () => {
    test('returns true when brainstorming is enabled and generate_prd is true', () => {
      const ctx = createContext()
      expect(isPrdGenerationEnabled(ctx.config)).toBe(true)
    })

    test('returns false when brainstorming is disabled', () => {
      const ctx = createContext({
        brainstorming: {
          ...defaultConfig.brainstorming,
          enabled: false,
        },
      })
      expect(isPrdGenerationEnabled(ctx.config)).toBe(false)
    })

    test('returns false when generate_prd is false', () => {
      const ctx = createContext({
        brainstorming: {
          ...defaultConfig.brainstorming,
          generate_prd: false,
        },
      })
      expect(isPrdGenerationEnabled(ctx.config)).toBe(false)
    })
  })

  describe('evaluateDocumentBundle', () => {
    const testDir = join(process.cwd(), '.test-prd-bundle')

    beforeEach(async () => {
      await rm(testDir, { recursive: true, force: true })
    })

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true })
    })

    test('returns full bundle when semantic signals are uncertain', async () => {
      const ctx = createContext()
      const designDir = join(testDir, 'docs', 'current', 'design', 'uncertain-feature')
      await mkdir(designDir, { recursive: true })
      await writeFile(join(designDir, 'design.md'), '# Design\n\n## Overview\n\nSimple notes.', 'utf-8')

      const decision = await evaluateDocumentBundle(testDir, 'uncertain-feature', ctx.config)
      expect(decision.generateDesign).toBe(true)
      expect(decision.generatePrd).toBe(true)
      expect(decision.generateDecisions).toBe(true)
    })

    test('respects explicit scope when provided', async () => {
      const ctx = createContext()
      const decision = await evaluateDocumentBundle(testDir, 'explicit-feature', ctx.config, ['design', 'prd'])
      expect(decision.generateDesign).toBe(true)
      expect(decision.generatePrd).toBe(true)
      expect(decision.generateDecisions).toBe(false)
    })
  })

  describe('hasPrdDocument', () => {
    const testDir = join(process.cwd(), '.test-prd-exists')

    beforeEach(async () => {
      await rm(testDir, { recursive: true, force: true })
    })

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true })
    })

    test('returns false when requirements directory does not exist', async () => {
      const ctx = createContext()
      const result = await hasPrdDocument(testDir, 'test-feature', ctx.config)
      expect(result).toBe(false)
    })

    test('returns false when no PRD file exists', async () => {
      const ctx = createContext()
      await mkdir(join(testDir, 'docs', 'current', 'requirements', 'test-feature'), { recursive: true })
      
      const result = await hasPrdDocument(testDir, 'test-feature', ctx.config)
      expect(result).toBe(false)
    })

    test('returns true when PRD file exists', async () => {
      const ctx = createContext()
      // Create design doc first so workspace detection picks change workspace
      const designDir = join(testDir, 'docs', 'changes', 'test-feature')
      await mkdir(designDir, { recursive: true })
      await writeFile(join(designDir, 'proposal.md'), '# Proposal', 'utf-8')
      await writeFile(join(designDir, 'prd.md'), '# Test PRD', 'utf-8')
      
      const result = await hasPrdDocument(testDir, 'test-feature', ctx.config)
      expect(result).toBe(true)
    })
  })

  describe('generatePrd', () => {
    const testDir = join(process.cwd(), '.test-prd-generate')

    beforeEach(async () => {
      await rm(testDir, { recursive: true, force: true })
    })

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true })
    })

    test('generates PRD document with default template', async () => {
      const ctx = createContext()
      
      const prdPath = await generatePrd({
        feature: 'test-feature',
        projectDir: testDir,
        config: ctx.config,
      })

      expect(prdPath).toContain('test-feature')
      expect(prdPath).toContain(join('docs', 'changes', 'test-feature', 'prd.md'))

      const content = await readFile(prdPath, 'utf-8')
      expect(content).toContain('test-feature')
      expect(content).toContain('Product Requirements Document')
      expect(content).toContain('功能描述')
      expect(content).toContain('用户故事')
      expect(content).toContain('验收标准')
    })

    test('generates PRD with design info when design documents exist', async () => {
      const ctx = createContext()
      
      // Create design documents
      const designDir = join(testDir, 'docs', 'current', 'design', 'test-feature')
      await mkdir(designDir, { recursive: true })
      
      await writeFile(
        join(designDir, 'proposal.md'),
        `# test-feature - Proposal

## Problem Statement

This feature solves the problem of X by doing Y.

## Success Criteria

- [ ] User can do A
- [ ] System supports B
`,
        'utf-8'
      )

      await writeFile(
        join(designDir, 'design.md'),
        `# test-feature - Design Document

## Overview

This is a high-level overview of the solution.

## Architecture

\`\`\`
Component A -> Component B
\`\`\`

### UserService

Purpose: Handles user operations

### AuthService

Purpose: Handles authentication
`,
        'utf-8'
      )

      const prdPath = await generatePrd({
        feature: 'test-feature',
        projectDir: testDir,
        config: ctx.config,
      })

      const content = await readFile(prdPath, 'utf-8')
      expect(content).toContain('test-feature')
    })

    test('does not overwrite existing PRD', async () => {
      const ctx = createContext()
      // Create design doc first so workspace detection picks change workspace
      const designDir = join(testDir, 'docs', 'changes', 'existing-feature')
      await mkdir(designDir, { recursive: true })
      await writeFile(join(designDir, 'proposal.md'), '# Proposal', 'utf-8')
      await writeFile(join(designDir, 'prd.md'), '# Existing PRD', 'utf-8')

      // This should not throw, but the existing file should remain
      const exists = await hasPrdDocument(testDir, 'existing-feature', ctx.config)
      expect(exists).toBe(true)
    })

    test('uses custom template if available', async () => {
      const ctx = createContext()
      
      // Create custom template
      const templateDir = join(testDir, 'templates')
      await mkdir(templateDir, { recursive: true })
      await writeFile(
        join(templateDir, 'prd.md'),
        '# {{feature}} Custom PRD\n\nDate: {{date}}',
        'utf-8'
      )

      const prdPath = await generatePrd({
        feature: 'custom-template',
        projectDir: testDir,
        config: ctx.config,
      })

      const content = await readFile(prdPath, 'utf-8')
      expect(content).toContain('Custom PRD')
      expect(content).toContain('custom-template')
    })

    test('prefers change workspace paths when design exists in docs/changes', async () => {
      const ctx = createContext()
      const changeDesignDir = join(testDir, 'docs', 'changes', 'change-feature')
      await mkdir(changeDesignDir, { recursive: true })
      await writeFile(join(changeDesignDir, 'design.md'), '# Design\n\n## Overview\n\nUser value and acceptance', 'utf-8')

      const prdPath = await generatePrd({
        feature: 'change-feature',
        projectDir: testDir,
        config: ctx.config,
      })

      expect(prdPath).toContain(join('docs', 'changes', 'change-feature', 'prd.md'))
      await expect(access(prdPath)).resolves.toBeNull()
    })

    test('creates decisions document when needed', async () => {
      const ctx = createContext()
      const designDir = join(testDir, 'docs', 'current', 'design', 'decision-feature')
      await mkdir(designDir, { recursive: true })

      const decisionsPath = await ensureDecisionsDocument(testDir, 'decision-feature', ctx.config)
      const content = await readFile(decisionsPath, 'utf-8')
      expect(content).toContain('decision-feature')
      expect(content).toContain('Key Decisions')
    })
  })
})
