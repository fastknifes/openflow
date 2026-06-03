---
layout: doc
---

# 配置指南

OpenFlow 开箱即用——大多数项目不需要任何配置。但当你需要自定义时，这里是如何做。

## 配置源优先级

OpenFlow 支持三个配置源，按优先级从高到低：

1. **`openflow.json`** — 项目根目录
2. **`openflow.jsonc`** — 项目根目录（支持注释）
3. **`opencode.json`** 中的顶层 `openflow` 键

第一个找到的配置源生效，不会跨源深度合并。

## 最小配置

如果默认配置满足需求，你**不需要**创建任何配置文件。OpenFlow 开箱即用。

如果需要自定义，最小配置只需要你关心的字段。未指定的字段使用默认值。

### 场景：关闭自动触发

默认情况下，OpenFlow 会智能判断是否需要进入 Feature 工作流。如果你希望始终手动触发：

```json
{
  "feature": {
    "trigger_mode": "always"
  }
}
```

### 场景：自定义文档路径

如果你希望把归档目录放在别处：

```json
{
  "paths": {
    "archive": "docs/history"
  }
}
```

### 场景：嵌入 opencode.json

如果你不想多一个配置文件，可以把配置直接放在 `opencode.json` 中：

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
每个配置项的详细说明请参阅 [配置项参考](/reference/config-options)。
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

## 配置速查

| 想要什么 | 怎么配 |
|----------|--------|
| 关闭 Feature 工作流 | `feature.enabled: false` |
| 始终手动触发 | `feature.trigger_mode: "always"` |
| 关闭 TDD 注入 | `tdd.enabled: false` |
| 只跑 lint 和 test | `verification.quality: ["lint", "test"]` |
| 关闭归档 | `archive.enabled: false` |
| 关闭漂移检测 | `guardian.enabled: false` |
| 关闭自动修复漂移 | `guardian.auto_fix: false` |

## 下一步

- [10 分钟上手](./quickstart) —— 实际操作一遍完整工作流
- [配置项参考](/reference/config-options) —— 每个配置项的详细说明
- [命令参考](/reference/commands) —— 所有命令和 Skill 的完整参考
