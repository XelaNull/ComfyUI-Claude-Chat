# fit_group_to_nodes

Resize a group to fit around specified nodes with padding.

## Syntax

```json
{"tool": "fit_group_to_nodes", "group": 0, "nodes": [1, 2, 3], "padding": 60}
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `group` | number\|string | Yes | Group index or title |
| `nodes` | array | No | Node IDs to fit around (uses current members if omitted) |
| `padding` | number | No | Padding around nodes (default: 60) |

## Returns

```json
{"success": true, "new_bounds": {"x": 50, "y": 50, "w": 500, "h": 400}}
```

## Notes

- Automatically calculates bounds to contain all specified nodes
- Useful after adding nodes to ensure group covers them
- Can be undone with `undo`
