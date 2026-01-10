# find_nodes

Query workflow nodes by criteria.

## Syntax

```json
{"tool": "find_nodes", "where": {"type": "LoraLoader"}}
{"tool": "find_nodes", "where": {"ungrouped": true}}
{"tool": "find_nodes", "where": {"has_disconnected_inputs": true}}
{"tool": "find_nodes", "where": {"in_group": "Loaders"}}
{"tool": "find_nodes", "where": {"bypassed": true}}
{"tool": "find_nodes", "where": {"widget": {"name": "sampler_name", "value": "euler"}}}
```

## Query Fields

| Field | Description |
|-------|-------------|
| `type` | Node type (exact or pattern with `*`) |
| `has_disconnected_inputs` | Nodes with required inputs not connected |
| `in_group` | Nodes in specific group (name or index) |
| `ungrouped` | Nodes not in any group |
| `widget` | Nodes where widget has specific value |
| `bypassed` | Nodes that are bypassed |

## Returns

```json
{"matches": [2, 5, 7], "count": 3}
```

## Examples

Find all LoRA loaders:
```json
{"tool": "find_nodes", "where": {"type": "LoraLoader"}}
```

Find nodes with problems:
```json
{"tool": "find_nodes", "where": {"has_disconnected_inputs": true}}
```

Find nodes using euler sampler:
```json
{"tool": "find_nodes", "where": {"widget": {"name": "sampler_name", "value": "euler"}}}
```

## Notes

- Part of **workflow** discovery (things you HAVE on canvas)
- For searching available node types to add, use [search_available_nodes](./search_available_nodes.md)
