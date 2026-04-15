import { describe, expect, test } from 'bun:test'
import { parsePlanTasks, classifyTaskType, isImplementationTask, extractPlanName } from '../../src/plan/parser'

describe('plan parser', () => {
  describe('parsePlanTasks', () => {
    test('should stop at Success Criteria section', () => {
      const plan = `# Test Plan

## TODOs

- [ ] Task 1: Implement feature
- [ ] Task 2: Add tests

## Success Criteria

- [ ] All tests pass
- [ ] Code reviewed
`
      const tasks = parsePlanTasks(plan)
      expect(tasks.length).toBe(2)
      expect(tasks[0]?.title).toBe('Task 1: Implement feature')
      expect(tasks[1]?.title).toBe('Task 2: Add tests')
    })

    test('should stop at Final Checklist section', () => {
      const plan = `# Test Plan

## TODOs

- [ ] Task 1: Build feature

## Final Checklist

- [ ] Verified
- [ ] Approved
`
      const tasks = parsePlanTasks(plan)
      expect(tasks.length).toBe(1)
      expect(tasks[0]?.title).toBe('Task 1: Build feature')
    })

    test('should stop at --- separator', () => {
      const plan = `# Test Plan

## TODOs

- [ ] Task 1: Implement

---

## Other Section

- [ ] This should not be parsed
`
      const tasks = parsePlanTasks(plan)
      expect(tasks.length).toBe(1)
    })

    test('should parse numbered tasks', () => {
      const plan = `# Test Plan

## TODOs

1. First task
2. Second task
`
      const tasks = parsePlanTasks(plan)
      expect(tasks.length).toBe(2)
    })
  })

  describe('classifyTaskType', () => {
    test('should classify test tasks', () => {
      expect(classifyTaskType('Write unit tests')).toBe('test')
      expect(classifyTaskType('Add spec for feature')).toBe('test')
      expect(classifyTaskType('测试功能')).toBe('test')
    })

    test('should classify verification tasks', () => {
      expect(classifyTaskType('Verify implementation')).toBe('verification')
      expect(classifyTaskType('Check code quality')).toBe('verification')
      expect(classifyTaskType('验证功能')).toBe('verification')
    })

    test('should classify setup tasks', () => {
      expect(classifyTaskType('Setup project')).toBe('setup')
      expect(classifyTaskType('Configure database')).toBe('setup')
      expect(classifyTaskType('初始化项目')).toBe('setup')
    })

    test('should classify implementation tasks', () => {
      expect(classifyTaskType('Implement feature')).toBe('implementation')
      expect(classifyTaskType('Create new component')).toBe('implementation')
      expect(classifyTaskType('实现功能')).toBe('implementation')
    })

    test('should return unknown for unclear tasks', () => {
      expect(classifyTaskType('Do something')).toBe('unknown')
      expect(classifyTaskType('Random task')).toBe('unknown')
    })
  })

  describe('isImplementationTask', () => {
    test('should identify implementation tasks', () => {
      expect(isImplementationTask('Implement user login')).toBe(true)
      expect(isImplementationTask('Create API endpoint')).toBe(true)
      expect(isImplementationTask('Add new feature')).toBe(true)
      expect(isImplementationTask('实现登录功能')).toBe(true)
    })

    test('should not identify non-implementation tasks', () => {
      expect(isImplementationTask('Write tests')).toBe(false)
      expect(isImplementationTask('Review code')).toBe(false)
      expect(isImplementationTask('Setup project')).toBe(false)
    })
  })

  describe('extractPlanName', () => {
    test('should extract plan name from path', () => {
      expect(extractPlanName('/project/.sisyphus/plans/user-login.md')).toBe('user-login')
      expect(extractPlanName('C:\\project\\.sisyphus\\plans\\feature.md')).toBe('feature')
    })

    test('should return null for invalid paths', () => {
      expect(extractPlanName('/some/other/path.md')).toBe(null)
      expect(extractPlanName('random-string')).toBe(null)
    })
  })
})
