# Context & Prompts Architecture

What gets sent to Claude and when.

---

## Message Structure

```
SYSTEM PROMPT          ← Role + tool index (full on first msg, minimal after)
USER MESSAGE           ← User's request
  + [WORKFLOW]         ← Auto-injected workflow snapshot (tiered detail)
  + [TOOL RESULTS]     ← Results from previous tool calls (if any)
```

---

## System Prompts

| Prompt | When | Target Size | Contains |
|--------|------|-------------|----------|
| `SYSTEM_PROMPT_FULL` | First message | ~1500 tokens | Role + tool index + key patterns |
| `SYSTEM_PROMPT_CONTINUATION` | Follow-ups | ~300 tokens | Role reminder only |
| `SYSTEM_PROMPT_READONLY` | Modify disabled | ~800 tokens | Role + read-only tools only |

### First Message Contains

- Role definition (ComfyUI workflow assistant)
- Tool index (names only, grouped by category)
- Key patterns ($ref, batch, inline groups)
- Pointer to `help` tool for detailed docs
- Type abbreviation legend

### Continuation Contains

- Role reminder
- Pointer to `help` if needed

**Design principle:** Full tool documentation lives in `help` tool, not system prompt.

---

## Tiered Workflow Context

Context detail scales with need. Small workflows get more detail; large workflows stay compact unless geometry is required.

### Level 1: Compact (Default)

```
[WORKFLOW]
Nodes (15): #1 CheckpointLoaderSimple "Load", #2 KSampler, #3 CLIPTextEncode "Pos"...
Groups: Model[1], Prompts[3,4], Sampling[2,5,6], Output[7]
Flow: 1→2,3,4 | 3,4,5→2 | 2→6→7
Issues: #2.latent_image disconnected
In Use: checkpoint=dreamshaper_8.safetensors
```

**~150-250 tokens** for 15 nodes. Sufficient for widget changes, adding nodes, simple questions.

### Level 2: Standard (Connections)

```
[WORKFLOW]
#1 CheckpointLoaderSimple "Load" →M:#2 →C:#3,#4 →V:#6
#2 KSampler ←model:#1 ←pos:#3 ←neg:#4 ←latent:? →L:#6
#3 CLIPTextEncode "Pos" ←clip:#1 →CD:#2.positive
...
Groups: Model[1], Prompts[3,4], Sampling[2,5,6], Output[7]
Issues: #2.latent_image disconnected
```

**~350-500 tokens** for 15 nodes. Shows slot connections for linking work.

### Level 3: Full (Geometry)

```
[WORKFLOW DETAIL]
#1 CheckpointLoaderSimple "Load"
   pos:(50,150) size:(320,120)
   widgets: {ckpt_name: "dreamshaper_8.safetensors"}
   outputs: [MODEL→#2, CLIP→#3,#4, VAE→#6]
...
Groups:
  "Model" [#2A4858] bounds:(30,100) size:(400,200) nodes:[1]
```

**~800-2000 tokens**. Includes positions, sizes, widget values. For layout/organize work.

### Auto-Selection

| Condition | Level |
|-----------|-------|
| Keywords: organize, position, move, layout, align | 3 |
| Keywords: connect, link, wire, slot, input, output | 2 |
| Small workflow (≤10 nodes) | 2 |
| Default | 1 |

Claude can request higher detail via `get_context level:N`.

---

## Static vs Dynamic Context

| Type | When Sent | Examples |
|------|-----------|----------|
| **Static** | First message only | Installed packs, available model counts, ComfyUI version |
| **Dynamic** | Every message | Workflow state, issues |
| **Semi-static** | On change | Models in use (only when changed) |

---

## Token Budget Guidelines

| Workflow Size | Target Context |
|---------------|----------------|
| Small (1-10 nodes) | ~300 tokens |
| Medium (11-30 nodes) | ~500 tokens |
| Large (31-50 nodes) | ~700 tokens |
| Complex (50+ nodes) | ~900 tokens |

**Goal:** Keep workflow context under 1000 tokens. Use tiered levels and on-demand detail to stay within budget.

---

## Type Abbreviations

Used in Level 2+ context for compactness:

| Abbrev | Type | Abbrev | Type |
|--------|------|--------|------|
| M | MODEL | I | IMAGE |
| C | CLIP | CD | CONDITIONING |
| V | VAE | CN | CONTROL_NET |
| L | LATENT | MK | MASK |

System prompt includes legend: `Types: M=MODEL, C=CLIP, V=VAE, L=LATENT, I=IMAGE, CD=CONDITIONING`

---

## Connection Syntax

```
←input:#source     Input connected from node #source
←input:?           Input disconnected (required)
←input:-           Input disconnected (optional)
→OUTPUT:#dest      Output connected to node #dest
→OUTPUT:#a,#b      Output connected to multiple nodes
```

---

## Implementation Files

| File | Responsibility |
|------|----------------|
| `claude_chat/prompts.py` | System prompt templates |
| `web/js/context_generator.js` | Workflow state generation (tiered) |
| `claude_chat/claude_client.py` | Message assembly, level selection |

---

## See Also

- [AGENT_TOOLS/](./AGENT_TOOLS/) - Tool reference with condensed syntax
- [COMFYUI_CHAT.md](./COMFYUI_CHAT.md) - Frontend UI architecture
