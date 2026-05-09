import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { logger } from './utils/logger.js'

const COMMANDS: Record<string, string> = {
  'openflow-brainstorm': 'OpenFlow brainstorm command for design clarification',
  'openflow-change': 'OpenFlow change command for feature workspace management',
  'openflow-init': 'OpenFlow init command for initializing AGENTS.md with docs guide',
  'openflow-verify': 'OpenFlow verify command for evidence and readiness checks',
  'openflow-archive': 'OpenFlow archive command for completed features',
  'openflow-status': 'OpenFlow status command',
  'openflow-config': 'OpenFlow config command',
  'openflow-migrate-docs': 'Migrate documentation from other workflow tools into OpenFlow docs structure',
  'openflow-harden': 'OpenFlow harden command for adversarial quality hardening',
  'openflow-issue': 'OpenFlow issue clarification and triage command for uncertain problems',
}

const LEGACY_SKILL_DIRS = [
  'openflow-brainstorm',
  'openflow-change',
  'openflow-init',
  'openflow-verify',
  'openflow-archive',
  'openflow-migrate-docs',
  'openflow-writing-plan',
  'openflow-harden',
]

const STALE_COMMAND_FILES = [
  'openflow-writing-plan.md',
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
    Object.entries(COMMANDS).map(async ([name, description]) => {
      const content = buildCommandFile(name, description)
      await fs.writeFile(path.join(commandsDir, `${name}.md`), content, 'utf-8')
    })
  )

  logger.info('Commands registered', { count: Object.keys(COMMANDS).length })
}

export async function unregisterCommands(): Promise<void> {
  const commandsDir = getGlobalCommandsDir()

  try {
    await Promise.all(
      [
        ...Object.keys(COMMANDS).map((name) => `${name}.md`),
        ...STALE_COMMAND_FILES,
      ].map((file) => fs.rm(path.join(commandsDir, file), { force: true }))
    )
    logger.info('Commands unregistered')
  } catch {
    void 0
  }
}
