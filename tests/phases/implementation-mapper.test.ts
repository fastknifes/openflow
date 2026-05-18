import { describe, expect, test, afterEach } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { generateImplementationMapper } from '../../src/phases/archive/implementation-mapper.js'
import type { FileChangeRecord } from '../../src/types.js'

const testDir = join(process.cwd(), '.test-impl-mapper')

async function setupTestDir() {
  await rm(testDir, { recursive: true, force: true })
  await mkdir(join(testDir, 'docs', 'changes', 'test-feat'), { recursive: true })
  await mkdir(join(testDir, 'src'), { recursive: true })
  await writeFile(join(testDir, 'src', 'lib.ts'), 'export function doThing() {}', 'utf-8')
  await writeFile(join(testDir, 'docs', 'changes', 'test-feat', 'prd.md'), '# Requirements\n- Map code to requirements\n', 'utf-8')
}

const baseChanges: FileChangeRecord[] = [
  { filePath: 'src/lib.ts', tool: 'write', timestamp: Date.now() },
]

const baseOptions = {
  feature: 'test',
  projectDir: testDir,
  archiveDir: join(testDir, 'archive'),
  requirementsPath: join(testDir, 'docs', 'changes', 'test-feat', 'prd.md'),
  designExists: false,
  planExists: false,
  changes: baseChanges,
  acceptanceState: null,
}

describe('generateImplementationMapper', () => {
  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  test('output includes 概述 section', async () => {
    await setupTestDir()
    const content = await generateImplementationMapper(baseOptions)
    expect(content).toContain('## 1. 概述')
  })

  test('output does NOT include 冻结工件 section', async () => {
    await setupTestDir()
    const content = await generateImplementationMapper(baseOptions)
    expect(content).not.toContain('冻结工件')
  })

  test('output does NOT include 修改的文件 section', async () => {
    await setupTestDir()
    const content = await generateImplementationMapper(baseOptions)
    expect(content).not.toContain('## 4. 修改的文件')
    expect(content).not.toContain('Modified Files')
  })

  test('output includes 需求到实现映射 section', async () => {
    await setupTestDir()
    const content = await generateImplementationMapper(baseOptions)
    expect(content).toContain('## 2. 需求到实现映射')
  })

  test('output includes 验证与结论 section', async () => {
    await setupTestDir()
    const content = await generateImplementationMapper(baseOptions)
    expect(content).toContain('## 3. 验证与结论')
  })

  test('output omits 全局依赖 section when no global deps exist', async () => {
    await setupTestDir()
    const content = await generateImplementationMapper(baseOptions)
    expect(content).not.toContain('全局依赖与例外证据')
  })

  test('output does NOT include same-feature document links', async () => {
    await setupTestDir()
    const content = await generateImplementationMapper({
      ...baseOptions,
      designExists: true,
      planExists: true,
    })
    expect(content).not.toContain('设计文档')
    expect(content).not.toContain('执行计划')
  })

  test('shows no verification evidence when acceptanceState is null', async () => {
    await setupTestDir()
    const content = await generateImplementationMapper(baseOptions)
    expect(content).toContain('no verification evidence recorded')
  })

  test('mapping table uses correct column headers', async () => {
    await setupTestDir()
    const content = await generateImplementationMapper(baseOptions)
    expect(content).toContain('| 追溯来源 | 需求/决策 | 代码文件 | 关键符号 | 关联说明 | 验证证据 |')
  })

  test('includes 全局依赖与例外证据 when driftItems exist', async () => {
    await setupTestDir()
    const content = await generateImplementationMapper({
      ...baseOptions,
      driftItems: [
        { item: 'drift-1', designDoc: 'design.md', actualCode: 'actual code', reason: 'intentional change' },
      ],
    })
    expect(content).toContain('全局依赖与例外证据')
    expect(content).toContain('## 2. 全局依赖与例外证据')
    expect(content).toContain('## 3. 需求到实现映射')
    expect(content).toContain('## 4. 验证与结论')
  })

  test('includes 已知偏差 when driftItems exist', async () => {
    await setupTestDir()
    const content = await generateImplementationMapper({
      ...baseOptions,
      driftItems: [
        { item: 'drift-1', designDoc: 'design.md', actualCode: 'actual code', reason: 'intentional change' },
      ],
    })
    expect(content).toContain('已知偏差')
    expect(content).toContain('drift-1')
  })

  test('continuous section numbering when 全局依赖 is omitted', async () => {
    await setupTestDir()
    const content = await generateImplementationMapper(baseOptions)
    expect(content).toContain('## 1. 概述')
    expect(content).toContain('## 2. 需求到实现映射')
    expect(content).toContain('## 3. 验证与结论')
    expect(content).not.toContain('## 4.')
  })

  test('continuous section numbering when 全局依赖 is present', async () => {
    await setupTestDir()
    const content = await generateImplementationMapper({
      ...baseOptions,
      driftItems: [
        { item: 'drift-1', designDoc: 'design.md', actualCode: 'actual code', reason: 'intentional change' },
      ],
    })
    expect(content).toContain('## 1. 概述')
    expect(content).toContain('## 2. 全局依赖与例外证据')
    expect(content).toContain('## 3. 需求到实现映射')
    expect(content).toContain('## 4. 验证与结论')
  })

  test('includes behavior mapping for scenario and boundary heading blocks', async () => {
    await setupTestDir()
    const behaviorPath = join(testDir, 'docs', 'changes', 'test-feat', 'behavior.md')
    await writeFile(behaviorPath, `# Behavior Contract: test

## Behavior Scenarios

### Scenario: User can complete core flow

Given:
- user has valid input

When:
- user runs the command

Then:
- result is generated

## Boundary Scenarios

### Boundary: Missing optional context

Given:
- optional context is absent

When:
- user runs the command

Then:
- system continues with fallback
`, 'utf-8')

    const content = await generateImplementationMapper({
      ...baseOptions,
      behaviorPath,
    })

    expect(content).toContain('## 3. 行为到实现映射')
    expect(content).toContain('| Behavior Scenario | Type | Expected Behavior | Evidence | Code Files | Key Symbols | Notes |')
    expect(content).toContain('| User can complete core flow | scenario | Given user has valid input / When user runs the command / Then result is generated | — | — | — | Critical behavior scenario. |')
    expect(content).toContain('| Missing optional context | boundary | Given optional context is absent / When user runs the command / Then system continues with fallback | — | — | — | Boundary scenario; should-pass evidence. |')
    expect(content).toContain('## 4. 验证与结论')
  })
})
