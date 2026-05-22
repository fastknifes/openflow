# OpenFlow: The Governance Layer for AI-Driven Development

[中文文档](./README_CN.md)

OpenFlow is a governance layer for AI-driven development. It does not start with "how should we write this?" — it starts with "what exactly is the boundary of the problem, which constraints must not move, and what evidence counts as done?"

Built for brownfield systems where requirement traceability, verification evidence, and archival authority matter more than speed of first output.

## Documentation

**Full documentation: [https://fastknifes.github.io/openflow/](https://fastknifes.github.io/openflow/)**

## Quick Install

For LLM Agents (Claude Code, Cursor, Trae, etc.):

```
Install and configure OpenFlow by following the instructions here:
https://fastknifes.github.io/openflow/getting-started/installation
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

## License

MIT License. Developed by [fastknife](https://github.com/fastknifes).
