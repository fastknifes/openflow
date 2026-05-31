import { test, expect, describe } from 'bun:test'
import {
  issueSlug,
  resolveIssueWorkspace,
  buildIssuePacket,
  buildIssueResolution,
  ISSUE_CLARIFICATION_FILENAME,
  PROMOTION_CANDIDATE_FILENAME,
  ISSUE_RESOLUTION_FILENAME,
} from '../../src/utils/issue-utils.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe('constants', () => {
  test('ISSUE_CLARIFICATION_FILENAME', () => {
    expect(ISSUE_CLARIFICATION_FILENAME).toBe('issue-clarification.md')
  })

  test('PROMOTION_CANDIDATE_FILENAME', () => {
    expect(PROMOTION_CANDIDATE_FILENAME).toBe('promotion-candidate.md')
  })

  test('ISSUE_RESOLUTION_FILENAME', () => {
    expect(ISSUE_RESOLUTION_FILENAME).toBe('issue-resolution.md')
  })
})

// ---------------------------------------------------------------------------
// issueSlug
// ---------------------------------------------------------------------------
describe('issueSlug', () => {
  test('slugifies normal text to lowercase with hyphens', () => {
    expect(issueSlug('My Bug Report')).toBe('my-bug-report')
  })

  test('slugifies text with special characters', () => {
    expect(issueSlug('foo_bar/baz!qux')).toBe('foo-bar-baz-qux')
  })

  test('collapses consecutive hyphens', () => {
    expect(issueSlug('hello   world')).toBe('hello-world')
  })

  test('trims leading/trailing hyphens', () => {
    expect(issueSlug('--hello--')).toBe('hello')
  })

  test('slugifies Chinese text — non-alpha become hyphens', () => {
    // Chinese characters are not [a-z0-9-], so they become hyphens;
    // leading hyphens are trimmed by the slug logic
    const result = issueSlug('修复 Bug')
    expect(result).toBe('bug')
  })

  test('throws on empty string', () => {
    expect(() => issueSlug('')).toThrow()
  })

  test('throws on whitespace only', () => {
    expect(() => issueSlug('   ')).toThrow()
  })

  test('throws on non-string input', () => {
    // @ts-expect-error — intentionally wrong type
    expect(() => issueSlug(123)).toThrow()
  })

  test('throws when slugified result is too short (< 2 chars)', () => {
    expect(() => issueSlug('a')).toThrow(/too short/i)
  })

  test('returns a valid slug for typical bug description', () => {
    expect(issueSlug('Null pointer in auth middleware')).toBe('null-pointer-in-auth-middleware')
  })
})

// ---------------------------------------------------------------------------
// resolveIssueWorkspace
// ---------------------------------------------------------------------------
describe('resolveIssueWorkspace', () => {
  test('returns { slug, workspacePath }', () => {
    const result = resolveIssueWorkspace({ directory: '/project' }, 'Login crash')
    expect(result).toHaveProperty('slug')
    expect(result).toHaveProperty('workspacePath')
  })

  test('workspacePath includes date prefix (YYYY-MM-DD-slug)', () => {
    const result = resolveIssueWorkspace({ directory: '/project' }, 'Login crash')
    const datePattern = /\d{4}-\d{2}-\d{2}-login-crash$/
    expect(result.workspacePath).toMatch(datePattern)
    expect(result.slug).toBe('login-crash')
  })

  test('uses default changesDir (docs/changes)', () => {
    const result = resolveIssueWorkspace({ directory: '/project' }, 'Bug fix')
    expect(result.workspacePath).toContain('docs/changes/')
  })

  test('supports custom changesDir', () => {
    const result = resolveIssueWorkspace({ directory: '/project' }, 'Bug fix', 'custom/dir')
    expect(result.workspacePath).toContain('custom/dir/')
    expect(result.workspacePath).not.toContain('docs/changes')
  })

  test('handles directory with trailing slash', () => {
    const result = resolveIssueWorkspace({ directory: '/project/' }, 'Test bug')
    expect(result.workspacePath).not.toContain('//')
  })
})

