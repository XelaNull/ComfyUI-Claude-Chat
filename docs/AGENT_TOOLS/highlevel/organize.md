# organize

Unified workflow layout tool with multiple modes.

## Syntax

```json
// Auto organize (instant, JS-based)
{"tool": "organize"}

// Auto with cableless (Get/Set nodes instead of cables)
{"tool": "organize", "cableless": true}

// LLM semantic organize
{"tool": "organize", "llm": true, "plan": {
  "flow": "left_to_right",
  "groups": [
    {"title": "Model", "color": "#2A4858", "nodes": [1, 2], "order": 1},
    {"title": "Sampling", "color": "#385828", "nodes": [5, 6], "order": 2}
  ]
}}

// LLM + cableless
{"tool": "organize", "llm": true, "cableless": true, "plan": {...}}
```

## Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `llm` | bool | false | Use semantic organization (requires `plan`) |
| `cableless` | bool | false | Replace inter-group cables with Get/Set nodes |
| `plan` | object | - | Required when `llm: true` |
| `options` | object | - | Spacing/padding overrides |

## Plan Object

| Field | Required | Description |
|-------|----------|-------------|
| `flow` | No | `left_to_right` or `top_to_bottom` |
| `groups` | Yes | Group definitions |
| `groups[].title` | Yes | Group name |
| `groups[].nodes` | Yes | Node IDs to include |
| `groups[].color` | No | Hex color |
| `groups[].order` | No | Position in flow (1-based) |
| `group_spacing` | No | Pixels between groups (default: 100) |
| `group_padding` | No | Pixels inside group border (default: 60) |

## Trigger Phrases

| User Says | Parameters |
|-----------|------------|
| "organize my workflow" | `{}` |
| "organize cableless" | `{cableless: true}` |
| "organize with llm" / "smart organize" | `{llm: true, plan: {...}}` |
| "clean up the spaghetti" | `{cableless: true}` |
| "AI organize this" | `{llm: true, plan: {...}}` |

## How Cableless Works

1. For each connection crossing group boundaries:
   - Creates a `Set_*` node at the output (named by data type + source)
   - Creates a `Get_*` node at the input (matching name)
2. Removes the original cable
3. Result: clean groups with no inter-group spaghetti

## Notes

- Auto mode is instant (frontend JS), LLM mode takes 5-10s
- Auto groups by type pattern; LLM groups by semantic understanding
- Frontend handles all positioning; LLM just specifies grouping
