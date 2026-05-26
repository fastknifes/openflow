---
layout: doc
---

# 问题排查

## OpenCode 识别不到 OpenFlow 命令

1. 确认已安装：`npm install @fastknife/openflow`。
2. 确认 `opencode.json` 中 `plugins` 包含 `@fastknife/openflow`。
3. 重启 OpenCode。
4. 运行 `/openflow-init` 验证。

## `/openflow-implement` 没有走 OMO

OMO 是可选增强。请确认：

- OMO 已安装；
- OpenCode 插件配置中包含 OMO；
- OMO doctor/检查命令通过。

如果没有 OMO，OpenFlow 会回退到 OpenCode 原生执行路径，这是正常行为。

## GitNexus 工具不可用

GitNexus 是可选增强。若需要它：

1. 确认已安装 `gitnexus`。
2. 确认 MCP 配置中有 `gitnexus`。
3. Windows 下确认使用 `gitnexus.cmd` 通过 `cmd /c` 启动。
4. 重启 OpenCode。

## 质量门返回 NotReady

查看输出中的 blocker：

- 证据缺失或过期；
- 关键场景没有覆盖；
- harden 发现未解决问题；
- 上下文缺失导致 readiness 不允许归档。

修复后重新让 AI 调用 `openflow-quality-gate`。

## 归档失败

常见原因：

- 没有 fresh matching readiness；
- readiness 是 NotReady / NeedsDecision；
- feature 名称不匹配；
- 工作区缺失。

先重新运行质量门并确认 feature 名一致。
