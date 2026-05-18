import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { join } from 'node:path'
import { mkdir, rm, writeFile, readFile, access } from 'node:fs/promises'
import { 
  ensureDecisionsDocument,
  evaluateDocumentBundle,
  generatePrd, 
  isPrdGenerationEnabled, 
  hasPrdDocument 
} from '../../../src/phases/feature/prd-generator.js'
import { createMinimalRequirementModel } from '../../../src/phases/feature/requirement-model.js'
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
    test('returns true when feature phase is enabled and generate_prd is true', () => {
      const ctx = createContext()
      expect(isPrdGenerationEnabled(ctx.config)).toBe(true)
    })

    test('returns false when feature phase is disabled', () => {
      const ctx = createContext({
        feature: {
          ...defaultConfig.feature,
          enabled: false,
        },
      })
      expect(isPrdGenerationEnabled(ctx.config)).toBe(false)
    })

    test('returns false when generate_prd is false', () => {
      const ctx = createContext({
        feature: {
          ...defaultConfig.feature,
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

    test('returns design only when semantic signals are uncertain', async () => {
      const ctx = createContext()
      const designDir = join(testDir, 'docs', 'current', 'design', 'uncertain-feature')
      await mkdir(designDir, { recursive: true })
      await writeFile(join(designDir, 'design.md'), '# Design\n\n## Overview\n\nSimple notes.', 'utf-8')

      const decision = await evaluateDocumentBundle(testDir, 'uncertain-feature', ctx.config)
      expect(decision.generateDesign).toBe(true)
      expect(decision.generatePrd).toBe(false)
      expect(decision.generateDecisions).toBe(false)
    })

    test('respects explicit scope when provided', async () => {
      const ctx = createContext()
      const decision = await evaluateDocumentBundle(testDir, 'explicit-feature', ctx.config, ['design', 'prd'])
      expect(decision.generateDesign).toBe(true)
      expect(decision.generatePrd).toBe(true)
      expect(decision.generateDecisions).toBe(false)
    })

    test('prefers requirement model metadata when sidecar exists', async () => {
      const ctx = createContext()
      const designDir = join(testDir, 'docs', 'changes', 'modeled-feature')
      await mkdir(designDir, { recursive: true })
      await writeFile(join(designDir, 'design.md'), '# Design', 'utf-8')

      const model = createMinimalRequirementModel('modeled-feature')
      model.constraints.push(
        {
          id: 'c-extra-1',
          category: 'security',
          severity: 'must',
          description: 'Protect access to generated documents',
          rationale: 'Generated content may include sensitive change context',
          verificationMethod: 'Permission tests cover the protected flow',
          sourceQuestionId: 'constraints',
        },
        {
          id: 'c-extra-2',
          category: 'maintainability',
          severity: 'should',
          description: 'Keep document generation logic easy to extend',
          rationale: 'The brainstorm workflow continues to evolve',
          verificationMethod: 'New sidecar-backed tests verify extension points',
          sourceQuestionId: 'constraints',
        },
      )
      model.expectedModules = [
        { path: 'src/phases/brainstorm/prd-generator.ts', purpose: 'Generate PRDs' },
        { path: 'src/phases/brainstorm/requirement-model.ts', purpose: 'Validate sidecar schema' },
      ]

      await writeFile(join(designDir, 'design.meta.json'), JSON.stringify(model, null, 2), 'utf-8')

      const decision = await evaluateDocumentBundle(testDir, 'modeled-feature', ctx.config)
      expect(decision.generateDesign).toBe(true)
      expect(decision.generatePrd).toBe(true)
      expect(decision.generateDecisions).toBe(true)
      expect(decision.reason).toContain('structured bundle decision')
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

    test('does not generate empty PRD from default template without design context', async () => {
      const ctx = createContext()

      await expect(generatePrd({
        feature: 'test-feature',
        projectDir: testDir,
        config: ctx.config,
      })).rejects.toThrow('Cannot generate PRD')
    })

    test('generates PRD with design info when design documents exist', async () => {
      const ctx = createContext()
      
      // Create design documents
      const designDir = join(testDir, 'docs', 'changes', 'test-feature')
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

    test('generates PRD from sidecar requirement model when available', async () => {
      const ctx = createContext()
      const designDir = join(testDir, 'docs', 'changes', 'modeled-prd')
      await mkdir(designDir, { recursive: true })
      await writeFile(join(designDir, 'design.md'), '# Design', 'utf-8')

      const model = createMinimalRequirementModel('modeled-prd')
      model.problemStatement = 'Reduce manual PRD drafting for structured brainstorm output.'
      model.goals = ['Generate a complete PRD from sidecar metadata', 'Preserve markdown fallback behavior']
      model.scopeBoundary.inScope = ['Generate PRD from design.meta.json', 'Validate sidecar content before rendering']
      model.scopeBoundary.outOfScope = ['Rewrite brainstorm prompts']
      model.acceptanceCriteria = [
        { id: 'ac-sidecar-1', description: 'PRD includes goals from the requirement model' },
        { id: 'ac-sidecar-2', description: 'PRD includes acceptance criteria from the sidecar' },
      ]
      model.constraints = [
        {
          id: 'c-sidecar-1',
          category: 'compatibility',
          severity: 'must',
          description: 'Keep legacy markdown extraction as a fallback path',
          rationale: 'Older workspaces do not have sidecar files yet',
          verificationMethod: 'Markdown-only tests still pass',
          sourceQuestionId: 'constraints',
        },
      ]

      await writeFile(join(designDir, 'design.meta.json'), JSON.stringify(model, null, 2), 'utf-8')

      const prdPath = await generatePrd({
        feature: 'modeled-prd',
        projectDir: testDir,
        config: ctx.config,
      })

      const content = await readFile(prdPath, 'utf-8')
      expect(content).toContain('Reduce manual PRD drafting for structured brainstorm output.')
      expect(content).toContain('Generate a complete PRD from sidecar metadata')
      expect(content).toContain('Keep legacy markdown extraction as a fallback path')
      expect(content).toContain('Generate PRD from design.meta.json')
      expect(content).toContain('Rewrite brainstorm prompts')
      expect(content).toContain('PRD includes acceptance criteria from the sidecar')
    })

    test('falls back to markdown extraction when no sidecar exists', async () => {
      const ctx = createContext()
      const designDir = join(testDir, 'docs', 'changes', 'fallback-prd')
      await mkdir(designDir, { recursive: true })

      await writeFile(
        join(designDir, 'proposal.md'),
        `# fallback-prd - Proposal

## Problem Statement

Markdown fallback problem statement.

## Success Criteria

- [ ] Legacy extraction still works
- [ ] No sidecar required
`,
        'utf-8'
      )

      await writeFile(
        join(designDir, 'design.md'),
        `# fallback-prd - Design Document

## Overview

Markdown fallback overview.

## Architecture

### ParserComponent

### WriterComponent
`,
        'utf-8'
      )

      const prdPath = await generatePrd({
        feature: 'fallback-prd',
        projectDir: testDir,
        config: ctx.config,
      })

      const content = await readFile(prdPath, 'utf-8')
      expect(content).toContain('Markdown fallback problem statement.')
      expect(content).toContain('Markdown fallback overview.')
      expect(content).toContain('Legacy extraction still works')
      expect(content).toContain('ParserComponent')
      expect(content).toContain('WriterComponent')
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

    test('uses custom template if available and design context exists', async () => {
      const ctx = createContext()
      
      // Create custom template
      const templateDir = join(testDir, 'templates')
      await mkdir(templateDir, { recursive: true })
      await writeFile(
        join(templateDir, 'prd.md'),
        '# {{feature}} Custom PRD\n\nDate: {{date}}',
        'utf-8'
      )
      const designDir = join(testDir, 'docs', 'changes', 'custom-template')
      await mkdir(designDir, { recursive: true })
      await writeFile(join(designDir, 'design.md'), '# Design\n\n## Overview\n\nCustom template has real design context.', 'utf-8')

      const prdPath = await generatePrd({
        feature: 'custom-template',
        projectDir: testDir,
        config: ctx.config,
      })

      const content = await readFile(prdPath, 'utf-8')
      expect(content).toContain('Custom PRD')
      expect(content).toContain('custom-template')
    })

    test('prefers existing dated change workspace over creating bare feature directory', async () => {
      const ctx = createContext()
      const datedDesignDir = join(testDir, 'docs', 'changes', '2026-05-11-dated-feature')
      await mkdir(datedDesignDir, { recursive: true })
      await writeFile(join(datedDesignDir, 'design.md'), '# Design\n\n## Overview\n\nUser value and acceptance', 'utf-8')

      const prdPath = await generatePrd({
        feature: 'dated-feature',
        projectDir: testDir,
        config: ctx.config,
      })

      expect(prdPath).toBe(join(datedDesignDir, 'prd.md'))
      await expect(access(join(testDir, 'docs', 'changes', 'dated-feature', 'prd.md'))).rejects.toThrow()
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
      const designDir = join(testDir, 'docs', 'changes', 'decision-feature')
      await mkdir(designDir, { recursive: true })

      const model = createMinimalRequirementModel('decision-feature')
      model.constraints = [
        {
          id: 'c-decision-1',
          category: 'scope',
          severity: 'must',
          description: 'Keep PRD generation limited to the brainstorm workspace',
          rationale: 'Avoid leaking changes into unrelated docs',
          verificationMethod: 'Workspace-path tests validate output location',
          sourceQuestionId: 'constraints',
        },
      ]
      await writeFile(join(designDir, 'design.meta.json'), JSON.stringify(model, null, 2), 'utf-8')

      const decisionsPath = await ensureDecisionsDocument(testDir, 'decision-feature', ctx.config)
      const content = await readFile(decisionsPath, 'utf-8')
      expect(content).toContain('decision-feature')
      expect(content).toContain('Key Decisions')
      expect(content).toContain('Keep PRD generation limited to the brainstorm workspace')
    })

    test('does not create placeholder decisions document without concrete constraints', async () => {
      const ctx = createContext()
      const designDir = join(testDir, 'docs', 'changes', 'empty-decision-feature')
      await mkdir(designDir, { recursive: true })
      await writeFile(join(designDir, 'design.md'), '# Design\n\n## Overview\n\nNo concrete decision source.', 'utf-8')

      await expect(ensureDecisionsDocument(testDir, 'empty-decision-feature', ctx.config)).rejects.toThrow(
        'Cannot generate decisions document'
      )
    })
  })
})
