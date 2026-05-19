# OpenFlow Installation Guide for LLM Agents

> Copy this entire document into your LLM agent (Claude Code, AmpCode, Cursor, Trae, Qoder, etc.) — the agent will handle everything automatically.

You are installing OpenFlow — the governance layer for AI-driven development — into the current project.

## Step 1: Install OpenFlow

First, install the npm package and register it as an OpenCode plugin:

```bash
npm install @fastknife/openflow
```

Then edit `~/.config/opencode/opencode.json` (or `opencode.jsonc`) and add `"@fastknife/openflow"` to the `plugin` array. If the `plugin` field doesn't exist, create it. Example:

```json
{
  "plugin": ["@fastknife/openflow"]
}
```

If there are already other plugins, append to the existing array — do NOT replace them.

After the plugin is configured, tell the user: "OpenFlow installed. Run `/openflow-init` in OpenCode to set up this project. This writes the docs guide block into `AGENTS.md`."

## Step 2: Ask about Omo (Optional Orchestrator)

Ask the user: "OpenFlow works best with **Oh My OpenAgent (omo)** — an AI agent orchestrator that adds multi-agent workflows (Prometheus planning, ultrawork execution, etc.). Would you like me to install it?"

If the user says **yes**, check whether omo is already installed by looking for `"oh-my-openagent"` or `"oh-my-opencode"` in the `plugin` array of `~/.config/opencode/opencode.json`. If already present, skip to Step 3.

If not installed, fetch and follow the installation guide:

```bash
curl -fsSL https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/refs/heads/dev/docs/guide/installation.md
# If curl is unavailable (common on Windows), use instead:
# Invoke-WebRequest -Uri "https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/refs/heads/dev/docs/guide/installation.md" -UseBasicParsing | Select-Object -ExpandProperty Content
```

Read that file and execute its instructions. The installer (`bunx oh-my-opencode install`) will ask the user about their AI subscriptions (Claude, ChatGPT, Gemini, OpenCode Zen, etc.). Note: omo requires Bun runtime — do NOT use `npx`.

After installation, verify:

```bash
bunx oh-my-opencode doctor
```

If the user says **no**, skip omo and move to Step 3.

## Step 3: Ask about GitNexus (Optional Code Intelligence)

Ask the user: "GitNexus provides graph-powered code intelligence — it indexes your codebase so AI agents can trace call graphs, assess change impact, and navigate safely. Would you like me to install it?"

If the user says **no**, you are done. Tell the user: "OpenFlow is ready. Run `/openflow-feature <feature>` to start your first governed feature."

If the user says **yes**, proceed with installation:

### 3a: Install GitNexus globally

```bash
npm install -g gitnexus
```

### 3b: Index the current project

```bash
cd <project-root>
npx gitnexus analyze
```

(If you want embeddings for semantic search, add `--embeddings`: `npx gitnexus analyze --embeddings`)

### 3c: Configure MCP in opencode.json

**On macOS / Linux**, add this to `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "gitnexus": {
      "command": "npx",
      "args": ["-y", "gitnexus@latest", "mcp"]
    }
  }
}
```

**On Windows**, a known issue ([GitHub #1201](https://github.com/abhigyanpatwari/GitNexus/issues/1201)) prevents Node MCP clients from spawning the extensionless npm shim directly. You MUST use `cmd /c` with the `.cmd` wrapper.

First, find where `gitnexus.cmd` is located:

```powershell
where.exe gitnexus.cmd
```

Typical paths: `%APPDATA%\npm\gitnexus.cmd` or `C:\Users\<user>\AppData\Roaming\npm\gitnexus.cmd`.

Then add this config (replace the path with the actual output of `where.exe`):

```json
{
  "mcp": {
    "gitnexus": {
      "type": "local",
      "command": ["cmd", "/c", "C:\\Users\\<your-user>\\AppData\\Roaming\\npm\\gitnexus.cmd", "mcp"],
      "enabled": true
    }
  }
}
```

**IMPORTANT**: If `opencode.json` already has a `mcp` section with other servers, merge the `gitnexus` entry — do NOT replace the entire `mcp` object.

### 3d: Verify

Restart OpenCode. GitNexus MCP tools (`gitnexus_context`, `gitnexus_impact`, etc.) should now be available in the agent's tool list.

## Done

Tell the user: "OpenFlow + GitNexus are ready. Run `/openflow-feature <feature>` to start your first governed feature. The agent now has code intelligence — it can trace call graphs and measure change impact before editing."
