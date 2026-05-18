import { describe, expect, test } from 'bun:test'
import {
  RequirementModelSchema,
  ConstraintSchema,
  ScopeBoundarySchema,
  AcceptanceCriterionSchema,
  ExpectedSymbolSchema,
  ExpectedModuleSchema,
  RiskSchema,
  DesignViewMetadataSchema,
  VerificationAssertionSchema,
  createMinimalRequirementModel,
  resetIdCounter,
  type RequirementModel,
} from '../../../src/phases/feature/requirement-model.js'

describe('RequirementModel schema', () => {
  test('parses a valid full model with all fields', () => {
    const model = {
      feature: 'user-auth',
      constraints: [
        {
          id: 'c-001',
          category: 'security',
          severity: 'must',
          description: 'Passwords must be hashed',
          rationale: 'Plain text passwords are a security risk',
          verificationMethod: 'Audit password storage code',
          sourceQuestionId: 'constraints',
        },
      ],
      scopeBoundary: {
        inScope: ['login flow', 'session management'],
        outOfScope: ['registration'],
        touchedModules: ['src/auth.ts'],
      },
      acceptanceCriteria: [
        { id: 'ac-001', description: 'Login succeeds with valid credentials', category: 'functional' },
      ],
      goals: ['Secure authentication'],
      nonGoals: ['Social login'],
      problemStatement: 'Users need to log in securely',
      targetUsers: 'End users',
      expectedSymbols: [
        { name: 'authenticate', kind: 'function', module: 'src/auth.ts' },
      ],
      expectedModules: [
        { path: 'src/auth.ts', purpose: 'Authentication logic' },
      ],
      risks: [
        { description: 'Brute force attacks', mitigation: 'Rate limiting' },
      ],
      testingStrategy: 'Unit tests for auth functions',
      synthesis: { summary: 'Auth feature' },
    }

    const result = RequirementModelSchema.safeParse(model)
    expect(result.success).toBe(true)
  })

  test('parses a valid minimal model', () => {
    resetIdCounter()
    const model = createMinimalRequirementModel('test-feature')

    const result = RequirementModelSchema.safeParse(model)
    expect(result.success).toBe(true)
  })

  test('rejects missing feature', () => {
    const model = {
      constraints: [],
      scopeBoundary: { inScope: [], outOfScope: [] },
      acceptanceCriteria: [],
      goals: [],
      nonGoals: [],
    }

    const result = RequirementModelSchema.safeParse(model)
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('feature')
    }
  })

  test('rejects missing constraints array', () => {
    const model = {
      feature: 'x',
      scopeBoundary: { inScope: [], outOfScope: [] },
      acceptanceCriteria: [],
      goals: [],
      nonGoals: [],
    }

    const result = RequirementModelSchema.safeParse(model)
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('constraints')
    }
  })

  test('rejects missing scopeBoundary', () => {
    const model = {
      feature: 'x',
      constraints: [],
      acceptanceCriteria: [],
      goals: [],
      nonGoals: [],
    }

    const result = RequirementModelSchema.safeParse(model)
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('scopeBoundary')
    }
  })

  test('rejects missing acceptanceCriteria', () => {
    const model = {
      feature: 'x',
      constraints: [],
      scopeBoundary: { inScope: [], outOfScope: [] },
      goals: [],
      nonGoals: [],
    }

    const result = RequirementModelSchema.safeParse(model)
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('acceptanceCriteria')
    }
  })

  test('rejects invalid constraint category', () => {
    const model = {
      feature: 'x',
      constraints: [
        {
          id: 'c-001',
          category: 'invalid-cat',
          severity: 'must',
          description: 'desc',
          rationale: 'rat',
          verificationMethod: 'vm',
          sourceQuestionId: 'constraints',
        },
      ],
      scopeBoundary: { inScope: [], outOfScope: [] },
      acceptanceCriteria: [],
      goals: [],
      nonGoals: [],
    }

    const result = RequirementModelSchema.safeParse(model)
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('constraints.0.category')
    }
  })

  test('rejects invalid constraint severity', () => {
    const model = {
      feature: 'x',
      constraints: [
        {
          id: 'c-001',
          category: 'security',
          severity: 'critical',
          description: 'desc',
          rationale: 'rat',
          verificationMethod: 'vm',
          sourceQuestionId: 'constraints',
        },
      ],
      scopeBoundary: { inScope: [], outOfScope: [] },
      acceptanceCriteria: [],
      goals: [],
      nonGoals: [],
    }

    const result = RequirementModelSchema.safeParse(model)
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('constraints.0.severity')
    }
  })
})

