import { spawn } from 'node:child_process'

export interface RunCommandOptions {
  cwd: string
  timeout?: number
  env?: Record<string, string>
}

export type CommandResultStatus =
  | 'pass'
  | 'findings'
  | 'tool_missing'
  | 'timeout'
  | 'parse_error'
  | 'error'

export interface CommandResult {
  status: CommandResultStatus
  stdout: string
  stderr: string
  exitCode?: number
  errorMessage?: string
}

const MAX_STDOUT = 256 * 1024 // 256KB

const NON_INTERACTIVE_ENV: Record<string, string> = {
  CI: 'true',
  DEBIAN_FRONTEND: 'noninteractive',
  GIT_TERMINAL_PROMPT: '0',
}

/**
 * Run an external command with safety guards: non-interactive env, timeout
 * kill, stdout size cap, and structured error classification. Uses
 * `spawn` with args array — never string interpolation.
 */
export async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...NON_INTERACTIVE_ENV, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })

    function finish(result: CommandResult): void {
      if (settled) return
      settled = true
      resolve(result)
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_STDOUT) {
        stdout += chunk.toString()
      }
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('error', (error: NodeJS.ErrnoException) => {
      finish({
        status: error.code === 'ENOENT' ? 'tool_missing' : 'error',
        stdout: '',
        stderr: '',
        errorMessage:
          error.code === 'ENOENT'
            ? `Command not found: ${command}`
            : error.message,
      })
    })

    child.on('close', (code) => {
      if (settled) return

      const status: CommandResultStatus = timedOut
        ? 'timeout'
        : code === 0
          ? 'pass'
          : 'findings'

      finish({
        status,
        stdout: stdout.slice(0, MAX_STDOUT),
        stderr,
        ...(code !== null ? { exitCode: code } : {}),
      })
    })

    if (options.timeout && options.timeout > 0) {
      setTimeout(() => {
        if (settled) return
        timedOut = true
        child.kill()
        // Force-kill after a brief grace period for stuck children
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL')
          }
        }, 1000)
      }, options.timeout)
    }
  })
}
