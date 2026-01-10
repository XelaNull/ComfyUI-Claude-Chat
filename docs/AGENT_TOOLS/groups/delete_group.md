# delete_group

Remove groups (nodes are preserved).

## Syntax

```json
{"tool": "delete_group", "groups": [1, 2]}
{"tool": "delete_group", "groups": ["Loaders", "Sampling"]}
{"tool": "delete_group", "groups": "all"}
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `groups` | array/string | Yes | Group indices, titles, or "all" |

## Returns

```json
{"success": true, "deleted": [1, 2]}
```

## Notes

- Accepts group index (0-based) or title string
- Nodes are NOT deleted, just ungrouped
- Use `"all"` to clear all groups before reorganizing