describe('createMinimalRequirementModel', () => {
  test('returns a valid RequirementModel', () => {
    resetIdCounter()
    const model = createMinimalRequirementModel('my-feature')

    expect(model.feature).toBe('my-feature')
    expect(model.constraints).toHaveLength(1)
    expect(model.scopeBoundary.inScope).toHaveLength(1)
    expect(model.acceptanceCriteria).toHaveLength(1)
    expect(model.goals).toHaveLength(1)
    expect(model.nonGoals).toHaveLength(1)
  })

  test('produces stable IDs across calls without reset', () => {
    resetIdCounter()
    const first = createMinimalRequirementModel('a')
    const second = createMinimalRequirementModel('b')

    // Each call increments twice: once for constraint, once for acceptance criterion
    expect(first.constraints[0]?.id).toBe('c-0001')
    expect(first.acceptanceCriteria[0]?.id).toBe('ac-0002')
    expect(second.constraints[0]?.id).toBe('c-0003')
    expect(second.acceptanceCriteria[0]?.id).toBe('ac-0004')
  })

  test('resets IDs when resetIdCounter is called', () => {
    resetIdCounter()
    const first = createMinimalRequirementModel('a')
    resetIdCounter()
    const second = createMinimalRequirementModel('b')

    expect(first.constraints[0]?.id).toBe('c-0001')
    expect(second.constraints[0]?.id).toBe('c-0001')
  })
})

describe('ConstraintSchema', () => {
  test('parses a valid constraint', () => {
    const result = ConstraintSchema.safeParse({
      id: 'c-001',
      category: 'performance',
      severity: 'should',
      description: 'Response under 200ms',
      rationale: 'UX requirement',
      verificationMethod: 'Load test',
      sourceQuestionId: 'constraints',
    })
    expect(result.success).toBe(true)
  })

  test('rejects empty id', () => {
    const result = ConstraintSchema.safeParse({
      id: '',
      category: 'security',
      severity: 'must',
      description: 'd',
      rationale: 'r',
      verificationMethod: 'v',
      sourceQuestionId: 'constraints',
    })
    expect(result.success).toBe(false)
  })

  test('rejects empty description', () => {
    const result = ConstraintSchema.safeParse({
      id: 'c-001',
      category: 'security',
      severity: 'must',
      description: '',
      rationale: 'r',
      verificationMethod: 'v',
      sourceQuestionId: 'constraints',
    })
    expect(result.success).toBe(false)
  })
})

describe('ScopeBoundarySchema', () => {
  test('parses with optional touchedModules', () => {
    const result = ScopeBoundarySchema.safeParse({
      inScope: ['a'],
      outOfScope: ['b'],
      touchedModules: ['src/a.ts'],
    })
    expect(result.success).toBe(true)
  })

  test('parses without touchedModules', () => {
    const result = ScopeBoundarySchema.safeParse({
      inScope: ['a'],
      outOfScope: ['b'],
    })
    expect(result.success).toBe(true)
  })
})

describe('AcceptanceCriterionSchema', () => {
  test('parses with optional category', () => {
    const result = AcceptanceCriterionSchema.safeParse({
      id: 'ac-001',
      description: 'Must work',
      category: 'functional',
    })
    expect(result.success).toBe(true)
  })

  test('parses without category', () => {
    const result = AcceptanceCriterionSchema.safeParse({
      id: 'ac-001',
      description: 'Must work',
    })
    expect(result.success).toBe(true)
  })
})

describe('ExpectedSymbolSchema', () => {
  test('parses all valid kinds', () => {
    const kinds = ['function', 'class', 'interface', 'type', 'const', 'enum'] as const
    for (const kind of kinds) {
      const result = ExpectedSymbolSchema.safeParse({
        name: 'Foo',
        kind,
      })
      expect(result.success).toBe(true)
    }
  })

  test('rejects invalid kind', () => {
    const result = ExpectedSymbolSchema.safeParse({
      name: 'Foo',
      kind: 'variable',
    })
    expect(result.success).toBe(false)
  })
})

describe('ExpectedModuleSchema', () => {
  test('parses valid module', () => {
    const result = ExpectedModuleSchema.safeParse({
      path: 'src/auth.ts',
      purpose: 'Handles authentication',
    })
    expect(result.success).toBe(true)
  })

  test('rejects empty path', () => {
    const result = ExpectedModuleSchema.safeParse({
      path: '',
      purpose: 'Handles authentication',
    })
    expect(result.success).toBe(false)
  })
})

describe('RiskSchema', () => {
  test('parses valid risk', () => {
    const result = RiskSchema.safeParse({
      description: 'Data loss',
      mitigation: 'Backups',
    })
    expect(result.success).toBe(true)
  })
})

describe('DesignViewMetadataSchema', () => {
  test('parses with optional audience', () => {
    const result = DesignViewMetadataSchema.safeParse({
      viewName: 'Architecture',
      description: 'System architecture overview',
      audience: 'developers',
    })
    expect(result.success).toBe(true)
  })

  test('parses without audience', () => {
    const result = DesignViewMetadataSchema.safeParse({
      viewName: 'Architecture',
      description: 'System architecture overview',
    })
    expect(result.success).toBe(true)
  })
})

describe('VerificationAssertionSchema', () => {
  test('parses with optional constraintId', () => {
    const result = VerificationAssertionSchema.safeParse({
      assertion: 'All tests pass',
      method: 'bun test',
      constraintId: 'c-001',
    })
    expect(result.success).toBe(true)
  })

  test('parses without constraintId', () => {
    const result = VerificationAssertionSchema.safeParse({
      assertion: 'All tests pass',
      method: 'bun test',
    })
    expect(result.success).toBe(true)
  })
})
