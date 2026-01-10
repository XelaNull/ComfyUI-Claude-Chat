# align_nodes

Align multiple nodes to a common edge or center.

## Syntax

```json
{"tool": "align_nodes", "nodes": [1, 2, 3], "alignment": "left"}
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `nodes` | array | Yes | Node IDs to align |
| `alignment` | string | No | Alignment type (default: "left") |

### Alignment Options

| Value | Description |
|-------|-------------|
| `left` | Align left edges |
| `right` | Align right edges |
| `top` | Align top edges |
| `bottom` | Align bottom edges |
| `center_h` | Align horizontal centers |
| `center_v` | Align vertical centers |

## Returns

```json
{"success": true, "aligned": 3}
```

## Notes

- Uses first node in array as reference point
- Supports $refs from create_node
- Can be undone with `undo`
