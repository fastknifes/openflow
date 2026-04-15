import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { logger } from './utils/logger.js'

const successfulRegistrations = new Set<string>()
const registrationInFlight = new Map<string, Promise<boolean>>()

function getGlobalCommandsDir(): string {
  // Match OpenCode's documented global config root: ~/.config/opencode
  const configHome = process.env.XDG_CONFIG_HOME
    || (os.platform() === 'win32'
      ? path.join(os.homedir(), '.config')
      : path.join(os.homedir(), '.config'))

  return path.join(configHome, 'opencode', 'commands')
}

export async function unregisterCommands(): Promise<void> {
  const commandsDir = getGlobalCommandsDir()

  try {
    await fs.rm(path.join(commandsDir, 'brainstorm.md'), { force: true })
    successfulRegistrations.delete(commandsDir)
    logger.info('Commands unregistered globally', { path: commandsDir })
  } catch {
    void 0
  }
}

export async function cleanupLegacyCommandArtifacts(): Promise<void> {
  const commandsDir = getGlobalCommandsDir()

  try {
    await fs.rm(path.join(commandsDir, 'brainstorm.md'), { force: true })
    successfulRegistrations.delete(commandsDir)
    registrationInFlight.delete(commandsDir)
    logger.info('Legacy brainstorm command artifact cleaned', { path: commandsDir })
  } catch {
    void 0
  }
}
