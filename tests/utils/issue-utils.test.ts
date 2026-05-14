import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  issueSlug,
  resolveIssueWorkspace,
  detectMode,
  buildIssueResolution,
  ISSUE_CLARIFICATION_FILENAME,
  PROMOTION_CANDIDATE_FILENAME,
  ISSUE_RESOLUTION_FILENAME,
  type IssueMode,
  type IssueResolutionInput,
} from '../../src/utils/issue-utils'

describe('issue-utils constants', () => {
  test('ISSUE_CLARIFICATION_FILENAME is correct', () => {
    expect(ISSUE_CLARIFICATION_FILENAME).toBe('issue-clarification.md')
  })

  test('PROMOTION_CANDIDATE_FILENAME is correct', () => {
    expect(PROMOTION_CANDIDATE_FILENAME).toBe('promotion-candidate.md')
  })

  test('ISSUE_RESOLUTION_FILENAME is correct', () => {
    expect(ISSUE_RESOLUTION_FILENAME).toBe('issue-resolution.md')
  })
})

describe('issueSlug', () => {
  test('should lowercase and replace spaces with hyphens', () => {
    expect(issueSlug('User Login Problem')).toBe('user-login-problem')
  })

  test('should throw on Chinese-only text (no latin chars survive)', () => {
    // All Chinese chars become hyphens, then collapse to empty → too short
    expect(() => issueSlug('用户登录问题')).toThrow('too short after slugification')
  })

  test('should handle mixed Chinese and English', () => {
    // "bug修复" → only "bug" is kept as alnum, rest becomes hyphens
    expect(issueSlug('bug修复')).toBe('bug')
  })

  test('should replace URLs and special chars with hyphens', () => {
    expect(issueSlug('https://example.com/issue')).toBe('https-example-com-issue')
  })

  test('should handle punctuation', () => {
    expect(issueSlug('fix: data loading error!')).toBe('fix-data-loading-error')
  })

  test('should collapse consecutive hyphens', () => {
    expect(issueSlug('hello   world')).toBe('hello-world')
  })

  test('should trim leading and trailing hyphens', () => {
    expect(issueSlug('  --hello-- ')).toBe('hello')
  })

  test('should throw on empty input', () => {
    expect(() => issueSlug('')).toThrow('Issue text is required')
  })

  test('should throw on whitespace-only input', () => {
    expect(() => issueSlug('   ')).toThrow('Issue text cannot be empty')
  })

  test('should throw on too short after sanitization', () => {
    expect(() => issueSlug('用户')).toThrow('too short after slugification')
  })

  test('should throw on null input', () => {
    expect(() => issueSlug(null as unknown as string)).toThrow('Issue text is required')
  })
})

describe('resolveIssueWorkspace', () => {
  const mockCtx = { directory: '/project/root' }

  test('should return slug and workspacePath with date prefix', () => {
    const result = resolveIssueWorkspace(mockCtx, 'login-bug')
    expect(result.slug).toBe('login-bug')
    // Should contain YYYY-MM-DD-login-bug
    expect(result.workspacePath).toMatch(/\/docs\/changes\/\d{4}-\d{2}-\d{2}-login-bug$/)
  })

  test('should slugify raw text before building path', () => {
    const result = resolveIssueWorkspace(mockCtx, 'Fix: Data Loading Error!')
    expect(result.slug).toBe('fix-data-loading-error')
    expect(result.workspacePath).toMatch(/\/docs\/changes\/\d{4}-\d{2}-\d{2}-fix-data-loading-error$/)
  })

  test('should use ctx.directory as base', () => {
    const result = resolveIssueWorkspace(mockCtx, 'test-issue')
    expect(result.workspacePath).toContain('/project/root')
  })

  test('should handle directory with trailing slash', () => {
    const result = resolveIssueWorkspace({ directory: '/project/root/' }, 'test-issue')
    expect(result.workspacePath).toBe(`/project/root/docs/changes/${result.workspacePath.split('/').pop()}`)
  })
})

