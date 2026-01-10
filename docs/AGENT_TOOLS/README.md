# Agent Tools Reference

## THE MOST IMPORTANT THING: Use `batch`

**Every tool round-trip costs 5-10 seconds.** When you know what you want to do, wrap it in `batch`:

```
❌ SLOW: 5 separate calls = 25-50 seconds
   create_node → wait → create_node → wait → create_link → wait → create_link → wait → update_widget

✅ FAST: 1 batch call = 5-10 seconds
   batch { create_node(5 nodes), create_link(4 links), update_widget(3 values) }
```

**Rule of thumb:**
- **Exploring?** → Individual calls are fine (discovery, checking options)
- **Know what to do?** → Wrap in `batch` (creating, modifying, linking)

### The Pattern

```json
{"tool": "batch", "commands": [
  {"tool": "create_node", "nodes": [
    {"type": "CheckpointLoaderSimple", "ref": "$ckpt", "group": "Model"},
    {"type": "KSampler", "ref": "$sampler", "group": "Sampling"},
    {"type": "VAEDecode", "ref": "$decode", "group": "Output"}
  ]},
  {"tool": "create_node_link", "links": [
    {"from": "$ckpt", "from_slot": 0, "to": "$sampler", "to_slot": 0},
    {"from": "$sampler", "from_slot": 0, "to": "$decode", "to_slot": 0}
  ]},
  {"tool": "update_widget", "updates": [
    {"node": "$sampler", "widget": "steps", "value": 25}
  ]}
]}
```

**Key features:**
- `$refs` created in earlier commands resolve in later commands
- All commands succeed or all fail (atomic)
- One round-trip for the entire operation

---

## Quick Reference

```
DISCOVERY                   NODES                     LINKS
────────────────────────    ──────────────────────    ──────────────────
list_nodes                  create_node [+arr]        create_node_link [+arr]
find_nodes                  delete_node [+arr]        delete_node_link [+arr]
list_available_nodes        update_node [+arr]
search_available_nodes      duplicate_node [+arr]
list_available_models       bypass_node [+arr]
search_available_models
get_node (smart)
get_workflow
get_context

WIDGETS                   GROUPS                    HIGH-LEVEL
──────────────────────    ──────────────────────    ──────────────────
update_widget [+arr]      create_group [+arr]       organize [llm] [cableless]
get_widget_options        delete_group [+arr]       clear_workflow
                          update_group [+arr]       integrate_node_into_groups
                          move_nodes_to_group [+arr]
                          merge_groups
                          split_group
                          detect_group_issues

LAYOUT
──────────────────────
align_nodes
distribute_nodes
move_group
fit_group_to_nodes

ANALYSIS                  EXECUTION                 UTILITY
──────────────────────    ──────────────────────    ──────────────────
get_modified_widgets      queue_execution           batch ⭐
validate_workflow         cancel_execution          undo
detect_layout_issues      execution_status          help
analyze_workflow

LOW-LEVEL
──────────────────────
get_workflow_json
patch_workflow_json [+arr]
set_workflow_json
```

`[+arr]` = supports array input (multiple items in one call)
`⭐` = use this for multi-step operations

---

## Efficiency Patterns

### 1. Arrays Over Loops

Most tools accept arrays. Use them:

```json
// ❌ Would require 5 separate calls
{"tool": "create_node", "nodes": [{"type": "A"}]}
{"tool": "create_node", "nodes": [{"type": "B"}]}
...

// ✅ One call, 5 nodes
{"tool": "create_node", "nodes": [
  {"type": "A", "ref": "$a"},
  {"type": "B", "ref": "$b"},
  {"type": "C", "ref": "$c"},
  {"type": "D", "ref": "$d"},
  {"type": "E", "ref": "$e"}
]}
```

### 2. $refs Over Waiting

Don't wait for node IDs - use $refs:

```json
// ❌ Wait for ID, then link
{"tool": "create_node", ...}  // Returns id: 15
// ... wait for response ...
{"tool": "create_link", "from": 15, ...}

// ✅ Assign ref, use immediately in batch
{"tool": "batch", "commands": [
  {"tool": "create_node", "nodes": [{"type": "X", "ref": "$x"}]},
  {"tool": "create_node_link", "links": [{"from": "$x", ...}]}
]}
```

### 3. Inline Groups Over Separate Calls

```json
// ❌ Create nodes, then create groups
{"tool": "create_node", "nodes": [...]}
{"tool": "create_group", "groups": [...]}

// ✅ Assign groups inline
{"tool": "create_node", "nodes": [
  {"type": "X", "group": "Loaders"},
  {"type": "Y", "group": "Loaders"},
  {"type": "Z", "group": {"title": "Output", "color": "#583828"}}
]}
```

### 4. Skip Discovery When Possible

Auto-context provides workflow state. Don't call discovery tools unless you need something not visible:

