# TDD Skill Redesign: From Plan Enhancer to Conditional AI Skill

## Human Consensus Summary

Feature title: TDD Skill Redesign
Internal slug: tdd-skill-redesign
Source intent: 将 TDD 从 plan enhancer 静态注入改为 AI skill 动态注册，解决死模板、全量应用、与执行脱节的问题
Problem or improvement target: 当前 TDD 通过 plan enhancer 在计划文件中静态注入通用 Red-Green-Refactor 模板，不结合代码上下文，无法区分核心业务和胶水代码
Expected result: TDD 变为运行期指导 skill，由配置控制，核心业务才使用，orchestrator 决定加载，subagent 函数级自主判断

## Identity And Assumptions

- Feature slug: tdd-skill-redesign
- Feature title: TDD Skill Redesign
- Source intent: 将 TDD 从 plan enhancer 静态注入改为 AI skill 动态注册
- Assumptions:
  - Existing users with `expand_threshold` in config will have it ignored gracefully
  - The quality gate will still expect TDD evidence for core business logic
  - The skill registration system can handle conditional registration based on config
  - AI agents can self-judge whether code is "core business" vs "glue/utilities"
- Pending confirmations:
  - None

## Overview

Feature: tdd-skill-redesign
In scope:
- Create `src/skills/tdd-skill.ts` with TDD skill content based on superpowers TDD skill adapted for OpenFlow
- Modify `src/skills/registry.ts` for conditional skill registration (only when `tdd.enabled=true`)
- Add `openflow-tdd` to `OPENFLOW_REGISTERED_SKILL_NAMES` in `src/commands/manifest.ts`
- Update `src/skills/registration.ts` to pass config to `getSkills()`
- Remove `addTddExpansionComment()` and related code from `src/plan/enhancer.ts`
- Simplify `TddConfig` in `src/types.ts` and `src/config.ts` (remove `expand_threshold`)
- Remove TDD from plan enhancement trigger in `src/hooks/tool-after.ts`
- Remove `expand_threshold` from `src/commands/config-cmd.ts`
- Update tests: remove TDD expansion tests, add skill registration tests

Out of scope:
- Changes to quality-gate verify logic (TDD evidence expectations remain the same)
- Changes to writing-plan command or plan format
- Changes to the core Red-Green-Refactor TDD cycle (content preserved in skill)
- New user-facing slash command (skill is AI-invoked, not user-facing)

## Problem

当前 TDD 通过 `plan enhancer` 的 `addTddExpansionComment()` 在计划文件中静态注入 Red-Green-Refactor 模板。这导致四个问题：

1. **死模板** — 每个实现任务生成的 TDD 指导都是相同的通用骨架，不结合具体代码上下文
2. **全量应用** — 只要实现任务数量 >= `expand_threshold`（默认3），所有任务一律注入 TDD 指导，无法区分核心业务和胶水代码
3. **与执行脱节** — 计划文件中的 TDD 指导是一段 Markdown 文本，AI agent 执行时大概率不会逐条遵守
4. **配置冗余** — `expand_threshold` 增加了理解负担，实际价值有限

## Goals

- Solve: TDD 指导从静态模板变为动态 skill，结合代码上下文生效
- Solve: 只有核心业务逻辑走 TDD，胶水代码/配置/工具函数可跳过
- Solve: TDD 指导在代码编写时实时生效，而非计划文件中的一段文字
- Honor priority: 兼容现有系统
- Honor priority: 风险最小

## Non-Goals

- 全面重写 quality gate 逻辑
- 为 TDD 添加新的用户交互界面
- 修改 OpenCode 的 skill 系统本身
- 支持多语言/多框架的 TDD 模板生成

## Behavior Alignment

| Behavior Scenario | Design Response | Risk |
|------------------|-----------------|------|
| When `tdd.enabled=true`, OpenFlow registers TDD skill during plugin init | TDD skill written to `~/.config/opencode/skills/openflow-tdd/SKILL.md` | Low |
| When `tdd.enabled=false`, no TDD skill is registered | No skill file created; orchestrator never loads it | Low |
| Orchestrator delegates core business implementation task | `load_skills` includes `"openflow-tdd"`; subagent sees TDD instructions | Low |
| Orchestrator delegates glue/config utility task | `load_skills` does not include `"openflow-tdd"`; subagent works normally | Low |
| Subagent loaded with TDD skill implements a function | Follows Red-Green-Refactor cycle; writes failing test first | Medium |
| Subagent loaded with TDD skill sees simple passthrough function | May skip TDD with brief reasoning; no dogmatic enforcement | Medium |
| Existing plan files with `## TDD Expanded Tasks` remain | Static text ignored; no breaking change | Low |
| Existing config with `expand_threshold` remains | Zod strict mode ignores unknown keys; no error | Low |

## Design Constraints

- [must] Backward compatible: existing configs with `expand_threshold` do not break
- [must] Existing plan files with TDD sections do not cause errors
- [must] Other plan enhancer features (Design Context, Verification Phase, Budget Warning) continue working
- [should] Skill content is AI-oriented, not user-facing documentation
- [should] Follow existing skill registration patterns in `src/skills/`
- [must] Config schema change is minimal: only remove `expand_threshold` from `TddConfig`

## Success Criteria

- [ ] When `tdd.enabled=true`, `~/.config/opencode/skills/openflow-tdd/SKILL.md` exists after plugin init
- [ ] When `tdd.enabled=false`, `openflow-tdd` skill directory does not exist
- [ ] Plan files no longer contain auto-generated `## TDD Expanded Tasks` sections
- [ ] `TddConfig` type has no `expand_threshold` field
- [ ] `bun test` passes for modified files
- [ ] `npm run typecheck` passes

## Risks And Mitigations

| Risk | Mitigation |
|------|-----------|
| Config schema change breaks existing users | Zod `.strict()` ignores unknown keys by default in this codebase; existing `expand_threshold` will be silently ignored |
| Skill not loaded when it should be | Skill description clearly states when to load; orchestrator judges based on task description |
| AI skips TDD when it shouldn't | Skill content includes clear "core business" criteria; quality gate still checks for test evidence |
| Plan enhancer removal breaks something else | Other enhancer features (Design Context, Verification Phase, Budget Warning) are independent and remain |

## Testing Strategy

- Unit tests for skill registration conditional logic
- Unit tests for `enhancer.ts` to verify TDD sections are NOT added
- Unit tests for config parsing with/without `expand_threshold`
- Regression test: verify other plan enhancer features still work
