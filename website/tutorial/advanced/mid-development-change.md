---
layout: doc
---

# 开发中需求变更

当 feature 已经开始，但还没有归档时，如果需求发生变化，不要直接改代码。先更新工作区中的设计和约束。

```text
/openflow-change <feature> "<change description>"
```

## 适用场景

- 设计已经生成；
- 实现正在进行或即将开始；
- 用户提出新增、删减或调整需求；
- 变更还没有归档。

## 不适用场景

- feature 已经归档：应新开 `/openflow-feature`。
- 只是代码实现细节调整：按原 plan 执行即可。
- 语义完全不明确：先 brainstorm 或重新澄清。

## 完成后

需求变更完成后仍然走主链路：

```text
implement → openflow-quality-gate → archive
```
