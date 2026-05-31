# Plan: openflow-json-openflow-jsonc-config-5f332d29

## Overview

本计划实现 OpenFlow 配置系统重构：配置源按 `openflow.json` > `openflow.jsonc` > `opencode.json` 的 `openflow` 字段优先级加载；所有路径配置统一收敛到扁平 `paths` 对象；移除未正式发布前遗留的路径字段，不做向后兼容。实现完成后，行为模块只保留行为开关，路径只从 `config.paths` 读取。

## Design Context

设计工作区：`docs/changes/2026-05-19-openflow-json-openflow-jsonc-config-5f332d29/`

已确认约束：项目未正式上线，不保留旧路径字段兼容；必须移除 `feature.output_dir`、`feature.prd_output_dir`、`archive.output_dir`、`guardian.state_dir`；独立配置文件优先于 `opencode.json`；`paths` 使用扁平结构；不引入环境变量配置、命令级路径覆盖、旧字段迁移 shim。

最终配置模型必须包含以下路径键：`changes`、`archive`、`current_requirements`、`current_design`、`current_spec`、`current_workflow`、`builds`、`plans`、`acceptance_state`、`feature_state`、`change_units`、`guardian_state`。默认值必须保持当前目录布局：`docs/changes`、`docs/archive`、`docs/current/requirements`、`docs/current/design`、`docs/current/spec`、`docs/current/workflow`、`.sisyphus/builds`、`.sisyphus/plans`、`.sisyphus/acceptance.local.md`、`.sisyphus/feature`、`.sisyphus/change-units.json`、`.sisyphus/openflow/guardian`。

## Execution Strategy

### Parallel Execution Waves

Wave 1: Task 1 inventory and Task 2 schema/default model can run in parallel only if Task 2 uses the final path key list above and does not edit call sites.

Wave 2: Task 3 config source loader depends on Task 2; Task 4 path helper refactor depends on Task 1 and Task 2.

Wave 3: Task 5 caller migration depends on Task 4; Task 6 tests depend on Tasks 2-5.

Wave 4: Task 7 documentation update depends on Tasks 2-4; Task 8 verification and quality gate depends on all implementation/doc tasks.

### Dependency Matrix

| Task | Blocked By | Blocks |
|---|---|---|
| 1. Inventory config and path references | None | 4, 5 |
| 2. Redesign config schema and defaults | None | 3, 4, 6, 7 |
| 3. Implement config source discovery | 2 | 5, 6 |
| 4. Refactor path helpers to `config.paths` | 1, 2 | 5, 6 |
| 5. Update runtime callers and remove legacy helpers | 1, 3, 4 | 6, 8 |
| 6. Rewrite and extend configuration tests | 2, 3, 4, 5 | 8 |
| 7. Update public configuration docs | 2, 4 | 8 |
| 8. Run full verification and quality gate | 5, 6, 7 | None |

## Tasks

- [ ] 1. Inventory all config/path references before editing (Agent: quick | Blocks: [4, 5] | Blocked By: [])

  **Agent Profile:** Category `quick`; Skills `[]`; use grep/AST-grep only, no code edits in this task.

  **Parallelization:** Can run in Wave 1 with Task 2 if the executor records findings before Task 4 starts.

  **Implementation Instructions:**
  - Search `src/` and `tests/` for `output_dir`, `prd_output_dir`, `state_dir`, `CHANGE_WORKSPACE_DIR`, `CURRENT_SPEC_DIR`, `CURRENT_WORKFLOW_DIR`, `LEGACY_DESIGN_OUTPUT_DIR`, `LEGACY_REQUIREMENTS_OUTPUT_DIR`, `.sisyphus`, `docs/changes`, `docs/archive`, `docs/current`.
  - Record the exact files that require edits in `.sisyphus/evidence/task-1-config-path-inventory.md`.
  - Confirm whether `src/utils/feature-resolver.ts`, `src/utils/change-units.ts`, `src/utils/diff-scope.ts`, `src/commands/quality-gate.ts`, `src/hooks/chat-message.ts`, and `src/config.ts` contain path literals that must move to `config.paths` or remain documented constants.

  **QA Scenarios:**
  ```
  Scenario: Inventory captures known old fields
    Tool: Bash
    Steps: Run `rg "output_dir|prd_output_dir|state_dir|CHANGE_WORKSPACE_DIR|CURRENT_SPEC_DIR|CURRENT_WORKFLOW_DIR|LEGACY_DESIGN_OUTPUT_DIR|LEGACY_REQUIREMENTS_OUTPUT_DIR" src tests`
    Expected: Output is copied or summarized in `.sisyphus/evidence/task-1-config-path-inventory.md` with every matched file listed.
    Evidence: .sisyphus/evidence/task-1-config-path-inventory.md

  Scenario: Inventory captures hardcoded state/docs paths
    Tool: Bash
    Steps: Run `rg "docs/changes|docs/archive|docs/current|\.sisyphus" src tests`
    Expected: Evidence file lists which matches are config paths to refactor and which are docs/test fixture literals to leave intact.
    Evidence: .sisyphus/evidence/task-1-config-path-classification.md
  ```

  **Acceptance Criteria:**
  - `rg "output_dir|prd_output_dir|state_dir" src tests` results are classified before any schema migration begins.
  - The executor has an explicit edit list for Tasks 4 and 5.

