---
layout: doc
---

# OpenFlow 指南

OpenFlow 是运行在 OpenCode 上的 AI 开发治理层。它不追求让 AI 更快地开始写代码，而是先回答三个问题：

1. 这次变更的边界是什么？
2. 哪些事实、约束和行为不能被悄悄改变？
3. 什么证据足以说明这次变更可以正式完成？

## 它解决什么问题？

在棕地项目里，AI 最大的风险通常不是“写不出代码”，而是：

- 把模糊症状直接当成 bug 修；
- 代码改了，但没人知道为什么改；
- 文档与实现长期漂移；
- AI 声称完成，却没有可复核证据；
- 会话、人员或 Agent 切换后，项目知识重新归零。

OpenFlow 用一条受治理的主链路解决这些问题：

```text
brainstorm → feature → writing-plan → implement → quality-gate → archive
```

其中 `brainstorm` 是可选的对话探索；真正的工程闭环从 `/openflow-feature` 开始，到 `/openflow-archive` 固化为止。

## 下一步

- [核心概念](./core-concepts) — 理解 current / changes / archive / decisions 的边界。
- [功能亮点](./highlights) — 看 OpenFlow 与普通 AI 工作流的差异。
- [教程概览](/tutorial/) — 开始实际使用。
