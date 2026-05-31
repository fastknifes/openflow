import { describe, test, expect } from 'bun:test'
import {
  normalizePath,
  isPlanFile,
  isDesignDoc,
  shouldTrackChange,
  isTestFile,
  isRuntimeCodeFile,
  isDesignOnlyFile,
  isPlanningOnlyFile,
  isMetadataOnlyFile,
  isDocsOnlyFile,
  isImplementationLikeFile,
  shouldPromptForAcceptanceDocSync,
  appendToolAfterPrompt,
} from '../../src/hooks/tool-after-policy.js'

describe('normalizePath', () => {
  test('lowercases the path', () => {
    expect(normalizePath('SRC/Foo/Bar.ts')).toBe('src/foo/bar.ts')
  })

  test('converts backslashes to forward slashes', () => {
    expect(normalizePath('src\\foo\\bar.ts')).toBe('src/foo/bar.ts')
  })

  test('handles mixed slashes and casing', () => {
    expect(normalizePath('SRC\\Foo/Bar.TS')).toBe('src/foo/bar.ts')
  })

  test('already normalized path stays the same', () => {
    expect(normalizePath('src/foo/bar.ts')).toBe('src/foo/bar.ts')
  })
})

describe('isPlanFile', () => {
  test('.sisyphus/plans/*.md returns true', () => {
    expect(isPlanFile('.sisyphus/plans/my-feature.md')).toBe(true)
  })

  test('.openflow/plans/*.md returns true', () => {
    expect(isPlanFile('.openflow/plans/my-feature.md')).toBe(true)
  })

  test('.opencode/plans/*.md returns true', () => {
    expect(isPlanFile('.opencode/plans/my-feature.md')).toBe(true)
  })

  test('docs/changes/*/plan.md returns true', () => {
    expect(isPlanFile('docs/changes/my-feature/plan.md')).toBe(true)
  })

  test('nested docs/changes/*/plan.md returns true', () => {
    expect(isPlanFile('docs/changes/2024-01-01-auth/plan.md')).toBe(true)
  })

  test('random .md file returns false', () => {
    expect(isPlanFile('docs/guide.md')).toBe(false)
  })

  test('src file returns false', () => {
    expect(isPlanFile('src/foo.ts')).toBe(false)
  })

  test('plan without .md extension returns false', () => {
    expect(isPlanFile('.sisyphus/plans/my-feature.txt')).toBe(false)
  })
})

describe('isDesignDoc', () => {
  test('proposal.md returns true', () => {
    expect(isDesignDoc('docs/changes/feature/proposal.md')).toBe(true)
  })

  test('design.md returns true', () => {
    expect(isDesignDoc('docs/changes/feature/design.md')).toBe(true)
  })

  test('decisions.md returns true', () => {
    expect(isDesignDoc('docs/changes/feature/decisions.md')).toBe(true)
  })

  test('dated variant 20240101-proposal.md returns true', () => {
    expect(isDesignDoc('docs/changes/feature/20240101-proposal.md')).toBe(true)
  })

  test('dated variant 20240101-design.md returns true', () => {
    expect(isDesignDoc('docs/changes/feature/20240101-design.md')).toBe(true)
  })

  test('dated variant 20240101-decisions.md returns true', () => {
    expect(isDesignDoc('docs/changes/feature/20240101-decisions.md')).toBe(true)
  })

  test('other .md returns false', () => {
    expect(isDesignDoc('docs/changes/feature/readme.md')).toBe(false)
  })

  test('plan.md returns false', () => {
    expect(isDesignDoc('docs/changes/feature/plan.md')).toBe(false)
  })
})

describe('shouldTrackChange', () => {
  test('node_modules/ returns false', () => {
    expect(shouldTrackChange('node_modules/foo/bar.ts')).toBe(false)
  })

  test('.sisyphus/ returns false', () => {
    expect(shouldTrackChange('.sisyphus/plans/feature.md')).toBe(false)
  })

  test('.openflow/ returns false', () => {
    expect(shouldTrackChange('.openflow/state.json')).toBe(false)
  })

  test('src/foo.ts returns true', () => {
    expect(shouldTrackChange('src/foo.ts')).toBe(true)
  })

  test('docs/guide.md returns true', () => {
    expect(shouldTrackChange('docs/guide.md')).toBe(true)
  })
})

