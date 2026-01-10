# update_node

Move and/or rename one or more nodes.

## Syntax

```json
{"tool": "update_node", "updates": [
  {"node": 5, "pos": [200, 200]},
  {"node": 6, "title": "Main Sampler"},
  {"node": 7, "pos": [400, 200], "title": "Positive Prompt"}
]}
```

## Parameters (per update)

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `node` | int/$ref | Yes | Node ID or $ref |
| `pos` | [x, y] | No | New position |
| `title` | string | No | New title |

## Returns

```json
{"success": true, "updated": [5, 6, 7]}
```

## Notes

- For widget values, use [update_widget](./update_widget.md)
- For group membership, use [move_to_group](./move_to_group.md)
- Position changes are relative to canvas origin (top-left)
