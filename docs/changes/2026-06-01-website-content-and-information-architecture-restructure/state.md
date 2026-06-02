# website-content-and-information-architecture-restructure Feature State

- Status: `complete`
- Feature: `website-content-and-information-architecture-restructure`
- Updated At: 2026-06-01T07:46:38.244Z

## Feature Brief

Not specified

## Constraints

- 重构 website 内容与信息架构：消除重复占位页、建立三层导航结构、按职责重新分区
- reference/含4页。index+命令速查+FAQ+问题排查\(从tutorial和misc移入\)
- guide/下4个子目录+14个新页面\(6个工作原理+8个亮点\); tutorial/walkthrough/2个实操页; reference/index.md
- 所有架构图解和流程图使用内联Mermaid代码块\(类似原workflow/index.md的风格\)，不使用SVG图片
- 范围控制→头脑风暴页; 合约约束→Feature页; 工作树隔离+生态集成→执行页; 证据新鲜度→质量门页
- 不改视觉主题交互体验; 不换技术栈\(VitePress\); 不做i18n; 不改docs/目录本身的文档结构

## Assumptions

- None recorded.

## Generated Documents

- `F:\\ai-code\\openflow\\docs\\changes\\2026-06-01-website-content-and-information-architecture-restructure\\design.md`
- `F:\\ai-code\\openflow\\docs\\changes\\2026-06-01-website-content-and-information-architecture-restructure\\behavior.md`

## Next Steps

- [ ] Review `design.md` and `behavior.md` for constraint sufficiency
- [ ] Run `/openflow-writing-plan website-content-and-information-architecture-restructure` when ready for implementation
