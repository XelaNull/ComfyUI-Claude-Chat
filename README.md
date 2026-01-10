# ComfyUI Claude Chat

An AI-powered assistant for ComfyUI that can **analyze, create, and modify workflows** through natural conversation.

![Claude Chat Panel](docs/screenshot.png)

## What Can It Do?

### Chat & Analyze
Ask questions about your workflow, get explanations, troubleshoot issues.

> "Why is my image grainy?"
> "What CFG should I use for SDXL?"
> "Explain what this workflow does"

### Create Workflows
Describe what you want, and Claude builds it for you.

> "Create a basic text-to-image workflow"
> "Add img2img with ControlNet to this"
> "Build an upscaling pipeline with face restoration"

### Modify & Reorganize
Make changes through natural language.

> "Replace the KSampler with KSamplerAdvanced"
> "Add a LoRA loader between the checkpoint and the sampler"
> "Organize my workflow - it's a mess"

### Smart Organization
Two modes: instant rule-based or intelligent semantic grouping.

> "organize my workflow" → Instant JS-based cleanup
> "analyze and organize intelligently" → Claude groups by purpose, explains reasoning

---

## Features

| Feature | Description |
|---------|-------------|
| **Chat Panel** | Draggable, resizable window integrated into ComfyUI |
| **Workflow Awareness** | Claude sees your nodes, connections, groups, and settings |
| **36 Agent Tools** | Full control: create, modify, connect, organize, analyze |
| **Batch Operations** | Complex multi-step changes in one command |
| **Max Plan Support** | Use your Claude Max subscription (no per-token charges!) |
| **API Fallback** | Works with Anthropic API key if you don't have Max plan |

---

## Installation

### Option 1: Clone into custom_nodes

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/Interstitch/comfyui-claude-chat.git
cd comfyui-claude-chat
pip install -r requirements.txt
```

### Option 2: Via ComfyUI Manager

Search for "Claude Chat" in the ComfyUI Manager.

---

## Authentication

### Claude Max Plan (Recommended)

Use your Max subscription - **no per-token charges!**

1. Install Claude Code CLI: https://claude.ai/code
2. Authenticate: `claude login`
3. Install the SDK: `pip install claude-code-sdk`
4. Set environment variables for your container/environment:
   - `CLAUDE_MAX_PLAN=true`
   - Or configure via your Docker environment

### Anthropic API (Fallback)

1. Get an API key from https://console.anthropic.com/
2. Set environment variable: `export ANTHROPIC_API_KEY=sk-ant-...`

---

## Usage

1. Click the **Claude** button next to the Run button in the ComfyUI menu bar
2. The chat panel opens - start talking!
3. Claude automatically sees your current workflow

### Example Conversations

**Troubleshooting:**
> "My generations are blurry"
> → Claude analyzes your workflow, finds CFG too low, suggests fix

**Building:**
> "Create a workflow for generating product photos with consistent lighting"
> → Claude creates nodes, connects them, sets reasonable defaults

**Learning:**
> "What does the VAE do? Why do I need it?"
> → Claude explains with context from your actual workflow

**Organizing:**
> "This workflow is chaos - help me clean it up"
> → Claude groups nodes logically, arranges left-to-right, adds colors

---

## AI Agent Capabilities

Claude has access to 36 tools organized by function:

| Category | Tools | Examples |
|----------|-------|----------|
| **Node Operations** | 5 | create, delete, duplicate, bypass |
| **Widget Operations** | 2 | update values, get dropdown options |
| **Link Operations** | 2 | connect nodes, disconnect |
| **Group Operations** | 6 | create, merge, reorganize |
| **Analysis** | 5 | validate workflow, find issues, compare to defaults |
| **Discovery** | 5 | search node types, get schemas, list models |
| **High-Level** | 3 | clear, organize, smart layout |
| **Execution** | 3 | queue, stop, get status |
| **Utility** | 2 | batch commands, undo |
| **Low-Level** | 3 | raw JSON access for edge cases |

For detailed tool specifications, see [AGENT_TOOLS.md](AGENT_TOOLS.md).

---

## Architecture

### Automatic Context Injection

Every message includes your workflow state automatically:
- All nodes with positions, sizes, and connections
- Group assignments and colors
- Data flow summary
- Auto-detected issues (missing connections, ungrouped nodes)

Claude doesn't need to "inspect" your workflow - it already sees everything.

### Batch Operations

Complex changes happen in a single round-trip:

```
User: "Add a LoRA loader for character style"

Claude (internally): batch({
  delete_link: disconnect MODEL from sampler
  create_node: LoraLoader with settings
  create_link: reconnect through LoRA
})

Result: Done in ~5 seconds, not 30+
```

### Responsibility Split

| Decision Type | Who Handles |
|---------------|-------------|
| What nodes to create | Claude (semantic) |
| How to connect them | Claude (logic) |
| Where to position them | Frontend (pixel math) |
| Group boundaries | Frontend (computed from nodes) |

---

## Configuration

The chat panel remembers:
- Panel position and size
- Context inclusion preferences
- Conversation history (per session)

---

## Development

```bash
# Install in development mode
pip install -e ".[max-plan]"

# Run tests
pytest tests/

# See tool architecture
cat AGENT_TOOLS.md
```

---

## Troubleshooting

**"Claude can't see my workflow"**
→ Make sure the workflow context toggle is enabled in the chat panel

**"Tools aren't working"**
→ Check the browser console for errors, ensure ComfyUI is running

**"Authentication failed"**
→ Run `claude login` again, or verify your API key is set correctly

---

## License

MIT License - feel free to use and modify!

---

## Credits

Built with love by Max & Claude (the cosmic duo).

*"The best AI assistant doesn't just answer questions - it takes action."*
