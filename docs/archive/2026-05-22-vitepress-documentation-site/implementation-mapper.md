# Implementation Mapper: vitepress-documentation-site

## Overview

VitePress documentation site for OpenFlow user-facing documentation.

## Requirement → Code Mapping

| Requirement | Files |
|---|---|
| VitePress site structure | `website/package.json`, `website/.vitepress/config.ts`, `website/.vitepress/theme/index.ts` |
| Installation guide migration | `website/getting-started/installation.md` (from `docs/guide/installation.md`) |
| Core content skeleton | `website/index.md`, `website/introduction/*.md`, `website/getting-started/*.md` |
| Guide skeleton | `website/guide/*.md` |
| Reference skeleton | `website/reference/*.md`, `website/highlights/*.md`, `website/misc/*.md` |
| GitHub Pages deployment | `.github/workflows/deploy-handbook.yml` |
| README cleanup | `README.md`, `README_CN.md` |
| Git ignore updates | `.gitignore` |

## Verification Evidence

- `cd website && npm run build`: ✅ passed (92 static files)
- `npm run typecheck`: ✅ passed (no errors)
- `npm run build`: ✅ passed (main project)
- `npm run test`: 12 pre-existing failures (unrelated to this change)

## Archive Location

- Design docs: `docs/archive/2026-05-22-vitepress-documentation-site/`
- Deployed at: `https://fastknifes.github.io/openflow/`
