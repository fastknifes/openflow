import { describe, expect, test } from 'bun:test'
import { readFile, rm } from 'node:fs/promises'
import * as os from 'node:os'
import { join } from 'node:path'
import { registerSkills } from '../../src/skills/registration.js'
import { defaultConfig, type OpenFlowContext } from '../../src/types.js'

function createContext(directory: string): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    config: { ...defaultConfig },
    enhancedPlans: new Set<string>(),
  }
}

describe('skill registration', () => {
  test('registers brainstorm as a discovered SKILL.md entry', async () => {
    const root = join(process.cwd(), '.test-skill-registration')
    await rm(root, { recursive: true, force: true })

    await registerSkills(createContext(root))

    const globalSkillPath = join(os.homedir(), '.config', 'opencode', 'skills', 'openflow', 'brainstorm', 'SKILL.md')
    const content = await readFile(globalSkillPath, 'utf-8')

    expect(content).toContain('name: brainstorm')
    expect(content).toContain('description: Use when starting or continuing feature design clarification')
    expect(content).toContain('/openflow/brainstorm <feature>')
    expect(content).toContain('internal OpenFlow `openflow/brainstorm` tool')
  })

  test('registers init as a discovered SKILL.md entry', async () => {
    const root = join(process.cwd(), '.test-skill-registration-init')
    await rm(root, { recursive: true, force: true })

    await registerSkills(createContext(root))

    const globalSkillPath = join(os.homedir(), '.config', 'opencode', 'skills', 'openflow', 'init', 'SKILL.md')
    const content = await readFile(globalSkillPath, 'utf-8')

    expect(content).toContain('name: init')
    expect(content).toContain('description: Use when initializing or refreshing the root AGENTS.md')
    expect(content).toContain('/openflow/init')
    expect(content).toContain('internal OpenFlow `openflow/init` tool')
  })
})
