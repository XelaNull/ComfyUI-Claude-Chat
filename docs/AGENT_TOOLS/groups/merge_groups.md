# merge_groups

Combine multiple groups into one.

## Syntax

```json
{"tool": "merge_groups", "merge": {
  "groups": [1, 2, "Old Loaders"],
  "into": {"title": "All Loaders", "color": "#2A4858"}
}}
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `groups` | array | Yes | Groups to merge (indices or titles) |
| `into` | object | Yes | Target group configuration |

## Returns

```json
{"success": true, "merged": 3, "resulting_group": 1}
```

## Notes

- Source groups are deleted
- All nodes from source groups move to the new group
- Bounds auto-calculated to contain all nodes
