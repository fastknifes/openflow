import { describe, test, expect, afterAll } from 'bun:test'
import { rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  isDeterministicRepair,
  executeRepair,
  repairDesignDocRef,
  repairSymbolRefInDesign,
} from '../../src/drift/repair-coordinator.js'
import type { DriftCheckResult } from '../../src/drift/diff-engine.js'
import { readGuardianRepairs } from '../../src/drift/state-store.js'

const TEMP_DIR = join(process.cwd(), '.test-repair-coordinator')
const FEATURE = 'test-repair-feature'

afterAll(async () => {
  await rm(TEMP_DIR, { recursive: true, force: true })
})

async function setupProject(): Promise<string> {
  await rm(TEMP_DIR, { recursive: true, force: true })
  await mkdir(TEMP_DIR, { recursive: true })
  return TEMP_DIR
}

async function setupSrcFile(projectDir: string, fileName: string, content: string): Promise<string> {
  const srcDir = join(projectDir, 'src')
  await mkdir(srcDir, { recursive: true })
  const filePath = join(srcDir, fileName)
  await writeFile(filePath, content, 'utf-8')
  return filePath
}

async function setupDesignDoc(projectDir: string, feature: string, content: string): Promise<string> {
  const designDir = join(projectDir, 'docs', 'changes', `2026-01-01-${feature}`)
  await mkdir(designDir, { recursive: true })
  const filePath = join(designDir, 'design.md')
  await writeFile(filePath, content, 'utf-8')
  return filePath
}

const sampleResult: DriftCheckResult = {
  item: 'oldName',
  type: 'symbol',
  contractReference: 'test-ref',
  actualValue: 'oldName',
  reason: 'test drift',
  suggestedFix: 'oldName->newName',
}

const noFixResult: DriftCheckResult = {
  item: 'oldName',
  type: 'symbol',
  contractReference: 'test-ref',
  actualValue: 'oldName',
  reason: 'ambiguous drift',
}

const emptyFixResult: DriftCheckResult = {
  item: 'oldName',
  type: 'symbol',
  contractReference: 'test-ref',
  actualValue: 'oldName',
  reason: 'test drift',
  suggestedFix: '',
}

// --- isDeterministicRepair ---

describe('isDeterministicRepair', () => {
  test('result with suggestedFix returns true', () => {
    expect(isDeterministicRepair(sampleResult)).toBe(true)
  })

  test('result without suggestedFix returns false', () => {
    expect(isDeterministicRepair(noFixResult)).toBe(false)
  })

  test('result with empty suggestedFix returns false', () => {
    expect(isDeterministicRepair(emptyFixResult)).toBe(false)
  })
})

// --- executeRepair ---

describe('executeRepair', () => {
  test('successful oldString->newString replacement in file', async () => {
    const projectDir = await setupProject()
    const filePath = join(projectDir, 'src', 'rename-me.ts')
    const content = 'import { oldName } from "./lib"\nconst oldName = 42\n'
    await mkdir(join(projectDir, 'src'), { recursive: true })
    await writeFile(filePath, content, 'utf-8')

    const result = await executeRepair(
      {
        item: 'oldName',
        type: 'symbol',
        contractReference: 'design-ref',
        actualValue: 'oldName',
        reason: 'symbol renamed',
        suggestedFix: 'oldName->newName',
      },
      'src/rename-me.ts',
      projectDir,
      FEATURE,
    )

    expect(result.success).toBe(true)
    expect(result.reason).toContain('Repair applied')

    const repaired = await readFile(filePath, 'utf-8')
    expect(repaired).toBe('import { newName } from "./lib"\nconst newName = 42\n')
  })

  test('files with "->" separator regex replaces old->new', async () => {
    const projectDir = await setupProject()
    const fileContent = 'ref: oldPath\ncall oldPath()\n// oldPath here\n'
    await setupSrcFile(projectDir, 'paths.ts', fileContent)

    const result = await executeRepair(
      {
        item: 'oldPath',
        type: 'file',
        contractReference: 'design-doc',
        actualValue: 'oldPath',
        reason: 'path renamed',
        suggestedFix: 'oldPath->newPath',
      },
      'src/paths.ts',
      projectDir,
      FEATURE,
    )

    expect(result.success).toBe(true)
    const repaired = await readFile(join(projectDir, 'src', 'paths.ts'), 'utf-8')
    expect(repaired).toBe('ref: newPath\ncall newPath()\n// newPath here\n')
  })

  test('writes repair record to state store', async () => {
    const projectDir = await setupProject()
    await setupSrcFile(projectDir, 'record.ts', 'oldSymbol here')

    const result = await executeRepair(
      {
        item: 'oldSymbol',
        type: 'symbol',
        contractReference: 'contract',
        actualValue: 'oldSymbol',
        reason: 'symbol drift',
        suggestedFix: 'oldSymbol->newSymbol',
      },
      'src/record.ts',
      projectDir,
      FEATURE,
    )

    expect(result.success).toBe(true)
    expect(result.repairRecord).toBeDefined()
    expect(result.repairRecord!.feature).toBe(FEATURE)
    expect(result.repairRecord!.filePath).toBe('src/record.ts')
    expect(result.repairRecord!.disposition).toBe('auto_repaired')

    const repairs = await readGuardianRepairs(projectDir)
    expect(repairs).toHaveLength(1)
    expect(repairs[0]!.filePath).toBe('src/record.ts')
  })

  test('fails when target segment not found (with retries)', async () => {
    const projectDir = await setupProject()
    await setupSrcFile(projectDir, 'missing.ts', 'completely different content')

    const result = await executeRepair(
      {
        item: 'target',
        type: 'symbol',
        contractReference: 'ref',
        actualValue: 'target',
        reason: 'drift',
        suggestedFix: 'nonexistent-target-segment',
      },
      'src/missing.ts',
      projectDir,
      FEATURE,
    )

    expect(result.success).toBe(false)
    expect(result.reason).toContain('Target segment not found')
  })

  test('respects maxRetries', async () => {
    const projectDir = await setupProject()
    await setupSrcFile(projectDir, 'retry.ts', 'no match here whatsoever')

    const start = Date.now()
    const result = await executeRepair(
      {
        item: 'target',
        type: 'symbol',
        contractReference: 'ref',
        actualValue: 'target',
        reason: 'drift',
        suggestedFix: 'target-word-not-in-file',
      },
      'src/retry.ts',
      projectDir,
      FEATURE,
      2, // maxRetries=2
    )
    const elapsed = Date.now() - start

    expect(result.success).toBe(false)
    expect(result.reason).toContain('concurrent_conflict')
    // With maxRetries=2, there should be 1 retry (attempt 0 + retry 1), so at least 50ms delay
    expect(elapsed).toBeGreaterThanOrEqual(40)
  })

  test('non-deterministic repair rejected (no suggestedFix)', async () => {
    const projectDir = await setupProject()
    await setupSrcFile(projectDir, 'nondet.ts', 'some content')

    const result = await executeRepair(
      noFixResult,
      'src/nondet.ts',
      projectDir,
      FEATURE,
    )

    expect(result.success).toBe(false)
    expect(result.reason).toContain('Not a deterministic repair')
  })
})