// ---------------------------------------------------------------------------
// buildIssuePacket
// ---------------------------------------------------------------------------
describe('buildIssuePacket', () => {
  test('minimal input (slug + symptom) produces full packet with defaults', () => {
    const packet = buildIssuePacket({ slug: 'login-crash', symptom: 'App crashes on login' })
    expect(packet.version).toBe(1)
    expect(packet.slug).toBe('login-crash')
    expect(packet.symptom).toBe('App crashes on login')
    expect(packet.environment).toBe('local')
    expect(packet.status).toBe('reported')
    expect(packet.classification).toBe('cannot_determine')
    expect(packet.confidence).toBe('low')
    expect(packet.evidence).toHaveLength(1)
    expect(packet.evidence[0]).toEqual({ source: 'user_report', summary: 'App crashes on login' })
    expect(packet.requiredChecks).toEqual(['openflow-quality-gate'])
    expect(packet.createdAt).toBeTruthy()
    expect(packet.updatedAt).toBeTruthy()
  })

  test('classification defaults to cannot_determine', () => {
    const packet = buildIssuePacket({ slug: 'test', symptom: 'bug' })
    expect(packet.classification).toBe('cannot_determine')
  })

  test('confidence is low when classification is cannot_determine', () => {
    const packet = buildIssuePacket({ slug: 'test', symptom: 'bug' })
    expect(packet.confidence).toBe('low')
  })

  test('confidence is medium when classification is known', () => {
    const packet = buildIssuePacket({ slug: 'test', symptom: 'bug', classification: 'bugfix' })
    expect(packet.confidence).toBe('medium')
  })

  test('hypotheses differ based on classification', () => {
    const unknown = buildIssuePacket({ slug: 'test', symptom: 'bug' })
    expect(unknown.hypotheses[0]).toContain('not confirmed')

    const known = buildIssuePacket({ slug: 'test', symptom: 'bug', classification: 'config_issue' })
    expect(known.hypotheses[0]).toContain('config_issue')
  })

  test('recommendedAction differs based on classification', () => {
    const unknown = buildIssuePacket({ slug: 'test', symptom: 'bug' })
    expect(unknown.recommendedAction).toContain('read-only')

    const known = buildIssuePacket({ slug: 'test', symptom: 'bug', classification: 'bugfix' })
    expect(known.recommendedAction).toContain('confirmed classification')
  })

  test('sessionID is optional — omitted when not provided', () => {
    const packet = buildIssuePacket({ slug: 'test', symptom: 'bug' })
    expect(packet.sessionID).toBeUndefined()
  })

  test('sessionID is included when provided', () => {
    const packet = buildIssuePacket({ slug: 'test', symptom: 'bug', sessionID: 'sess_abc123' })
    expect(packet.sessionID).toBe('sess_abc123')
  })

  test('now timestamp can be overridden', () => {
    const fixedTime = '2025-01-15T10:00:00.000Z'
    const packet = buildIssuePacket({ slug: 'test', symptom: 'bug', now: fixedTime })
    expect(packet.createdAt).toBe(fixedTime)
    expect(packet.updatedAt).toBe(fixedTime)
  })

  test('symptom defaults to slug when empty', () => {
    const packet = buildIssuePacket({ slug: 'test-bug', symptom: '' })
    expect(packet.symptom).toBe('test-bug')
    expect(packet.evidence).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// buildIssueResolution
// ---------------------------------------------------------------------------
describe('buildIssueResolution', () => {
  const minimalInput = {
    symptom: 'App crashes on startup',
    rootCause: 'Missing config file',
    fixSummary: 'Added fallback config loading',
  }

  test('required fields produce valid markdown', () => {
    const md = buildIssueResolution(minimalInput)
    expect(md).toContain('# Issue Resolution')
    expect(md).toContain('## Symptom')
    expect(md).toContain('App crashes on startup')
    expect(md).toContain('## Root Cause')
    expect(md).toContain('Missing config file')
    expect(md).toContain('## Fix Summary')
    expect(md).toContain('Added fallback config loading')
  })

  test('optional fields default to placeholder text when omitted', () => {
    const md = buildIssueResolution(minimalInput)
    expect(md).toContain('_No files recorded._')
    expect(md).toContain('_No verification evidence recorded._')
    expect(md).toContain('_No recurrence signature recorded.')
    expect(md).toContain('_No AI guidance recorded.')
  })

  test('filesInvolved rendered as markdown list', () => {
    const md = buildIssueResolution({
      ...minimalInput,
      filesInvolved: ['src/config.ts', 'src/index.ts'],
    })
    expect(md).toContain('- src/config.ts')
    expect(md).toContain('- src/index.ts')
    expect(md).not.toContain('_No files recorded._')
  })

  test('empty filesInvolved falls back to placeholder', () => {
    const md = buildIssueResolution({
      ...minimalInput,
      filesInvolved: ['', '  '],
    })
    expect(md).toContain('_No files recorded._')
  })

  test('verification evidence uses provided value', () => {
    const md = buildIssueResolution({
      ...minimalInput,
      verificationEvidence: 'Tests pass, manual check OK',
    })
    expect(md).toContain('Tests pass, manual check OK')
    expect(md).not.toContain('_No verification evidence recorded._')
  })

  test('recurrence signature uses provided value', () => {
    const md = buildIssueResolution({
      ...minimalInput,
      recurrenceSignature: 'Look for crash on boot',
    })
    expect(md).toContain('Look for crash on boot')
  })

  test('future AI guidance uses provided value', () => {
    const md = buildIssueResolution({
      ...minimalInput,
      futureAIGuidance: 'Check config first',
    })
    expect(md).toContain('Check config first')
  })

  test('markdown headings in content are demoted to bold', () => {
    const md = buildIssueResolution({
      symptom: '## Detailed symptom\nSome text',
      rootCause: '### Nested cause',
      fixSummary: '#### Deep heading fix',
    })
    // Headings should be converted to bold, not remain as ## lines
    expect(md).toContain('**Detailed symptom**')
    expect(md).not.toMatch(/## Detailed symptom/)
    expect(md).toContain('**Nested cause**')
    expect(md).toContain('**Deep heading fix**')
  })

  test('excessive newlines are collapsed', () => {
    const md = buildIssueResolution({
      ...minimalInput,
      verificationEvidence: 'Line 1\n\n\n\n\nLine 2',
    })
    // Should not have 3+ consecutive newlines
    expect(md).not.toMatch(/\n{3,}/)
  })
})