describe('detectMode', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'issue-utils-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function setupWorkspace(name: string, files: string[]): Promise<void> {
    const wsDir = path.join(tmpDir, 'docs', 'changes', name)
    await fs.mkdir(wsDir, { recursive: true })
    for (const file of files) {
      await fs.writeFile(path.join(wsDir, file), '# test')
    }
  }

  async function setupDatedWorkspace(name: string, files: string[]): Promise<void> {
    const datePrefix = '2026-05-09'
    const changeDir = `${datePrefix}-${name}`
    const wsDir = path.join(tmpDir, 'docs', 'changes', changeDir)
    await fs.mkdir(wsDir, { recursive: true })
    for (const file of files) {
      await fs.writeFile(path.join(wsDir, file), '# test')
    }
    const indexPath = path.join(tmpDir, '.sisyphus', 'change-units.json')
    await fs.mkdir(path.dirname(indexPath), { recursive: true })
    const index = {
      version: 1,
      byFeature: { [name]: { changeDir } },
    }
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8')
  }

  test('should return "feature" when neither design nor clarification exists', async () => {
    await setupWorkspace('my-feature', ['requirements.md'])
    const mode = await detectMode({ directory: tmpDir }, 'my-feature')
    expect(mode).toBe('feature')
  })

  test('should return "feature" when workspace does not exist at all', async () => {
    const mode = await detectMode({ directory: tmpDir }, 'nonexistent')
    expect(mode).toBe('feature')
  })

  test('should return "issue" when only issue-clarification exists', async () => {
    await setupWorkspace('my-issue', [ISSUE_CLARIFICATION_FILENAME])
    const mode = await detectMode({ directory: tmpDir }, 'my-issue')
    expect(mode).toBe('issue')
  })

  test('should return "feature" when only design exists', async () => {
    await setupWorkspace('my-feature', ['design.md'])
    const mode = await detectMode({ directory: tmpDir }, 'my-feature')
    expect(mode).toBe('feature')
  })

  test('should return "mixed" when both design and clarification exist', async () => {
    await setupWorkspace('mixed-workspace', ['design.md', ISSUE_CLARIFICATION_FILENAME])
    const mode = await detectMode({ directory: tmpDir }, 'mixed-workspace')
    expect(mode).toBe('mixed')
  })

  test('should resolve date-prefixed workspace for feature mode', async () => {
    await setupDatedWorkspace('dated-feature', ['design.md'])
    const mode = await detectMode({ directory: tmpDir }, 'dated-feature')
    expect(mode).toBe('feature')
  })

  test('should resolve date-prefixed workspace for issue mode', async () => {
    await setupDatedWorkspace('dated-issue', [ISSUE_CLARIFICATION_FILENAME])
    const mode = await detectMode({ directory: tmpDir }, 'dated-issue')
    expect(mode).toBe('issue')
  })

  test('should resolve date-prefixed workspace for mixed mode', async () => {
    await setupDatedWorkspace('dated-mixed', ['design.md', ISSUE_CLARIFICATION_FILENAME])
    const mode = await detectMode({ directory: tmpDir }, 'dated-mixed')
    expect(mode).toBe('mixed')
  })

  test('should fallback to raw name when no index entry exists', async () => {
    await setupWorkspace('fallback-feature', ['design.md'])
    const mode = await detectMode({ directory: tmpDir }, 'fallback-feature')
    expect(mode).toBe('feature')
  })
})

// ---------------------------------------------------------------------------
// buildIssueResolution
// ---------------------------------------------------------------------------

const REQUIRED_HEADINGS = [
  '## Symptom',
  '## Root Cause',
  '## Fix Summary',
  '## Files Involved',
  '## Verification Evidence',
  '## Recurrence Signature',
  '## Future AI Guidance',
]

const FULL_INPUT: IssueResolutionInput = {
  symptom: 'API returns 500 on login',
  rootCause: 'Null pointer in auth middleware when session cookie is missing',
  fixSummary: 'Added null guard in auth middleware to handle missing session cookie',
  filesInvolved: ['src/auth/middleware.ts', 'tests/auth/middleware.test.ts'],
  verificationEvidence: 'All 42 tests pass; manual login with cleared cookies works',
  recurrenceSignature: '500 on any auth-protected route when cookies are cleared',
  futureAIGuidance: 'Check auth middleware null guards first when seeing 500s on protected routes',
}

