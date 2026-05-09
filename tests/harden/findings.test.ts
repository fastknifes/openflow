import { describe, expect, test } from 'bun:test'
import { classifyFindings } from '../../src/utils/harden-utils.js'

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
  })

  test('finding with blocking_bug level goes to actionable', () => {
    const input = `Level: blocking_bug
Description: Null pointer dereference in src/utils/parser.ts
Evidence: Line 42 calls .parse() without null check
Files: src/utils/parser.ts`

    const result = classifyFindings(input, [])
    expect(result.actionable).toHaveLength(1)
    expect(result.actionable[0].level).toBe('blocking_bug')
    expect(result.ambiguous).toHaveLength(0)
    expect(result.nonBlocking).toHaveLength(0)
  })

  test('finding with spec_violation level goes to actionable', () => {
    const input = `Level: spec_violation
Description: Implementation uses synchronous API where spec requires async
Evidence: src/api/client.ts line 15
Files: src/api/client.ts`

    const result = classifyFindings(input, [])
    expect(result.actionable).toHaveLength(1)
    expect(result.actionable[0].level).toBe('spec_violation')
  })

  test('finding with regression_risk goes to actionable', () => {
    const input = `Level: regression_risk
Description: Changing return type may break existing consumers
Evidence: src/types/index.ts exported interface changed
Files: src/types/index.ts`

    const result = classifyFindings(input, [])
    expect(result.actionable).toHaveLength(1)
    expect(result.actionable[0].level).toBe('regression_risk')
  })

  test('finding with regression_risk without evidence is rejected', () => {
    const input = `Level: regression_risk
Description: Potential breakage in downstream consumers`

    const result = classifyFindings(input, [])
    expect(result.actionable).toHaveLength(0)
    expect(result.ambiguous).toHaveLength(0)
    expect(result.nonBlocking).toHaveLength(0)
  })

  test('finding with design_ambiguity goes to ambiguous', () => {
    const input = `Level: design_ambiguity
Description: Design doc does not specify error handling strategy for network failures
Files: src/services/network.ts`

    const result = classifyFindings(input, [])
    expect(result.ambiguous).toHaveLength(1)
    expect(result.ambiguous[0].level).toBe('design_ambiguity')
    expect(result.actionable).toHaveLength(0)
  })

  test('finding with test_gap goes to nonBlocking', () => {
    const input = `Level: test_gap
Description: No tests for the new validation logic
Files: src/utils/validator.ts`

    const result = classifyFindings(input, [])
    expect(result.nonBlocking).toHaveLength(1)
    expect(result.nonBlocking[0].level).toBe('test_gap')
    expect(result.actionable).toHaveLength(0)
  })

  test('finding with style_or_preference is discarded', () => {
    const input = `Level: style_or_preference
Description: Consider using single quotes instead of double quotes
Files: src/utils/formatter.ts`

    const result = classifyFindings(input, [])
    expect(result.actionable).toHaveLength(0)
    expect(result.ambiguous).toHaveLength(0)
    expect(result.nonBlocking).toHaveLength(0)
    expect(result.style).toHaveLength(0)
  })

  test('multiple findings are correctly categorized', () => {
    const input = `Level: blocking_bug
Description: Crash on null input
Files: src/parser.ts

Level: design_ambiguity
Description: Unclear retry policy
Files: src/client.ts

Level: test_gap
Description: Missing unit tests
Files: src/handler.ts

Level: style_or_preference
Description: Use const instead of let
Files: src/main.ts`

    const result = classifyFindings(input, [])
    expect(result.actionable).toHaveLength(1)
    expect(result.actionable[0].level).toBe('blocking_bug')
    expect(result.ambiguous).toHaveLength(1)
    expect(result.ambiguous[0].level).toBe('design_ambiguity')
    expect(result.nonBlocking).toHaveLength(1)
    expect(result.nonBlocking[0].level).toBe('test_gap')
    expect(result.style).toHaveLength(0)
  })

  test('finding levels without evidence are all rejected', () => {
    const input = `Level: blocking_bug
Description: Missing evidence should reject this finding

Level: spec_violation
Description: Missing evidence should reject this too

Level: test_gap
Description: Missing evidence should reject non-blocking findings too`

    const result = classifyFindings(input, [])
    expect(result.actionable).toHaveLength(0)
    expect(result.ambiguous).toHaveLength(0)
    expect(result.nonBlocking).toHaveLength(0)
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

  test('plain text with file evidence falls back to actionable', () => {
    const text = 'This review found a crash in src/parser.ts when input is null.'
    const result = classifyFindings(text, [])
    expect(result.actionable).toHaveLength(1)
    expect(result.actionable[0].level).toBe('blocking_bug')
    expect(result.actionable[0].files).toContain('src/parser.ts')
  })
})
