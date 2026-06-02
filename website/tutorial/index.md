---
layout: doc
---

# OpenFlow 教程

这部分只讲"怎么用"。如果你还不了解 OpenFlow 解决什么问题，先读[指南](/guide/)；如果你已经准备接入项目，从安装开始即可。

## 推荐路径

1. [安装 OpenFlow](/tutorial/getting-started/installation)。
2. 跑一遍[10 分钟上手](/tutorial/getting-started/quickstart)。
3. 跟着[设计与规划实操](/tutorial/walkthrough/design-and-planning)开始真实变更。
4. 用[实施与完成实操](/tutorial/walkthrough/implement-and-complete)跑完闭环。

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
