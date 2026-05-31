# Plan: implementation-mapper-traceability

---
## TDD Expanded Tasks

> Auto-expanded by OpenFlow. Each implementation task follows Red-Green-Refactor cycle.


### Task 1: 1. Restore the missing design document for this feature at \`docs/changes/implementation-mapper-traceability/design/20260508-design.md\`, based on \`docs/changes/implementation-mapper-traceability/proposal.md\`; include final output structure, path-filtering policy, evidence policy, stable-sort policy, and explicit non-goals. Verify with \`bun test tests/phases/code-mapper.test.ts\` to ensure documentation-only changes do not affect current behavior. (TDD)

**Files:**
- Test: `tests/unit/path/to/test.ts`
- Implementation: `src/path/to/file.ts`

- [ ] **Step 1: RED - Write failing test**
```typescript
// Write test for 1. Restore the missing design document for this feature at `docs/changes/implementation-mapper-traceability/design/20260508-design.md`, based on `docs/changes/implementation-mapper-traceability/proposal.md`; include final output structure, path-filtering policy, evidence policy, stable-sort policy, and explicit non-goals. Verify with `bun test tests/phases/code-mapper.test.ts` to ensure documentation-only changes do not affect current behavior.
describe('1. Restore the missing design document for this feature at `docs/changes/implementation-mapper-traceability/design/20260508-design.md`, based on `docs/changes/implementation-mapper-traceability/proposal.md`; include final output structure, path-filtering policy, evidence policy, stable-sort policy, and explicit non-goals. Verify with `bun test tests/phases/code-mapper.test.ts` to ensure documentation-only changes do not affect current behavior.', () => {
  it('should work correctly', () => {
    // Arrange
    // Act
    // Assert
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `bun test tests/unit/path/to/test.ts`
Expected: FAIL

- [ ] **Step 3: GREEN - Implement minimal code**
```typescript
// Minimal implementation to pass
```

- [ ] **Step 4: Run test to verify it passes**
Run: `bun test tests/unit/path/to/test.ts`
Expected: PASS

- [ ] **Step 5: REFACTOR - Clean up while keeping tests green**

- [ ] **Step 6: Commit**
```bash
git add tests/ src/
git commit -m "feat: 1. Restore the missing design document for this feature at `docs/changes/implementation-mapper-traceability/design/20260508-design.md`, based on `docs/changes/implementation-mapper-traceability/proposal.md`; include final output structure, path-filtering policy, evidence policy, stable-sort policy, and explicit non-goals. Verify with `bun test tests/phases/code-mapper.test.ts` to ensure documentation-only changes do not affect current behavior."
```


### Task 2: 2. Add scoped path filtering tests before implementation in \`tests/phases/code-mapper.test.ts\` for a new mapper input filter: reject \`C:\\Users\\...\\AppData\\Local\\Temp\\...\`, reject absolute paths outside \`projectDir\`, reject \`..\` traversal escaping \`projectDir\`, reject \`tmp/.tmp/.cache\` paths, and keep normal repo-relative paths like \`src/phases/archive/code-mapper.ts\`. Verify initially with \`bun test tests/phases/code-mapper.test.ts\` and expect the new tests to fail before implementation. (TDD)

**Files:**
- Test: `tests/unit/path/to/test.ts`
- Implementation: `src/path/to/file.ts`

- [ ] **Step 1: RED - Write failing test**
```typescript
// Write test for 2. Add scoped path filtering tests before implementation in `tests/phases/code-mapper.test.ts` for a new mapper input filter: reject `C:\Users\...\AppData\Local\Temp\...`, reject absolute paths outside `projectDir`, reject `..` traversal escaping `projectDir`, reject `tmp/.tmp/.cache` paths, and keep normal repo-relative paths like `src/phases/archive/code-mapper.ts`. Verify initially with `bun test tests/phases/code-mapper.test.ts` and expect the new tests to fail before implementation.
describe('2. Add scoped path filtering tests before implementation in `tests/phases/code-mapper.test.ts` for a new mapper input filter: reject `C:\Users\...\AppData\Local\Temp\...`, reject absolute paths outside `projectDir`, reject `..` traversal escaping `projectDir`, reject `tmp/.tmp/.cache` paths, and keep normal repo-relative paths like `src/phases/archive/code-mapper.ts`. Verify initially with `bun test tests/phases/code-mapper.test.ts` and expect the new tests to fail before implementation.', () => {
  it('should work correctly', () => {
    // Arrange
    // Act
    // Assert
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `bun test tests/unit/path/to/test.ts`
Expected: FAIL

- [ ] **Step 3: GREEN - Implement minimal code**
```typescript
// Minimal implementation to pass
```

- [ ] **Step 4: Run test to verify it passes**
Run: `bun test tests/unit/path/to/test.ts`
Expected: PASS

- [ ] **Step 5: REFACTOR - Clean up while keeping tests green**

- [ ] **Step 6: Commit**
```bash
git add tests/ src/
git commit -m "feat: 2. Add scoped path filtering tests before implementation in `tests/phases/code-mapper.test.ts` for a new mapper input filter: reject `C:\Users\...\AppData\Local\Temp\...`, reject absolute paths outside `projectDir`, reject `..` traversal escaping `projectDir`, reject `tmp/.tmp/.cache` paths, and keep normal repo-relative paths like `src/phases/archive/code-mapper.ts`. Verify initially with `bun test tests/phases/code-mapper.test.ts` and expect the new tests to fail before implementation."
```


### Task 3: 3. Implement the path filtering helper in \`src/phases/archive/code-mapper.ts\` or a dedicated archive helper imported by it; apply it before \`buildChangedFileEvidence\(\)\` reads files. The helper must resolve candidate paths against \`projectDir\`, confirm the resolved path is inside \`projectDir\`, normalize path separators, and classify temp/cache/out-of-scope records as ignored internal input only. Verify with \`bun test tests/phases/code-mapper.test.ts\`. (TDD)

**Files:**
- Test: `tests/unit/path/to/test.ts`
- Implementation: `src/path/to/file.ts`

- [ ] **Step 1: RED - Write failing test**
```typescript
// Write test for 3. Implement the path filtering helper in `src/phases/archive/code-mapper.ts` or a dedicated archive helper imported by it; apply it before `buildChangedFileEvidence()` reads files. The helper must resolve candidate paths against `projectDir`, confirm the resolved path is inside `projectDir`, normalize path separators, and classify temp/cache/out-of-scope records as ignored internal input only. Verify with `bun test tests/phases/code-mapper.test.ts`.
describe('3. Implement the path filtering helper in `src/phases/archive/code-mapper.ts` or a dedicated archive helper imported by it; apply it before `buildChangedFileEvidence()` reads files. The helper must resolve candidate paths against `projectDir`, confirm the resolved path is inside `projectDir`, normalize path separators, and classify temp/cache/out-of-scope records as ignored internal input only. Verify with `bun test tests/phases/code-mapper.test.ts`.', () => {
  it('should work correctly', () => {
    // Arrange
    // Act
    // Assert
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `bun test tests/unit/path/to/test.ts`
Expected: FAIL

- [ ] **Step 3: GREEN - Implement minimal code**
```typescript
// Minimal implementation to pass
```

- [ ] **Step 4: Run test to verify it passes**
Run: `bun test tests/unit/path/to/test.ts`
Expected: PASS

- [ ] **Step 5: REFACTOR - Clean up while keeping tests green**

- [ ] **Step 6: Commit**
```bash
git add tests/ src/
git commit -m "feat: 3. Implement the path filtering helper in `src/phases/archive/code-mapper.ts` or a dedicated archive helper imported by it; apply it before `buildChangedFileEvidence()` reads files. The helper must resolve candidate paths against `projectDir`, confirm the resolved path is inside `projectDir`, normalize path separators, and classify temp/cache/out-of-scope records as ignored internal input only. Verify with `bun test tests/phases/code-mapper.test.ts`."
```


### Task 4: 4. Remove the \`changed files\` fallback from \`generateCodeMappingTable\(\)\` in \`src/phases/archive/code-mapper.ts\`. When no traceability items exist, return no mappings rather than manufacturing \`{ sourceLabel: 'changed files', item: '\<feature\> archived implementation changes' }\`. Verify with \`bun test tests/phases/code-mapper.test.ts\` and add/update assertions that no output row has source \`changed files\`. (TDD)

**Files:**
- Test: `tests/unit/path/to/test.ts`
- Implementation: `src/path/to/file.ts`

- [ ] **Step 1: RED - Write failing test**
```typescript
// Write test for 4. Remove the `changed files` fallback from `generateCodeMappingTable()` in `src/phases/archive/code-mapper.ts`. When no traceability items exist, return no mappings rather than manufacturing `{ sourceLabel: 'changed files', item: '<feature> archived implementation changes' }`. Verify with `bun test tests/phases/code-mapper.test.ts` and add/update assertions that no output row has source `changed files`.
describe('4. Remove the `changed files` fallback from `generateCodeMappingTable()` in `src/phases/archive/code-mapper.ts`. When no traceability items exist, return no mappings rather than manufacturing `{ sourceLabel: 'changed files', item: '<feature> archived implementation changes' }`. Verify with `bun test tests/phases/code-mapper.test.ts` and add/update assertions that no output row has source `changed files`.', () => {
  it('should work correctly', () => {
    // Arrange
    // Act
    // Assert
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `bun test tests/unit/path/to/test.ts`
Expected: FAIL

- [ ] **Step 3: GREEN - Implement minimal code**
```typescript
// Minimal implementation to pass
```

- [ ] **Step 4: Run test to verify it passes**
Run: `bun test tests/unit/path/to/test.ts`
Expected: PASS

- [ ] **Step 5: REFACTOR - Clean up while keeping tests green**

- [ ] **Step 6: Commit**
```bash
git add tests/ src/
git commit -m "feat: 4. Remove the `changed files` fallback from `generateCodeMappingTable()` in `src/phases/archive/code-mapper.ts`. When no traceability items exist, return no mappings rather than manufacturing `{ sourceLabel: 'changed files', item: '<feature> archived implementation changes' }`. Verify with `bun test tests/phases/code-mapper.test.ts` and add/update assertions that no output row has source `changed files`."
```


### Task 6: 6. Add stable ordering to \`generateCodeMappingTable\(\)\` in \`src/phases/archive/code-mapper.ts\`: preserve traceability item order from \`traceability.ts\`, then sort evidence within each row by category order \`product code -\> tests -\> docs -\> config\`, then normalized file path, then symbol string. Remove nondeterministic ordering from \`selectRelevantEvidence\(\)\`. Verify with a new test in \`tests/phases/code-mapper.test.ts\` that repeated calls with shuffled input produce identical row/cell order using \`bun test tests/phases/code-mapper.test.ts\`. (TDD)

**Files:**
- Test: `tests/unit/path/to/test.ts`
- Implementation: `src/path/to/file.ts`

- [ ] **Step 1: RED - Write failing test**
```typescript
// Write test for 6. Add stable ordering to `generateCodeMappingTable()` in `src/phases/archive/code-mapper.ts`: preserve traceability item order from `traceability.ts`, then sort evidence within each row by category order `product code -> tests -> docs -> config`, then normalized file path, then symbol string. Remove nondeterministic ordering from `selectRelevantEvidence()`. Verify with a new test in `tests/phases/code-mapper.test.ts` that repeated calls with shuffled input produce identical row/cell order using `bun test tests/phases/code-mapper.test.ts`.
describe('6. Add stable ordering to `generateCodeMappingTable()` in `src/phases/archive/code-mapper.ts`: preserve traceability item order from `traceability.ts`, then sort evidence within each row by category order `product code -> tests -> docs -> config`, then normalized file path, then symbol string. Remove nondeterministic ordering from `selectRelevantEvidence()`. Verify with a new test in `tests/phases/code-mapper.test.ts` that repeated calls with shuffled input produce identical row/cell order using `bun test tests/phases/code-mapper.test.ts`.', () => {
  it('should work correctly', () => {
    // Arrange
    // Act
    // Assert
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `bun test tests/unit/path/to/test.ts`
Expected: FAIL

- [ ] **Step 3: GREEN - Implement minimal code**
```typescript
// Minimal implementation to pass
```

- [ ] **Step 4: Run test to verify it passes**
Run: `bun test tests/unit/path/to/test.ts`
Expected: PASS

- [ ] **Step 5: REFACTOR - Clean up while keeping tests green**

- [ ] **Step 6: Commit**
```bash
git add tests/ src/
git commit -m "feat: 6. Add stable ordering to `generateCodeMappingTable()` in `src/phases/archive/code-mapper.ts`: preserve traceability item order from `traceability.ts`, then sort evidence within each row by category order `product code -> tests -> docs -> config`, then normalized file path, then symbol string. Remove nondeterministic ordering from `selectRelevantEvidence()`. Verify with a new test in `tests/phases/code-mapper.test.ts` that repeated calls with shuffled input produce identical row/cell order using `bun test tests/phases/code-mapper.test.ts`."
```


### Task 8: 8. Add direct renderer tests for \`generateImplementationMapper\(\)\` in a new \`tests/phases/implementation-mapper.test.ts\`. Cover: no \`\#\# 4. 修改的文件\`, no \`\#\# 2. 冻结工件\`, no repeated same-feature \`proposal/design/requirements\` links, no empty global-dependency section, no excluded-files section, and explicit no-verification marker when \`acceptanceState\` is missing. Verify with \`bun test tests/phases/implementation-mapper.test.ts\`. (TDD)

**Files:**
- Test: `tests/unit/path/to/test.ts`
- Implementation: `src/path/to/file.ts`

- [ ] **Step 1: RED - Write failing test**
```typescript
// Write test for 8. Add direct renderer tests for `generateImplementationMapper()` in a new `tests/phases/implementation-mapper.test.ts`. Cover: no `## 4. 修改的文件`, no `## 2. 冻结工件`, no repeated same-feature `proposal/design/requirements` links, no empty global-dependency section, no excluded-files section, and explicit no-verification marker when `acceptanceState` is missing. Verify with `bun test tests/phases/implementation-mapper.test.ts`.
describe('8. Add direct renderer tests for `generateImplementationMapper()` in a new `tests/phases/implementation-mapper.test.ts`. Cover: no `## 4. 修改的文件`, no `## 2. 冻结工件`, no repeated same-feature `proposal/design/requirements` links, no empty global-dependency section, no excluded-files section, and explicit no-verification marker when `acceptanceState` is missing. Verify with `bun test tests/phases/implementation-mapper.test.ts`.', () => {
  it('should work correctly', () => {
    // Arrange
    // Act
    // Assert
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `bun test tests/unit/path/to/test.ts`
Expected: FAIL

- [ ] **Step 3: GREEN - Implement minimal code**
```typescript
// Minimal implementation to pass
```

- [ ] **Step 4: Run test to verify it passes**
Run: `bun test tests/unit/path/to/test.ts`
Expected: PASS

- [ ] **Step 5: REFACTOR - Clean up while keeping tests green**

- [ ] **Step 6: Commit**
```bash
git add tests/ src/
git commit -m "feat: 8. Add direct renderer tests for `generateImplementationMapper()` in a new `tests/phases/implementation-mapper.test.ts`. Cover: no `## 4. 修改的文件`, no `## 2. 冻结工件`, no repeated same-feature `proposal/design/requirements` links, no empty global-dependency section, no excluded-files section, and explicit no-verification marker when `acceptanceState` is missing. Verify with `bun test tests/phases/implementation-mapper.test.ts`."
```


### Task 9: 9. Rewrite \`generateImplementationMapper\(\)\` in \`src/phases/archive/implementation-mapper.ts\` to render the new section model: \`\#\# 1. 概述\`, optional \`\#\# 2. 全局依赖与例外证据\`, \`\#\# 3. 需求到实现映射\`, and \`\#\# 4. 验证与结论\`. Remove \`generateFilesTable\(\)\` usage from final output. Remove same-feature frozen artifact links. Omit optional sections when they have no content. Verify with \`bun test tests/phases/implementation-mapper.test.ts\`. (TDD)

**Files:**
- Test: `tests/unit/path/to/test.ts`
- Implementation: `src/path/to/file.ts`

- [ ] **Step 1: RED - Write failing test**
```typescript
// Write test for 9. Rewrite `generateImplementationMapper()` in `src/phases/archive/implementation-mapper.ts` to render the new section model: `## 1. 概述`, optional `## 2. 全局依赖与例外证据`, `## 3. 需求到实现映射`, and `## 4. 验证与结论`. Remove `generateFilesTable()` usage from final output. Remove same-feature frozen artifact links. Omit optional sections when they have no content. Verify with `bun test tests/phases/implementation-mapper.test.ts`.
describe('9. Rewrite `generateImplementationMapper()` in `src/phases/archive/implementation-mapper.ts` to render the new section model: `## 1. 概述`, optional `## 2. 全局依赖与例外证据`, `## 3. 需求到实现映射`, and `## 4. 验证与结论`. Remove `generateFilesTable()` usage from final output. Remove same-feature frozen artifact links. Omit optional sections when they have no content. Verify with `bun test tests/phases/implementation-mapper.test.ts`.', () => {
  it('should work correctly', () => {
    // Arrange
    // Act
    // Assert
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `bun test tests/unit/path/to/test.ts`
Expected: FAIL

- [ ] **Step 3: GREEN - Implement minimal code**
```typescript
// Minimal implementation to pass
```

- [ ] **Step 4: Run test to verify it passes**
Run: `bun test tests/unit/path/to/test.ts`
Expected: PASS

- [ ] **Step 5: REFACTOR - Clean up while keeping tests green**

- [ ] **Step 6: Commit**
```bash
git add tests/ src/
git commit -m "feat: 9. Rewrite `generateImplementationMapper()` in `src/phases/archive/implementation-mapper.ts` to render the new section model: `## 1. 概述`, optional `## 2. 全局依赖与例外证据`, `## 3. 需求到实现映射`, and `## 4. 验证与结论`. Remove `generateFilesTable()` usage from final output. Remove same-feature frozen artifact links. Omit optional sections when they have no content. Verify with `bun test tests/phases/implementation-mapper.test.ts`."
```


### Task 10: 10. Update \`generateImplementationMappingSection\(\)\` in \`src/phases/archive/implementation-mapper.ts\` to use the final table columns \`追溯来源 | 需求/决策 | 代码文件 | 关键符号 | 关联说明 | 验证证据\`. Use \`CodeMappingEntry.description\` as the association explanation. If all changes are filtered out or no mappings are available, render a concise non-table sentence rather than referring readers to a modified-files list. Verify with \`bun test tests/phases/implementation-mapper.test.ts tests/phases/code-mapper.test.ts\`. (TDD)

**Files:**
- Test: `tests/unit/path/to/test.ts`
- Implementation: `src/path/to/file.ts`

- [ ] **Step 1: RED - Write failing test**
```typescript
// Write test for 10. Update `generateImplementationMappingSection()` in `src/phases/archive/implementation-mapper.ts` to use the final table columns `追溯来源 | 需求/决策 | 代码文件 | 关键符号 | 关联说明 | 验证证据`. Use `CodeMappingEntry.description` as the association explanation. If all changes are filtered out or no mappings are available, render a concise non-table sentence rather than referring readers to a modified-files list. Verify with `bun test tests/phases/implementation-mapper.test.ts tests/phases/code-mapper.test.ts`.
describe('10. Update `generateImplementationMappingSection()` in `src/phases/archive/implementation-mapper.ts` to use the final table columns `追溯来源 | 需求/决策 | 代码文件 | 关键符号 | 关联说明 | 验证证据`. Use `CodeMappingEntry.description` as the association explanation. If all changes are filtered out or no mappings are available, render a concise non-table sentence rather than referring readers to a modified-files list. Verify with `bun test tests/phases/implementation-mapper.test.ts tests/phases/code-mapper.test.ts`.', () => {
  it('should work correctly', () => {
    // Arrange
    // Act
    // Assert
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `bun test tests/unit/path/to/test.ts`
Expected: FAIL

- [ ] **Step 3: GREEN - Implement minimal code**
```typescript
// Minimal implementation to pass
```

- [ ] **Step 4: Run test to verify it passes**
Run: `bun test tests/unit/path/to/test.ts`
Expected: PASS

- [ ] **Step 5: REFACTOR - Clean up while keeping tests green**

- [ ] **Step 6: Commit**
```bash
git add tests/ src/
git commit -m "feat: 10. Update `generateImplementationMappingSection()` in `src/phases/archive/implementation-mapper.ts` to use the final table columns `追溯来源 | 需求/决策 | 代码文件 | 关键符号 | 关联说明 | 验证证据`. Use `CodeMappingEntry.description` as the association explanation. If all changes are filtered out or no mappings are available, render a concise non-table sentence rather than referring readers to a modified-files list. Verify with `bun test tests/phases/implementation-mapper.test.ts tests/phases/code-mapper.test.ts`."
```


### Task 13: 13. Update README implementation-mapping wording in \`README.md\` and \`README_CN.md\` so it promises requirement/decision-to-symbol traceability and no longer implies a modified-file inventory. Verify by searching for obsolete wording with \`rg "Modified Files|changed files|文件清单|修改的文件" README.md README_CN.md\` and running \`npm run build\`. (TDD)

**Files:**
- Test: `tests/unit/path/to/test.ts`
- Implementation: `src/path/to/file.ts`

- [ ] **Step 1: RED - Write failing test**
```typescript
// Write test for 13. Update README implementation-mapping wording in `README.md` and `README_CN.md` so it promises requirement/decision-to-symbol traceability and no longer implies a modified-file inventory. Verify by searching for obsolete wording with `rg "Modified Files|changed files|文件清单|修改的文件" README.md README_CN.md` and running `npm run build`.
describe('13. Update README implementation-mapping wording in `README.md` and `README_CN.md` so it promises requirement/decision-to-symbol traceability and no longer implies a modified-file inventory. Verify by searching for obsolete wording with `rg "Modified Files|changed files|文件清单|修改的文件" README.md README_CN.md` and running `npm run build`.', () => {
  it('should work correctly', () => {
    // Arrange
    // Act
    // Assert
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `bun test tests/unit/path/to/test.ts`
Expected: FAIL

- [ ] **Step 3: GREEN - Implement minimal code**
```typescript
// Minimal implementation to pass
```

- [ ] **Step 4: Run test to verify it passes**
Run: `bun test tests/unit/path/to/test.ts`
Expected: PASS

- [ ] **Step 5: REFACTOR - Clean up while keeping tests green**

- [ ] **Step 6: Commit**
```bash
git add tests/ src/
git commit -m "feat: 13. Update README implementation-mapping wording in `README.md` and `README_CN.md` so it promises requirement/decision-to-symbol traceability and no longer implies a modified-file inventory. Verify by searching for obsolete wording with `rg "Modified Files|changed files|文件清单|修改的文件" README.md README_CN.md` and running `npm run build`."
```


### Task 14: 14. Run final verification commands: \`bun test tests/phases/code-mapper.test.ts tests/phases/implementation-mapper.test.ts\`, \`bun test tests/commands/archive.test.ts\` if the file exists, \`npm run typecheck\`, and \`npm run build\`. Archive a controlled fixture or unit snapshot must show no \`AppData/Local/Temp\`, no \`changed files\` trace source, no modified-files section, omitted empty optional sections, and stable sorted mapping rows. (TDD)

**Files:**
- Test: `tests/unit/path/to/test.ts`
- Implementation: `src/path/to/file.ts`

- [ ] **Step 1: RED - Write failing test**
```typescript
// Write test for 14. Run final verification commands: `bun test tests/phases/code-mapper.test.ts tests/phases/implementation-mapper.test.ts`, `bun test tests/commands/archive.test.ts` if the file exists, `npm run typecheck`, and `npm run build`. Archive a controlled fixture or unit snapshot must show no `AppData/Local/Temp`, no `changed files` trace source, no modified-files section, omitted empty optional sections, and stable sorted mapping rows.
describe('14. Run final verification commands: `bun test tests/phases/code-mapper.test.ts tests/phases/implementation-mapper.test.ts`, `bun test tests/commands/archive.test.ts` if the file exists, `npm run typecheck`, and `npm run build`. Archive a controlled fixture or unit snapshot must show no `AppData/Local/Temp`, no `changed files` trace source, no modified-files section, omitted empty optional sections, and stable sorted mapping rows.', () => {
  it('should work correctly', () => {
    // Arrange
    // Act
    // Assert
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `bun test tests/unit/path/to/test.ts`
Expected: FAIL

- [ ] **Step 3: GREEN - Implement minimal code**
```typescript
// Minimal implementation to pass
```

- [ ] **Step 4: Run test to verify it passes**
Run: `bun test tests/unit/path/to/test.ts`
Expected: PASS

- [ ] **Step 5: REFACTOR - Clean up while keeping tests green**

- [ ] **Step 6: Commit**
```bash
git add tests/ src/
git commit -m "feat: 14. Run final verification commands: `bun test tests/phases/code-mapper.test.ts tests/phases/implementation-mapper.test.ts`, `bun test tests/commands/archive.test.ts` if the file exists, `npm run typecheck`, and `npm run build`. Archive a controlled fixture or unit snapshot must show no `AppData/Local/Temp`, no `changed files` trace source, no modified-files section, omitted empty optional sections, and stable sorted mapping rows."
```




## Overview

Redesign OpenFlow's archived `implementation-mapper.md` so it is a high-signal traceability document instead of a changed-files snapshot. The implementation must filter temp/out-of-repo noise, remove Git-duplicated file lists, map requirements/design decisions to concrete code symbols where possible, attach explicit verification evidence, omit empty sections, and keep output order stable.

## Design Context

- Primary proposal: `docs/changes/implementation-mapper-traceability/proposal.md`
- Current archive entry point: `src/commands/archive.ts:83-143`
- Current renderer: `src/phases/archive/implementation-mapper.ts:23-198`
- Current code mapping logic: `src/phases/archive/code-mapper.ts:86-249`
- Current traceability extractor: `src/phases/archive/traceability.ts:19-205`
- Existing tests: `tests/phases/code-mapper.test.ts`
- Metis guardrails incorporated:
  - Reject absolute paths outside `projectDir`, `..` traversal, temp/cache paths, and repository-external paths.
  - Remove `generateCodeMappingMarkdown` / `saveCodeMapping` if no internal consumers exist.
  - Do not fallback to `changed files` as a traceability source.
  - Use explicit `no verification evidence recorded` when verify evidence is absent.
  - Add direct tests for `generateImplementationMapper`, not only `generateCodeMappingTable`.

## Execution Rules

- Before editing any function/class/method, run GitNexus impact analysis for that symbol, per repository rules.
- Do not change archive readiness gating in `src/commands/archive.ts`; this feature changes mapper content only.
- Do not add a final “modified files” table or an “excluded files” table.
- Do not output empty sections for template symmetry.
- Keep output section headings in Chinese to match current archive documents.

## Tasks

- [x] 1. Restore the missing design document for this feature at `docs/changes/implementation-mapper-traceability/design/20260508-design.md`, based on `docs/changes/implementation-mapper-traceability/proposal.md`; include final output structure, path-filtering policy, evidence policy, stable-sort policy, and explicit non-goals. Verify with `bun test tests/phases/code-mapper.test.ts` to ensure documentation-only changes do not affect current behavior.

- [x] 2. Add scoped path filtering tests before implementation in `tests/phases/code-mapper.test.ts` for a new mapper input filter: reject `C:\Users\...\AppData\Local\Temp\...`, reject absolute paths outside `projectDir`, reject `..` traversal escaping `projectDir`, reject `tmp/.tmp/.cache` paths, and keep normal repo-relative paths like `src/phases/archive/code-mapper.ts`. Verify initially with `bun test tests/phases/code-mapper.test.ts` and expect the new tests to fail before implementation.

- [x] 3. Implement the path filtering helper in `src/phases/archive/code-mapper.ts` or a dedicated archive helper imported by it; apply it before `buildChangedFileEvidence()` reads files. The helper must resolve candidate paths against `projectDir`, confirm the resolved path is inside `projectDir`, normalize path separators, and classify temp/cache/out-of-scope records as ignored internal input only. Verify with `bun test tests/phases/code-mapper.test.ts`.

- [x] 4. Remove the `changed files` fallback from `generateCodeMappingTable()` in `src/phases/archive/code-mapper.ts`. When no traceability items exist, return no mappings rather than manufacturing `{ sourceLabel: 'changed files', item: '<feature> archived implementation changes' }`. Verify with `bun test tests/phases/code-mapper.test.ts` and add/update assertions that no output row has source `changed files`.

- [x] 5. Change file/symbol evidence construction in `src/phases/archive/code-mapper.ts` so mappings use explicit `file-level fallback` when no symbols are extracted, instead of `-`. Preserve extracted symbols for functions/classes/consts/interfaces/types. Verify with `bun test tests/phases/code-mapper.test.ts`.

- [x] 6. Add stable ordering to `generateCodeMappingTable()` in `src/phases/archive/code-mapper.ts`: preserve traceability item order from `traceability.ts`, then sort evidence within each row by category order `product code -> tests -> docs -> config`, then normalized file path, then symbol string. Remove nondeterministic ordering from `selectRelevantEvidence()`. Verify with a new test in `tests/phases/code-mapper.test.ts` that repeated calls with shuffled input produce identical row/cell order using `bun test tests/phases/code-mapper.test.ts`.

- [x] 7. Replace weak verification strings in `formatVerificationEvidence()` in `src/phases/archive/code-mapper.ts`. Use `acceptanceState.verifyResult` when present to include `readiness`, `verifiedAt`, `reasonCodes`, and `constraintsChecked`; keep `verificationFailureCategory` only as failure context; if no acceptance state exists, output `no verification evidence recorded`. Do not output pure counts such as `pending acceptance/doc updates recorded (N)`. Verify with new tests in `tests/phases/code-mapper.test.ts`.

- [x] 8. Add direct renderer tests for `generateImplementationMapper()` in a new `tests/phases/implementation-mapper.test.ts`. Cover: no `## 4. 修改的文件`, no `## 2. 冻结工件`, no repeated same-feature `proposal/design/requirements` links, no empty global-dependency section, no excluded-files section, and explicit no-verification marker when `acceptanceState` is missing. Verify with `bun test tests/phases/implementation-mapper.test.ts`.

- [x] 9. Rewrite `generateImplementationMapper()` in `src/phases/archive/implementation-mapper.ts` to render the new section model: `## 1. 概述`, optional `## 2. 全局依赖与例外证据`, `## 3. 需求到实现映射`, and `## 4. 验证与结论`. Remove `generateFilesTable()` usage from final output. Remove same-feature frozen artifact links. Omit optional sections when they have no content. Verify with `bun test tests/phases/implementation-mapper.test.ts`.

- [x] 10. Update `generateImplementationMappingSection()` in `src/phases/archive/implementation-mapper.ts` to use the final table columns `追溯来源 | 需求/决策 | 代码文件 | 关键符号 | 关联说明 | 验证证据`. Use `CodeMappingEntry.description` as the association explanation. If all changes are filtered out or no mappings are available, render a concise non-table sentence rather than referring readers to a modified-files list. Verify with `bun test tests/phases/implementation-mapper.test.ts tests/phases/code-mapper.test.ts`.

- [x] 11. Remove dead secondary mapper output functions from `src/phases/archive/code-mapper.ts`: `generateCodeMappingMarkdown()` and `saveCodeMapping()`, plus any exports from `src/phases/archive/index.ts` if present. Confirm no internal imports remain before deletion. Verify with `bun test tests/phases/code-mapper.test.ts` and `npm run typecheck`.

- [x] 12. Keep `src/commands/archive.ts` behavior stable while ensuring it passes only mapper-safe options. Do not change readiness blocking or promotion behavior. If path filtering remains in `code-mapper.ts`, no archive logic change is needed except type adjustments caused by mapper API changes. Verify with existing archive-related tests using `bun test tests/commands/archive.test.ts` if present; otherwise run `bun test tests`.

- [x] 13. Update README implementation-mapping wording in `README.md` and `README_CN.md` so it promises requirement/decision-to-symbol traceability and no longer implies a modified-file inventory. Verify by searching for obsolete wording with `rg "Modified Files|changed files|文件清单|修改的文件" README.md README_CN.md` and running `npm run build`.

- [x] 14. Run final verification commands: `bun test tests/phases/code-mapper.test.ts tests/phases/implementation-mapper.test.ts`, `bun test tests/commands/archive.test.ts` if the file exists, `npm run typecheck`, and `npm run build`. Archive a controlled fixture or unit snapshot must show no `AppData/Local/Temp`, no `changed files` trace source, no modified-files section, omitted empty optional sections, and stable sorted mapping rows.

## Success Criteria

- `implementation-mapper.md` is traceability-first and no longer includes Git-duplicated file inventory.
- Temp/cache/outside-repo paths never appear in final mapper output.
- Missing verification is explicit instead of hidden behind weak archive-file-change wording.
- Same input generates stable output order.
- README, proposal, design, tests, and implementation all describe the same behavior.


---
## Verification Phase

### Security Checks
- [ ] **Secret Scan**: Check for accidentally committed secrets
- [ ] **Vulnerability Scan**: Run dependency vulnerability check

### Quality Checks
- [ ] **Lint Check**: Run linter
- [ ] **Type Check**: Run type checker
- [ ] **Test Suite**: Run all tests

### Failure Handling
- Quality failure: fix implementation and rerun verification.
- Security failure: block archive until fixed.
- Consistency failure: sync docs and implementation, then rerun verification.

> Auto-generated by OpenFlow. Complete all verification tasks before archiving.
