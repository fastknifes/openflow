# OpenFlow: AI 驱动开发的工业级治理层

[English](./README.md)

OpenFlow 是 AI 驱动开发的治理层。它不是先问"怎么写"，而是先问"问题边界是什么、哪些约束不能破、什么证据才算完成"。

面向存量系统，关注需求可追溯、验证证据和归档权威，而非快速产出第一行代码。

## 文档

**完整文档：[https://fastknifes.github.io/openflow/](https://fastknifes.github.io/openflow/)**

## 快速安装

给 LLM Agent（Claude Code、Cursor、Trae 等）：

```
Install and configure OpenFlow by following the instructions here:
https://fastknifes.github.io/openflow/getting-started/installation
```

手动安装：

```bash
npm install @fastknife/openflow
```

然后在 `opencode.json` 中启用插件：

```json
{
  "plugins": ["@fastknife/openflow"]
}
```

## 开源协议

MIT License. 由 [fastknife](https://github.com/fastknifes) 开发。
