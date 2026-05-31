---
layout: doc
---

# OpenFlow 教程

这部分只讲“怎么用”。如果你还不了解 OpenFlow 解决什么问题，先读[指南](/guide/)；如果你已经准备接入项目，从安装开始即可。

## 推荐路径

1. [手动安装](./installation)或把[LLM 自动安装](./installation-for-agents)交给 Agent。
2. 跑一遍[10 分钟上手](./quickstart)。
3. 按[Feature 工作流](./feature-workflow)开始真实变更。
4. 实现后让 AI 调用[质量门](./quality-gate-and-archive)，再归档。

## 最小命令链

```text
/openflow-init
/openflow-feature <feature>
/openflow-writing-plan <feature>
/openflow-implement <feature>
openflow-quality-gate
/openflow-archive <feature>
```

`openflow-quality-gate` 是 AI-callable Skill，不是普通用户 slash command。实现完成后由 AI 调用。
