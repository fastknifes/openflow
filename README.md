# OpenFlow: The Governance Layer for AI-Driven Development

[中文文档](./README_CN.md)

OpenFlow is a governance layer for AI-driven development. It does not start with "how should we write this?" — it starts with "what exactly is the boundary of the problem, which constraints must not move, and what evidence counts as done?"

Built for brownfield systems where requirement traceability, verification evidence, and archival authority matter more than speed of first output.

## Documentation

**Full documentation: [https://fastknifes.github.io/openflow/](https://fastknifes.github.io/openflow/)**

- Manual install: [https://fastknifes.github.io/openflow/介绍/quickstart](https://fastknifes.github.io/openflow/介绍/quickstart)
- LLM agent install: [https://fastknifes.github.io/openflow/介绍/quickstart](https://fastknifes.github.io/openflow/介绍/quickstart)
- Quickstart: [https://fastknifes.github.io/openflow/使用指南/tutorial-phase1](https://fastknifes.github.io/openflow/使用指南/tutorial-phase1)

## Quick Install

For LLM Agents (Claude Code, Cursor, Trae, Qoder, etc.):

```
Install and configure OpenFlow by following the instructions here:
https://fastknifes.github.io/openflow/介绍/quickstart
```

Manual:

```bash
npm install @fastknife/openflow
```

Then enable the plugin in your `opencode.json`:

```json
{
  "plugins": ["@fastknife/openflow"]
}
```

Optional integrations such as OMO and GitNexus are documented in the install guide. If they are already installed, reuse the existing configuration instead of reinstalling or overwriting it.

## OpenCode V1 and V2

One package serves both OpenCode generations from the same entrypoint. The default export
carries a V1 `server()` hook and a V2 `setup()` hook; each runtime picks the one it understands.

| Runtime | Config key | Entry used | Minimum version |
|---------|-----------|------------|-----------------|
| OpenCode V2 (`@opencode/cli`) | `plugins` | `setup()` | 2.0.x |
| OpenCode V1 (`opencode-ai`) | `plugin` | `server()` | 1.18.29 |

If you still run OpenCode V1 as well, keep both keys pointing at the same package:

```jsonc
{
  "plugin":  ["@fastknife/openflow"],   // V1
  "plugins": ["@fastknife/openflow"]    // V2
}
```

V1 releases older than `1.18.29` expect a function export rather than the object form, so pin
`@fastknife/openflow` to a pre-dual version there. See
[Support V1](https://opencode.ai/v2/docs/build/plugins#support-v1) in the OpenCode V2 plugin
guide for the general contract.

### Known V2 limitation

V2's `session.hook("prompt")` only fires for user prompts and exposes the prompt as plain text.
OpenFlow maps its `chat.message` hook onto it, so the completion guard and feature suggestions
still work for user turns, but assistant-side interception (analyzing the assistant's own reply
in the same turn) is unavailable. The V1 path retains full `chat.message` semantics.

## License

MIT License. Developed by [fastknife](https://github.com/fastknifes).
