import { describe, expect, test } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readDesignContextPacket } from '../../src/commands/writing-plan.js'
import { createMinimalRequirementModel } from '../../src/phases/brainstorm/requirement-model.js'

const TEST_ROOT = join(process.cwd(), '.test-writing-plan')

describe('writing-plan design context packet', () => {
  test('reads structured sidecar context from requirements.json when available', async () => {
    await rm(TEST_ROOT, { recursive: true, force: true })

    const designDir = join(TEST_ROOT, 'docs', 'changes', 'writing-plan-feature')
    await mkdir(designDir, { recursive: true })
    await writeFile(join(designDir, 'design.md'), '# Design\n\n## Overview\n\nLegacy markdown fallback.\n', 'utf-8')

    const model = createMinimalRequirementModel('writing-plan-feature')
    model.problemStatement = 'Turn sidecar metadata into a plan-ready context packet.'
    model.goals = ['Keep the design packet concise and structured']
    model.constraints = [
      {
        id: 'c-writing-plan-sidecar',
        category: 'maintainability',
        severity: 'should',
        description: 'Reuse the brainstorm sidecar instead of re-parsing markdown when possible',
        rationale: 'The sidecar is already structured and validated',
        verificationMethod: 'Packet tests assert sidecar-first behavior',
        sourceQuestionId: 'constraints',
      },
    ]
    model.acceptanceCriteria = [
      { id: 'ac-writing-plan-sidecar', description: 'Packet lists acceptance criteria from the sidecar' },
    ]

    await writeFile(join(designDir, 'requirements.json'), JSON.stringify(model, null, 2), 'utf-8')

    const packet = await readDesignContextPacket(TEST_ROOT, 'writing-plan-feature')

    expect(packet).not.toBeNull()
    expect(packet).toContain('Turn sidecar metadata into a plan-ready context packet.')
    expect(packet).toContain('Keep the design packet concise and structured')
    expect(packet).toContain('[SHOULD / maintainability] Reuse the brainstorm sidecar instead of re-parsing markdown when possible')
    expect(packet).toContain('Packet lists acceptance criteria from the sidecar')
    expect(packet).not.toContain('Legacy markdown fallback.')

    await rm(TEST_ROOT, { recursive: true, force: true })
  })

  test('falls back to markdown excerpts when no sidecar exists', async () => {
    await rm(TEST_ROOT, { recursive: true, force: true })

    const designDir = join(TEST_ROOT, 'docs', 'changes', 'fallback-writing-plan')
    await mkdir(designDir, { recursive: true })
    await writeFile(
      join(designDir, 'design.md'),
      `# fallback-writing-plan - Design\n\n## Overview\n\nMarkdown fallback overview.\n\n## Constraints\n\n- Keep the old extraction path working.\n`,
      'utf-8'
    )

    const packet = await readDesignContextPacket(TEST_ROOT, 'fallback-writing-plan')

    expect(packet).toBe('### Overview\nMarkdown fallback overview.\n\n### Constraints\n- Keep the old extraction path working.')

    await rm(TEST_ROOT, { recursive: true, force: true })
  })
})