- [ ] 2. Redesign `OpenFlowConfig` schema and defaults around flat `paths` (Agent: unspecified-high | Blocks: [3, 4, 6, 7] | Blocked By: [])

  **Agent Profile:** Category `unspecified-high`; Skills `[]`; requires careful TypeScript type and validation changes.

  **Parallelization:** Wave 1; may run after Task 1 starts, but must not update callers outside `src/types.ts` and `src/config.ts` until Task 4.

  **Implementation Instructions:**
  - In `src/types.ts`, add `PathsConfig` with required keys: `changes`, `archive`, `current_requirements`, `current_design`, `current_spec`, `current_workflow`, `builds`, `plans`, `acceptance_state`, `feature_state`, `change_units`, `guardian_state`.
  - Add `paths: PathsConfig` to `OpenFlowConfig`.
  - Remove `output_dir` and `prd_output_dir` from `FeatureConfig`.
  - Remove `output_dir` from `ArchiveConfig`.
  - Remove `state_dir` from both `GuardianConfig` and `DriftGuardianConfig`.
  - Move all removed path defaults into `defaultConfig.paths`; keep feature/archive/guardian behavioral defaults unchanged.
  - In `src/config.ts`, update the Zod override schema so removed path fields are not accepted. Use strict object schemas for `feature`, `archive`, `guardian`, and top-level config sections so old fields fail validation instead of being silently ignored.
  - Keep `loadConfig()` object-input behavior for tests and `opencode.json` config, but make it validate the new schema only.

  **QA Scenarios:**
  ```
  Scenario: New paths defaults exist
    Tool: Bash
    Steps: Run `node --input-type=module -e "import('./dist/config.js').catch(()=>process.exit(0))"` only after build, or rely on `npm run typecheck` before build.
    Expected: TypeScript accepts `defaultConfig.paths` with all required keys.
    Evidence: .sisyphus/evidence/task-2-typecheck.txt

  Scenario: Old fields are rejected by schema
    Tool: Bash
    Steps: Run `node scripts/run-tests.mjs tests/utils/config.test.ts tests/config-guardian.test.ts` after Task 6 updates tests.
    Expected: Tests assert old fields return defaults or invalid-config behavior according to current `loadConfig` invalid handling; no test expects old fields to work.
    Evidence: .sisyphus/evidence/task-2-old-fields-rejected.txt
  ```

  **Acceptance Criteria:**
  - `src/types.ts` no longer exposes `feature.output_dir`, `feature.prd_output_dir`, `archive.output_dir`, or `guardian.state_dir`.
  - `defaultConfig.paths` contains every final path key and no `legacy_*` keys.
  - `src/config.ts` validation rejects removed fields.