```json
// ❌ Unnecessary discovery
{"tool": "list_nodes"}  // Just to see what exists
{"tool": "get_node", "id": 5}  // Just to see connections

// ✅ Trust the context
// Context already shows: #5 KSampler ←model:#1 ←pos:#3 →latent:#6
// Just do the operation directly
```

---

## Discovery: Workflow vs Registry

| Domain | Question | Tools |
|--------|----------|-------|
| **Workflow** (canvas) | "What's in my workflow?" | list_nodes, find_nodes, get_node(id) |
| **Registry** (installation) | "What node types are available?" | list_available_nodes, search_available_nodes, get_node(type) |
| **Registry** (installation) | "What models are available?" | list_available_models, search_available_models |

**Naming convention:**
- **list_nodes/find_nodes** = nodes IN your workflow (canvas instances)
- **list_available_*/search_available_*** = things AVAILABLE to use (registry: node types, models)

---

## Condensed Syntax Reference

### Nodes

```json
// create_node - supports inline group assignment
{"tool": "create_node", "nodes": [
  {"type": "KSampler", "ref": "$sampler", "widgets": {"steps": 20}, "group": "Sampling"}
]}

// delete_node
{"tool": "delete_node", "nodes": [5, 6, "$ref"]}

// update_node - move/rename
{"tool": "update_node", "updates": [{"node": 5, "pos": [200, 200], "title": "New Name"}]}

// duplicate_node
{"tool": "duplicate_node", "nodes": [{"node": 5, "ref": "$copy", "offset": [50, 50]}]}

// bypass_node
{"tool": "bypass_node", "nodes": [5, 6], "bypass": true}
```

### Widgets

```json
// update_widget
{"tool": "update_widget", "updates": [
  {"node": 5, "widget": "steps", "value": 30},
  {"node": 5, "widget": "cfg", "value": 7.5}
]}

// get_widget_options - for dropdowns
{"tool": "get_widget_options", "queries": [{"node": 5, "widget": "sampler_name"}]}
// Returns: {"options": ["euler", "dpmpp_2m", ...], "current": "euler"}
```

### Links

```json
// create_node_link - slot indices are 0-based
{"tool": "create_node_link", "links": [
  {"from": "$ckpt", "from_slot": 0, "to": "$sampler", "to_slot": 0}
]}

// delete_node_link - specify the input side
{"tool": "delete_node_link", "links": [{"node": 5, "input_slot": 0}]}
```

**Common slot patterns:**

| Node | Output Slots | Input Slots |
|------|--------------|-------------|
| CheckpointLoaderSimple | 0:MODEL, 1:CLIP, 2:VAE | - |
| KSampler | 0:LATENT | 0:model, 1:positive, 2:negative, 3:latent_image |
| CLIPTextEncode | 0:CONDITIONING | 0:clip |
| VAEDecode | 0:IMAGE | 0:samples, 1:vae |

### Groups

```json
// create_group
{"tool": "create_group", "groups": [
  {"title": "Loaders", "nodes": [1, 2], "color": "#2A4858"}
]}

// delete_group
{"tool": "delete_group", "groups": [1, "Loaders"]}  // by index or title
{"tool": "delete_group", "groups": "all"}

// update_group - rename, resize, modify membership
{"tool": "update_group", "updates": [
  {"group": 1, "title": "New Name", "pos": [50, 50], "size": [700, 500]},
  {"group": 2, "add_nodes": [5, 6], "remove_nodes": [3]}
]}

// move_nodes_to_group
{"tool": "move_nodes_to_group", "moves": [
  {"nodes": [4, 5], "to_group": "Prompts"},
  {"nodes": [6], "to_group": null}  // ungroup
]}

// merge_groups
{"tool": "merge_groups", "merge": {
  "groups": [1, 2], "into": {"title": "Combined", "color": "#2A4858"}
}}

// split_group
{"tool": "split_group", "split": {
  "group": "Loaders",
  "into": [
    {"title": "Checkpoints", "nodes": [1]},
    {"title": "LoRAs", "nodes": [2, 3]}
  ]
}}
```

### High-Level

```json
// organize - instant JS-based layout
{"tool": "organize"}
{"tool": "organize", "cableless": true}  // Get/Set nodes instead of cables

// organize with LLM semantic grouping
{"tool": "organize", "llm": true, "plan": {
  "flow": "left_to_right",
  "groups": [
    {"title": "Model", "nodes": [1], "order": 1},
    {"title": "Sampling", "nodes": [2, 3], "order": 2}
  ]
}}

// clear_workflow - delete everything
{"tool": "clear_workflow"}
```

### Discovery

