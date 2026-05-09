import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  issueSlug,
  resolveIssueWorkspace,
  detectMode,
  ISSUE_CLARIFICATION_FILENAME,
  PROMOTION_CANDIDATE_FILENAME,
  ISSUE_RESOLUTION_FILENAME,
  type IssueMode,
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
})
