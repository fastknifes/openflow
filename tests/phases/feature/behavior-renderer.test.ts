import { describe, expect, test } from 'bun:test'
import { createMinimalRequirementModel, resetIdCounter, type RequirementModel } from '../../../src/phases/feature/requirement-model.js'
import { renderBehaviorDocument } from '../../../src/phases/feature/behavior-renderer.js'

const REQUIRED_HEADINGS = [
  '## User Context',
  '## Trigger Rules',
  '## Non-Trigger Rules',
  '## User-Visible Scenarios',
  '## Required Content',
  '## Success Responses',
  '## Must Not Behavior',
  '## Acceptance / Verification Mapping',
] as const

describe('renderBehaviorDocument', () => {
  test('renders a full model with all 8 behavior-only sections', () => {
    const model: RequirementModel = {
      feature: 'behavior-renderer',
      constraints: [
        {
          id: 'c-001',
          category: 'compatibility',
          severity: 'must',
          description: 'Must not change existing public output',
          rationale: 'Downstream consumers parse behavior docs',
          verificationMethod: 'Compare generated output against golden files',
          sourceQuestionId: 'constraints',
        },
        {
          id: 'c-002',
          category: 'security',
          severity: 'must',
          description: 'No secrets in generated output',
          rationale: 'Output may be committed to version control',
          verificationMethod: 'Scan for secret patterns',
          sourceQuestionId: 'constraints',
        },
      ],
      scopeBoundary: {
        inScope: ['Feature activation via slash command', 'Question flow driven by state machine'],
        outOfScope: ['Wiring into archive command', 'Modifying design renderer'],
      },
      acceptanceCriteria: [
        { id: 'ac-001', description: 'User sees behavior-only sections in generated output' },
        { id: 'ac-002', description: 'Generated output never includes module paths or file names' },
      ],
      goals: ['Produce stable behavior markdown'],
      nonGoals: ['Modify the brainstorm command', 'Generate design diagrams'],
      testingStrategy: 'unit',
    }

    const markdown = renderBehaviorDocument(model)

    expectHeadingsExactlyOnce(markdown)

    // Trigger Rules
    expect(markdown).toContain('- Goal-driven: Produce stable behavior markdown')
    expect(markdown).toContain('- In-scope match: Feature activation via slash command')

    // Non-Trigger Rules
    expect(markdown).toContain('- Out of scope: Wiring into archive command')
    expect(markdown).toContain('- Not a goal: Modify the brainstorm command')

    // User-Visible Scenarios
    expect(markdown).toContain('### Scenario: User sees behavior-only sections in generated output')
    expect(markdown).toContain('**Given:**')
    expect(markdown).toContain('**When:**')
    expect(markdown).toContain('**Then (observable outcome):**')

    // Required Content
    expect(markdown).toContain('- Must satisfy constraint: Must not change existing public output')
    expect(markdown).toContain('- Must satisfy constraint: No secrets in generated output')
    expect(markdown).toContain('- Must include: Feature activation via slash command')

    // Success Responses
    expect(markdown).toContain('**Success:** User sees behavior-only sections in generated output')
    expect(markdown).toContain('**Success:** Generated output never includes module paths or file names')

    // Must Not Behavior
    expect(markdown).toContain('- Must not: Modify the brainstorm command')
    expect(markdown).toContain('- Security boundary: No secrets in generated output')

    // Acceptance / Verification Mapping
    expect(markdown).toContain('| Acceptance Criterion | Scenario | Evidence Type | Expected Evidence | Status |')
    expect(markdown).toContain('| User sees behavior-only sections in generated output |')
    expect(markdown).toContain('| unit | User-observable confirmation')

    // No design/architecture language in renderer scaffolding
    expect(markdown).not.toContain('architecture')
  })

  test('renders a minimal model while preserving all required headings', () => {
    resetIdCounter()
    const model = createMinimalRequirementModel('minimal-feature')

    const markdown = renderBehaviorDocument(model)

    expectHeadingsExactlyOnce(markdown)
    expect(markdown).toContain('- In-scope match: minimal-feature core logic')
    expect(markdown).toContain('- Goal-driven: minimal-feature works correctly')
    expect(markdown).toContain('### Scenario: All existing tests pass')
  })

  test('renders empty optional fields with Not specified', () => {
    const model: RequirementModel = {
      feature: 'empty-optional-fields',
      constraints: [],
      scopeBoundary: { inScope: [], outOfScope: [] },
      acceptanceCriteria: [],
      goals: [],
      nonGoals: [],
    }

    const markdown = renderBehaviorDocument(model)

    expectHeadingsExactlyOnce(markdown)
    expect(markdown).toContain('## Trigger Rules\n\nNot specified.')
    expect(markdown).toContain('## Non-Trigger Rules\n\nNot specified.')
    expect(markdown).toContain('## User-Visible Scenarios\n\n')
    expect(markdown).toContain('Not specified.')
    expect(markdown).toContain('## Required Content\n\nNot specified.')
    expect(markdown).toContain('## Success Responses\n\nNot specified.')
    expect(markdown).toContain('## Must Not Behavior\n\nNot specified.')
    expect(markdown).toContain('## Acceptance / Verification Mapping\n\nNot specified.')
  })

  test('keeps section headings in the required order', () => {
    resetIdCounter()
    const markdown = renderBehaviorDocument(createMinimalRequirementModel('ordered-feature'))

    let previousIndex = -1
    for (const heading of REQUIRED_HEADINGS) {
      const index = markdown.indexOf(heading)
      expect(index).toBeGreaterThan(previousIndex)
      previousIndex = index
    }
  })

  test('renders verification mapping table with correct columns', () => {
    const model: RequirementModel = {
      feature: 'table-test',
      constraints: [],
      scopeBoundary: { inScope: [], outOfScope: [] },
      acceptanceCriteria: [
        { id: 'ac-001', description: 'First behavior' },
        { id: 'ac-002', description: 'Second behavior' },
      ],
      goals: [],
      nonGoals: [],
      testingStrategy: 'automated',
    }

    const markdown = renderBehaviorDocument(model)

    const tableHeader = '| Acceptance Criterion | Scenario | Evidence Type | Expected Evidence | Status |'
    expect(markdown).toContain(tableHeader)
    expect(markdown).toContain('| First behavior | First behavior | automated | User-observable confirmation that "First behavior" occurs | pending |')
    expect(markdown).toContain('| Second behavior | Second behavior | automated | User-observable confirmation that "Second behavior" occurs | pending |')
  })

  test('uses manual as default evidence type when testingStrategy is absent', () => {
    const model: RequirementModel = {
      feature: 'no-strategy',
      constraints: [],
      scopeBoundary: { inScope: [], outOfScope: [] },
      acceptanceCriteria: [{ id: 'ac-001', description: 'Some behavior' }],
      goals: [],
      nonGoals: [],
    }

    const markdown = renderBehaviorDocument(model)

    expect(markdown).toContain('| Some behavior | Some behavior | manual | User-observable confirmation that "Some behavior" occurs | pending |')
  })

  test('maps constraints to trigger, non-trigger, and must-not rules correctly', () => {
    const model: RequirementModel = {
      feature: 'constraint-mapping',
      constraints: [
        {
          id: 'c-001',
          category: 'compatibility',
          severity: 'must',
          description: 'Must obey scope boundary',
          rationale: 'Prevent scope creep',
          verificationMethod: 'Review scope',
          sourceQuestionId: 'constraints',
        },
        {
          id: 'c-002',
          category: 'performance',
          severity: 'should',
          description: 'Respond within 200ms',
          rationale: 'User experience',
          verificationMethod: 'Benchmark',
          sourceQuestionId: 'constraints',
        },
        {
          id: 'c-003',
          category: 'compatibility',
          severity: 'may',
          description: 'Support legacy format',
          rationale: 'Nice to have',
          verificationMethod: 'Manual check',
          sourceQuestionId: 'constraints',
        },
        {
          id: 'c-004',
          category: 'security',
          severity: 'must',
          description: 'No credentials in output',
          rationale: 'Log safety',
          verificationMethod: 'Secret scan',
          sourceQuestionId: 'constraints',
        },
      ],
      scopeBoundary: { inScope: ['Constraint-based behavior'], outOfScope: ['Unrelated feature'] },
      acceptanceCriteria: [],
      goals: ['Map constraints correctly'],
      nonGoals: ['Remove existing behavior'],
    }

    const markdown = renderBehaviorDocument(model)

    // Trigger Rules
    expect(markdown).toContain('- Must constraint: Must obey scope boundary')
    expect(markdown).toContain('- Should constraint: Respond within 200ms')

    // Non-Trigger Rules
    expect(markdown).toContain('- May constraint (non-trigger): Support legacy format')

    // Required Content
    expect(markdown).toContain('- Must satisfy constraint: Must obey scope boundary (verify by: Review scope)')

    // Must Not Behavior
    expect(markdown).toContain('- Security boundary: No credentials in output — must not violate (must)')
  })

  test('renders user context from targetUsers and problemStatement', () => {
    const model: RequirementModel = {
      feature: 'context-test',
      constraints: [],
      scopeBoundary: { inScope: ['Test in-scope'], outOfScope: [] },
      acceptanceCriteria: [{ id: 'ac-001', description: 'User sees result' }],
      goals: [],
      nonGoals: [],
      targetUsers: 'project managers',
      problemStatement: 'Current flow lacks clear completion indicators',
    }

    const markdown = renderBehaviorDocument(model)

    expect(markdown).toContain('**Target users:** project managers')
    expect(markdown).toContain('**Problem statement:** Current flow lacks clear completion indicators')
    expect(markdown).toContain('- The target user is: project managers')
  })

  test('omits feature-command-specific rules for unrelated features', () => {
    const model: RequirementModel = {
      feature: 'report-export',
      constraints: [],
      scopeBoundary: { inScope: ['CSV report export'], outOfScope: [] },
      acceptanceCriteria: [{ id: 'ac-001', description: 'User downloads a CSV report' }],
      goals: ['Export reports for finance users'],
      nonGoals: [],
    }

    const markdown = renderBehaviorDocument(model)

    expect(markdown).not.toContain('## Feature Command Behavior')
    expect(markdown).not.toContain('/openflow-feature')
    expect(markdown).not.toContain('Feature name is too short after sanitization')
  })
})

