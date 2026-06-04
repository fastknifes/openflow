# Design: VitePress Documentation Site Refactor

## Overview

本次变更将 `website/` VitePress 官网从“介绍 / 快速开始 / 使用指南 / 参考 / 亮点”五段式骨架，重构为面向终端用户的双导航信息架构：**指南** 与 **教程**。

新目标不是继续扩展旧骨架，而是解决用户反馈的核心问题：内容太散、安装指引不清、当前功能说明滞后、缺少吸引人的亮点表达，以及缺少直观图解。

## Confirmed Direction

用户明确确认以下方向：

1. 顶部导航应收敛为“指南 / 教程”。
2. 所有核心说明应集中到少量文档，而不是分散在介绍、参考、指南、亮点多个入口。
3. 教程必须教用户如何使用 OpenFlow 的工作流。
4. Issue 不再作为官网主工作流推广；其能力被质量门与归档链路消费。
5. 安装必须分为“手动安装”和“LLM 自动安装”。
6. OMO 与 GitNexus 均为可选增强；如果已安装，安装流程必须跳过并复用现有配置。
7. README / README_CN 必须引用新的安装文档。
8. 官网需要新增图解，包括工作流、implement、quality gate、harden、BDD/集成测试、archive。

## Target Information Architecture

```text
website/
├── index.md
├── guide/
│   ├── index.md
│   ├── core-concepts.md
│   ├── diagrams.md
│   ├── highlights.md
│   ├── comparison.md
│   └── directory-conventions.md
├── tutorial/
│   ├── index.md
│   ├── installation.md
│   ├── installation-for-agents.md
│   ├── quickstart.md
│   ├── configuration.md
│   ├── feature-workflow.md
│   ├── implementation.md
│   ├── quality-gate-and-archive.md
│   ├── issue-context.md
│   ├── mid-development-change.md
│   ├── migrate-docs.md
│   ├── commands.md
│   ├── faq.md
│   └── troubleshooting.md
├── public/
│   └── diagrams/
│       ├── workflow.svg
│       ├── implement.svg
│       ├── quality-gate.svg
│       ├── harden.svg
│       ├── bdd-integration.svg
│       └── archive.svg
├── getting-started/   # old URL compatibility notices
├── introduction/      # old URL compatibility notices
├── reference/         # old URL compatibility notices
├── highlights/        # old URL compatibility notices
└── misc/              # old URL compatibility notices
```

## VitePress Configuration

`website/.vitepress/config.ts` uses two top-level nav items:

```ts
nav: [
  { text: '指南', link: '/guide/' },
  { text: '教程', link: '/tutorial/' },
]
```

The sidebar is grouped by actual user tasks:

- `guide/`：理解 OpenFlow、核心概念、图解、亮点、适用场景、目录约定。
- `tutorial/`：安装、上手、工作流、质量门归档、Issue 上下文、迁移、命令、FAQ、排查。

Old directories remain as compatibility pages only, to avoid breaking previously published links while preventing stale content from appearing as canonical guidance.

## Installation Design

Installation is split into two user paths:

| Page | Audience | Key behavior |
|---|---|---|
| `tutorial/installation.md` | Human users | Manual npm install, plugin config, `/openflow-init`, optional OMO/GitNexus notes |
| `tutorial/installation-for-agents.md` | LLM agents | Copyable agent instructions with explicit “read existing config, merge, do not overwrite” rules |

OMO and GitNexus are explicitly optional:

- If installed, skip installation and reuse existing config.
- If not installed, ask user before installing.
- Refusing either option must not block OpenFlow installation.

## Current Workflow Semantics

The canonical flow is:

```text
brainstorm → feature → writing-plan → implement → quality-gate → archive
```

`openflow-quality-gate` is the unified post-implementation gate. `/openflow-harden` and `/openflow-verify` are not documented as normal manual entrypoints.

Issue handling is documented as context feeding the unified quality/archive chain, not as a separate public completion flow.

## Diagram Strategy

Use static SVG files under `website/public/diagrams/` instead of Mermaid. Rationale:

- VitePress renders SVG assets without extra plugins.
- GitHub Pages build remains dependency-free.
- The diagrams can be embedded across multiple pages with normal Markdown image syntax.

Required diagrams:

1. `workflow.svg` — main OpenFlow workflow.
2. `implement.svg` — `/openflow-implement` creates `ImplementationRun` and routes to OMO/OpenCode.
3. `quality-gate.svg` — context bundle, risk assessment, harden, verify, readiness.
4. `harden.svg` — Coordinator / Reviewer / Executor adversarial loop.
5. `bdd-integration.svg` — behavior scenarios to integration evidence mapping.
6. `archive.svg` — readiness + docs freeze + current promotion + implementation mapper.

## README Updates

`README.md` and `README_CN.md` should stay short and link to the canonical install pages:

- `/tutorial/installation`
- `/tutorial/installation-for-agents`
- `/tutorial/quickstart`

They must mention that OMO and GitNexus are optional and should be skipped when already installed.

## Non-Goals

- Do not add Mermaid or another diagram plugin.
- Do not make OMO or GitNexus required.
- Do not revive `/openflow-harden` or `/openflow-verify` as normal user commands.
- Do not present Issue as a separate primary completion workflow.
- Do not migrate internal `docs/current/*` wholesale into the public site.

## Validation

- `website/.vitepress/config.ts` has no LSP diagnostics.
- `website` build must pass with `npm run build`.
- Stale phrases such as `正在建设中` and old navigation paths should not remain in canonical pages.
- README links must point to the new install pages.
