import { test, expect, describe } from 'bun:test'
import { parsePlanTasks, classifyTaskType, isImplementationTask, extractPlanName } from '../../src/plan/parser.js'

// ============================================================================
// parsePlanTasks
// ============================================================================
describe('parsePlanTasks', () => {
  test('returns empty array for empty content', () => {
    expect(parsePlanTasks('')).toEqual([])
  })

  test('returns empty array for content without task section', () => {
    const content = `
# My Plan

Some intro text.

## Overview
This is an overview.
`
    expect(parsePlanTasks(content)).toEqual([])
  })

  test('parses - [ ] task format', () => {
    const content = `
## Tasks
- [ ] Implement user service
`
    const tasks = parsePlanTasks(content)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('Implement user service')
    expect(tasks[0].id).toBe(1)
    expect(tasks[0].isImplementation).toBe(true)
    expect(tasks[0].type).toBe('implementation')
    expect(tasks[0].lineNumber).toBe(3)
    expect(tasks[0].raw).toBe('- [ ] Implement user service')
    expect(tasks[0].description).toBe('')
    expect(tasks[0].dependencies).toEqual([])
  })

  test('parses - [x] checked task format', () => {
    const content = `
## Tasks
- [x] Completed task
`
    const tasks = parsePlanTasks(content)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('Completed task')
  })

  test('parses numbered format (1. task)', () => {
    const content = `
## Tasks
1. First task
2. Second task
`
    const tasks = parsePlanTasks(content)
    expect(tasks).toHaveLength(2)
    expect(tasks[0].title).toBe('First task')
    expect(tasks[0].id).toBe(1)
    expect(tasks[1].title).toBe('Second task')
    expect(tasks[1].id).toBe(2)
  })

  test('parses mixed formats in same section', () => {
    const content = `
## Tasks
- [ ] Unordered task
1. Numbered task
- [x] Checked task
2. Another numbered task
`
    const tasks = parsePlanTasks(content)
    expect(tasks).toHaveLength(4)
    expect(tasks[0].title).toBe('Unordered task')
    expect(tasks[1].title).toBe('Numbered task')
    expect(tasks[2].title).toBe('Checked task')
    expect(tasks[3].title).toBe('Another numbered task')
    // IDs are sequential regardless of format
    expect(tasks.map(t => t.id)).toEqual([1, 2, 3, 4])
  })

  test('stops parsing at ## Success Criteria', () => {
    const content = `
## Tasks
- [ ] Task before criteria

## Success Criteria
- [ ] This should not be parsed
`
    const tasks = parsePlanTasks(content)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('Task before criteria')
  })

  test('stops parsing at --- horizontal rule', () => {
    const content = `
## Tasks
- [ ] Task above rule

---

- [ ] This should not be parsed
`
    const tasks = parsePlanTasks(content)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('Task above rule')
  })

  test('stops parsing at ## Final Checklist', () => {
    const content = `
## Tasks
- [ ] Keep this

## Final Checklist
- [ ] Skip this
`
    const tasks = parsePlanTasks(content)
    expect(tasks).toHaveLength(1)
  })

  test('stops parsing at ## Verification', () => {
    const content = `
## Tasks
- [ ] Keep this

## Verification
- [ ] Skip this
`
    const tasks = parsePlanTasks(content)
    expect(tasks).toHaveLength(1)
  })

  test('stops parsing at ## Commit Strategy', () => {
    const content = `
## Tasks
- [ ] Keep this

## Commit Strategy
Do something.
`
    const tasks = parsePlanTasks(content)
    expect(tasks).toHaveLength(1)
  })

  test('stops parsing at ## Notes', () => {
    const content = `
## Tasks
- [ ] Keep this

## Notes
Some notes here.
`
    const tasks = parsePlanTasks(content)
    expect(tasks).toHaveLength(1)
  })

  test('stops parsing at ## References', () => {
    const content = `
## Tasks
- [ ] Keep this

## References
- ref 1
`
    const tasks = parsePlanTasks(content)
    expect(tasks).toHaveLength(1)
  })

  test('stops parsing at ## Appendix', () => {
    const content = `
## Tasks
- [ ] Keep this

## Appendix
Extra info.
`
    const tasks = parsePlanTasks(content)
    expect(tasks).toHaveLength(1)
  })

  test('stops parsing at ## Execution', () => {
    const content = `
## Tasks
- [ ] Keep this

## Execution
Execution details.
`
    const tasks = parsePlanTasks(content)
    expect(tasks).toHaveLength(1)
  })

  test('## Wave subsections stop parsing (SECTION_END_MARKERS catches them)', () => {
    const content = `
## Tasks
- [ ] First wave task

## Wave 1
- [ ] Second wave task
`
    const tasks = parsePlanTasks(content)
    // ## Wave matches /^##\s*[^T]/ in SECTION_END_MARKERS, so it stops
    expect(tasks).toHaveLength(1)
  })

  test('reports correct line numbers', () => {
    const content = `line 1
line 2
## Tasks
- [ ] Task on line 4
- [ ] Task on line 5
`
    const tasks = parsePlanTasks(content)
    expect(tasks).toHaveLength(2)
    expect(tasks[0].lineNumber).toBe(4)
    expect(tasks[1].lineNumber).toBe(5)
  })

  test('skips tasks with titles shorter than 2 characters', () => {
    const content = `
## Tasks
- [ ] a
- [ ] ok
- [ ]
- [ ] Ab
`
    const tasks = parsePlanTasks(content)
    // "a" is < 2 chars, empty from "- [ ] " is < 2 chars
    expect(tasks).toHaveLength(2)
    expect(tasks[0].title).toBe('ok')
    expect(tasks[1].title).toBe('Ab')
  })

  test('parses Chinese task names', () => {
    const content = `
## 任务
- [ ] 实现用户服务
- [ ] 配置数据库
- [ ] 测试接口
- [ ] 验证功能
`
    const tasks = parsePlanTasks(content)
    expect(tasks).toHaveLength(4)
    expect(tasks[0].title).toBe('实现用户服务')
    expect(tasks[0].type).toBe('implementation')
    expect(tasks[1].title).toBe('配置数据库')
    expect(tasks[1].type).toBe('setup')
    expect(tasks[2].title).toBe('测试接口')
    expect(tasks[2].type).toBe('test')
    expect(tasks[3].title).toBe('验证功能')
    expect(tasks[3].type).toBe('verification')
  })

  test('recognizes "Task" header (singular)', () => {
    const content = `
## Task
- [ ] Single task header
`
    const tasks = parsePlanTasks(content)
    expect(tasks).toHaveLength(1)
  })

  test('recognizes "TODO" header', () => {
    const content = `
## TODO
- [ ] Todo item
`
    const tasks = parsePlanTasks(content)
    expect(tasks).toHaveLength(1)
  })

  test('recognizes "TODOs" header', () => {
    const content = `
## TODOs
- [ ] Todos item
`
    const tasks = parsePlanTasks(content)
    expect(tasks).toHaveLength(1)
  })

  test('recognizes h1 # Tasks header', () => {
    const content = `
# Tasks
- [ ] Task under h1
`
    const tasks = parsePlanTasks(content)
    expect(tasks).toHaveLength(1)
  })

  test('initializes dependencies as empty array', () => {
    const content = `
## Tasks
- [ ] Task with deps
`
    const tasks = parsePlanTasks(content)
    expect(tasks[0].dependencies).toEqual([])
  })

  test('assigns sequential IDs across mixed content', () => {
    const content = `
## Tasks
- [ ] First
some non-task line
- [ ] Second
1. Third
`
    const tasks = parsePlanTasks(content)
    expect(tasks.map(t => t.id)).toEqual([1, 2, 3])
  })

  test('stops parsing at other ## headings (not Wave/Task/Step)', () => {
    const content = `
## Tasks
- [ ] Keep

## Deployment
- [ ] Skip
`
    const tasks = parsePlanTasks(content)
    expect(tasks).toHaveLength(1)
  })

  test('continues parsing at ## Task subsection headings', () => {
    const content = `
## Tasks
- [ ] First

## Task Details
- [ ] Second
`
    const tasks = parsePlanTasks(content)
    expect(tasks).toHaveLength(2)
  })

  test('## Step subsection headings stop parsing (SECTION_END_MARKERS catches them)', () => {
    const content = `
## Tasks
- [ ] First

## Step 1
- [ ] Second
`
    const tasks = parsePlanTasks(content)
    // ## Step matches /^##\s*[^T]/ (S ≠ T), stops at SECTION_END_MARKERS
    expect(tasks).toHaveLength(1)
  })
})

