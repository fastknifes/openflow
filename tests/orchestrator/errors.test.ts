import { describe, expect, test } from 'bun:test'
import { SchedulerError, taskNotFound, duplicateExecutor, executorNotFound, selfDependency, dependencyNotFound, cycleDetected, invalidResource, payloadNotSerializable, resultNotSerializable, sensitiveFieldRejected, invalidStateTransition, executorFailed, schedulerInterrupted, schedulerStopped, taskTimeout } from '../../src/orchestrator/errors'

// ---------------------------------------------------------------------------
// SchedulerError base class
// ---------------------------------------------------------------------------

describe('SchedulerError', () => {
  test('stores code, message, and optional taskId', () => {
    const err = new SchedulerError('TEST_CODE', 'hello')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(SchedulerError)
    expect(err.name).toBe('SchedulerError')
    expect(err.code).toBe('TEST_CODE')
    expect(err.message).toBe('hello')
    expect(err.taskId).toBeUndefined()
  })

  test('accepts optional taskId', () => {
    const err = new SchedulerError('CODE', 'msg', 't-1')
    expect(err.taskId).toBe('t-1')
  })

  test('toTaskError returns plain object matching TaskError shape', () => {
    const err = new SchedulerError('CODE', 'msg', 't-1')
    const plain = err.toTaskError()
    expect(plain).toEqual({ code: 'CODE', message: 'msg', taskId: 't-1' })
  })

  test('toTaskError omits taskId when absent', () => {
    const err = new SchedulerError('CODE', 'msg')
    const plain = err.toTaskError()
    expect(plain).toEqual({ code: 'CODE', message: 'msg' })
    expect('taskId' in plain).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Error factory functions
// ---------------------------------------------------------------------------

describe('error factories', () => {
  const factories: Array<{
    name: string
    fn: () => SchedulerError
    expectedCode: string
    expectedMessagePart: string
    expectedTaskId: string | undefined
  }> = [
    {
      name: 'taskNotFound',
      fn: () => taskNotFound('t-1'),
      expectedCode: 'TASK_NOT_FOUND',
      expectedMessagePart: 't-1',
      expectedTaskId: 't-1',
    },
    {
      name: 'duplicateExecutor',
      fn: () => duplicateExecutor('build'),
      expectedCode: 'DUPLICATE_EXECUTOR',
      expectedMessagePart: 'build',
      expectedTaskId: undefined,
    },
    {
      name: 'executorNotFound',
      fn: () => executorNotFound('deploy'),
      expectedCode: 'EXECUTOR_NOT_FOUND',
      expectedMessagePart: 'deploy',
      expectedTaskId: undefined,
    },
    {
      name: 'selfDependency',
      fn: () => selfDependency('t-2'),
      expectedCode: 'SELF_DEPENDENCY',
      expectedMessagePart: 't-2',
      expectedTaskId: 't-2',
    },
    {
      name: 'dependencyNotFound',
      fn: () => dependencyNotFound('t-3', 't-missing'),
      expectedCode: 'DEPENDENCY_NOT_FOUND',
      expectedMessagePart: 't-missing',
      expectedTaskId: 't-3',
    },
    {
      name: 'cycleDetected',
      fn: () => cycleDetected('t-4', 't-4 -> t-5 -> t-4'),
      expectedCode: 'CYCLE_DETECTED',
      expectedMessagePart: 'cycle',
      expectedTaskId: 't-4',
    },
    {
      name: 'invalidResource',
      fn: () => invalidResource('t-6', 'empty kind'),
      expectedCode: 'INVALID_RESOURCE',
      expectedMessagePart: 'empty kind',
      expectedTaskId: 't-6',
    },
    {
      name: 'payloadNotSerializable',
      fn: () => payloadNotSerializable('t-7', 'circular ref'),
      expectedCode: 'PAYLOAD_NOT_SERIALIZABLE',
      expectedMessagePart: 'circular ref',
      expectedTaskId: 't-7',
    },
    {
      name: 'resultNotSerializable',
      fn: () => resultNotSerializable('t-8', 'function value'),
      expectedCode: 'RESULT_NOT_SERIALIZABLE',
      expectedMessagePart: 'function value',
      expectedTaskId: 't-8',
    },
    {
      name: 'sensitiveFieldRejected',
      fn: () => sensitiveFieldRejected('t-9', 'password'),
      expectedCode: 'SENSITIVE_FIELD_REJECTED',
      expectedMessagePart: 'password',
      expectedTaskId: 't-9',
    },
    {
      name: 'invalidStateTransition',
      fn: () => invalidStateTransition('t-10', 'succeeded', 'running'),
      expectedCode: 'INVALID_STATE_TRANSITION',
      expectedMessagePart: 'succeeded -> running',
      expectedTaskId: 't-10',
    },
    {
      name: 'executorFailed',
      fn: () => executorFailed('t-11', 'exit code 1'),
      expectedCode: 'EXECUTOR_FAILED',
      expectedMessagePart: 'exit code 1',
      expectedTaskId: 't-11',
    },
    {
      name: 'schedulerInterrupted',
      fn: () => schedulerInterrupted('t-12'),
      expectedCode: 'SCHEDULER_INTERRUPTED',
      expectedMessagePart: 't-12',
      expectedTaskId: 't-12',
    },
    {
      name: 'schedulerStopped',
      fn: () => schedulerStopped('t-13'),
      expectedCode: 'SCHEDULER_STOPPED',
      expectedMessagePart: 't-13',
      expectedTaskId: 't-13',
    },
    {
      name: 'taskTimeout',
      fn: () => taskTimeout('t-14', 5000),
      expectedCode: 'TASK_TIMEOUT',
      expectedMessagePart: '5000ms',
      expectedTaskId: 't-14',
    },
  ]

  for (const { name, fn, expectedCode, expectedMessagePart, expectedTaskId } of factories) {
    describe(name, () => {
      test(`produces code=${expectedCode}`, () => {
        const err = fn()
        expect(err.code).toBe(expectedCode)
      })

      test('is a SchedulerError instance', () => {
        expect(fn()).toBeInstanceOf(SchedulerError)
      })

      test('message contains expected substring', () => {
        expect(fn().message).toContain(expectedMessagePart)
      })

      test(`taskId is ${expectedTaskId ?? 'undefined'}`, () => {
        const err = fn()
        expect(err.taskId).toBe(expectedTaskId)
      })

      test('toTaskError returns correct shape', () => {
        const err = fn()
        const plain = err.toTaskError()
        expect(plain.code).toBe(expectedCode)
        expect(typeof plain.message).toBe('string')
        if (expectedTaskId !== undefined) {
          expect(plain.taskId).toBe(expectedTaskId)
        }
      })
    })
  }
})
