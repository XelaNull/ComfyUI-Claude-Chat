# duplicate_node

Clone one or more nodes with all widget settings.

## Syntax

```json
{"tool": "duplicate_node", "nodes": [
  {"node": 5, "ref": "$copy"},
  {"node": 6, "ref": "$copy2", "offset": [50, 50]}
]}
```

## Parameters (per node)

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `node` | int/$ref | Yes | Source node to clone |
| `ref` | string | No | $reference for the new copy |
| `offset` | [x, y] | No | Position offset from original (default: [50, 50]) |

## Returns

```json
{
  "success": true,
  "created": [18, 19],
  "refs": {"$copy": 18, "$copy2": 19}
}
```

## Notes

- Copies all widget values from the source node
- **Connections are NOT copied** - use [create_link](./create_link.md) after
- Use $refs to connect the duplicated nodes in same batch
- Useful for creating parallel processing branches
