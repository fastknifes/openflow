# OpenFlow: AI 驱动开发的工业级治理层

[English](./README.md)

OpenFlow 是 AI 驱动开发的治理层。它不是先问"怎么写"，而是先问"问题边界是什么、哪些约束不能破、什么证据才算完成"。

面向存量系统，关注需求可追溯、验证证据和归档权威，而非快速产出第一行代码。

## 文档

**完整文档：[https://fastknifes.github.io/openflow/](https://fastknifes.github.io/openflow/)**

- 手动安装：[https://fastknifes.github.io/openflow/介绍/quickstart](https://fastknifes.github.io/openflow/介绍/quickstart)
- LLM 自动安装：[https://fastknifes.github.io/openflow/介绍/quickstart](https://fastknifes.github.io/openflow/介绍/quickstart)
- 快速上手：[https://fastknifes.github.io/openflow/使用指南/tutorial-phase1](https://fastknifes.github.io/openflow/使用指南/tutorial-phase1)

## 快速安装

给 LLM Agent（Claude Code、Cursor、Trae、Qoder 等）：

```
Install and configure OpenFlow by following the instructions here:
https://fastknifes.github.io/openflow/介绍/quickstart
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

OMO 和 GitNexus 都是可选增强，详见安装文档。若已经安装，应复用现有配置，不要重复安装或覆盖配置。

## OpenCode V1 与 V2

同一个包、同一个入口同时服务两代 OpenCode。默认导出同时带有 V1 的 `server()` 和 V2 的
`setup()`，各运行时只读取自己认识的那一个。

| 运行时 | 配置项 | 使用的入口 | 最低版本 |
|--------|--------|-----------|---------|
| OpenCode V2（`@opencode/cli`） | `plugins` | `setup()` | 2.0.x |
| OpenCode V1（`opencode-ai`） | `plugin` | `server()` | 1.18.29 |

若你仍需同时运行 OpenCode V1，两个配置项指向同一个包即可：

```jsonc
{
  "plugin":  ["@fastknife/openflow"],   // V1
  "plugins": ["@fastknife/openflow"]    // V2
}
```

低于 `1.18.29` 的 V1 版本要求函数式导出，而非对象式，请在这类环境固定到双形态之前的版本。
通用约定见 OpenCode V2 插件指南的
[Support V1](https://opencode.ai/v2/docs/build/plugins#support-v1)。

### V2 已知限制

V2 的 `session.hook("prompt")` 只对用户输入触发，且只暴露纯文本。OpenFlow 将 `chat.message`
钩子映射到它，因此完成度守卫与特性建议在用户回合仍可工作，但无法在同一个回合内拦截助手自己
的回复。V1 路径保留完整的 `chat.message` 语义。

## 开源协议

MIT License. 由 [fastknife](https://github.com/fastknifes) 开发。
