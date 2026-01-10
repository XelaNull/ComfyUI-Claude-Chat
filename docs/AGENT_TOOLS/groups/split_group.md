# split_group

Divide one group into multiple groups.

## Syntax

```json
{"tool": "split_group", "split": {
  "group": "Loaders",
  "into": [
    {"title": "Checkpoints", "nodes": [1], "color": "#2A4858"},
    {"title": "LoRAs", "nodes": [2, 3, 4], "color": "#4A3858"}
  ]
}}
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `group` | int/string | Yes | Group to split (index or title) |
| `into` | array | Yes | New group definitions |
| `into[].title` | string | Yes | New group title |
| `into[].nodes` | array | Yes | Node IDs for this group |
| `into[].color` | string | No | Hex color |

## Returns

```json
{"success": true, "created": [2, 3], "deleted": 1}
```

## Notes

- Original group is deleted
- Nodes not assigned to any new group become ungrouped
- Each `into` entry must specify which nodes go to that group