```json
// list_nodes / find_nodes
{"tool": "list_nodes", "verbose": true}
{"tool": "find_nodes", "where": {"type": "LoraLoader"}}
{"tool": "find_nodes", "where": {"has_disconnected_inputs": true}}
{"tool": "find_nodes", "where": {"widget": {"name": "sampler_name", "value": "euler"}}}

// list_available_nodes / search_available_nodes
{"tool": "list_available_nodes", "category": "loaders"}
{"tool": "search_available_nodes", "query": "face detail"}

// get_node - smart: id → workflow node, type → schema
{"tool": "get_node", "id": 5}
{"tool": "get_node", "type": "KSampler"}
{"tool": "get_node", "id": 5, "schema": true}  // both

// list_available_models / search_available_models
{"tool": "list_available_models", "type": "checkpoints"}
{"tool": "search_available_models", "type": "loras", "query": "detail"}

// get_context - request higher detail level
{"tool": "get_context", "level": 3}  // includes geometry
```

### Analysis

```json
{"tool": "validate_workflow"}
// Returns: {can_execute, blocking_errors, warnings}

{"tool": "analyze_workflow"}
// Returns: validation + layout + optimization + complexity

{"tool": "get_modified_widgets", "nodes": [5, 6]}
// Returns: which widgets differ from defaults

{"tool": "detect_layout_issues"}
// Returns: overlapping nodes, cramped areas
```

### Execution

```json
{"tool": "queue_execution"}
{"tool": "queue_execution", "batch_size": 4}
{"tool": "cancel_execution"}
{"tool": "execution_status"}
```

### Low-Level

```json
// Raw JSON access - use as backup
{"tool": "get_workflow_json"}

{"tool": "patch_workflow_json", "patches": [
  {"op": "replace", "path": "/nodes/0/pos", "value": [100, 200]},
  {"op": "add", "path": "/groups/-", "value": {...}},
  {"op": "remove", "path": "/nodes/5"}
]}

{"tool": "set_workflow_json", "workflow": {...}}
```

---

## Error Response Format

All tools return consistent errors with hints:

```json
{
  "success": false,
  "error": "Invalid slot index",
  "hint": "KSampler has 4 inputs: model(0), positive(1), negative(2), latent_image(3)",
  "suggestion": "Use to_slot: 3 for latent_image"
}
```

---

## Tool Index (Detailed Docs)

### Discovery
- [list_nodes](./discovery/list_nodes.md) | [find_nodes](./discovery/find_nodes.md) | [list_available_nodes](./discovery/list_available_nodes.md) | [search_available_nodes](./discovery/search_available_nodes.md)
- [get_node](./discovery/get_node.md) | [get_workflow](./discovery/get_workflow.md) | [list_available_models](./discovery/list_available_models.md) | [search_available_models](./discovery/search_available_models.md) | [get_context](./discovery/get_context.md)

### Nodes
- [create_node](./nodes/create_node.md) | [delete_node](./nodes/delete_node.md) | [update_node](./nodes/update_node.md) | [duplicate_node](./nodes/duplicate_node.md) | [bypass_node](./nodes/bypass_node.md)

### Widgets
- [update_widget](./widgets/update_widget.md) | [get_widget_options](./widgets/get_widget_options.md)

### Links
- [create_node_link](./links/create_node_link.md) | [delete_node_link](./links/delete_node_link.md)

### Groups
- [create_group](./groups/create_group.md) | [delete_group](./groups/delete_group.md) | [update_group](./groups/update_group.md) | [move_nodes_to_group](./groups/move_nodes_to_group.md)
- [merge_groups](./groups/merge_groups.md) | [split_group](./groups/split_group.md) | [detect_group_issues](./groups/detect_group_issues.md)

### Layout
- [align_nodes](./layout/align_nodes.md) | [distribute_nodes](./layout/distribute_nodes.md) | [move_group](./layout/move_group.md) | [fit_group_to_nodes](./layout/fit_group_to_nodes.md)

### High-Level
- [organize](./highlevel/organize.md) | [clear_workflow](./highlevel/clear_workflow.md) | [integrate_node_into_groups](./highlevel/integrate_node_into_groups.md)

### Analysis
- [get_modified_widgets](./analysis/get_modified_widgets.md) | [validate_workflow](./analysis/validate_workflow.md) | [detect_layout_issues](./analysis/detect_layout_issues.md) | [analyze_workflow](./analysis/analyze_workflow.md)

### Execution
- [queue_execution](./execution/queue_execution.md) | [cancel_execution](./execution/cancel_execution.md) | [execution_status](./execution/execution_status.md)

### Utility
- [batch](./utility/batch.md) ⭐ | [undo](./utility/undo.md) | [help](./utility/help.md)

### Low-Level
- [get_workflow_json](./lowlevel/get_workflow_json.md) | [patch_workflow_json](./lowlevel/patch_workflow_json.md) | [set_workflow_json](./lowlevel/set_workflow_json.md)

---

## See Also

- [CONTEXT.md](../CONTEXT.md) - Context injection and tiered levels
- [COMFYUI_CHAT.md](../COMFYUI_CHAT.md) - Frontend architecture