test('rejects implementation-mechanics leakage in generated text', () => {
  const model: RequirementModel = {
    feature: 'mechanics-test',
    constraints: [
      {
        id: 'c-001',
        category: 'compatibility',
        severity: 'must',
        description: 'Report format is readable',
        rationale: 'User needs to read it',
        verificationMethod: 'User review session',
        sourceQuestionId: 'constraints',
      },
    ],
    scopeBoundary: {
      inScope: ['On-demand report generation via UI'],
      outOfScope: ['Batch reprocess historical data'],
    },
    acceptanceCriteria: [
      { id: 'ac-001', description: 'User sees formatted report with correct data' },
    ],
    goals: ['Deliver formatted reports on request'],
    nonGoals: ['Alter upstream data pipeline'],
    testingStrategy: 'manual',
  }

  const markdown = renderBehaviorDocument(model)

  // Renderer's own scaffolding must not contain design/implementation terminology
  // Model-provided content (descriptions, goals, etc.) is excluded from these checks
  const forbiddenScaffolding = [
    'architecture',
    'internal implementation',
    'file path',
    'class diagram',
    'dependency injection',
  ]

  for (const term of forbiddenScaffolding) {
    expect(markdown).not.toContain(term)
  }

  // Must use observable-behavior framing in renderer-generated scaffolding
  expect(markdown).toContain('activat')
  expect(markdown).toContain('observable outcome')
  expect(markdown).toContain('User-Visible Scenarios')
  expect(markdown).toContain('Trigger Rules')
  expect(markdown).toContain('Must Not Behavior')
})

function expectHeadingsExactlyOnce(markdown: string): void {
  for (const heading of REQUIRED_HEADINGS) {
    expect(markdown.match(new RegExp(`^${escapeRegExp(heading)}$`, 'gm'))).toHaveLength(1)
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
