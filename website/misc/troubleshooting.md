---
layout: doc
---

# 问题排查

本文档帮助你排查 OpenFlow 使用中遇到的常见问题。

## 安装与初始化

### 插件加载失败

**症状**：OpenCode 中无法识别 OpenFlow 命令。

**排查步骤**：

1. 确认 `opencode.json` 中已正确添加 `"@fastknife/openflow"` 到 `plugin` 数组
2. 确认 npm 包已安装：`npm list @fastknife/openflow`
3. 重启 OpenCode

### `/openflow-init` 执行后 AGENTS.md 未更新

**排查步骤**：

1. 检查项目根目录是否存在 `AGENTS.md`
2. 确认 OpenFlow 插件已正确加载
3. 检查文件写入权限

## 工作流问题

### `/openflow-feature` 提示找不到配置

**排查步骤**：

1. 确认项目根目录存在 `openflow.json`、`openflow.jsonc` 或 `opencode.json` 中的 `openflow` 配置
2. 检查 JSON 格式是否正确

### 质量门始终返回 NotReady

**可能原因**：

1. 验证步骤（lint、typecheck、test）未通过
2. 存在未解决的漂移检测发现
3. 文档未更新以反映代码变更

**建议**：查看质量门输出的具体证据列表，逐项解决。

### 归档失败

**排查步骤**：

1. 确认质量门已通过（状态为 `Ready` 或 `ReadyWithDocUpdates`）
2. 检查 `docs/changes/` 下对应功能目录是否存在
3. 确认 `docs/archive/` 目录写入权限

## 性能问题

### 漂移检测运行缓慢

**排查步骤**：

1. 检查 `guardian` 配置是否启用
2. 语义漂移审查使用配置的模型，如果模型响应慢，考虑切换
3. 检查里程碑粒度是否过细

### 计划生成超时

**排查步骤**：

1. 检查功能设计文档是否过于复杂
2. 考虑拆分为更小的功能单元
3. 检查网络连接和模型可用性

> 本文档正在建设中，更多排查场景和解决方案将持续补充。
