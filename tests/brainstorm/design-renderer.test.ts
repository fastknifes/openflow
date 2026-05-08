import { describe, expect, test } from 'bun:test'
import { createMinimalRequirementModel, resetIdCounter, type RequirementModel } from '../../src/phases/brainstorm/requirement-model.js'
import { renderDesignDocument } from '../../src/phases/brainstorm/design-renderer.js'

const REQUIRED_HEADINGS = [
  '## Overview',
  '## Problem',
  '## Goals',
  '## Non-Goals',
  '## Architecture',
  '## Design Constraints',
  '## Success Criteria',
  '## Proposed Design',
  '## Risks And Mitigations',
  '## Testing Strategy',
] as const

describe('renderDesignDocument', () => {
  test('renders a full model with all required sections and architecture details', () => {
    const model: RequirementModel = {
      feature: 'design-renderer',
      constraints: [
        {
          id: 'c-001',
          category: 'scope',
          severity: 'must',
          description: 'Keep the renderer deterministic',
          rationale: 'Stable markdown keeps downstream parsing predictable',
          verificationMethod: 'Render the same model twice and compare output',
          sourceQuestionId: 'constraints',
        },
        {
          id: 'c-002',
          category: 'maintainability',
          severity: 'should',
          description: 'Keep renderer output easy to scan',
          rationale: 'Humans still read the design document',
          verificationMethod: 'Review the generated headings and lists',
          sourceQuestionId: 'constraints',
        },
      ],
      scopeBoundary: {
        inScope: ['Generate design.md from a requirement model'],
        outOfScope: ['Wiring into brainstorm command'],
        touchedModules: ['src/phases/brainstorm/design-renderer.ts'],
      },
      acceptanceCriteria: [
        {
          id: 'ac-001',
          description: 'Renderer emits all required sections in order',
        },
        {
          id: 'ac-002',
          description: 'Architecture includes expected modules and symbols',
        },
      ],
      goals: ['Produce stable markdown for downstream tooling'],
      nonGoals: ['Modify the brainstorm command'],
      problemStatement: 'The brainstorm phase needs a deterministic design.md renderer',
      targetUsers: 'OpenFlow maintainers',
      expectedModules: [
        {
          path: 'src/phases/brainstorm/design-renderer.ts',
          purpose: 'Render design markdown',
        },
      ],
      expectedSymbols: [
        {
          name: 'renderDesignDocument',
          kind: 'function',
          module: 'src/phases/brainstorm/design-renderer.ts',
        },
        {
          name: 'designRendererContract',
          kind: 'const',
          module: 'src/phases/brainstorm/design-renderer.ts',
        },
      ],
      risks: [
        {
          description: 'Markdown changes could break drift detection',
          mitigation: 'Keep stable headings, backticks, and src/ paths',
        },
      ],
      testingStrategy: 'Use targeted Bun tests for the renderer output contract',
      synthesis: {
        summary: 'Deterministic renderer for brainstorm design documents',
      },
    }

    const markdown = renderDesignDocument(model)

    expectHeadingsExactlyOnce(markdown)
    expect(markdown).toContain('### Component: Render design markdown')
    expect(markdown).toContain('- Location: src/phases/brainstorm/design-renderer.ts')
    expect(markdown).toContain('- `renderDesignDocument` (function)')
    expect(markdown).toContain('- `designRendererContract` (const)')
    expect(markdown).toContain('- [must] Keep the renderer deterministic')
    expect(markdown).toContain('- [should] Keep renderer output easy to scan')
    expect(markdown).toContain('- [ ] Renderer emits all required sections in order')
  })

  test('renders a minimal model while preserving all required headings', () => {
    resetIdCounter()
    const model = createMinimalRequirementModel('minimal-feature')

    const markdown = renderDesignDocument(model)

    expectHeadingsExactlyOnce(markdown)
    expect(markdown).toContain('Feature: minimal-feature')
    expect(markdown).toContain('## Architecture\n\nNot specified.')
    expect(markdown).toContain('- [must] Must be backward compatible')
    expect(markdown).toContain('- [ ] All existing tests pass')
  })

  test('renders empty optional fields with notes instead of omitting headings', () => {
    const model: RequirementModel = {
      feature: 'empty-optional-fields',
      constraints: [],
      scopeBoundary: {
        inScope: [],
        outOfScope: [],
      },
      acceptanceCriteria: [],
      goals: [],
      nonGoals: [],
      expectedModules: [],
      expectedSymbols: [],
      risks: [],
      problemStatement: '',
      targetUsers: '',
      testingStrategy: '',
      synthesis: {},
    }

    const markdown = renderDesignDocument(model)

    expectHeadingsExactlyOnce(markdown)
    expect(markdown).toContain('## Problem\n\nNot specified.')
    expect(markdown).toContain('## Goals\n\nNot specified.')
    expect(markdown).toContain('## Non-Goals\n\nNot specified.')
    expect(markdown).toContain('## Architecture\n\nNot specified.')
    expect(markdown).toContain('## Design Constraints\n\nNot specified.')
    expect(markdown).toContain('## Success Criteria\n\n- [ ] Not specified.')
    expect(markdown).toContain('## Proposed Design\n\nNot specified.')
    expect(markdown).toContain('## Risks And Mitigations\n\nNot specified.')
    expect(markdown).toContain('## Testing Strategy\n\nNot specified.')
  })

  test('keeps section headings in the required order', () => {
    resetIdCounter()
    const markdown = renderDesignDocument(createMinimalRequirementModel('ordered-feature'))

    let previousIndex = -1
    for (const heading of REQUIRED_HEADINGS) {
      const index = markdown.indexOf(heading)
      expect(index).toBeGreaterThan(previousIndex)
      previousIndex = index
    }
  })
})

function expectHeadingsExactlyOnce(markdown: string): void {
  for (const heading of REQUIRED_HEADINGS) {
    expect(markdown.match(new RegExp(`^${escapeRegExp(heading)}$`, 'gm'))).toHaveLength(1)
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
