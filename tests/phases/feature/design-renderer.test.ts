import { describe, expect, test } from 'bun:test'
import { createMinimalRequirementModel, resetIdCounter, type RequirementModel } from '../../../src/phases/feature/requirement-model.js'
import { renderDesignDocument } from '../../../src/phases/feature/design-renderer.js'

const REQUIRED_HEADINGS = [
  '## Human Consensus Summary',
  '## Identity And Assumptions',
  '## Overview',
  '## Problem',
  '## Goals',
  '## Non-Goals',
  '## Behavior Alignment',
  '## Design Constraints',
  '## Success Criteria',
  '## Risks And Mitigations',
  '## Testing Strategy',
] as const

describe('renderDesignDocument', () => {
  test('renders a full model with product-level sections and execution constraints', () => {
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
          description: 'Renderer keeps the design readable without implementation details',
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
    expect(markdown).toContain('## Human Consensus Summary')
    expect(markdown).toContain('## Identity And Assumptions')
    expect(markdown).not.toContain('## Architecture')
    expect(markdown).not.toContain('## Proposed Design')
    expect(markdown).not.toContain('### Component: Render design markdown')
    expect(markdown).not.toContain('Files / Modules')
    expect(markdown).not.toContain('| Renderer emits all required sections in order | See constraints')
    expect(markdown).toContain('| Renderer emits all required sections in order | Captured as observable product/workflow behavior; implementation structure is deferred until planning. | Medium |')
    expect(markdown).not.toContain('src/phases/brainstorm/design-renderer.ts')
    expect(markdown).not.toContain('renderDesignDocument')
    expect(markdown).not.toContain('designRendererContract')
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
    expect(markdown).not.toContain('## Architecture')
    expect(markdown).toContain('- [must] Must be backward compatible')
    expect(markdown).toContain('- [ ] All existing tests pass')
  })

  test('adds an ASCII page and interaction preview for frontend requirements', () => {
    const model: RequirementModel = {
      ...createMinimalRequirementModel('settings-page'),
      featureTitle: '设置页面筛选器',
      problemStatement: '用户需要在前端页面通过表单筛选设置项',
      targetUsers: '后台用户',
      scopeBoundary: {
        inScope: ['Settings filter page'],
        outOfScope: ['Backend permission model'],
        touchedModules: ['src/components/settings/SettingsFilter.tsx'],
      },
      goals: ['用户可以在设置页面筛选列表'],
      acceptanceCriteria: [
        {
          id: 'ac-ui-001',
          description: '用户点击筛选按钮后列表刷新并显示反馈',
        },
      ],
    }

    const markdown = renderDesignDocument(model)

    expect(markdown).toContain('## UI / Interaction ASCII Preview')
    expect(markdown).toContain('+------------------------------------------------------------+')
    expect(markdown).toContain('Interaction flow:')
    expect(markdown).toContain('User opens the page/component')
    expect(markdown.indexOf('## UI / Interaction ASCII Preview')).toBeGreaterThan(markdown.indexOf('## Problem'))
    expect(markdown.indexOf('## UI / Interaction ASCII Preview')).toBeLessThan(markdown.indexOf('## Goals'))
  })

  test('does not add the frontend ASCII preview for non-frontend requirements', () => {
    const markdown = renderDesignDocument(createMinimalRequirementModel('api-cache-policy'))

    expect(markdown).not.toContain('## UI / Interaction ASCII Preview')
  })

  test('does not treat excluded frontend scope as a frontend requirement', () => {
    const model: RequirementModel = {
      ...createMinimalRequirementModel('api-contract-cleanup'),
      problemStatement: 'Normalize backend API response fields for service consumers',
      scopeBoundary: {
        inScope: ['Backend response contract'],
        outOfScope: ['Frontend page changes', 'UI component updates'],
      },
      nonGoals: ['Do not change the dashboard page'],
    }

    const markdown = renderDesignDocument(model)

    expect(markdown).not.toContain('## UI / Interaction ASCII Preview')
  })

  test('does not add the frontend ASCII preview for explicit no-UI backend changes', () => {
    const model: RequirementModel = {
      ...createMinimalRequirementModel('backend-contract-cleanup'),
      problemStatement: 'Normalize backend API response fields with no UI changes',
      scopeBoundary: {
        inScope: ['Backend response contract; frontend is not affected'],
        outOfScope: [],
      },
      goals: ['Keep dashboard page unchanged while backend clients migrate'],
    }

    const markdown = renderDesignDocument(model)

    expect(markdown).not.toContain('## UI / Interaction ASCII Preview')
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
    expect(markdown).toContain('## Design Constraints\n\nNot specified.')
    expect(markdown).toContain('## Success Criteria\n\n- [ ] Not specified.')
    expect(markdown).not.toContain('## Proposed Design')
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
