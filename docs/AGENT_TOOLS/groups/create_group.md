# create_group

Create one or more groups around nodes.

## Syntax

```json
{"tool": "create_group", "groups": [
  {"title": "Loaders", "nodes": [1, 2, 3], "color": "#2A4858"},
  {"title": "Sampling", "nodes": ["$sampler", 6], "color": "#385828"}
]}
```

## Parameters (per group)

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Group title |
| `nodes` | array | Yes | Node IDs or $refs to include |
| `color` | string | No | Hex color (default: auto-assign) |
| `padding` | int | No | Padding around nodes (default: 60) |

## Returns

```json
{"success": true, "created": [1, 2]}
```

## Notes

- Frontend auto-calculates group bounds based on node positions
- Colors auto-assigned based on category/hash if not specified
- Prefer inline `group` param in [create_node](../nodes/create_node.md) for efficiency
- Nodes can only belong to one group at a time