describe('isTestFile', () => {
  test('tests/foo.test.ts returns true', () => {
    expect(isTestFile('tests/foo.test.ts')).toBe(true)
  })

  test('__tests__/bar.ts returns true', () => {
    expect(isTestFile('__tests__/bar.ts')).toBe(true)
  })

  test('test/ subdirectory returns true', () => {
    expect(isTestFile('test/unit/bar.ts')).toBe(true)
  })

  test('foo.spec.ts returns true', () => {
    expect(isTestFile('src/foo.spec.ts')).toBe(true)
  })

  test('src/foo.ts returns false', () => {
    expect(isTestFile('src/foo.ts')).toBe(false)
  })

  test('readme.md returns false', () => {
    expect(isTestFile('readme.md')).toBe(false)
  })
})

describe('isRuntimeCodeFile', () => {
  test('src/foo.ts returns true', () => {
    expect(isRuntimeCodeFile('src/foo.ts')).toBe(true)
  })

  test('src/foo.tsx returns true', () => {
    expect(isRuntimeCodeFile('src/foo.tsx')).toBe(true)
  })

  test('src/bar.js returns true', () => {
    expect(isRuntimeCodeFile('src/bar.js')).toBe(true)
  })

  test('tests/foo.test.ts returns false', () => {
    expect(isRuntimeCodeFile('tests/foo.test.ts')).toBe(false)
  })

  test('src/foo.md returns false', () => {
    expect(isRuntimeCodeFile('src/foo.md')).toBe(false)
  })

  test('lib/foo.ts (no src/ prefix) returns false', () => {
    expect(isRuntimeCodeFile('lib/foo.ts')).toBe(false)
  })
})

describe('isDesignOnlyFile', () => {
  test('docs/changes/xxx/design.md returns true', () => {
    expect(isDesignOnlyFile('docs/changes/feature-x/design.md')).toBe(true)
  })

  test('docs/changes/xxx/proposal.md returns true', () => {
    expect(isDesignOnlyFile('docs/changes/feature-x/proposal.md')).toBe(true)
  })

  test('docs/changes/xxx/behavior.md returns true', () => {
    expect(isDesignOnlyFile('docs/changes/feature-x/behavior.md')).toBe(true)
  })

  test('docs/changes/xxx/prd.md returns true', () => {
    expect(isDesignOnlyFile('docs/changes/feature-x/prd.md')).toBe(true)
  })

  test('src/foo.ts returns false', () => {
    expect(isDesignOnlyFile('src/foo.ts')).toBe(false)
  })

  test('docs/changes/xxx/plan.md returns false', () => {
    expect(isDesignOnlyFile('docs/changes/feature-x/plan.md')).toBe(false)
  })
})

describe('isPlanningOnlyFile', () => {
  test('.sisyphus/plans/xxx.md returns true', () => {
    expect(isPlanningOnlyFile('.sisyphus/plans/my-feature.md')).toBe(true)
  })

  test('docs/changes/xxx/plan.md returns true', () => {
    expect(isPlanningOnlyFile('docs/changes/my-feature/plan.md')).toBe(true)
  })

  test('.sisyphus/state.json returns false', () => {
    expect(isPlanningOnlyFile('.sisyphus/state.json')).toBe(false)
  })

  test('src/foo.ts returns false', () => {
    expect(isPlanningOnlyFile('src/foo.ts')).toBe(false)
  })

  test('nested plan in .sisyphus returns false', () => {
    expect(isPlanningOnlyFile('.sisyphus/plans/sub/feature.md')).toBe(false)
  })
})

describe('isMetadataOnlyFile', () => {
  test('.sisyphus/* returns true', () => {
    expect(isMetadataOnlyFile('.sisyphus/state.json')).toBe(true)
  })

  test('package-lock returns true', () => {
    expect(isMetadataOnlyFile('package-lock')).toBe(true)
  })

  test('.gitnexus/* returns true', () => {
    expect(isMetadataOnlyFile('.gitnexus/meta.json')).toBe(true)
  })

  test('bun.lockb returns true', () => {
    expect(isMetadataOnlyFile('bun.lockb')).toBe(true)
  })

  test('pnpm-lock returns true', () => {
    expect(isMetadataOnlyFile('pnpm-lock')).toBe(true)
  })

  test('yarn.lock returns true', () => {
    expect(isMetadataOnlyFile('yarn.lock')).toBe(true)
  })

  test('src/foo.ts returns false', () => {
    expect(isMetadataOnlyFile('src/foo.ts')).toBe(false)
  })
})

