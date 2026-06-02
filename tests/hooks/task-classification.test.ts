import { describe, test, expect } from 'bun:test'
import { isVerificationTask, isImplementationTask } from '../../src/hooks/task-classification.js'

describe('isVerificationTask', () => {
  test('returns false for undefined', () => {
    expect(isVerificationTask(undefined)).toBe(false)
  })

  test('returns true for category "test"', () => {
    expect(isVerificationTask({ category: 'test' })).toBe(true)
  })

  test('returns true for category "verification"', () => {
    expect(isVerificationTask({ category: 'verification' })).toBe(true)
  })

  test('returns true for category "quality"', () => {
    expect(isVerificationTask({ category: 'quality' })).toBe(true)
  })

  test('returns true for category "review"', () => {
    expect(isVerificationTask({ category: 'review' })).toBe(true)
  })

  test('returns false for category "implementation"', () => {
    expect(isVerificationTask({ category: 'implementation' })).toBe(false)
  })

  test('returns true for oracle subagent with verification prompt', () => {
    expect(isVerificationTask({ subagent_type: 'oracle', prompt: 'verify the code' })).toBe(true)
  })

  test('returns true for momus subagent with verification prompt', () => {
    expect(isVerificationTask({ subagent_type: 'momus', prompt: 'check the code quality' })).toBe(true)
  })

  test('returns false for oracle subagent with unrelated prompt', () => {
    expect(isVerificationTask({ subagent_type: 'oracle', prompt: 'unrelated' })).toBe(false)
  })

  test('returns true for prompt with keyword + context: "run tests after implementation"', () => {
    expect(isVerificationTask({ prompt: 'run tests after implementation' })).toBe(true)
  })

  test('returns false for "just a test plan" (no verification context)', () => {
    expect(isVerificationTask({ prompt: 'just a test plan' })).toBe(false)
  })

  test('returns false for "implement feature"', () => {
    expect(isVerificationTask({ prompt: 'implement feature' })).toBe(false)
  })

  test('returns true for "verify that the build passes"', () => {
    expect(isVerificationTask({ prompt: 'verify that the build passes' })).toBe(true)
  })

  test('returns true for "check that the lint rules are satisfied"', () => {
    expect(isVerificationTask({ prompt: 'check that the lint rules are satisfied' })).toBe(true)
  })

  test('returns true for "run build before completion"', () => {
    expect(isVerificationTask({ prompt: 'run build before completion' })).toBe(true)
  })

  test('returns false when prompt has keyword but no context', () => {
    expect(isVerificationTask({ prompt: 'write a test plan for the feature' })).toBe(false)
  })
})

describe('isImplementationTask', () => {
  test('returns false for undefined', () => {
    expect(isImplementationTask(undefined)).toBe(false)
  })

  test('returns true for "implement login feature"', () => {
    expect(isImplementationTask({ prompt: 'implement login feature' })).toBe(true)
  })

  test('returns true for "add new module"', () => {
    expect(isImplementationTask({ prompt: 'add new module' })).toBe(true)
  })

  test('returns true for "fix the bug"', () => {
    expect(isImplementationTask({ prompt: 'fix the bug' })).toBe(true)
  })

  test('returns false for "verify the code" (verification takes priority)', () => {
    expect(isImplementationTask({ prompt: 'verify the code after implementation' })).toBe(false)
  })

  test('returns true for category "quick" with "build the api endpoint"', () => {
    expect(isImplementationTask({ category: 'quick', prompt: 'build the api endpoint' })).toBe(true)
  })

  test('returns true for category "quick" with no prompt', () => {
    expect(isImplementationTask({ category: 'quick' })).toBe(true)
  })

  test('returns true for category "deep" with no prompt', () => {
    expect(isImplementationTask({ category: 'deep' })).toBe(true)
  })

  test('Chinese: "实现功能" returns true', () => {
    expect(isImplementationTask({ prompt: '实现功能' })).toBe(true)
  })

  test('Chinese: "开发新的模块" returns true', () => {
    expect(isImplementationTask({ prompt: '开发新的模块' })).toBe(true)
  })

  test('Chinese: "修复缺陷" returns true', () => {
    expect(isImplementationTask({ prompt: '修复缺陷' })).toBe(true)
  })

  test('returns true for "create a new page component"', () => {
    expect(isImplementationTask({ prompt: 'create a new page component' })).toBe(true)
  })

  test('returns true for "refactor the service logic"', () => {
    expect(isImplementationTask({ prompt: 'refactor the service logic' })).toBe(true)
  })

  test('returns true for "update the api endpoint"', () => {
    expect(isImplementationTask({ prompt: 'update the api endpoint' })).toBe(true)
  })

  test('returns false for category alone without recognized prompt or implementation category', () => {
    expect(isImplementationTask({ category: 'unknown-category' })).toBe(false)
  })

  test('returns false for empty args', () => {
    expect(isImplementationTask({})).toBe(false)
  })
})
