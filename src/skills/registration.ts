import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import type { OpenFlowContext } from '../types.js'
import { escapeMarkdown } from '../utils/security.js'
import { logger } from '../utils/logger.js'
import { getSkills } from './registry.js'

function getRegisteredSkillName(name: string): string {
  const segments = name.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? name
}

function buildFrontMatter(name: string, description: string): string {
  return `---
name: ${escapeMarkdown(getRegisteredSkillName(name))}
description: ${escapeMarkdown(description)}
---

`
}

function getGlobalSkillsDir(): string {
  const configHome = process.env.XDG_CONFIG_HOME
    || path.join(os.homedir(), '.config')

  return path.join(configHome, 'opencode', 'skills')
}

async function cleanupLegacyWorkspaceSkillArtifacts(projectDir: string | undefined): Promise<void> {
  if (!projectDir) return

  const legacyPaths = [
    path.join(projectDir, '.opencode', 'skills', 'archive.md'),
    path.join(projectDir, '.opencode', 'skills', 'verify.md'),
    path.join(projectDir, '.opencode', 'skills', 'brainstorm.md'),
    path.join(projectDir, '.opencode', 'skills', 'openflow'),
    path.join(projectDir, '.opencode', 'skills', 'archive'),
    path.join(projectDir, '.opencode', 'skills', 'verify'),
    path.join(projectDir, '.opencode', 'skills', 'brainstorm'),
    path.join(projectDir, '.opencode', 'commands', 'brainstorm.md'),
  ]

  await Promise.all(legacyPaths.map((target) => fs.rm(target, { recursive: true, force: true })))
}

export async function registerSkills(ctx: OpenFlowContext): Promise<boolean> {
  const skills = getSkills()
  const projectDir = typeof ctx.directory === 'string' && ctx.directory.trim().length > 0
    ? ctx.directory
    : typeof ctx.worktree === 'string' && ctx.worktree.trim().length > 0
      ? ctx.worktree
      : undefined
  const targetRoots = new Set<string>([getGlobalSkillsDir()])

  try {
    await cleanupLegacyWorkspaceSkillArtifacts(projectDir)

    for (const skill of skills) {
      const frontMatter = buildFrontMatter(skill.name, skill.description)
      const content = frontMatter + skill.content

      await Promise.all([...targetRoots].map(async (root) => {
        const skillDir = path.join(root, skill.name)
        await fs.mkdir(skillDir, { recursive: true })
        await fs.writeFile(path.join(skillDir, 'SKILL.md'), content, 'utf-8')
      }))

      logger.debug('Registered skill', { name: skill.name })
    }

    logger.info('Skills registered', { count: skills.length, roots: [...targetRoots] })
    return true
  } catch (error) {
    logger.warn('Failed to register skills', {
      roots: [...targetRoots],
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

export async function unregisterSkills(ctx: OpenFlowContext): Promise<void> {
  const projectDir = typeof ctx.directory === 'string' && ctx.directory.trim().length > 0
    ? ctx.directory
    : typeof ctx.worktree === 'string' && ctx.worktree.trim().length > 0
      ? ctx.worktree
      : undefined
  const targetRoots = new Set<string>([getGlobalSkillsDir()])

  try {
    await Promise.all(getSkills().map(async (skill) => {
      await Promise.all([...targetRoots].map((root) => fs.rm(path.join(root, skill.name), { recursive: true, force: true })))
    }))
    await cleanupLegacyWorkspaceSkillArtifacts(projectDir)
    logger.info('Skills unregistered')
  } catch {
    void 0
  }
}
