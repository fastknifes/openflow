---
layout: home

hero:
  name: OpenFlow
  text: AI 驱动开发的治理层
  tagline: 先澄清边界，再让 AI 带着证据完成变更
  actions:
    - theme: brand
      text: 开始教程
      link: /tutorial/
    - theme: alt
      text: 了解亮点
      link: /guide/highlights
    - theme: alt
      text: 安装 OpenFlow
      link: /tutorial/installation

features:
  - title: 归档自动生成代码地图
    details: 每次完成后生成 implementation-mapper.md，把需求、设计约束、代码文件、关键符号和验证证据连起来。
    icon: 🗺️
  - title: 质量门统一 harden / verify
    details: AI 完成代码后调用 openflow-quality-gate，由它按风险决定是否硬化审查，并检查证据是否足够进入归档。
    icon: 🛡️
  - title: 把项目知识变成长期记忆
    details: current / decisions / changes / archive 让需求边界、架构决策、实现过程和历史原因不再丢在聊天记录里。
    icon: 🧠
---

## 一句话理解 OpenFlow

OpenFlow 不是替代 AI 写代码的工具，而是让 AI 在写代码前先明确边界、在写代码后拿出证据、在完成后把事实归档。

```text
feature → writing-plan → implement → quality-gate → archive
             │                │             │              │
             │                │             │              └─ 生成 implementation-mapper.md
             │                │             └─ 统一 harden / verify readiness
             │                └─ OMO 或 OpenCode 原生执行
             └─ 生成可执行计划与验证要求
```

## 该从哪里开始？

- 第一次接入项目：阅读[手动安装](/tutorial/installation)或把[LLM 自动安装](/tutorial/installation-for-agents)发给你的 Agent。
- 想快速体验：跟着[10 分钟上手](/tutorial/quickstart)跑一次完整链路。
- 想理解价值：先看[功能亮点](/guide/highlights)和[核心概念](/guide/core-concepts)。
