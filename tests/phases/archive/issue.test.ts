import { describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  generateAdHocIssueArtifacts,
  writeIssueResolution,
} from '../../../src/phases/archive/issue.js'
import type { ArchiveFileChange } from '../../../src/phases/archive/types.js'

const changes: ArchiveFileChange[] = [
  { filePath: 'src/example.ts', tool: 'edit' },
]

describe('archive issue artifacts', () => {
  test('writeIssueResolution generates issue-resolution from clarification sections', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'openflow-archive-issue-'))
    const workspace = join(dir, 'workspace')
    const archiveDir = join(dir, 'archive')
    await mkdir(workspace, { recursive: true })
    await mkdir(archiveDir, { recursive: true })
    const clarificationPath = join(workspace, 'issue-clarification.md')
    await writeFile(clarificationPath, '# Issue Clarification\n\n## Issue Intake\nObserved bug\n\n## Next Action Gate\nFix accepted\n', 'utf-8')

    await writeIssueResolution({
      projectDir: dir,
      archiveDir,
      feature: 'issue-feature',
      mode: 'issue',
      issueClarificationPath: clarificationPath,
      promotionCandidatePath: null,
      acceptanceState: null,
      changes,
    })

    const resolution = await readFile(join(archiveDir, 'issue-resolution.md'), 'utf-8')
    expect(resolution).toContain('# Issue Resolution')
    expect(resolution).toContain('Observed bug')
    expect(resolution).toContain('archive mode: issue')
    expect(resolution).toContain('src/example.ts')

    await rm(dir, { recursive: true, force: true })
  })

  test('generateAdHocIssueArtifacts writes clarification and resolution', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'openflow-archive-issue-'))
    await mkdir(dir, { recursive: true })

    await generateAdHocIssueArtifacts({ writeDir: dir, feature: 'ad-hoc-bug', changes })

    expect(await readFile(join(dir, 'issue-clarification.md'), 'utf-8')).toContain('ad-hoc-bug')
    const resolution = await readFile(join(dir, 'issue-resolution.md'), 'utf-8')
    expect(resolution).toContain('archive mode: ad-hoc')
    expect(resolution).toContain('src/example.ts')

    await rm(dir, { recursive: true, force: true })
  })
})
