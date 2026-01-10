# move_group

Move a group and all its contained nodes by a delta offset.

## Syntax

```json
{"tool": "move_group", "group": 0, "dx": 200, "dy": 0}
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `group` | number\|string | Yes | Group index or title |
| `dx` | number | No | Horizontal offset (default: 0) |
| `dy` | number | No | Vertical offset (default: 0) |

## Returns

```json
{"success": true, "moved_nodes": 5}
```

## Notes

- Moves the group AND all nodes inside it
- Useful for making space in workflow layout
- Can be undone with `undo`
