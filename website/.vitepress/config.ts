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
    ],

    sidebar: {
      '/guide/': [
        {
          text: '认识 OpenFlow',
          items: [
            { text: '概览', link: '/guide/' },
            { text: '核心概念', link: '/guide/core-concepts' },
            { text: '架构图解', link: '/guide/diagrams' },
            { text: '功能亮点', link: '/guide/highlights' },
            { text: '适用场景与对比', link: '/guide/comparison' },
            { text: '目录约定', link: '/guide/directory-conventions' },
          ],
        },
      ],
      '/tutorial/': [
        {
          text: '安装与上手',
          items: [
            { text: '教程概览', link: '/tutorial/' },
            { text: '手动安装', link: '/tutorial/installation' },
            { text: 'LLM 自动安装', link: '/tutorial/installation-for-agents' },
            { text: '10 分钟上手', link: '/tutorial/quickstart' },
            { text: '最小配置', link: '/tutorial/configuration' },
          ],
        },
        {
          text: '工作流教程',
          items: [
            { text: 'Feature 工作流', link: '/tutorial/feature-workflow' },
            { text: '实施与执行后端', link: '/tutorial/implementation' },
            { text: '质量门与归档', link: '/tutorial/quality-gate-and-archive' },
            { text: 'Issue 上下文处理', link: '/tutorial/issue-context' },
            { text: '开发中需求变更', link: '/tutorial/mid-development-change' },
            { text: '迁移已有文档', link: '/tutorial/migrate-docs' },
          ],
        },
        {
          text: '参考',
          items: [
            { text: '命令速查', link: '/tutorial/commands' },
            { text: 'FAQ', link: '/tutorial/faq' },
            { text: '问题排查', link: '/tutorial/troubleshooting' },
          ],
        },
      ],
      '/misc/': [
        {
          text: '其他',
          items: [],
        },
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