// --- repairDesignDocRef ---

describe('repairDesignDocRef', () => {
  test('updates path reference in design.md', async () => {
    const projectDir = await setupProject()
    const designContent = '## Files\n\n- src/old-path.ts\n- src/other.ts\n\nThe file is src/old-path.ts\n'
    await setupDesignDoc(projectDir, FEATURE, designContent)

    const result = await repairDesignDocRef(FEATURE, 'src/old-path.ts', 'src/new-path.ts', projectDir)

    expect(result.success).toBe(true)

    // Read back and verify
    const designDir = join(projectDir, 'docs', 'changes', `2026-01-01-${FEATURE}`)
    const repaired = await readFile(join(designDir, 'design.md'), 'utf-8')
    expect(repaired).toContain('src/new-path.ts')
    expect(repaired).not.toContain('src/old-path.ts')
  })

  test('returns failure when design.md not found', async () => {
    const projectDir = await setupProject()

    const result = await repairDesignDocRef('nonexistent-feature', 'src/old.ts', 'src/new.ts', projectDir)

    expect(result.success).toBe(false)
    expect(result.reason).toContain('Design directory not found')
  })
})

// --- repairSymbolRefInDesign ---

describe('repairSymbolRefInDesign', () => {
  test('updates symbol reference in design.md', async () => {
    const projectDir = await setupProject()
    const designContent = '## Symbols\n\n- `OldClass` is the main class\n- Uses OldClass for processing\n'
    await setupDesignDoc(projectDir, FEATURE, designContent)

    const result = await repairSymbolRefInDesign(FEATURE, 'OldClass', 'NewClass', projectDir)

    expect(result.success).toBe(true)

    const designDir = join(projectDir, 'docs', 'changes', `2026-01-01-${FEATURE}`)
    const repaired = await readFile(join(designDir, 'design.md'), 'utf-8')
    expect(repaired).toContain('NewClass')
    expect(repaired).not.toContain('OldClass')
  })

  test('returns failure when design.md not found', async () => {
    const projectDir = await setupProject()

    const result = await repairSymbolRefInDesign('no-feature', 'Old', 'New', projectDir)

    expect(result.success).toBe(false)
    expect(result.reason).toContain('Design directory not found')
  })
})

// --- Full repair flow ---

describe('Full repair flow', () => {
  test('DriftCheckResult -> executeRepair -> verify file content + repair log', async () => {
    const projectDir = await setupProject()
    const fileContent = 'const x = oldUtil()\nexport { oldUtil }\n'
    await setupSrcFile(projectDir, 'util.ts', fileContent)

    const driftResult: DriftCheckResult = {
      item: 'oldUtil',
      type: 'symbol',
      contractReference: 'design-spec-v2',
      actualValue: 'oldUtil',
      reason: 'Function rename required for API consistency',
      suggestedFix: 'oldUtil->newUtil',
    }

    const repairResult = await executeRepair(
      driftResult,
      'src/util.ts',
      projectDir,
      'full-flow-feature',
    )

    // Verify repair succeeded
    expect(repairResult.success).toBe(true)
    expect(repairResult.filePath).toBe('src/util.ts')

    // Verify file content
    const repairedContent = await readFile(join(projectDir, 'src', 'util.ts'), 'utf-8')
    expect(repairedContent).toBe('const x = newUtil()\nexport { newUtil }\n')
    expect(repairedContent).not.toContain('oldUtil')

    // Verify repair log
    const repairs = await readGuardianRepairs(projectDir)
    expect(repairs).toHaveLength(1)
    expect(repairs[0]!.feature).toBe('full-flow-feature')
    expect(repairs[0]!.filePath).toBe('src/util.ts')
    expect(repairs[0]!.disposition).toBe('auto_repaired')
    expect(repairs[0]!.originalSegment).toBe(fileContent)
    expect(repairs[0]!.repairedSegment).toBe('const x = newUtil()\nexport { newUtil }\n')
    expect(repairs[0]!.reason).toBe('Function rename required for API consistency')

    // Verify repair result has the record
    expect(repairResult.repairRecord).toBeDefined()
    expect(repairResult.repairRecord!.feature).toBe('full-flow-feature')
  })
})
