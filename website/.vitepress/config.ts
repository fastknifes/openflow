import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'OpenFlow',
  description: '面向 AI 驱动开发的文档治理工作流',
  lang: 'zh-CN',
  base: '/openflow/',

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: '介绍', link: '/introduction/' },
      { text: '快速开始', link: '/getting-started/installation' },
      { text: '使用指南', link: '/guide/feature-workflow' },
      { text: '参考', link: '/reference/commands' },
      { text: '亮点', link: '/highlights/quality-gate' },
    ],

    sidebar: {
      '/introduction/': [
        {
          text: '介绍',
          items: [
            { text: '概览', link: '/introduction/' },
            { text: '核心概念', link: '/introduction/concepts' },
            { text: '工程哲学', link: '/introduction/philosophy' },
            { text: '与竞品对比', link: '/introduction/comparison' },
          ],
        },
      ],
      '/getting-started/': [
        {
          text: '快速开始',
          items: [
            { text: '安装', link: '/getting-started/installation' },
            { text: '10 分钟上手', link: '/getting-started/quickstart' },
            { text: '最小配置', link: '/getting-started/configuration' },
          ],
        },
      ],
      '/guide/': [
        {
          text: '使用指南',
          items: [
            { text: 'Feature 工作流', link: '/guide/feature-workflow' },
            { text: '行为文档指南', link: '/guide/behavior-document-guide' },
            { text: '实现工作流', link: '/guide/implement-workflow' },
            { text: '开发中变更', link: '/guide/mid-development-change' },
            { text: '迁移已有文档', link: '/guide/migrate-existing-docs' },
            { text: '归档与追溯', link: '/guide/archive-and-traceability' },
          ],
        },
      ],
      '/reference/': [
        {
          text: '参考',
          items: [
            { text: '命令速查', link: '/reference/commands' },
            { text: '配置项', link: '/reference/config-options' },
            { text: '目录约定', link: '/reference/directory-conventions' },
          ],
        },
      ],
      '/highlights/': [
        {
          text: '亮点',
          items: [
            { text: '质量门', link: '/highlights/quality-gate' },
            { text: '漂移守护', link: '/highlights/drift-guardian' },
            { text: '智能归档', link: '/highlights/smart-archive' },
            { text: 'TDD/BDD/SDD', link: '/highlights/tdd-bdd-sdd' },
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