- [ ] 3. Implement project config source discovery with JSONC support (Agent: unspecified-high | Blocks: [5, 6] | Blocked By: [2])

  **Agent Profile:** Category `unspecified-high`; Skills `[]`; requires async file IO and careful source-priority behavior.

  **Parallelization:** Wave 2; can run in parallel with Task 4 after Task 2 completes.

  **Implementation Instructions:**
  - Add `src/utils/config-loader.ts` or equivalent small module.
  - Implement source priority as first selected source wins: `<project>/openflow.json`, then `<project>/openflow.jsonc`, then `ctx.config.openflow` from OpenCode. Do not deep-merge across sources.
  - Standalone `openflow.json` and `openflow.jsonc` must contain the OpenFlow config object directly, not nested under `openflow`.
  - `opencode.json`/OpenCode context path remains `ctx.config.openflow` only.
  - Because `package.json` currently has no JSONC parser dependency, implement a minimal state-machine JSONC comment stripper that removes `//` and `/* */` comments outside string literals; do not use a regex-only stripper.
  - Invalid or malformed selected standalone config must not fall through to lower-priority sources. It must produce the same invalid-config behavior path as `loadConfig()` validation: warn clearly and use defaults, unless the current project error pattern provides a stronger typed error.
  - Update `src/index.ts` startup and config reload callback to load config with `ctx.directory` plus `ctx.config`, so standalone files are considered both at initialization and reload.

  **QA Scenarios:**
  ```
  Scenario: Standalone JSON wins over OpenCode config
    Tool: Bash
    Steps: Create a temp test fixture with `openflow.json` setting `paths.plans` to `.custom/plans` and pass conflicting `ctx.config.openflow.paths.plans` as `.opencode/plans` in a unit test.
    Expected: Loaded config uses `.custom/plans`.
    Evidence: .sisyphus/evidence/task-3-source-priority-json.txt

  Scenario: JSONC comments parse correctly
    Tool: Bash
    Steps: Unit test fixture loads `openflow.jsonc` containing `//` and `/* */` comments plus `paths.builds` override.
    Expected: Loaded config uses the JSONC override and does not throw on comments.
    Evidence: .sisyphus/evidence/task-3-jsonc.txt

  Scenario: Higher-priority invalid standalone config does not fall through
    Tool: Bash
    Steps: Unit test fixture contains invalid `openflow.json` and valid lower-priority OpenCode config.
    Expected: Loader reports invalid selected source behavior and does not apply lower-priority OpenCode config.
    Evidence: .sisyphus/evidence/task-3-invalid-priority.txt
  ```

  **Acceptance Criteria:**
  - Config source priority is covered by tests for all three sources.
  - JSONC support works without adding a package dependency.
  - `src/index.ts` uses the new loader at startup and config reload.

- [ ] 4. Refactor path helpers to read only from `config.paths` (Agent: unspecified-high | Blocks: [5, 6] | Blocked By: [1, 2])

  **Agent Profile:** Category `unspecified-high`; Skills `[]`; this is the core path cleanup.

  **Parallelization:** Wave 2; can run in parallel with Task 3 after Task 2 completes.

  **Implementation Instructions:**
  - In `src/config.ts`, remove exported hardcoded path constants that represent configurable paths: `LEGACY_DESIGN_OUTPUT_DIR`, `LEGACY_REQUIREMENTS_OUTPUT_DIR`, `CHANGE_WORKSPACE_DIR`, `CURRENT_SPEC_DIR`, `CURRENT_WORKFLOW_DIR`.
  - Remove legacy design/requirements candidate helpers if no production caller needs them: `getLegacyDesignPath()` and `getLegacyRequirementsPath()` must not remain as compatibility fallbacks.
  - Update path helpers to accept `config?: OpenFlowConfig` when they currently cannot read config: `getBuildsPath`, `getBuildPath`, `getChangesPath`, `getAcceptanceStatePath`, `getPlanPath`, `getChangeWorkspacePath`, `ensureChangeWorkspacePath`, `getChangeDocumentPath`, `ensureArchivePath`, and any related helper found in Task 1.
  - Use `config?.paths.<key> ?? defaultConfig.paths.<key>` for every configurable path.
  - Replace archive path logic with `paths.archive`; replace change workspace logic with `paths.changes`; replace plan/build/acceptance state paths with the corresponding `paths` keys.
  - `getDesignCandidatePaths`, `getRequirementsCandidatePaths`, and `getBehaviorCandidatePaths` must only include current change-workspace paths, not `docs/design` or `docs/requirements` legacy candidates.

  **QA Scenarios:**
  ```
  Scenario: Path helper overrides work
    Tool: Bash
    Steps: Unit test calls path helpers with `config.paths.changes = 'custom/changes'`, `config.paths.archive = 'custom/archive'`, and `config.paths.plans = '.custom/plans'`.
    Expected: Returned paths include those custom roots.
    Evidence: .sisyphus/evidence/task-4-path-helper-overrides.txt

  Scenario: Legacy candidate paths are gone
    Tool: Bash
    Steps: Unit test calls design/requirements candidate helpers for a feature.
    Expected: Candidate arrays do not include `docs/design` or `docs/requirements`.
    Evidence: .sisyphus/evidence/task-4-no-legacy-candidates.txt
  ```

  **Acceptance Criteria:**
  - `rg "LEGACY_DESIGN_OUTPUT_DIR|LEGACY_REQUIREMENTS_OUTPUT_DIR|CHANGE_WORKSPACE_DIR|CURRENT_SPEC_DIR|CURRENT_WORKFLOW_DIR" src` returns no production definitions or usages.
  - `rg "docs/design|docs/requirements" src` returns no compatibility path helper usage.
  - All configurable path helper defaults come from `defaultConfig.paths`.

- [ ] 5. Update runtime callers to pass config and remove stale path assumptions (Agent: unspecified-high | Blocks: [6, 8] | Blocked By: [1, 3, 4])

  **Agent Profile:** Category `unspecified-high`; Skills `[]`; requires precise caller migration after helper signatures change.

  **Parallelization:** Wave 3; starts after Tasks 3 and 4.

  **Implementation Instructions:**
  - Update all callers of changed helpers to pass `ctx.config` or the current `OpenFlowConfig` object.
  - Known caller to update: `src/commands/quality-gate.ts` calls `getPlanPath(projectDir, feature)` and must pass config.
  - Update direct path construction in `src/utils/feature-resolver.ts`, `src/utils/change-units.ts`, `src/hooks/chat-message.ts`, and any file identified by Task 1 when the path corresponds to one of the final `paths` keys.
  - Keep path literals that are part of markdown examples, regex recognition of file references, or tests for docs text only if Task 1 classified them as non-runtime configuration.
  - Update logger metadata in `src/index.ts` so guardian state logging reads `config.paths.guardian_state`, not `config.guardian.state_dir`.

  **QA Scenarios:**
  ```
  Scenario: No stale runtime references to removed fields
    Tool: Bash
    Steps: Run `rg "feature\.output_dir|prd_output_dir|archive\.output_dir|guardian\.state_dir|state_dir" src tests`
    Expected: No production reference remains to removed fields; test references only assert rejection/removal.
    Evidence: .sisyphus/evidence/task-5-removed-field-grep.txt

  Scenario: Runtime callers compile with new helper signatures
    Tool: Bash
    Steps: Run `npm run typecheck`
    Expected: Exit code 0; no missing-argument or removed-property TypeScript errors.
    Evidence: .sisyphus/evidence/task-5-typecheck.txt
  ```

  **Acceptance Criteria:**
  - Every changed path helper caller passes config or intentionally uses defaults in tests.
  - `config.guardian.state_dir` no longer exists anywhere in production code.
  - `npm run typecheck` exits 0.

- [ ] 6. Rewrite and extend configuration tests (Agent: unspecified-high | Blocks: [8] | Blocked By: [2, 3, 4, 5])

  **Agent Profile:** Category `unspecified-high`; Skills `[]`; testing is the main regression protection for config behavior.

  **Parallelization:** Wave 3; starts after implementation tasks provide compileable APIs.

  **Implementation Instructions:**
  - Update `tests/utils/config.test.ts` for new schema: default config includes `paths`, partial `paths` overrides deep-merge with defaults, old fields are invalid/rejected, and behavioral fields still merge normally.
  - Rewrite `tests/config-guardian.test.ts`: remove all `guardian.state_dir` expectations; add tests for `guardian` behavior fields and `paths.guardian_state` validation.
  - Add tests for `openflow.json`, `openflow.jsonc`, and `ctx.config.openflow` source priority. Use temp directories consistent with existing test fixture style.
  - Add tests for JSONC comments using both line and block comments outside strings.
  - Add tests for path traversal validation on `paths.*` fields using the existing `validateConfigPath` rule.
  - Add path helper tests for `paths.changes`, `paths.archive`, `paths.plans`, `paths.builds`, `paths.acceptance_state`, `paths.feature_state`, `paths.change_units`, and `paths.guardian_state`.

  **QA Scenarios:**
  ```
  Scenario: Focused config tests pass
    Tool: Bash
    Steps: Run `node scripts/run-tests.mjs tests/utils/config.test.ts tests/config-guardian.test.ts`
    Expected: Exit code 0; output shows both config test files pass.
    Evidence: .sisyphus/evidence/task-6-focused-config-tests.txt

  Scenario: Removed fields are covered by tests
    Tool: Bash
    Steps: Inspect updated tests for `output_dir`, `prd_output_dir`, and `state_dir`.
    Expected: These strings appear only in tests that assert removed fields are invalid/rejected, not in success-path config examples.
    Evidence: .sisyphus/evidence/task-6-removed-field-test-coverage.txt
  ```

  **Acceptance Criteria:**
  - Focused config tests pass with `node scripts/run-tests.mjs tests/utils/config.test.ts tests/config-guardian.test.ts`.
  - Tests cover config source priority, JSONC parsing, partial paths merge, invalid paths, and removed old fields.

- [ ] 7. Update public configuration documentation and examples (Agent: writing | Blocks: [8] | Blocked By: [2, 4])

  **Agent Profile:** Category `writing`; Skills `[]`; documentation-only but must mirror final schema exactly.

  **Parallelization:** Wave 4 can start after schema and helper defaults are finalized.

  **Implementation Instructions:**
  - Update `README.md` configuration section to show `openflow.json` and `openflow.jsonc` as supported standalone files and document source priority.
  - Update `README_CN.md` with the same schema and priority in Chinese.
  - Update `docs/guide/installation.md` if it contains old `opencode.json`-only guidance or old path fields.
  - Remove `feature.output_dir`, `feature.prd_output_dir`, `archive.output_dir`, and `guardian.state_dir` from all success-path docs examples.
  - Show path fields only under the flat `paths` object.
  - Keep `opencode.json` documented only as the lowest-priority embedding option using a top-level `openflow` object.

  **QA Scenarios:**
  ```
  Scenario: Docs no longer recommend old fields
    Tool: Bash
    Steps: Run `rg "output_dir|prd_output_dir|state_dir" README.md README_CN.md docs/guide/installation.md`
    Expected: No match in recommended config examples; if mentioned, it is explicitly described as removed, not supported.
    Evidence: .sisyphus/evidence/task-7-docs-old-fields.txt

  Scenario: Docs show standalone config priority
    Tool: Bash
    Steps: Run `rg "openflow\.json|openflow\.jsonc|opencode\.json" README.md README_CN.md docs/guide/installation.md`
    Expected: Docs state `openflow.json > openflow.jsonc > opencode.json openflow` priority.
    Evidence: .sisyphus/evidence/task-7-docs-priority.txt
  ```

  **Acceptance Criteria:**
  - README English and Chinese examples use only the new schema.
  - Installation/config docs describe standalone files and priority accurately.

- [ ] 8. Run full verification and invoke quality gate (Agent: unspecified-high | Blocks: [] | Blocked By: [5, 6, 7])

  **Agent Profile:** Category `unspecified-high`; Skills [`openflow-quality-gate`] because this is final readiness verification.

  **Parallelization:** Final wave only; cannot run until all edits are complete.

  **Implementation Instructions:**
  - Run `npm run typecheck`.
  - Run `npm test`.
  - Run focused grep checks:
    - `rg "feature\.output_dir|prd_output_dir|archive\.output_dir|guardian\.state_dir" src tests README.md README_CN.md docs/guide/installation.md`
    - `rg "LEGACY_DESIGN_OUTPUT_DIR|LEGACY_REQUIREMENTS_OUTPUT_DIR|CHANGE_WORKSPACE_DIR|CURRENT_SPEC_DIR|CURRENT_WORKFLOW_DIR" src`
  - Manually QA config loading by adding or using a test fixture that proves `openflow.json`, `openflow.jsonc`, and `ctx.config.openflow` priority behavior with actual loaded config values.
  - After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.

  **QA Scenarios:**
  ```
  Scenario: Full automated verification passes
    Tool: Bash
    Steps: Run `npm run typecheck` and `npm test`.
    Expected: Both commands exit 0.
    Evidence: .sisyphus/evidence/task-8-full-verification.txt

  Scenario: Removed compatibility paths are absent
    Tool: Bash
    Steps: Run the two focused `rg` commands listed above.
    Expected: No production code usage of removed fields or removed path constants; docs contain no recommended old-field examples.
    Evidence: .sisyphus/evidence/task-8-removed-compatibility-grep.txt

  Scenario: Quality gate readiness
    Tool: OpenFlow skill
    Steps: Invoke `openflow-quality-gate` after all code/test/doc edits are complete.
    Expected: Quality gate reports readiness or a concrete blocking reason; executor does not claim completion before readiness.
    Evidence: .sisyphus/evidence/task-8-quality-gate.txt
  ```

  **Acceptance Criteria:**
  - `npm run typecheck` exits 0.
  - `npm test` exits 0 or any pre-existing unrelated failure is documented with evidence.
  - Removed fields and legacy constants are absent from production code.
  - Quality gate is invoked and readiness result is recorded.

## Execution Unit Estimate

8 tasks, approximately 18 execution sub-units. Same-wave concurrency never exceeds 2 tasks, so no task merging is required.

## Final Quality Gate Instruction

After implementation is complete, invoke the openflow-quality-gate skill. The skill decides whether harden is required and performs evidence-aware verify. Do not claim completion until the quality gate reports readiness.
