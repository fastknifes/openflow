---
layout: doc
---

# 最小配置

本文档介绍 OpenFlow 的配置方式，从最小可用配置到完整配置选项。

## 配置源优先级

OpenFlow 支持三个配置源，按优先级从高到低：

1. **`openflow.json`** — 项目根目录
2. **`openflow.jsonc`** — 项目根目录（支持注释）
3. **`opencode.json`** 中的顶层 `openflow` 键

第一个找到的配置源生效，不会跨源深度合并。

## 最小配置

如果默认配置满足需求，你**不需要**创建任何配置文件。OpenFlow 开箱即用。

如果需要自定义，最小配置只需要你关心的字段。未指定的字段使用默认值。

### 示例：自定义路径

```json
{
  "paths": {
    "plans": ".custom/plans",
    "archive": "docs/history"
  }
}
```

### 示例：调整 Feature 触发模式

```json
{
  "feature": {
    "trigger_mode": "always"
  }
}
```

### 示例：嵌入 opencode.json

```json
{
  "plugin": ["@fastknife/openflow"],
  "openflow": {
    "feature": {
      "trigger_mode": "always"
    },
    "verification": {
      "quality": ["lint", "typecheck", "test"]
    }
  }
}
```

## 完整配置参考

::: info
完整的配置项说明请参阅 [配置项参考](/reference/config-options)。
:::

```json
{
  "paths": {
    "changes": "docs/changes",
    "archive": "docs/archive",
    "current_requirements": "docs/current/requirements",
    "current_design": "docs/current/design",
    "current_spec": "docs/current/spec",
    "current_workflow": "docs/current/workflow",
    "builds": ".sisyphus/builds",
    "plans": ".sisyphus/plans",
    "acceptance_state": ".sisyphus/acceptance.local.md",
    "feature_state": ".sisyphus/feature",
    "change_units": ".sisyphus/change-units.json",
    "guardian_state": ".sisyphus/openflow/guardian"
  },
  "feature": {
    "enabled": true,
    "auto_trigger": true,
    "trigger_mode": "smart"
  },
  "tdd": {
    "enabled": true,
    "expand_threshold": 3
  },
  "verification": {
    "in_plan": true,
    "security": ["secret", "vuln"],
    "quality": ["lint", "typecheck", "test"]
  },
  "archive": {
    "enabled": true,
    "auto_promote_current": true
  },
  "writingPlan": {
    "enabled": true
  },
  "guardian": {
    "enabled": true,
    "auto_fix": true
  }
}
```

## 下一步

- [10 分钟上手](./quickstart) —— 实际操作一遍完整工作流
- [配置项参考](/reference/config-options) —— 每个配置项的详细说明
- [目录约定](/reference/directory-conventions) —— 理解 OpenFlow 的目录结构
