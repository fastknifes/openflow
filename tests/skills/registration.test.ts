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
  test('registers writing-plan as the only discovered OpenFlow SKILL.md entry', async () => {
    const root = join(process.cwd(), '.test-skill-registration')
    await rm(root, { recursive: true, force: true })

    await registerSkills(createContext(root))

    const globalSkillPath = join(os.homedir(), '.config', 'opencode', 'skills', 'openflow-writing-plan', 'SKILL.md')
    const content = await readFile(globalSkillPath, 'utf-8')

    expect(content).toContain('name: openflow-writing-plan')
    expect(content).toContain('description:')
    expect(content).toContain('development plan')
    expect(content).toContain('/openflow-writing-plan <feature>')
    expect(content).toContain('openflow-writing-plan <feature>')

    const brainstormSkillPath = join(os.homedir(), '.config', 'opencode', 'skills', 'openflow-brainstorm', 'SKILL.md')
    await expect(readFile(brainstormSkillPath, 'utf-8')).rejects.toBeDefined()
  })
})
