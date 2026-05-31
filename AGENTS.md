<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **openflow** (6787 symbols, 11929 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/openflow/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/openflow/context` | Codebase overview, check index freshness |
| `gitnexus://repo/openflow/clusters` | All functional areas |
| `gitnexus://repo/openflow/processes` | All execution flows |
| `gitnexus://repo/openflow/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

<!-- OPENFLOW DOCS GUIDE:BEGIN -->
## 文档阅读指南

以下目录均为按需阅读，不要求一次性通读；只在对应工作阶段或问题需要时再打开相关文件。

- `docs/current/requirements/`：当前需求事实与验收要点，优先作为“要做什么”的依据。
- `docs/current/design/`：当前设计事实、模块边界与实现约束，优先作为“怎么做”的依据。
- `docs/current/spec/`：当前规格说明与可执行规范，优先用于校准行为细节与接口约定。
- `docs/current/workflow/`：当前流程规则与协作步骤，优先用于确认文档与执行顺序。
- `docs/decisions/`：跨版本的架构与治理决策，只有在需要理解长期原则或取舍时才阅读。
- `docs/changes/`：进行中的变更工作区，仅在处理某个具体 feature、需求或设计任务时阅读。
- `docs/archive/`：已完成并冻结的历史归档，仅在追溯背景、对比演进或审计时阅读。
- `docs/current/workflow/ai-reflection/`：AI 自我反思记录与纠正规则，当该目录存在相关内容时，按需阅读与当前任务相关的纠正规则或反思记录，避免重复犯错。

阅读原则：先读当前、再读相关、最后才读历史；先看最小必要集合，再按需要扩展。
<!-- OPENFLOW DOCS GUIDE:END -->

## Dependence
本项目是opencode 的插件, 弱依赖于omo(oh-my-openagent), 如遇到与之相关的问题时，可搜索它们的源码。
- omo `F:\ai-code\oh-my-openagent`
- opencode `F:\ai-code\opencode`

## 文档
- 在阅读文档时以docs/*.md 文档为准
- website/*.md 有一定的滞后，请忽略它。

## lsp
- *.md 文件不需要使用LSP 验证

## 语言
默认使用用户输入的语言进行回复，生成的文件也应使用相同语言。  
如果用户使用中文，则所有回复以及生成的文件均使用中文；除非用户明确指定使用英文或其他语言。