// ============================================================================
// classifyTaskType
// ============================================================================
describe('classifyTaskType', () => {
  describe('test type', () => {
    test('matches "test"', () => {
      expect(classifyTaskType('Write unit test')).toBe('test')
    })
    test('matches "spec"', () => {
      expect(classifyTaskType('Add spec for API')).toBe('test')
    })
    test('matches "测试" (Chinese)', () => {
      expect(classifyTaskType('编写测试用例')).toBe('test')
    })
    test('is case insensitive', () => {
      expect(classifyTaskType('TEST everything')).toBe('test')
    })

    // Contract: parser must support ## Tasks (new) AND ## TODOs (legacy)
    test('should recognize ## Tasks header (contract)', () => {
      const plan = `# Test Plan

## Tasks

- [ ] Task 1: Implement feature with concrete paths
- [ ] Task 2: Add tests and verification
- [ ] Task 3: Wire into main export
`
      const tasks = parsePlanTasks(plan)
      expect(tasks.length).toBe(3)
      expect(tasks[0]?.title).toBe('Task 1: Implement feature with concrete paths')
      expect(tasks[1]?.title).toBe('Task 2: Add tests and verification')
      expect(tasks[2]?.title).toBe('Task 3: Wire into main export')
    })

    test('should recognize ## Tasks with checkbox items (contract)', () => {
      const fixture = [
        '## Tasks',
        '',
        '- [ ] 1. Create src/foo.ts with foo function',
        '- [ ] 2. Add test for foo in tests/foo.test.ts',
        '- [ ] 3. Wire foo into main export',
      ].join('\n')

      const tasks = parsePlanTasks(fixture)
      expect(tasks.length).toBeGreaterThan(0)
    })

    // Preserve: parser must continue supporting legacy ## TODOs for backward compatibility
    test('should still parse legacy ## TODOs with checkbox items', () => {
      const fixture = [
        '## TODOs',
        '',
        '- [ ] Create src/foo.ts with foo function',
        '- [ ] Add test for foo in tests/foo.test.ts',
      ].join('\n')

      const tasks = parsePlanTasks(fixture)
      expect(tasks.length).toBe(2)
    })

    test('should stop at Success Criteria when using ## Tasks header', () => {
      const plan = `# Test Plan

## Tasks

- [ ] Task 1: Implement feature
- [ ] Task 2: Add tests

## Success Criteria

- [ ] All tests pass
- [ ] Code reviewed
`
      const tasks = parsePlanTasks(plan)
      expect(tasks.length).toBe(2)
    })
  })

  describe('verification type', () => {
    test('matches "verify"', () => {
      expect(classifyTaskType('Verify the output')).toBe('verification')
    })
    test('matches "check"', () => {
      expect(classifyTaskType('Check results')).toBe('verification')
    })
    test('matches "review"', () => {
      expect(classifyTaskType('Review the code')).toBe('verification')
    })
    test('matches "验证" (Chinese)', () => {
      expect(classifyTaskType('验证功能正确性')).toBe('verification')
    })
    test('matches "检查" (Chinese)', () => {
      expect(classifyTaskType('检查代码质量')).toBe('verification')
    })
  })

  describe('setup type', () => {
    test('matches "setup"', () => {
      expect(classifyTaskType('Setup environment')).toBe('setup')
    })
    test('matches "config"', () => {
      expect(classifyTaskType('Config the database')).toBe('setup')
    })
    test('matches "init"', () => {
      expect(classifyTaskType('Init project')).toBe('setup')
    })
    test('matches "配置" (Chinese)', () => {
      expect(classifyTaskType('配置开发环境')).toBe('setup')
    })
    test('matches "初始化" (Chinese)', () => {
      expect(classifyTaskType('初始化项目')).toBe('setup')
    })
  })

  describe('implementation type', () => {
    test('matches "implement"', () => {
      expect(classifyTaskType('Implement feature')).toBe('implementation')
    })
    test('matches "create"', () => {
      expect(classifyTaskType('Create new module')).toBe('implementation')
    })
    test('matches "build"', () => {
      expect(classifyTaskType('Build the service')).toBe('implementation')
    })
    test('matches "add"', () => {
      expect(classifyTaskType('Add new endpoint')).toBe('implementation')
    })
    test('matches "实现" (Chinese)', () => {
      expect(classifyTaskType('实现新功能')).toBe('implementation')
    })
    test('matches "创建" (Chinese)', () => {
      expect(classifyTaskType('创建新模块')).toBe('implementation')
    })
    test('matches "开发" (Chinese)', () => {
      expect(classifyTaskType('开发新功能')).toBe('implementation')
    })
    test('matches "添加" (Chinese)', () => {
      expect(classifyTaskType('添加新接口')).toBe('implementation')
    })
  })

  describe('unknown type', () => {
    test('returns unknown for unrelated keywords', () => {
      expect(classifyTaskType('Deploy to production')).toBe('unknown')
    })
    test('returns unknown for generic words', () => {
      expect(classifyTaskType('Fix something')).toBe('unknown')
    })
    test('returns unknown for empty-ish titles', () => {
      expect(classifyTaskType('Do work')).toBe('unknown')
    })
  })

  describe('priority ordering', () => {
    test('test takes priority over implementation keywords', () => {
      // "test" is checked first in the function
      expect(classifyTaskType('implement test')).toBe('test')
    })
    test('verification takes priority over implementation keywords', () => {
      expect(classifyTaskType('verify implementation')).toBe('verification')
    })
    test('setup takes priority over implementation keywords', () => {
      expect(classifyTaskType('setup config for create')).toBe('setup')
    })
  })
})

