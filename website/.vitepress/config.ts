import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(defineConfig({
  title: 'OpenFlow',
  description: '面向 AI 驱动开发的文档治理工作流',
  lang: 'zh-CN',
  base: '/openflow/',

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: '介绍', link: '/introduction/' },
      { text: '快速开始', link: '/getting-started/installation' },
      { text: '使用指南', link: '/guide/' },
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
          text: '指南入口',
          items: [
            { text: '概览', link: '/guide/' },
          ],
        },
        {
          text: '核心流程',
          items: [
            { text: 'Feature 工作流', link: '/guide/feature-workflow' },
            { text: '行为文档指南', link: '/guide/behavior-document-guide' },
            { text: '实现工作流', link: '/guide/implement-workflow' },
            { text: '开发中变更', link: '/guide/mid-development-change' },
            { text: '迁移已有文档', link: '/guide/migrate-existing-docs' },
            { text: '归档与追溯', link: '/guide/archive-and-traceability' },
          ],
        },
        {
          text: 'How It Works',
          items: [
            { text: 'Brainstorm', link: '/guide/how-it-works/brainstorm' },
            { text: 'Feature', link: '/guide/how-it-works/feature' },
            { text: 'Writing Plan', link: '/guide/how-it-works/writing-plan' },
            { text: 'Implement', link: '/guide/how-it-works/implement' },
            { text: 'Quality Gate', link: '/guide/how-it-works/quality-gate' },
            { text: 'Archive', link: '/guide/how-it-works/archive' },
          ],
        },
        {
          text: '亮点机制',
          items: [
            { text: 'TDD', link: '/guide/highlights/tdd' },
            { text: 'BDD', link: '/guide/highlights/bdd' },
            { text: '金字塔原则', link: '/guide/highlights/pyramid' },
            { text: '对抗性硬化', link: '/guide/highlights/harden' },
            { text: '代码地图', link: '/guide/highlights/code-map' },
            { text: '漂移检测', link: '/guide/highlights/drift-detection' },
            { text: '契约扫描', link: '/guide/highlights/contract-scanning' },
            { text: 'AI 反思', link: '/guide/highlights/ai-reflection' },
          ],
        },
        {
          text: '理解与架构',
          items: [
            { text: '理解 OpenFlow', link: '/guide/understanding/' },
            { text: '核心概念', link: '/guide/understanding/core-concepts' },
            { text: '目录约定', link: '/guide/architecture/directory-conventions' },
            { text: '架构图', link: '/guide/architecture/diagrams' },
            { text: '方案对比', link: '/guide/architecture/comparison' },
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
}))
