import { describe, expect, test } from 'bun:test'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
import { join } from 'node:path'
import { OpenFlowPlugin } from '../src/index.js'

function createPluginInput(directory: string) {
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    config: {},
  }
}

describe('OpenFlowPlugin runtime registration', () => {
  test('cleans legacy brainstorm command and workspace skill artifacts on init', async () => {
    const root = join(process.cwd(), '.test-plugin-no-runtime-registration')
    await rm(root, { recursive: true, force: true })

    await mkdir(join(root, '.opencode', 'skills', 'openflow'), { recursive: true })
    await mkdir(join(root, '.opencode', 'commands'), { recursive: true })
    await writeFile(join(root, '.opencode', 'skills', 'archive.md'), 'legacy', 'utf-8')
    await writeFile(join(root, '.opencode', 'skills', 'openflow', 'verify.md'), 'legacy', 'utf-8')
    await writeFile(join(root, '.opencode', 'commands', 'brainstorm.md'), 'legacy', 'utf-8')

    const globalCommandPath = join(os.homedir(), '.config', 'opencode', 'commands', 'brainstorm.md')
    await mkdir(join(os.homedir(), '.config', 'opencode', 'commands'), { recursive: true })
    await writeFile(globalCommandPath, 'legacy command', 'utf-8')

    await OpenFlowPlugin(createPluginInput(root) as never)

    await expect(access(join(root, '.opencode', 'commands', 'brainstorm.md'))).rejects.toBeDefined()
    await expect(access(join(root, '.opencode', 'skills', 'archive.md'))).rejects.toBeDefined()
    await expect(access(join(root, '.opencode', 'skills', 'openflow', 'verify.md'))).rejects.toBeDefined()
    await expect(access(globalCommandPath)).rejects.toBeDefined()

    const globalSkillPath = join(os.homedir(), '.config', 'opencode', 'skills', 'openflow', 'brainstorm', 'SKILL.md')
    await expect(access(globalSkillPath)).resolves.toBeNull()
    const content = await readFile(globalSkillPath, 'utf-8')
    expect(content).toContain('name: brainstorm')

    await rm(root, { recursive: true, force: true })
  })
})
