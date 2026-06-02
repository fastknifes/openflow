import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'OpenFlow',
  description: '面向 AI 驱动开发的文档治理工作流',
  lang: 'zh-CN',
  base: '/openflow/',

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: '指南', link: '/guide/' },
      { text: '教程', link: '/tutorial/' },
      { text: '参考', link: '/reference/' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '了解 OpenFlow',
          items: [
            { text: '概览', link: '/guide/understanding/' },
            { text: '核心概念', link: '/guide/understanding/core-concepts' },
          ],
        },
        {
          text: '设计与架构',
          items: [
            { text: '架构图解', link: '/guide/architecture/diagrams' },
            { text: '目录约定', link: '/guide/architecture/directory-conventions' },
            { text: '适用场景与对比', link: '/guide/architecture/comparison' },
          ],
        },
        {
          text: '工作原理',
          items: [
            { text: '头脑风暴', link: '/guide/how-it-works/brainstorm' },
            { text: 'Feature', link: '/guide/how-it-works/feature' },
            { text: '开发计划', link: '/guide/how-it-works/writing-plan' },
            { text: '执行', link: '/guide/how-it-works/implement' },
            { text: '质量门', link: '/guide/how-it-works/quality-gate' },
            { text: '归档', link: '/guide/how-it-works/archive' },
          ],
        },
        {
          text: '功能亮点',
          items: [
            { text: 'TDD 指导', link: '/guide/highlights/tdd' },
            { text: '金字塔编程', link: '/guide/highlights/pyramid' },
            { text: 'AI 自我反思', link: '/guide/highlights/ai-reflection' },
            { text: '设计漂移检测', link: '/guide/highlights/drift-detection' },
            { text: '合约与约束扫描', link: '/guide/highlights/contract-scanning' },
            { text: 'Code Map', link: '/guide/highlights/code-map' },
            { text: 'Harden 对抗审查', link: '/guide/highlights/harden' },
            { text: 'BDD 与集成测试', link: '/guide/highlights/bdd' },
          ],
        },
      ],
      '/tutorial/': [
        {
          text: '开始使用',
          items: [
            { text: '教程概览', link: '/tutorial/' },
            { text: '安装', link: '/tutorial/getting-started/installation' },
            { text: '10 分钟上手', link: '/tutorial/getting-started/quickstart' },
            { text: '最小配置', link: '/tutorial/getting-started/configuration' },
          ],
        },
        {
          text: '实操指南',
          items: [
            { text: '设计与规划', link: '/tutorial/walkthrough/design-and-planning' },
            { text: '实施与完成', link: '/tutorial/walkthrough/implement-and-complete' },
          ],
        },
        {
          text: '进阶场景',
          items: [
            { text: 'Issue 上下文处理', link: '/tutorial/advanced/issue-context' },
            { text: '开发中需求变更', link: '/tutorial/advanced/mid-development-change' },
            { text: '迁移已有文档', link: '/tutorial/advanced/migrate-docs' },
          ],
        },
      ],
      '/reference/': [
        { text: '命令速查', link: '/reference/commands' },
        { text: 'FAQ', link: '/reference/faq' },
        { text: '问题排查', link: '/reference/troubleshooting' },
      ],
    },

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025-present fastknife',
    },
  },

  // 预留 i18n 结构
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
    },
    // en: {
    //   label: 'English',
    //   lang: 'en-US',
    //   link: '/en/',
    //   themeConfig: {},
    // },
  },
})
