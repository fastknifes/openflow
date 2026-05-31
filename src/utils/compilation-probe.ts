import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { spawn } from 'node:child_process'

export type ProjectLanguage = 'typescript' | 'javascript' | 'go' | 'rust' | 'php'

export interface CompilationProbeResult {
  status: 'passed' | 'failed' | 'skipped'
  command?: string
  detail: string
}

/**
 * Detects the project language/framework based on root files.
 */
export async function detectProjectLanguage(projectDir: string): Promise<ProjectLanguage | null> {
  const hasFile = async (name: string): Promise<boolean> => {
    try {
      await fs.access(path.join(projectDir, name))
      return true
    } catch {
      return false
    }
  }

  // Priority-based detection
  if (await hasFile('tsconfig.json')) return 'typescript'
  if (await hasFile('go.mod')) return 'go'
  if (await hasFile('Cargo.toml')) return 'rust'
  if (await hasFile('composer.json')) return 'php'

  // Fallback: package.json + file extension heuristics
  if (await hasFile('package.json')) {
    const tsCount = await countFilesByExt(projectDir, '.ts')
    const jsCount = await countFilesByExt(projectDir, '.js')
    if (tsCount > jsCount && tsCount > 0) return 'typescript'
    if (jsCount > 0) return 'javascript'
  }

  return null
}

async function countFilesByExt(dir: string, ext: string): Promise<number> {
  try {
    const srcDir = path.join(dir, 'src')
    const entries = await fs.readdir(srcDir, { recursive: true, withFileTypes: false })
    return entries.filter((e): e is string => typeof e === 'string' && e.endsWith(ext)).length
  } catch {
    return 0
  }
}

/**
 * Returns the compilation probe command for the detected language.
 */
export async function getCompilationProbeCommand(
  language: ProjectLanguage,
  projectDir: string,
): Promise<{ command: string; args: string[] } | null> {
  const hasFile = async (name: string): Promise<boolean> => {
    try {
      await fs.access(path.join(projectDir, name))
      return true
    } catch {
      return false
    }
  }

  switch (language) {
    case 'typescript': {
      // Prefer local tsc if available
      if (await hasFile('node_modules/.bin/tsc')) {
        return { command: 'npx', args: ['tsc', '--noEmit'] }
      }
      return { command: 'tsc', args: ['--noEmit'] }
    }
    case 'go':
      return { command: 'go', args: ['build', './...'] }
    case 'rust':
      return { command: 'cargo', args: ['check'] }
    case 'php': {
      if (await hasFile('vendor/bin/phpstan')) {
        return { command: 'vendor/bin/phpstan', args: ['analyse', '--no-progress'] }
      }
      if (await hasFile('vendor/bin/psalm')) {
        return { command: 'vendor/bin/psalm', args: ['--no-progress'] }
      }
      return null
    }
    case 'javascript': {
      // Check package.json scripts for typecheck
      try {
        const pkgContent = await fs.readFile(path.join(projectDir, 'package.json'), 'utf-8')
        const pkg = JSON.parse(pkgContent) as { scripts?: Record<string, string> }
        if (pkg.scripts?.typecheck) {
          return { command: 'npm', args: ['run', 'typecheck'] }
        }
      } catch {
        // ignore parse errors
      }
      return null
    }
  }
}

const COMPILATION_PROBE_TIMEOUT_MS = 30_000

/**
 * Runs a compilation probe in the project directory.
 * The result is advisory-only: failures do not block readiness.
 */
export async function runCompilationProbe(projectDir: string): Promise<CompilationProbeResult> {
  const language = await detectProjectLanguage(projectDir)
  if (!language) {
    return {
      status: 'skipped',
      detail: 'No compilation probe available for this project language',
    }
  }

  const cmdSpec = await getCompilationProbeCommand(language, projectDir)
  if (!cmdSpec) {
    return {
      status: 'skipped',
      detail: `No compilation probe command found for ${language}`,
    }
  }

  const commandStr = `${cmdSpec.command} ${cmdSpec.args.join(' ')}`

  try {
    const exitCode = await execCommand(cmdSpec.command, cmdSpec.args, projectDir)
    if (exitCode === 0) {
      return {
        status: 'passed',
        command: commandStr,
        detail: 'Compilation probe passed',
      }
    }
    return {
      status: 'failed',
      command: commandStr,
      detail: `Compilation probe failed (exit code ${exitCode})`,
    }
  } catch (err: unknown) {
    // ENOENT: toolchain not found
    if (isENOENT(err)) {
      return {
        status: 'skipped',
        detail: `Toolchain not found: ${cmdSpec.command}`,
      }
    }
    return {
      status: 'failed',
      command: commandStr,
      detail: `Compilation probe error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

function isENOENT(err: unknown): boolean {
  if (err instanceof Error && 'code' in err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT'
  }
  return false
}

function execCommand(command: string, args: string[], cwd: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      timeout: COMPILATION_PROBE_TIMEOUT_MS,
    })

    let killed = false

    const timer = setTimeout(() => {
      killed = true
      child.kill('SIGTERM')
    }, COMPILATION_PROBE_TIMEOUT_MS)

    child.on('error', (err: Error) => {
      clearTimeout(timer)
      reject(err)
    })

    child.on('close', (code: number | null) => {
      clearTimeout(timer)
      if (killed) {
        reject(new Error(`Compilation probe timed out after ${COMPILATION_PROBE_TIMEOUT_MS / 1000}s`))
      } else {
        resolve(code ?? 1)
      }
    })
  })
}
