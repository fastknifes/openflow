import { afterEach, describe, expect, it } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { AdapterCache } from '../../src/adapters/cache.js'
import { DecisionsConstraintsAdapter } from '../../src/adapters/consistency/decisions-constraints.js'

const cleanupDirs: string[] = []

afterEach(async () => {
  await Promise.all(cleanupDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('DecisionsConstraintsAdapter', () => {
  it('detects ADR-002 prohibited slash command form', async () => {
    const projectDir = await createProject()
    await write(path.join(projectDir, 'docs', 'decisions', 'ADR-002-command-naming-convention.md'), [
      '## 2.2 禁止格式',
      '- /openflow/verify (应为 /openflow-verify)',
    ].join('\n'))
    await write(path.join(projectDir, 'docs', 'decisions', 'ADR-003-command-registration-via-commands-not-skills.md'), 'openflow-writing-plan 保留 Skill 注册。\n')
    await write(path.join(projectDir, 'README.md'), 'Run /openflow/verify before archive.\n')

    const adapter = new DecisionsConstraintsAdapter()
    const results = await adapter.run({
      projectDir,
      feature: 'consistency',
      config: {},
      cache: new AdapterCache(),
      changedFiles: ['README.md'],
    })

    expect(results.some((result) => result.detail?.includes('/openflow/verify'))).toBe(true)
  })

  it('detects ADR-003 skill registration violations and allows writing-plan exception', async () => {
    const projectDir = await createProject()
    await write(path.join(projectDir, 'docs', 'decisions', 'ADR-002-command-naming-convention.md'), [
      '## 2.2 禁止格式',
      '- /openflow/verify (应为 /openflow-verify)',
    ].join('\n'))
    await write(path.join(projectDir, 'docs', 'decisions', 'ADR-003-command-registration-via-commands-not-skills.md'), [
      'openflow-writing-plan 作为可被 Agent 调用的计划编写入口，保留 Skill 注册。',
      '其他 OpenFlow 命令不注册为 Skill。',
    ].join('\n'))
    await write(path.join(projectDir, 'src', 'skills', 'registry.ts'), 'registerSkills(["openflow-writing-plan", "openflow-verify"])\n')

    const adapter = new DecisionsConstraintsAdapter()
    const results = await adapter.run({
      projectDir,
      feature: 'consistency',
      config: {},
      cache: new AdapterCache(),
      changedFiles: ['src/skills/registry.ts'],
    })

    expect(results.some((result) => result.detail?.includes('openflow-verify'))).toBe(true)
    expect(results.every((result) => !result.detail?.includes('openflow-writing-plan') || result.detail.includes('except openflow-writing-plan'))).toBe(true)
  })
})

async function createProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openflow-decisions-test-'))
  cleanupDirs.push(dir)
  return dir
}

async function write(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
}