// ============================================================================
// isImplementationTask
// ============================================================================
describe('isImplementationTask', () => {
  test.each([
    ['implement', 'Implement user auth'],
    ['create', 'Create new service'],
    ['build', 'Build the module'],
    ['add', 'Add validation layer'],
    ['develop', 'Develop feature X'],
    ['实现', '实现认证模块'],
    ['创建', '创建服务'],
    ['开发', '开发新功能'],
    ['添加', '添加日志'],
    ['编写', '编写工具函数'],
  ])('returns true for keyword "%s"', (_keyword, title) => {
    expect(isImplementationTask(title)).toBe(true)
  })

  test.each([
    'Verify the output',
    'Check results',
    'Setup environment',
    'Config the DB',
    'Write tests',
    'Review code',
    'Deploy to production',
    'Update README',
  ])('returns false for non-implementation title: %s', (title) => {
    expect(isImplementationTask(title)).toBe(false)
  })
})

// ============================================================================
// extractPlanName
// ============================================================================
describe('extractPlanName', () => {
  describe('.openflow/plans/ paths', () => {
    test('extracts name from .openflow/plans/feature-name.md', () => {
      expect(extractPlanName('.openflow/plans/my-feature.md')).toBe('my-feature')
    })

    test('extracts name with forward slashes', () => {
      expect(extractPlanName('path/to/.openflow/plans/cool-feature.md')).toBe('cool-feature')
    })

    test('extracts name with backslashes', () => {
      expect(extractPlanName('path\\to\\.openflow\\plans\\cool-feature.md')).toBe('cool-feature')
    })

    test('extracts simple name', () => {
      expect(extractPlanName('.openflow/plans/auth.md')).toBe('auth')
    })
  })

  describe('docs/changes/ paths with date prefix', () => {
    test('extracts from docs/changes/YYYY-MM-DD-feature/plan.md', () => {
      expect(extractPlanName('docs/changes/2026-01-01-my-feature/plan.md')).toBe('my-feature')
    })

    test('strips date prefix', () => {
      expect(extractPlanName('docs/changes/2026-05-31-auth-system/plan.md')).toBe('auth-system')
    })

    test('works with backslashes', () => {
      expect(extractPlanName('docs\\changes\\2026-01-01-feature\\plan.md')).toBe('feature')
    })
  })

  describe('docs/changes/ paths without date prefix', () => {
    test('extracts from docs/changes/feature/plan.md', () => {
      expect(extractPlanName('docs/changes/my-feature/plan.md')).toBe('my-feature')
    })

    test('extracts simple name', () => {
      expect(extractPlanName('docs/changes/auth/plan.md')).toBe('auth')
    })
  })

  describe('invalid paths', () => {
    test('returns null for random path', () => {
      expect(extractPlanName('random/file.txt')).toBeNull()
    })

    test('returns null for empty string', () => {
      expect(extractPlanName('')).toBeNull()
    })

    test('returns null for plan.md without changes/ or plans/ parent', () => {
      expect(extractPlanName('some/dir/plan.md')).toBeNull()
    })

    test('returns null for .md file not named plan.md under changes/', () => {
      expect(extractPlanName('docs/changes/feature/other.md')).toBeNull()
    })
  })
})
