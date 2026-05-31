---
layout: doc
---

# 最小配置

OpenFlow 默认开箱即用。只有当你需要调整目录、验证策略或归档行为时，才需要配置文件。

## 配置来源

OpenFlow 支持三个来源，优先级从高到低：

1. 项目根目录 `openflow.json`
2. 项目根目录 `openflow.jsonc`
3. `opencode.json` 中的顶层 `openflow` 键

第一个找到的来源生效，不跨来源深度合并。

## 常见最小配置

```json
{
  "verification": {
    "quality": ["lint", "typecheck", "test"]
  },
  "archive": {
    "auto_promote_current": true
  }
}
```

## 自定义路径

```json
{
  "paths": {
    "changes": "docs/changes",
    "archive": "docs/archive",
    "plans": ".sisyphus/plans"
  }
}
```

## OMO / GitNexus 不在这里强制配置

OMO 和 GitNexus 都是可选增强。是否安装和如何配置应在[安装教程](./installation)中处理，不应通过 OpenFlow 配置强制要求。
