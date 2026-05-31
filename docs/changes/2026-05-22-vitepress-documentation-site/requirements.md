# Requirements: VitePress Documentation Site Refactor

## Functional Requirements

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-1 | VitePress site must keep source under `website/`. | Must | Existing architecture |
| FR-2 | Top navigation must be reduced to “指南” and “教程”. | Must | User feedback |
| FR-3 | Canonical content must be concentrated under `guide/` and `tutorial/`. | Must | User feedback |
| FR-4 | Tutorials must teach the OpenFlow workflow end-to-end. | Must | User feedback |
| FR-5 | Installation docs must split manual install and LLM-agent install. | Must | User feedback |
| FR-6 | OMO and GitNexus must be documented as optional integrations; already-installed integrations must be skipped. | Must | User feedback |
| FR-7 | README and README_CN must link to the new install docs. | Must | User feedback |
| FR-8 | Issue must not be presented as a separate primary completion workflow; issue context is consumed by quality gate/archive. | Must | Current command registration + user clarification |
| FR-9 | Quality gate docs must present `openflow-quality-gate` as the unified harden/verify path. | Must | ADR-004 |
| FR-10 | Six SVG diagrams must be added and embedded in relevant docs. | Must | User request |
| FR-11 | Old route directories may remain only as compatibility notices, not canonical stale docs. | Should | Link compatibility |
| FR-12 | Site must build without adding runtime or VitePress diagram dependencies. | Must | Build isolation |

## Non-Goals

| ID | Description |
|---|---|
| NG-1 | Do not add a Mermaid/VitePress plugin for diagrams. |
| NG-2 | Do not require OMO or GitNexus for OpenFlow. |
| NG-3 | Do not document `/openflow-harden` or `/openflow-verify` as normal manual commands. |
| NG-4 | Do not keep placeholder pages that say “正在建设中”. |
| NG-5 | Do not migrate all internal governance docs into the public site. |

## Acceptance Criteria

- [ ] `website/.vitepress/config.ts` exposes only “指南” and “教程” in top nav.
- [ ] `website/tutorial/installation.md` documents manual installation.
- [ ] `website/tutorial/installation-for-agents.md` documents LLM-agent installation with optional OMO/GitNexus skip logic.
- [ ] `website/guide/diagrams.md` embeds six diagrams.
- [ ] The six SVG files exist under `website/public/diagrams/`.
- [ ] Canonical docs do not contain `正在建设中` or obsolete old navigation links.
- [ ] `README.md` and `README_CN.md` link to `/tutorial/installation` and `/tutorial/installation-for-agents`.
- [ ] `cd website && npm run build` passes.
- [ ] `gitnexus_detect_changes(scope=all)` reports low risk or expected documentation-only impact.
