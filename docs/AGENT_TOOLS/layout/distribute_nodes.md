# distribute_nodes

Space nodes evenly in a horizontal or vertical arrangement.

## Syntax

```json
{"tool": "distribute_nodes", "nodes": [1, 2, 3], "direction": "horizontal", "spacing": 50}
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `nodes` | array | Yes | Node IDs to distribute |
| `direction` | string | No | "horizontal" or "vertical" (default: "horizontal") |
| `spacing` | number | No | Gap between nodes (default: auto-calculated) |

## Returns

```json
{"success": true, "distributed": 3}
```

## Notes

- When spacing is omitted, nodes are distributed evenly across existing span
- Maintains relative order of nodes
- Supports $refs from create_node
- Can be undone with `undo`
