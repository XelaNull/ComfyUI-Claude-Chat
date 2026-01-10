# create_node

Create one or more nodes, optionally with group assignment.

## Syntax

```json
{"tool": "create_node", "nodes": [
  {"type": "KSampler", "ref": "$sampler"},
  {"type": "VAEDecode", "ref": "$decode", "group": "Output"},
  {"type": "CLIPTextEncode", "widgets": {"text": "a cat"}, "group": {"title": "Prompts", "color": "#4A3858"}}
]}
```

## Parameters (per node)

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Node type (e.g., "KSampler") |
| `ref` | string | No | $reference for use in later tool calls |
| `pos` | [x, y] | No | Position (default: auto-place) |
| `widgets` | object | No | Initial widget values |
| `title` | string | No | Custom node title |
| `group` | string/object | No | Group assignment |

## Group Assignment

```json
// Simple: just group name
"group": "Prompts"

// With color
"group": {"title": "Prompts", "color": "#4A3858"}
```

- If group doesn't exist, it's created automatically
- Nodes without `group` remain ungrouped
- Frontend auto-calculates group bounds

## Returns

```json
{
  "success": true,
  "created": [15, 16, 17],
  "refs": {"$sampler": 15, "$decode": 16}
}
```

## Examples

Create a basic text-to-image workflow:
```json
{"tool": "create_node", "nodes": [
  {"type": "CheckpointLoaderSimple", "ref": "$ckpt", "group": "Model"},
  {"type": "CLIPTextEncode", "ref": "$pos", "widgets": {"text": "a photo"}, "group": "Prompts"},
  {"type": "CLIPTextEncode", "ref": "$neg", "widgets": {"text": "blurry"}, "group": "Prompts"},
  {"type": "EmptyLatentImage", "ref": "$latent", "group": "Latent"},
  {"type": "KSampler", "ref": "$sampler", "group": "Sampling"},
  {"type": "VAEDecode", "ref": "$decode", "group": "Output"},
  {"type": "SaveImage", "ref": "$save", "group": "Output"}
]}
```

## Notes

- Supports array input: 5 nodes = 1 tool call
- Use $refs to chain with [create_link](./create_link.md)
- Inline group assignment is more efficient than separate [create_group](./create_group.md)
- Check type exists first with [search_available_nodes](../discovery/search_available_nodes.md) if unsure
