

# Learnings from Task 8: Cursor, Trae, and Generic Adapter Tests

## Date: 2026-04-24

## Key Patterns Followed

### 1. Test Fixture Management
- Use beforeEach/afterEach hooks with unique temp directories
- Pattern: `join(process.cwd(), 'tests', 'fixtures', 'adapter-test-' + Date.now())`
- Recursive cleanup function handles nested directories properly

### 2. Cursor Adapter Specifics
- Detect confidence 0.9 for `.cursor/rules/` directory
- Detect confidence 0.6 for `cursor.md` or `cursor-rules.md` root files
- Classify rules → `current/workflow/cursor-rules.md` (0.6)
- Classify conversation/history/chat → `references/raw/cursor-conversations/` (0.4)
- Classify cursor.md → `references/raw/` (0.4)

### 3. Trae Adapter Specifics
- Detect confidence 0.9 for `.trae/` with docs/rules subdirectories
- Detect confidence 0.5 for `.trae/` only
- Classify rules/guideline files → `current/workflow/` (0.6)
- Classify config/setting/preference → `references/raw/trae/` (0.4)

### 4. Generic Adapter Specifics (Keyword-Based Classification)
- Always detects with confidence 0.3 (fallback adapter)
- README → references/raw (0.3)
- DESIGN/design → current/design (0.5)
- SPEC/spec → current/spec (0.5)
- REQUIREMENT/需求 → current/requirements (0.5)
- TODO/CHANGELOG/CHANGE → changes (0.4)
- DEPRECATED/legacy/old/旧 → archive (0.6)
- ADR/decision/决策 → decisions (0.4)
- Everything else → references/raw (0.3)

### 5. Heading Extraction
- Read first 50 lines for `# heading` pattern
- Use heading content as fallback for classification
- Only applies when filename doesn't give clear classification

### 6. Registry Test Updates
- Generic adapter always detects, so registry tests need adjustment
- Updated test expectations to allow generic's 0.3 confidence behavior
- Other adapters should still return detected: false on arbitrary paths

### 7. Symlink Handling
- All adapters skip symlinks with `isSymbolicLink()` check
- Cross-platform: symlinks may not be supported on all platforms
- Tests verify symlinks are excluded from results

### 8. Non-Markdown File Warnings
- Pattern: `[adapter] Skipping non-Markdown file: {path}`
- Console.warn output visible during test runs
- Only `.md` and `.markdown` extensions processed

## Files Created
1. tests/phases/migrate-docs/adapters/cursor.test.ts - 11 tests
2. tests/phases/migrate-docs/adapters/trae.test.ts - 17 tests
3. tests/phases/migrate-docs/adapters/generic.test.ts - 26 tests
4. tests/phases/migrate-docs/adapters/registry.test.ts - Updated 2 tests

## Test Coverage Summary
- cursor: 11 tests (detect 4, scan 5, classify 4)
- trae: 17 tests (detect 5, scan 5, classify 7)
- generic: 26 tests (detect 2, scan 4, classify by keyword 13, classify by heading 4)
- Total: 78 adapter tests, all passing

## QA Evidence Files
- .sisyphus/evidence/task-8-generic-classify.txt - Keyword classification QA
- .sisyphus/evidence/task-8-cursor-rules.txt - Cursor rules workflow QA
