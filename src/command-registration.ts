import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { logger } from './utils/logger.js'
import { OPENFLOW_COMMAND_FILES } from './commands/manifest.js'

// Skills that are INTENTIONALLY registered by registerSkills() are excluded
// from cleanup to prevent a race: registerCommands() deletes them, then
// registerSkills() immediately recreates them.
const LEGACY_SKILL_DIRS = [
  'openflow-feature',
  'openflow-change',
  'openflow-init',
  'openflow-archive',
  'openflow-migrate-docs',
  // Legacy issue-mode: removed from active workflow, cleanup only
  'openflow-issue',
]

const STALE_COMMAND_FILES = [
  'openflow-writing-plan.md',
  'openflow-harden.md',
  'openflow-verify.md',
  'openflow-brainstorm.md',
  'openflow-issue.md',
]

function getGlobalConfigDir(): string {
  const configHome = process.env.XDG_CONFIG_HOME
    || path.join(os.homedir(), '.config')
  return configHome
}

function getGlobalCommandsDir(): string {
  return path.join(getGlobalConfigDir(), 'opencode', 'commands')
}

function getGlobalSkillsDir(): string {
  return path.join(getGlobalConfigDir(), 'opencode', 'skills')
}

function buildCommandFile(name: string, description: string): string {
  return `---
description: ${description}
---

OpenFlow command: /${name} $ARGUMENTS
`
}

async function cleanupLegacySkillDirs(): Promise<void> {
  const skillsDir = getGlobalSkillsDir()
  await Promise.all(
    LEGACY_SKILL_DIRS.map((dir) =>
      fs.rm(path.join(skillsDir, dir), { recursive: true, force: true }).catch(() => {})
    )
  )
  logger.debug('Legacy skill directories cleaned')
}

export async function registerCommands(): Promise<void> {
  const commandsDir = getGlobalCommandsDir()

  await cleanupLegacySkillDirs()

  await fs.mkdir(commandsDir, { recursive: true })
  await Promise.all(
    STALE_COMMAND_FILES.map((file) => fs.rm(path.join(commandsDir, file), { force: true }))
  )

  await Promise.all(
    OPENFLOW_COMMAND_FILES.map(async ({ name, description }) => {
      const content = buildCommandFile(name, description)
      await fs.writeFile(path.join(commandsDir, `${name}.md`), content, 'utf-8')
    })
  )

  logger.info('Commands registered', { count: OPENFLOW_COMMAND_FILES.length })
}

export async function unregisterCommands(): Promise<void> {
  const commandsDir = getGlobalCommandsDir()

  try {
    await Promise.all(
      [
        ...OPENFLOW_COMMAND_FILES.map(({ name }) => `${name}.md`),
        ...STALE_COMMAND_FILES,
      ].map((file) => fs.rm(path.join(commandsDir, file), { force: true }))
    )
    logger.info('Commands unregistered')
  } catch {
    void 0
  }
}
