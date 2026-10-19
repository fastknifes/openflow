import { SchedulerLoop, type StopOptions } from './orchestrator/index.js'

export let scheduler: SchedulerLoop | undefined

let schedulerStopPromise: Promise<void> | undefined
let schedulerShutdownHookRegistered = false

export function getSchedulerLoop(): SchedulerLoop | undefined {
  return scheduler
}

export function startOpenFlowScheduler(projectRoot: string): SchedulerLoop {
  if (scheduler !== undefined) {
    return scheduler
  }

  scheduler = new SchedulerLoop(projectRoot, {
    maxConcurrency: 2,
    tickIntervalMs: 100,
  })
  scheduler.startScheduler()
  registerSchedulerShutdownHook()
  return scheduler
}

export async function stopOpenFlowScheduler(options: StopOptions = {}): Promise<void> {
  const currentScheduler = scheduler
  if (currentScheduler === undefined) {
    return
  }

  if (schedulerStopPromise !== undefined) {
    await schedulerStopPromise
    return
  }

  schedulerStopPromise = currentScheduler.stopScheduler(options).finally(() => {
    if (scheduler === currentScheduler) {
      scheduler = undefined
    }
    schedulerStopPromise = undefined
  })

  await schedulerStopPromise
}

function registerSchedulerShutdownHook(): void {
  if (schedulerShutdownHookRegistered) {
    return
  }

  schedulerShutdownHookRegistered = true
  process.once('beforeExit', () => {
    void stopOpenFlowScheduler()
  })
  process.once('SIGINT', () => {
    void stopOpenFlowScheduler({ abortRunning: true }).finally(() => {
      process.exit(130)
    })
  })
  process.once('SIGTERM', () => {
    void stopOpenFlowScheduler({ abortRunning: true }).finally(() => {
      process.exit(143)
    })
  })
}
