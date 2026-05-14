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
  test('creates command files, skips writing-plan command, and registers writing-plan skill on init', async () => {
    const root = join(process.cwd(), '.test-plugin-runtime-registration')
    await rm(root, { recursive: true, force: true })

    // Pre-create a legacy global skill dir that registerCommands() should clean
    const legacySkillDir = join(os.homedir(), '.config', 'opencode', 'skills', 'openflow-brainstorm')
    await mkdir(join(legacySkillDir), { recursive: true })
    await writeFile(join(legacySkillDir, 'SKILL.md'), 'legacy skill', 'utf-8')

    await OpenFlowPlugin(createPluginInput(root) as never)

    // 1. Command .md files are created (openflow-feature replaces old brainstorm command)
    const commandPath = join(os.homedir(), '.config', 'opencode', 'commands', 'openflow-feature.md')
    const commandContent = await readFile(commandPath, 'utf-8')
    expect(commandContent).toContain('description:')
    expect(commandContent).toContain('openflow-feature')

    // 2. Legacy global skill dirs are cleaned (registerCommands calls cleanupLegacySkillDirs),
    //    then brainstorm is re-registered as an active skill by registerSkills.
    const brainstormSkillPath = join(os.homedir(), '.config', 'opencode', 'skills', 'openflow-brainstorm', 'SKILL.md')
    await expect(access(brainstormSkillPath)).resolves.toBeNull()
    const brainstormSkillContent = await readFile(brainstormSkillPath, 'utf-8')
    expect(brainstormSkillContent).toContain('name: openflow-brainstorm')
    expect(brainstormSkillContent).toContain('/openflow-feature')

    // 4. writing-plan is the intentional agent-callable skill exception.
    const writingPlanCommandPath = join(os.homedir(), '.config', 'opencode', 'commands', 'openflow-writing-plan.md')
    await expect(access(writingPlanCommandPath)).rejects.toBeDefined()

    const writingPlanSkillPath = join(os.homedir(), '.config', 'opencode', 'skills', 'openflow-writing-plan', 'SKILL.md')
    const writingPlanSkillContent = await readFile(writingPlanSkillPath, 'utf-8')
    expect(writingPlanSkillContent).toContain('name: openflow-writing-plan')
    expect(writingPlanSkillContent).toContain('/openflow-writing-plan <feature>')

    // 5. openflow-issue command file is created with correct description
    const issueCommandPath = join(os.homedir(), '.config', 'opencode', 'commands', 'openflow-issue.md')
    const issueCommandContent = await readFile(issueCommandPath, 'utf-8')
    expect(issueCommandContent).toContain('description:')
    expect(issueCommandContent).toContain('openflow-issue')
    expect(issueCommandContent).toContain('OpenFlow issue clarification and triage command for uncertain problems')
    expect(issueCommandContent).toContain('OpenFlow command: /openflow-issue $ARGUMENTS')

    await rm(root, { recursive: true, force: true })
  })

  test('registerCommands creates openflow-issue.md when run standalone', async () => {
    const root = join(process.cwd(), '.test-plugin-issue-registration')
    await rm(root, { recursive: true, force: true })

    await OpenFlowPlugin(createPluginInput(root) as never)

    const issueCommandPath = join(os.homedir(), '.config', 'opencode', 'commands', 'openflow-issue.md')
    const content = await readFile(issueCommandPath, 'utf-8')
    expect(content).toContain('OpenFlow issue clarification and triage command for uncertain problems')
    expect(content).toContain('/openflow-issue $ARGUMENTS')
    // Verify command file has valid frontmatter format
    expect(content).toMatch(/^---\ndescription:/)

    await rm(root, { recursive: true, force: true })
  })
})