describe('isDocsOnlyFile', () => {
  test('docs/guide.md returns true', () => {
    expect(isDocsOnlyFile('docs/guide.md')).toBe(true)
  })

  test('docs/deep/nested.md returns true', () => {
    expect(isDocsOnlyFile('docs/deep/nested.md')).toBe(true)
  })

  test('README.md returns true', () => {
    expect(isDocsOnlyFile('readme.md')).toBe(true)
  })

  test('README_en.md returns true', () => {
    expect(isDocsOnlyFile('readme_en.md')).toBe(true)
  })

  test('src/foo.ts returns false', () => {
    expect(isDocsOnlyFile('src/foo.ts')).toBe(false)
  })

  test('docs/guide.ts returns false (not .md)', () => {
    expect(isDocsOnlyFile('docs/guide.ts')).toBe(false)
  })

  test('notes.md in root returns false (not docs/ or readme)', () => {
    expect(isDocsOnlyFile('notes.md')).toBe(false)
  })
})

describe('isImplementationLikeFile', () => {
  test('src/foo.ts returns true', () => {
    expect(isImplementationLikeFile('src/foo.ts')).toBe(true)
  })

  test('tests/foo.test.ts returns true', () => {
    expect(isImplementationLikeFile('tests/foo.test.ts')).toBe(true)
  })

  test('docs/x.md returns false', () => {
    expect(isImplementationLikeFile('docs/x.md')).toBe(false)
  })

  test('.sisyphus/* returns false', () => {
    expect(isImplementationLikeFile('.sisyphus/state.json')).toBe(false)
  })

  test('docs/changes/feature/design.md returns false', () => {
    expect(isImplementationLikeFile('docs/changes/feature/design.md')).toBe(false)
  })

  test('docs/changes/feature/plan.md returns false', () => {
    expect(isImplementationLikeFile('docs/changes/feature/plan.md')).toBe(false)
  })

  test('package-lock.json returns false', () => {
    expect(isImplementationLikeFile('package-lock.json')).toBe(false)
  })
})

describe('shouldPromptForAcceptanceDocSync', () => {
  test('src/foo.ts returns true', () => {
    expect(shouldPromptForAcceptanceDocSync('src/foo.ts')).toBe(true)
  })

  test('docs/x.md returns false', () => {
    expect(shouldPromptForAcceptanceDocSync('docs/x.md')).toBe(false)
  })

  test('path containing /docs/ returns false', () => {
    expect(shouldPromptForAcceptanceDocSync('project/docs/x.md')).toBe(false)
  })

  test('tests/foo.test.ts returns true', () => {
    expect(shouldPromptForAcceptanceDocSync('tests/foo.test.ts')).toBe(true)
  })
})

describe('appendToolAfterPrompt', () => {
  test('appends prompt to output string', () => {
    const output = { output: 'existing text' }
    appendToolAfterPrompt(output, 'new prompt')
    expect(output.output).toBe('existing text\n\nnew prompt')
  })

  test('sets prompt as output when no existing output', () => {
    const output = { output: '' }
    appendToolAfterPrompt(output, 'new prompt')
    expect(output.output).toBe('new prompt')
  })

  test('does nothing for null output', () => {
    const output = null
    expect(() => appendToolAfterPrompt(output, 'prompt')).not.toThrow()
  })

  test('does nothing for undefined output', () => {
    expect(() => appendToolAfterPrompt(undefined, 'prompt')).not.toThrow()
  })

  test('does nothing for non-object output', () => {
    expect(() => appendToolAfterPrompt('string' as unknown, 'prompt')).not.toThrow()
  })

  test('handles object with non-string output field', () => {
    const output = { output: 42 }
    appendToolAfterPrompt(output, 'prompt')
    expect(output.output).toBe('prompt')
  })

  test('handles object with no output field', () => {
    const output = {}
    appendToolAfterPrompt(output, 'prompt')
    expect(output.output).toBe('prompt')
  })
})
