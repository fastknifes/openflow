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
      { text: '介绍', link: '/介绍/' },
      { text: '使用指南', link: '/使用指南/' },
    ],

    sidebar: {
      '/介绍/': [
        {
          text: '介绍',
          items: [
            { text: '概览', link: '/介绍/' },
            { text: '快速开始', link: '/介绍/quickstart' },
            { text: '核心概念', link: '/介绍/concepts' },
            { text: '与竞品对比', link: '/介绍/comparison' },
            { text: '集成与依赖', link: '/介绍/integrations' },
          ],
        },
      ],
      '/使用指南/': [
        {
          text: '使用指南',
          items: [
            { text: '概览', link: '/使用指南/' },
          ],
        },
        {
          text: '教学流程',
          items: [
            { text: '阶段一：需求探索与确认', link: '/使用指南/tutorial-phase1' },
            { text: '阶段二：开发计划与实现', link: '/使用指南/tutorial-phase2' },
            { text: '阶段三：验证与归档', link: '/使用指南/tutorial-phase3' },
          ],
        },
        {
          text: '进阶',
          items: [
            { text: '需求变更', link: '/使用指南/change-request' },
            { text: '迁移已有文档', link: '/使用指南/migrate-existing-docs' },
          ],
        },
        {
          text: '开发计划',
          items: [
            { text: '金字塔原理编程', link: '/使用指南/highlights/pyramid' },
            { text: '设计模式', link: '/使用指南/highlights/design-pattern' },
            { text: '混合模式', link: '/使用指南/highlights/mixed-mode' },
          ],
        },
        {
          text: '质量门',
          items: [
            { text: 'TDD', link: '/使用指南/highlights/tdd' },
            { text: 'BDD 与集成测试', link: '/使用指南/highlights/bdd' },
            { text: '代码加固', link: '/使用指南/highlights/harden' },
            { text: '漂移检测', link: '/使用指南/highlights/drift-detection' },
            { text: '契约扫描', link: '/使用指南/highlights/contract-scanning' },
            { text: '代码地图', link: '/使用指南/highlights/code-map' },
          ],
        },
        {
          text: '参考',
          items: [
            { text: '命令速查', link: '/使用指南/reference/commands' },
            { text: '配置项', link: '/使用指南/reference/config-options' },
          ],
        },
      ],
    },

    outline: {
      label: '本页目录',
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
  },
}))