describe('buildIssueResolution', () => {
  test('contains all required headings', () => {
    const md = buildIssueResolution(FULL_INPUT)
    for (const heading of REQUIRED_HEADINGS) {
      expect(md).toContain(heading)
    }
  })

  test('includes document title', () => {
    const md = buildIssueResolution(FULL_INPUT)
    expect(md).toContain('# Issue Resolution')
  })

  test('renders symptom from input', () => {
    const md = buildIssueResolution(FULL_INPUT)
    expect(md).toContain('API returns 500 on login')
  })

  test('renders root cause from input', () => {
    const md = buildIssueResolution(FULL_INPUT)
    expect(md).toContain('Null pointer in auth middleware')
  })

  test('renders fix summary from input', () => {
    const md = buildIssueResolution(FULL_INPUT)
    expect(md).toContain('Added null guard in auth middleware')
  })

  test('renders files involved as list items', () => {
    const md = buildIssueResolution(FULL_INPUT)
    expect(md).toContain('- src/auth/middleware.ts')
    expect(md).toContain('- tests/auth/middleware.test.ts')
  })

  test('renders verification evidence from input', () => {
    const md = buildIssueResolution(FULL_INPUT)
    expect(md).toContain('All 42 tests pass')
  })

  test('renders recurrence signature from input', () => {
    const md = buildIssueResolution(FULL_INPUT)
    expect(md).toContain('500 on any auth-protected route')
  })

  test('renders future AI guidance from input', () => {
    const md = buildIssueResolution(FULL_INPUT)
    expect(md).toContain('Check auth middleware null guards first')
  })
})

describe('buildIssueResolution fallbacks', () => {
  const MINIMAL_INPUT: IssueResolutionInput = {
    symptom: 'Login page blank',
    rootCause: 'Missing CSS import',
    fixSummary: 'Added missing import',
  }

  test('renders files involved fallback when omitted', () => {
    const md = buildIssueResolution(MINIMAL_INPUT)
    expect(md).toContain('_No files recorded._')
  })

  test('renders verification evidence fallback when omitted', () => {
    const md = buildIssueResolution(MINIMAL_INPUT)
    expect(md).toContain('_No verification evidence recorded._')
  })

  test('renders recurrence signature fallback when omitted', () => {
    const md = buildIssueResolution(MINIMAL_INPUT)
    expect(md).toContain('_No recurrence signature recorded.')
  })

  test('renders future AI guidance fallback when omitted', () => {
    const md = buildIssueResolution(MINIMAL_INPUT)
    expect(md).toContain('_No AI guidance recorded.')
  })

  test('renders files involved fallback when array is empty', () => {
    const md = buildIssueResolution({ ...MINIMAL_INPUT, filesInvolved: [] })
    expect(md).toContain('_No files recorded._')
  })

  test('renders fallback when optional field is empty string', () => {
    const md = buildIssueResolution({ ...MINIMAL_INPUT, verificationEvidence: '   ' })
    expect(md).toContain('_No verification evidence recorded._')
  })

  test('all required headings still present with minimal input', () => {
    const md = buildIssueResolution(MINIMAL_INPUT)
    for (const heading of REQUIRED_HEADINGS) {
      expect(md).toContain(heading)
    }
  })
})

describe('buildIssueResolution heading safety', () => {
  test('demotes user heading lines to bold text', () => {
    const md = buildIssueResolution({
      symptom: '## Not a real section\nSome detail',
      rootCause: '### Nested heading',
      fixSummary: 'Fix applied',
    })
    expect(md).not.toMatch(/^## Not a real section$/m)
    expect(md).toContain('**Not a real section**')
    expect(md).toContain('**Nested heading**')
  })

  test('preserves non-heading markdown formatting', () => {
    const md = buildIssueResolution({
      symptom: 'Error: **critical** failure in `login()`',
      rootCause: 'Bad config',
      fixSummary: 'Fixed',
    })
    expect(md).toContain('**critical**')
    expect(md).toContain('`login()`')
  })

  test('collapses excessive blank lines', () => {
    const md = buildIssueResolution({
      symptom: 'Line 1\n\n\n\n\nLine 2',
      rootCause: 'Cause',
      fixSummary: 'Fix',
    })
    expect(md).not.toContain('\n\n\n\n')
  })

  test('filters out blank file entries', () => {
    const md = buildIssueResolution({
      symptom: 'Bug',
      rootCause: 'Cause',
      fixSummary: 'Fix',
      filesInvolved: ['src/a.ts', '   ', '', 'src/b.ts'],
    })
    expect(md).toContain('- src/a.ts')
    expect(md).toContain('- src/b.ts')
    // Blank entries should not produce list items
    expect(md).not.toContain('-    ')
  })
})
