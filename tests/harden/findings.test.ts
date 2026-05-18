import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, test } from 'bun:test'
import { classifyFindings } from '../../src/utils/harden-utils.js'

const tempDirs: string[] = []

function writeDesignDoc(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'openflow-findings-'))
  tempDirs.push(dir)
  const filePath = join(dir, 'design.md')
  writeFileSync(filePath, content, 'utf8')
  return filePath
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('classifyFindings', () => {
  test('empty input returns empty arrays', () => {
    const result = classifyFindings('', [])
    expect(result.actionable).toHaveLength(0)
    expect(result.ambiguous).toHaveLength(0)
    expect(result.nonBlocking).toHaveLength(0)
    expect(result.style).toHaveLength(0)
  })

  test('whitespace-only input returns empty arrays', () => {
    const result = classifyFindings('   \n\n  ', [])
    expect(result.actionable).toHaveLength(0)
    expect(result.ambiguous).toHaveLength(0)
    expect(result.nonBlocking).toHaveLength(0)
    expect(result.style).toHaveLength(0)
  })

  test('blocking_bug with evidence stays actionable as must_fix', () => {
    const input = `Level: blocking_bug
Description: Null pointer dereference in src/utils/parser.ts
Evidence: Line 42 calls .parse() without null check
Files: src/utils/parser.ts`

    const result = classifyFindings(input, [])
    expect(result.actionable).toHaveLength(1)
    expect(result.actionable[0].level).toBe('blocking_bug')
    expect(result.actionable[0].disposition).toBe('must_fix')
    expect(result.ambiguous).toHaveLength(0)
  })

  test('blocking_bug without evidence is downgraded to ambiguous design_ambiguity', () => {
    const input = `Level: blocking_bug
Description: Crash can happen but reviewer gave no file or line evidence`

    const result = classifyFindings(input, [])
    expect(result.actionable).toHaveLength(0)
    expect(result.ambiguous).toHaveLength(1)
    expect(result.ambiguous[0].level).toBe('design_ambiguity')
    expect(result.ambiguous[0].disposition).toBe('needs_decision')
  })

  test('regression_risk with evidence stays actionable as must_fix', () => {
    const input = `Level: regression_risk
Description: Changing return type may break existing consumers
Evidence: src/types/index.ts exported interface changed
Files: src/types/index.ts`

    const result = classifyFindings(input, [])
    expect(result.actionable).toHaveLength(1)
    expect(result.actionable[0].level).toBe('regression_risk')
    expect(result.actionable[0].disposition).toBe('must_fix')
  })

  test('regression_risk without evidence becomes non-blocking design_divergence', () => {
    const input = `Level: regression_risk
Description: Potential breakage in downstream consumers`

    const result = classifyFindings(input, [])
    expect(result.actionable).toHaveLength(0)
    expect(result.nonBlocking).toHaveLength(1)
    expect(result.nonBlocking[0].level).toBe('regression_risk')
    expect(result.nonBlocking[0].disposition).toBe('design_divergence')
  })

  test('design_ambiguity defaults to ambiguous design_divergence', () => {
    const input = `Level: design_ambiguity
Description: Design doc does not specify error handling strategy for network failures
Files: src/services/network.ts`

    const result = classifyFindings(input, [])
    expect(result.ambiguous).toHaveLength(1)
    expect(result.ambiguous[0].level).toBe('design_ambiguity')
    expect(result.ambiguous[0].disposition).toBe('design_divergence')
    expect(result.actionable).toHaveLength(0)
  })

  test('design_ambiguity with non-blocking evidence is candidate accepted_known_issue', () => {
    const input = `Level: design_ambiguity
Description: Retry count is not documented, but current behavior is acceptable
Evidence: Behavior is acceptable and does not affect functionality in src/services/network.ts
Files: src/services/network.ts`

    const result = classifyFindings(input, [])
    expect(result.ambiguous).toHaveLength(0)
    expect(result.nonBlocking).toHaveLength(1)
    expect(result.nonBlocking[0].disposition).toBe('accepted_known_issue')
  })

  test('test_gap defaults to non-blocking needs_decision', () => {
    const input = `Level: test_gap
Description: No tests for the new validation logic
Files: src/utils/validator.ts`

    const result = classifyFindings(input, [])
    expect(result.nonBlocking).toHaveLength(1)
    expect(result.nonBlocking[0].level).toBe('test_gap')
    expect(result.nonBlocking[0].disposition).toBe('needs_decision')
  })

  test('test gap beyond design scope is classified as false_positive', () => {
    const input = `Level: test_gap
Description: Missing test for error handling edge case not in design
Evidence: No test for timeout scenario; this edge case is beyond design scope and outside design scope
Files: tests/unit.test.ts`

    const result = classifyFindings(input, [])
    expect(result.actionable).toHaveLength(0)
    expect(result.nonBlocking).toHaveLength(1)
    expect(result.nonBlocking[0].disposition).toBe('false_positive')
  })

  test('style_or_preference is discarded', () => {
    const input = `Level: style_or_preference
Description: Consider using single quotes instead of double quotes
Files: src/utils/formatter.ts`

    const result = classifyFindings(input, [])
    expect(result.actionable).toHaveLength(0)
    expect(result.ambiguous).toHaveLength(0)
    expect(result.nonBlocking).toHaveLength(0)
    expect(result.style).toHaveLength(0)
  })

  test('directory structure preference is classified as style_or_preference and discarded', () => {
    const input = `Level: spec_violation
Description: File should be in src/utils/ not src/helpers/
Evidence: File exists at src/helpers/thing.ts
Files: src/helpers/thing.ts`

    const result = classifyFindings(input, [])
    expect(result.actionable).toHaveLength(0)
    expect(result.ambiguous).toHaveLength(0)
    expect(result.nonBlocking).toHaveLength(0)
    expect(result.style).toHaveLength(0)
  })

  test('reviewer suggesting extra steps not in design is classified as design_divergence', () => {
    const designPath = writeDesignDoc(`
# Design

- Route handler should persist the request payload.
- API should return the saved entity.
`)

    const input = `Level: spec_violation
Description: Implementation should add input validation middleware
Evidence: No validation middleware found
Files: src/routes.ts`

    const result = classifyFindings(input, [designPath])
    expect(result.actionable).toHaveLength(0)
    expect(result.ambiguous).toHaveLength(1)
    expect(result.ambiguous[0].level).toBe('design_ambiguity')
    expect(result.ambiguous[0].disposition).toBe('design_divergence')
  })

  test('findings with same meaning but different wording are normalized to single finding', () => {
    const input = `Level: spec_violation
Description: API response body does not match spec
Evidence: src/api.ts line 45 returns the wrong payload shape
Files: src/api.ts

Level: spec_violation
Description: API response payload doesn't match spec
Evidence: src/api.ts line 45 returns the wrong response body
Files: src/api.ts`

    const result = classifyFindings(input, [])
    expect(result.ambiguous).toHaveLength(1)
    expect(result.ambiguous[0].repeatCount).toBe(2)
  })

  test('spec_violation without evidence is downgraded to design_ambiguity', () => {
    const input = `Level: spec_violation
Description: API response format doesn't match spec
Evidence:
Files:`

    const result = classifyFindings(input, [])
    expect(result.actionable).toHaveLength(0)
    expect(result.ambiguous).toHaveLength(1)
    expect(result.ambiguous[0].level).toBe('design_ambiguity')
  })

  test('spec_violation with design support and clear evidence stays as must_fix', () => {
    const designPath = writeDesignDoc(`
# API design

- API client must handle 404 responses with an explicit error result.
- The response formatter must preserve the documented error shape.
`)

    const input = `Level: spec_violation
Description: Missing error handling for 404
Evidence: Line 45 in src/api.ts does not handle 404 response
Files: src/api.ts`

    const result = classifyFindings(input, [designPath])
    expect(result.actionable).toHaveLength(1)
    expect(result.actionable[0].level).toBe('spec_violation')
    expect(result.actionable[0].disposition).toBe('must_fix')
    expect(result.ambiguous).toHaveLength(0)
  })

  test('spec_violation with design support but no evidence becomes needs_decision', () => {
    const designPath = writeDesignDoc(`
# API design

- API response format must include an explicit error code field.
`)

    const input = `Level: spec_violation
Description: API response format is missing error code field`

    const result = classifyFindings(input, [designPath])
    expect(result.actionable).toHaveLength(0)
    expect(result.ambiguous).toHaveLength(1)
    expect(result.ambiguous[0].level).toBe('design_ambiguity')
    expect(result.ambiguous[0].disposition).toBe('needs_decision')
  })

  test('multiple findings are correctly categorized with dispositions', () => {
    const designPath = writeDesignDoc(`
# Design

- Client must handle 404 responses explicitly.
`)

    const input = `Level: blocking_bug
Description: Crash on null input
Evidence: src/parser.ts line 10 dereferences null
Files: src/parser.ts

Level: spec_violation
Description: Missing error handling for 404
Evidence: src/client.ts line 21 does not handle 404 response
Files: src/client.ts

Level: design_ambiguity
Description: Retry count is unclear in the design
Files: src/retry.ts

Level: test_gap
Description: Missing test for timeout scenario beyond design scope
Evidence: No test for timeout scenario; outside design scope
Files: tests/client.test.ts

Level: style_or_preference
Description: Use const instead of let
Files: src/main.ts`

    const result = classifyFindings(input, [designPath])
    expect(result.actionable).toHaveLength(2)
    expect(result.actionable.map(item => item.disposition)).toEqual(['must_fix', 'must_fix'])
    expect(result.ambiguous).toHaveLength(1)
    expect(result.ambiguous[0].disposition).toBe('design_divergence')
    expect(result.nonBlocking).toHaveLength(1)
    expect(result.nonBlocking[0].disposition).toBe('false_positive')
    expect(result.style).toHaveLength(0)
  })

  test('NO_FINDINGS returns empty arrays', () => {
    const result = classifyFindings('NO_FINDINGS', [])
    expect(result.actionable).toHaveLength(0)
    expect(result.ambiguous).toHaveLength(0)
    expect(result.nonBlocking).toHaveLength(0)
    expect(result.style).toHaveLength(0)
  })

  test('plain text without evidence is rejected', () => {
    const text = 'This is a plain text review without any level markers or finding blocks.'
    const result = classifyFindings(text, [])
    expect(result.actionable).toHaveLength(0)
    expect(result.ambiguous).toHaveLength(0)
    expect(result.nonBlocking).toHaveLength(0)
  })

  test('plain text with file evidence falls back to actionable must_fix', () => {
    const text = 'This review found a crash in src/parser.ts when input is null.'
    const result = classifyFindings(text, [])
    expect(result.actionable).toHaveLength(1)
    expect(result.actionable[0].level).toBe('blocking_bug')
    expect(result.actionable[0].disposition).toBe('must_fix')
    expect(result.actionable[0].files).toContain('src/parser.ts')
  })
})
