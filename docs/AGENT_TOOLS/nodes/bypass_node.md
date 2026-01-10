# bypass_node

Temporarily disable nodes without deleting them.

## Syntax

```json
{"tool": "bypass_node", "nodes": [5, 6], "bypass": true}
{"tool": "bypass_node", "nodes": [5], "bypass": false}
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `nodes` | array | Yes | Node IDs or $refs |
| `bypass` | bool | Yes | true = disable, false = re-enable |

## Returns

```json
{"success": true, "bypassed": [5, 6]}
```

## Notes

- Bypassed nodes pass data through without processing
- Visually indicated in ComfyUI (grayed out)
- Useful for A/B testing or temporarily skipping steps
- Use [find_nodes](./find_nodes.md) with `{"bypassed": true}` to find bypassed nodes
